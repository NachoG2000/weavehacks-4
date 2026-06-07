/**
 * Historian analytics over the REAL POS export (the `ServiceRecord[]` in pos.json, ~1.5k
 * services across 3 years). Pure functions — no LLM, no clock — loaded ONCE at import.
 *
 * The Historian reasons the way an operator does out loud:
 *
 *   "typical Tuesday dinner ≈ 15 items …
 *    football nights run about +5 …
 *    rain knocks ~2 off the cold sushi categories …
 *    so call it ~18 tonight."
 *
 * The trick is that each adjustment is its OWN query over MANY nights, computed INDEPENDENTLY
 * — not one filter stacking every condition at once. That keeps every sample size healthy:
 * "Tuesday + Champions League + rain" is a bucket of n=1, but "the effect of rain" and "the
 * effect of football" are each measured over hundreds of nights. The trade-off is honest and
 * stated: the effects are MARGINAL (one factor at a time), so summing them is an estimate, not
 * a joint model. Every result carries `n` so a claim's confidence is visible and the Critic can
 * reject a thin one.
 */

import { loadServiceRecords, type ServiceRecord } from "@weavehacks/seed";

// Load the operator's JSON once. Missing file → empty set; every function degrades to a
// "no data" note instead of crashing (mirrors apps/api/src/forecast.ts).
const LOADED = loadServiceRecords();
const RECORDS: ServiceRecord[] = LOADED.found ? LOADED.records : [];

/**
 * AS-OF cutoff (no-leakage guard). When set to an ISO date, EVERY history query sees only
 * services strictly BEFORE it — so a backtest can hide the recent weeks it's testing against
 * and the agents can't peek at the answer. null (the default) = all data, for the live demo.
 * The eval harness sets this; agents cannot (it's not a tool parameter).
 */
let AS_OF: string | null = null;
export function setAsOf(date: string | null): void {
  AS_OF = date;
}
export function getAsOf(): string | null {
  return AS_OF;
}
/** The records a query is allowed to see right now (train-only when AS_OF is set). */
function visible(): ServiceRecord[] {
  return AS_OF ? RECORDS.filter((r) => r.date < AS_OF!) : RECORDS;
}

/** A factor's effect needs at least this many nights on EACH side to be a trustworthy signal. */
const MIN_SAMPLE = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (delta: number, base: number) => (base ? Math.round((delta / base) * 100) : 0);
/** Some category names in the export carry trailing spaces ("Maki ", "Sushi ") — fold them. */
const normCat = (c: string) => c.trim();

/** What the demo knows about its own data source — surfaced so the agent can cite provenance. */
export const POS_INFO = {
  found: LOADED.found,
  source: LOADED.path,
  records: RECORDS.length,
  from: RECORDS[0]?.date ?? null,
  to: RECORDS[RECORDS.length - 1]?.date ?? null,
};

/** Distinct football competitions present in the data — valid values for the `competition` filter. */
export const COMPETITIONS: string[] = [
  ...new Set(
    RECORDS.flatMap((r) => (r.events ?? []).filter((e) => e.type === "football" && e.competition).map((e) => e.competition as string)),
  ),
].sort();

// ─── weather / football readers (the export's real fields) ───────────────────────────────

function rainMm(r: ServiceRecord): number {
  const w = r.weather as Record<string, unknown> | null;
  if (!w) return 0;
  return Number(w.pluie_mm ?? w.precipitation_mm ?? 0) || 0;
}
function snowCm(r: ServiceRecord): number {
  const w = r.weather as Record<string, unknown> | null;
  return w ? Number(w.neige_cm ?? 0) || 0 : 0;
}
function tempMaxC(r: ServiceRecord): number | null {
  const w = r.weather as Record<string, unknown> | null;
  return w && w.temp_max_c != null ? Number(w.temp_max_c) : null;
}

const isSnow = (r: ServiceRecord) => snowCm(r) > 0;
const isRain = (r: ServiceRecord) => !isSnow(r) && rainMm(r) > 0;
const isFootball = (r: ServiceRecord) => (r.football_count ?? 0) > 0;
const hasCompetition = (r: ServiceRecord, comp: string) =>
  (r.events ?? []).some((e) => e.type === "football" && e.competition === comp);

// ─── aggregation ─────────────────────────────────────────────────────────────────────────

export interface DemandSummary {
  /** how many services this average is over — the grounding number */
  n: number;
  /** avg total items sold per service */
  avgItems: number;
  /** avg number of orders/tickets per service */
  avgOrders: number;
  /** avg revenue (€) per service */
  avgRevenue: number;
  /** category name → avg units per service */
  byCategory: Record<string, number>;
}

function summarize(recs: ServiceRecord[]): DemandSummary {
  const n = recs.length;
  if (!n) return { n: 0, avgItems: 0, avgOrders: 0, avgRevenue: 0, byCategory: {} };
  let items = 0,
    orders = 0,
    rev = 0;
  const catTotals = new Map<string, number>();
  for (const r of recs) {
    items += r.total_items ?? 0;
    orders += r.total_orders ?? 0;
    rev += r.total_revenue ?? 0;
    for (const [c, q] of Object.entries(r.sales_by_category ?? {})) {
      const key = normCat(c);
      catTotals.set(key, (catTotals.get(key) ?? 0) + (q ?? 0));
    }
  }
  const byCategory: Record<string, number> = {};
  for (const [c, total] of catTotals) byCategory[c] = round1(total / n);
  return { n, avgItems: round1(items / n), avgOrders: round1(orders / n), avgRevenue: round1(rev / n), byCategory };
}

function topProducts(recs: ServiceRecord[], k: number): { product: string; avg: number }[] {
  const n = recs.length || 1;
  const totals = new Map<string, number>();
  for (const r of recs) for (const [p, q] of Object.entries(r.sales_by_product ?? {})) totals.set(p, (totals.get(p) ?? 0) + (q ?? 0));
  return [...totals.entries()]
    .map(([product, total]) => ({ product, avg: round1(total / n) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, k);
}

// ─── 1. the base rate ────────────────────────────────────────────────────────────────────

export interface BaselineResult {
  query: { day: string; service: string; lastN: number };
  found: boolean;
  source: string;
  window: { from: string; to: string } | null;
  summary: DemandSummary;
  topProducts: { product: string; avg: number }[];
  note: string;
}

/**
 * The typical night: average over the most recent `lastN` services matching `day` + `service`.
 * Default lastN = 8 ≈ the last 2 months of a given weekday. Records are date-sorted, so
 * `slice(-lastN)` is the recent window.
 */
export function baselineDemand(day: string, service: string, lastN = 8): BaselineResult {
  const d = day.toLowerCase();
  const s = service.toLowerCase();
  const matches = visible().filter((r) => r.day === d && r.service === s);
  const recent = matches.slice(-lastN);
  const summary = summarize(recent);
  const window = recent.length ? { from: recent[0].date, to: recent[recent.length - 1].date } : null;
  const note = !POS_INFO.found
    ? `No POS data at ${POS_INFO.source}.`
    : recent.length
      ? `Base rate over the last ${recent.length} ${d} ${s} service(s) (${window?.from} → ${window?.to}): avg ${summary.avgOrders} orders / ${summary.avgItems} items / €${summary.avgRevenue}. Does NOT condition on weather/football/holidays — add those separately with the effect_of_* tools.`
      : `No past ${d} ${s} services on file.`;
  return { query: { day: d, service: s, lastN }, found: POS_INFO.found, source: POS_INFO.source, window, summary, topProducts: topProducts(recent, 12), note };
}

export interface DayBaselineResult {
  day: string;
  lastN: number;
  found: boolean;
  source: string;
  /** the typical lunch and dinner for this weekday, kept SEPARATE (services differ a lot) */
  lunch: BaselineResult;
  dinner: BaselineResult;
}

/** Base rate for a weekday with BOTH services broken out — typical lunch vs typical dinner. */
export function baselineDay(day: string, lastN = 8): DayBaselineResult {
  return {
    day: day.toLowerCase(),
    lastN,
    found: POS_INFO.found,
    source: POS_INFO.source,
    lunch: baselineDemand(day, "lunch", lastN),
    dinner: baselineDemand(day, "dinner", lastN),
  };
}

// ─── 2. isolated marginal effects ────────────────────────────────────────────────────────

export interface CategoryMover {
  category: string;
  /** avg units with the factor − without it */
  delta: number;
  pct: number;
}

export interface EffectResult {
  factor: string;
  service: string;
  withFactor: DemandSummary;
  withoutFactor: DemandSummary;
  /** avg total items WITH the factor − WITHOUT it (the headline ±) */
  deltaItems: number;
  pctItems: number;
  /** which categories move the most (sorted by |delta|) — e.g. rain: sushi down, ramen up */
  categoryMovers: CategoryMover[];
  /** true when both sides clear MIN_SAMPLE — otherwise treat as a weak signal */
  reliable: boolean;
  note: string;
}

function categoryMovers(withF: DemandSummary, withoutF: DemandSummary, k = 8): CategoryMover[] {
  const cats = new Set([...Object.keys(withF.byCategory), ...Object.keys(withoutF.byCategory)]);
  return [...cats]
    .map((category) => {
      const a = withF.byCategory[category] ?? 0;
      const b = withoutF.byCategory[category] ?? 0;
      const delta = round1(a - b);
      return { category, delta, pct: pct(delta, b) };
    })
    .filter((m) => m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, k);
}

/** Compare nights WITH a factor vs comparable nights WITHOUT it (same service), over ALL history. */
function effect(factor: string, pred: (r: ServiceRecord) => boolean, opts: { service?: string }): EffectResult {
  const service = (opts.service ?? "any").toLowerCase();
  const base = opts.service ? visible().filter((r) => r.service === service) : visible();
  const withF = summarize(base.filter(pred));
  const withoutF = summarize(base.filter((r) => !pred(r)));
  const deltaItems = round1(withF.avgItems - withoutF.avgItems);
  const reliable = withF.n >= MIN_SAMPLE && withoutF.n >= MIN_SAMPLE;
  const note = !POS_INFO.found
    ? `No POS data at ${POS_INFO.source}.`
    : `${withF.n} ${service} night(s) WITH ${factor} (avg ${withF.avgItems} items) vs ${withoutF.n} WITHOUT (avg ${withoutF.avgItems}) → ${deltaItems >= 0 ? "+" : ""}${deltaItems} items (${pct(deltaItems, withoutF.avgItems)}%).` +
      (reliable ? "" : ` ⚠ small sample (need ≥${MIN_SAMPLE}/side) — weak signal, do not over-weight.`);
  return { factor, service, withFactor: withF, withoutFactor: withoutF, deltaItems, pctItems: pct(deltaItems, withoutF.avgItems), categoryMovers: categoryMovers(withF, withoutF), reliable, note };
}

/** How much a football match night moves demand. Optionally narrow to one competition. */
export function footballEffect(opts: { service?: string; competition?: string } = {}): EffectResult {
  if (opts.competition) return effect(`a ${opts.competition} match`, (r) => hasCompetition(r, opts.competition!), opts);
  return effect("a football match", isFootball, opts);
}

/** How much a weather condition moves demand (rain/snow lift hot dishes, drop cold ones; heat/cold shift it too). */
export function weatherEffect(condition: "rain" | "snow" | "hot" | "cold", opts: { service?: string } = {}): EffectResult {
  const pred =
    condition === "rain"
      ? isRain
      : condition === "snow"
        ? isSnow
        : condition === "hot"
          ? (r: ServiceRecord) => (tempMaxC(r) ?? -99) >= 25
          : (r: ServiceRecord) => (tempMaxC(r) ?? 99) <= 10;
  return effect(condition === "hot" ? "a hot day (≥25°C)" : condition === "cold" ? "a cold day (≤10°C)" : condition, pred, opts);
}

/** How much a calendar flag (public holiday / school break / commercial event) moves demand. */
export function calendarEffect(factor: "holiday" | "school_break" | "commercial_event", opts: { service?: string } = {}): EffectResult {
  const pred =
    factor === "holiday"
      ? (r: ServiceRecord) => !!r.is_holiday
      : factor === "school_break"
        ? (r: ServiceRecord) => !!r.school_break
        : (r: ServiceRecord) => !!r.is_commercial_event;
  const label = factor === "school_break" ? "a school break" : factor === "commercial_event" ? "a commercial event" : "a public holiday";
  return effect(label, pred, opts);
}

/** Raw spot-check: every real service on one date. AS-OF guarded — a holdout day returns nothing. */
export function serviceOn(date: string): ServiceRecord[] {
  return visible().filter((r) => r.date === date);
}

// ─── eval support: holdout split + ground-truth (NOT as-of guarded — the harness, not agents) ──

/** Add `days` to an ISO date (date-only, deterministic). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The full data range (ignores AS_OF) — used to choose a holdout window. */
export function dataRange(): { from: string | null; to: string | null; count: number } {
  return { from: RECORDS[0]?.date ?? null, to: RECORDS[RECORDS.length - 1]?.date ?? null, count: RECORDS.length };
}

/** Cutoff date that holds out the last `weeks` of data (everything ≥ cutoff is the test set). */
export function holdoutCutoff(weeks: number): string {
  const end = RECORDS[RECORDS.length - 1]?.date;
  if (!end) return "";
  return addDays(end, -weeks * 7 + 1); // +1 so a 1-week holdout includes exactly the last 7 days
}

/** The held-out services (date ≥ cutoff) — the real future we score predictions against. */
export function holdoutServices(cutoff: string): ServiceRecord[] {
  return RECORDS.filter((r) => r.date >= cutoff);
}

/** The Scout-style conditions for a real service — what's legitimately knowable about the day (NOT its sales). */
export interface Conditions {
  date: string;
  day: string;
  service: string;
  rain: boolean;
  snow: boolean;
  tempMaxC: number | null;
  football: boolean;
  competitions: string[];
  holiday: boolean;
  schoolBreak: boolean;
  commercialEvent: boolean;
}

export function conditionsOf(r: ServiceRecord): Conditions {
  const comps = [...new Set((r.events ?? []).filter((e) => e.type === "football" && e.competition).map((e) => e.competition as string))];
  return {
    date: r.date,
    day: r.day,
    service: r.service,
    rain: isRain(r),
    snow: isSnow(r),
    tempMaxC: tempMaxC(r),
    football: isFootball(r),
    competitions: comps,
    holiday: !!r.is_holiday,
    schoolBreak: !!r.school_break,
    commercialEvent: !!r.is_commercial_event,
  };
}

/** A plain-language conditions line both arms get equally (the "perfect Scout" for a fair test). */
export function conditionsSentence(c: Conditions): string {
  const parts: string[] = [];
  if (c.football) parts.push(c.competitions.length ? `a football match (${c.competitions.join(", ")})` : "a football match");
  if (c.rain) parts.push("rain");
  if (c.snow) parts.push("snow");
  if (c.tempMaxC != null && c.tempMaxC >= 25) parts.push(`hot (${c.tempMaxC}°C)`);
  if (c.tempMaxC != null && c.tempMaxC <= 10) parts.push(`cold (${c.tempMaxC}°C)`);
  if (c.holiday) parts.push("a public holiday");
  if (c.schoolBreak) parts.push("a school break");
  if (c.commercialEvent) parts.push("a commercial event");
  return parts.length ? parts.join("; ") : "nothing unusual (an ordinary day)";
}

/** Ground-truth total items actually sold for a service (the answer we score against). */
export function actualTotalItems(r: ServiceRecord): number {
  return r.total_items ?? Object.values(r.sales_by_product ?? {}).reduce((a, b) => a + (b ?? 0), 0);
}

/** Training records strictly before the cutoff — for the deterministic naive baseline. */
export function trainBefore(cutoff: string): ServiceRecord[] {
  return RECORDS.filter((r) => r.date < cutoff);
}
