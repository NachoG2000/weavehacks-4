/**
 * Solo-vs-team forecast eval on a RECENT HOLDOUT.
 *
 * Hold out the last `weeks` of real POS data, hide it from every history tool (as-of guard),
 * have each forecaster predict the held-out services, then score the predictions against what
 * ACTUALLY happened. Objective ground truth, no LLM judge. The naive baseline runs for free and
 * proves the harness; solo/team spend a little inference.
 */

import type { ServiceRecord } from "@weavehacks/seed";
import {
  holdoutCutoff,
  holdoutServices,
  conditionsOf,
  conditionsSentence,
  actualTotalItems,
  setAsOf,
  dataRange,
  type Conditions,
} from "./tools";
import { naiveForecastValue, soloForecast, teamForecast, type ForecastQ, type ForecastValue } from "./forecasters";

export type Arm = "naive" | "solo" | "team";

export interface EvalScenario {
  date: string;
  day: string;
  service: string;
  conditions: Conditions;
  conditionsText: string;
  /** ground truth: items actually sold */
  actual: number;
}

export interface ScenarioResult {
  scenario: EvalScenario;
  preds: Partial<Record<Arm, ForecastValue>>;
}

export interface ArmSummary {
  arm: Arm;
  scored: number;
  /** mean absolute error, items */
  mae: number;
  /** mean absolute % error vs actual, 0..200 (capped per row) */
  mape: number;
  /** 1 − MAPE/100, clamped [0,1] — the scoreboard score (higher = better) */
  accuracy: number;
}

export interface ForecastEvalResult {
  dataFrom: string | null;
  dataTo: string | null;
  cutoff: string;
  weeks: number;
  scenarios: number;
  /** holdout services dropped as effectively-closed (below CLOSED_FLOOR items) — not a prep target */
  skippedClosed: number;
  arms: Arm[];
  results: ScenarioResult[];
  summary: Record<Arm, ArmSummary>;
}

/** A service below this many items is effectively closed/anomalous — exclude it from the eval. */
const CLOSED_FLOOR = 10;

/** Coarse condition bucket, used only to pick a VARIED set of holdout days. */
function bucketOf(c: Conditions): string {
  if (c.football) return "football";
  if (c.rain || c.snow) return "weather";
  if (c.holiday || c.schoolBreak || c.commercialEvent) return "calendar";
  return "normal";
}

/** Choose up to `n` holdout services, round-robin across condition buckets for variety (deterministic). */
export function pickScenarios(weeks: number, n: number): { cutoff: string; scenarios: EvalScenario[]; skippedClosed: number } {
  const cutoff = holdoutCutoff(weeks);
  const all = holdoutServices(cutoff);
  const hs = all.filter((r) => actualTotalItems(r) >= CLOSED_FLOOR); // drop effectively-closed days
  const skippedClosed = all.length - hs.length;
  const buckets = new Map<string, ServiceRecord[]>();
  for (const r of hs) {
    const b = bucketOf(conditionsOf(r));
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(r);
  }
  const order = ["football", "weather", "calendar", "normal"].filter((b) => buckets.has(b));
  const picked: ServiceRecord[] = [];
  let i = 0;
  while (picked.length < n && order.length) {
    const b = order[i % order.length];
    const arr = buckets.get(b)!;
    if (arr.length) {
      picked.push(arr.shift()!);
      i++;
    } else {
      order.splice(i % order.length, 1);
    }
  }
  const scenarios = picked
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const c = conditionsOf(r);
      return { date: r.date, day: r.day, service: r.service, conditions: c, conditionsText: conditionsSentence(c), actual: actualTotalItems(r) };
    });
  return { cutoff, scenarios, skippedClosed };
}

function summarizeArm(arm: Arm, results: ScenarioResult[]): ArmSummary {
  let absSum = 0;
  let pctSum = 0;
  let scored = 0;
  for (const r of results) {
    const p = r.preds[arm]?.totalItems;
    if (p == null) continue;
    const a = r.scenario.actual;
    absSum += Math.abs(p - a);
    pctSum += Math.min(200, (Math.abs(p - a) / Math.max(a, 1)) * 100);
    scored++;
  }
  const mae = scored ? Math.round((absSum / scored) * 10) / 10 : 0;
  const mape = scored ? Math.round(pctSum / scored) : 0;
  return { arm, scored, mae, mape, accuracy: Math.max(0, Math.min(1, 1 - mape / 100)) };
}

export interface ForecastEvalOptions {
  weeks?: number;
  n?: number;
  arms?: Arm[];
  model?: string;
  /** called after each scenario so a CLI can stream progress */
  onScenario?: (r: ScenarioResult, index: number, total: number) => void;
}

/**
 * Run the eval. The as-of guard is ON for the whole run (agents blind past the cutoff) and
 * ALWAYS restored in `finally` — even if an arm throws — so the live demo isn't left blinded.
 */
export async function runForecastEval(opts: ForecastEvalOptions = {}): Promise<ForecastEvalResult> {
  const weeks = opts.weeks ?? 4;
  const n = opts.n ?? 10;
  const arms = opts.arms ?? ["naive", "solo", "team"];
  const range = dataRange();

  setAsOf(null); // pick scenarios over the FULL data (the held-out window must exist)
  const { cutoff, scenarios, skippedClosed } = pickScenarios(weeks, n);

  setAsOf(cutoff); // ← LEAKAGE GUARD: every history tool is now blind to date ≥ cutoff
  try {
    const results: ScenarioResult[] = [];
    for (let i = 0; i < scenarios.length; i++) {
      const sc = scenarios[i];
      const q: ForecastQ = { date: sc.date, day: sc.day, service: sc.service };
      const preds: Partial<Record<Arm, ForecastValue>> = {};
      if (arms.includes("naive")) preds.naive = naiveForecastValue(q, cutoff);
      if (arms.includes("solo")) preds.solo = await soloForecast(q, sc.conditionsText, { model: opts.model });
      if (arms.includes("team")) preds.team = await teamForecast(q, sc.conditionsText, { model: opts.model });
      const r: ScenarioResult = { scenario: sc, preds };
      results.push(r);
      opts.onScenario?.(r, i, scenarios.length);
    }
    const summary = {} as Record<Arm, ArmSummary>;
    for (const arm of arms) summary[arm] = summarizeArm(arm, results);
    return { dataFrom: range.from, dataTo: range.to, cutoff, weeks, scenarios: scenarios.length, skippedClosed, arms, results, summary };
  } finally {
    setAsOf(null); // ← restore the live demo's full-data view no matter what
  }
}
