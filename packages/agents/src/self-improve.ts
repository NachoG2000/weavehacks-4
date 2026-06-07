/**
 * Two-phase self-improvement loop — does the system get measurably better from feedback?
 *
 *   ACTOR  = a naive demand forecaster (per weekday+service average; ignores weather/football —
 *            so it has real, learnable mistakes).
 *   JUDGE  = a coach that reads ONE feedback month of (prediction vs real, by condition) and
 *            writes general correction rules ("football night → +9").
 *
 * Phase 1 (learn): actor predicts the feedback month; judge derives rules from the misses.
 * Phase 2 (test):  on the UNSEEN test month, score the actor WITHOUT vs WITH the rules, against
 *                  real sales. If error drops on a month nobody saw, the feedback generalised.
 *
 * Metric = MAE (avg items off) vs reality — no contrived briefs, no LLM grading. The judge is an
 * LLM, but its rules are applied deterministically and there's a deterministic fallback, so a
 * signal never hinges on the model phrasing JSON correctly.
 */

import { traced } from "@weavehacks/observability";
import { runToolAgent } from "@weavehacks/runtime";
import type { ServiceRecord } from "@weavehacks/seed";
import { selfImproveSplit, conditionsOf, actualTotalItems, trainBefore, servicesInRange, addDaysISO, dataRange } from "./tools";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Conditions we can write a correction rule for. */
const CONDITIONS = ["football", "rain", "holiday", "school_break", "hot", "cold"] as const;
type Condition = (typeof CONDITIONS)[number];

function flagsOf(r: ServiceRecord): Condition[] {
  const c = conditionsOf(r);
  const f: Condition[] = [];
  if (c.football) f.push("football");
  if (c.rain) f.push("rain");
  if (c.holiday) f.push("holiday");
  if (c.schoolBreak) f.push("school_break");
  if (c.tempMaxC != null && c.tempMaxC >= 25) f.push("hot");
  if (c.tempMaxC != null && c.tempMaxC <= 10) f.push("cold");
  return f;
}

/** Naive prediction: average total items over comparable (weekday, service) services in `train`. */
function naiveTotal(train: ServiceRecord[], day: string, service: string): number {
  const exact = train.filter((r) => r.day === day && r.service === service);
  const pool = exact.length ? exact : train.filter((r) => r.service === service);
  if (!pool.length) return 0;
  return round1(pool.reduce((s, r) => s + (r.total_items ?? 0), 0) / pool.length);
}

export interface ConditionResidual {
  condition: Condition;
  /** nights in the feedback month with this condition */
  n: number;
  /** average (actual − predicted): positive = the actor UNDER-predicted */
  meanResidual: number;
}

export interface CorrectionRule {
  condition: Condition;
  /** items to add (or subtract) when this condition holds */
  adjust: number;
  reason: string;
}

export interface TestRow {
  date: string;
  day: string;
  service: string;
  conditions: Condition[];
  actual: number;
  before: number;
  after: number;
}

export interface SelfImproveResult {
  weeks: number;
  feedbackStart: string;
  testStart: string;
  end: string;
  feedbackServices: number;
  testServices: number;
  /** actor's error on the feedback month (what the judge studied) */
  m1Mae: number;
  /** test-month error WITHOUT the judge's corrections */
  m2BeforeMae: number;
  /** test-month error WITH the corrections (learned from the feedback month) */
  m2AfterMae: number;
  improvement: number;
  improvementPct: number;
  residuals: ConditionResidual[];
  rules: CorrectionRule[];
  testRows: TestRow[];
}

function extractTaggedJson(text: string, tag: string): any | null {
  const start = text.indexOf("{", Math.max(0, text.indexOf(tag)));
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const JUDGE =
  "You are a forecasting coach. A naive demand model predicted last month; below is its AVERAGE ERROR by condition " +
  "(positive = it under-predicted, so add items; negative = it over-predicted, so subtract), with how many nights each is " +
  "based on. Write correction rules to apply NEXT month. Include a condition ONLY if it has enough nights (n ≥ 3) and a " +
  "meaningful average error (at least ~2 items); set adjust ≈ the average error, rounded to a whole number. Output ONLY:\n" +
  'CORRECTIONS_JSON: {"rules": [{"condition": "<football|rain|holiday|school_break|hot|cold>", "adjust": <integer>, "reason": "<short>"}]}';

async function learnCorrections(residuals: ConditionResidual[], model?: string): Promise<CorrectionRule[]> {
  const table = residuals.map((a) => `${a.condition}: avg error ${a.meanResidual >= 0 ? "+" : ""}${a.meanResidual} over ${a.n} nights`).join("\n");
  const res = await traced("agent.judge", (t: string) => runToolAgent({ name: "Coach", role: "critic", instructions: JUDGE, input: t, tools: [], model, maxSteps: 1 }))(table);
  const o = extractTaggedJson(res.text, "CORRECTIONS_JSON");
  let rules: CorrectionRule[] = Array.isArray(o?.rules)
    ? o.rules
        .map((r: any) => ({ condition: String(r?.condition) as Condition, adjust: Math.round(Number(r?.adjust) || 0), reason: String(r?.reason ?? "") }))
        .filter((r: CorrectionRule) => (CONDITIONS as readonly string[]).includes(r.condition) && r.adjust !== 0)
    : [];
  // Deterministic fallback so a signal never hinges on the model emitting clean JSON.
  if (!rules.length) rules = residuals.filter((a) => a.n >= 3 && Math.abs(a.meanResidual) >= 2).map((a) => ({ condition: a.condition, adjust: Math.round(a.meanResidual), reason: `avg error ${a.meanResidual} over ${a.n} nights` }));
  return rules;
}

const mae = (rows: TestRow[], key: "before" | "after") => (rows.length ? round1(rows.reduce((s, x) => s + Math.abs(x[key] - x.actual), 0) / rows.length) : 0);

interface RoundOutput {
  m1Mae: number;
  residuals: ConditionResidual[];
  rules: CorrectionRule[];
  testRows: TestRow[];
}

/**
 * One learn→test round. `historyTrain` predicts the feedback window (to measure residuals);
 * `testTrain` (more recent, fairest baseline) predicts the test window; the judge's rules are
 * applied to the test predictions. Shared by the single run and the multi-month series.
 */
async function computeRound(historyTrain: ServiceRecord[], feedback: ServiceRecord[], testTrain: ServiceRecord[], test: ServiceRecord[], model?: string): Promise<RoundOutput> {
  const fb = feedback.map((r) => {
    const pred = naiveTotal(historyTrain, r.day, r.service);
    const actual = actualTotalItems(r);
    return { pred, actual, residual: round1(actual - pred), flags: flagsOf(r) };
  });
  const residuals: ConditionResidual[] = CONDITIONS.map((condition) => {
    const rows = fb.filter((x) => x.flags.includes(condition));
    const n = rows.length;
    return { condition, n, meanResidual: n ? round1(rows.reduce((s, x) => s + x.residual, 0) / n) : 0 };
  }).filter((a) => a.n > 0);
  const m1Mae = fb.length ? round1(fb.reduce((s, x) => s + Math.abs(x.pred - x.actual), 0) / fb.length) : 0;

  const rules = await learnCorrections(residuals, model);
  const ruleMap = new Map(rules.map((r) => [r.condition, r.adjust]));

  const testRows: TestRow[] = test.map((r) => {
    const before = naiveTotal(testTrain, r.day, r.service);
    const flags = flagsOf(r);
    const correction = flags.reduce((s, f) => s + (ruleMap.get(f) ?? 0), 0);
    const after = Math.max(0, round1(before + correction));
    return { date: r.date, day: r.day, service: r.service, conditions: flags, actual: actualTotalItems(r), before, after };
  });
  return { m1Mae, residuals, rules, testRows };
}

export interface SelfImproveOptions {
  weeks?: number;
  model?: string;
}

export async function runSelfImprove(opts: SelfImproveOptions = {}): Promise<SelfImproveResult> {
  const weeks = opts.weeks ?? 4;
  return traced("brigade.self_improve", async (): Promise<SelfImproveResult> => {
    const split = selfImproveSplit(weeks);
    const round = await computeRound(split.history, split.feedback, [...split.history, ...split.feedback], split.test, opts.model);
    const m2BeforeMae = mae(round.testRows, "before");
    const m2AfterMae = mae(round.testRows, "after");
    return {
      weeks,
      feedbackStart: split.feedbackStart,
      testStart: split.testStart,
      end: split.end,
      feedbackServices: split.feedback.length,
      testServices: split.test.length,
      m1Mae: round.m1Mae,
      m2BeforeMae,
      m2AfterMae,
      improvement: round1(m2BeforeMae - m2AfterMae),
      improvementPct: m2BeforeMae ? Math.round(((m2BeforeMae - m2AfterMae) / m2BeforeMae) * 100) : 0,
      residuals: round.residuals,
      rules: round.rules,
      testRows: round.testRows,
    };
  })();
}

// ─── multi-month series: does the improvement hold month after month? ──────────────────────

export interface SeriesRound {
  testStart: string;
  testEnd: string;
  testServices: number;
  feedbackServices: number;
  beforeMae: number;
  afterMae: number;
  improvement: number;
  rules: CorrectionRule[];
}

export interface SelfImproveSeriesResult {
  weeks: number;
  months: number;
  rounds: SeriesRound[];
  /** mean error across all test months, before vs after */
  meanBefore: number;
  meanAfter: number;
  meanImprovementPct: number;
  /** how many of the test months the corrections actually helped (consistency check) */
  monthsImproved: number;
  /** all test rows pooled (for one robust Weave eval) */
  allRows: TestRow[];
}

export interface SelfImproveSeriesOptions {
  weeks?: number;
  months?: number;
  model?: string;
  onRound?: (r: SeriesRound, index: number) => void;
}

/**
 * Slide the learn→test window forward `months` times with an EXPANDING feedback window, so each
 * round the judge has learned from more data. Reports before/after per month — a small gain that
 * shows up every month is real (replication), not a one-month fluke.
 */
export async function runSelfImproveSeries(opts: SelfImproveSeriesOptions = {}): Promise<SelfImproveSeriesResult> {
  const W = opts.weeks ?? 4;
  const K = opts.months ?? 5;
  return traced("brigade.self_improve_series", async (): Promise<SelfImproveSeriesResult> => {
    const end = dataRange().to ?? "";
    const expStart = addDaysISO(end, -(K + 1) * W * 7 + 1); // first feedback day; one window precedes the first test month
    const historyTrain = trainBefore(expStart); // fixed base for measuring feedback residuals
    const rounds: SeriesRound[] = [];
    const allRows: TestRow[] = [];

    for (let i = 1; i <= K; i++) {
      const testStart = addDaysISO(end, -(K - i + 1) * W * 7 + 1);
      const testNext = i === K ? addDaysISO(end, 1) : addDaysISO(end, -(K - i) * W * 7 + 1);
      const feedback = servicesInRange(expStart, testStart); // expands each round
      const testTrain = trainBefore(testStart);
      const test = servicesInRange(testStart, testNext);

      const round = await computeRound(historyTrain, feedback, testTrain, test, opts.model);
      const beforeMae = mae(round.testRows, "before");
      const afterMae = mae(round.testRows, "after");
      const sr: SeriesRound = { testStart, testEnd: addDaysISO(testNext, -1), testServices: test.length, feedbackServices: feedback.length, beforeMae, afterMae, improvement: round1(beforeMae - afterMae), rules: round.rules };
      rounds.push(sr);
      allRows.push(...round.testRows);
      opts.onRound?.(sr, i - 1);
    }

    const meanBefore = rounds.length ? round1(rounds.reduce((s, r) => s + r.beforeMae, 0) / rounds.length) : 0;
    const meanAfter = rounds.length ? round1(rounds.reduce((s, r) => s + r.afterMae, 0) / rounds.length) : 0;
    return {
      weeks: W,
      months: K,
      rounds,
      meanBefore,
      meanAfter,
      meanImprovementPct: meanBefore ? Math.round(((meanBefore - meanAfter) / meanBefore) * 100) : 0,
      monthsImproved: rounds.filter((r) => r.afterMae < r.beforeMae).length,
      allRows,
    };
  })();
}
