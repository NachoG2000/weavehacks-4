/**
 * POS daily-service records — the REAL Le Kyoto data contract (Hiboutik export).
 *
 * One record = one SERVICE on one DAY (e.g. 2023-06-02 dinner). This is the shape the
 * operator's JSON must follow; the forecaster (Prep agent) and the backtest read it.
 *
 * The demo split: ~year 1 is VISIBLE (train), years 2–3 are HIDDEN (the "future" we
 * predict and then score against). See `splitTrainHoldout`.
 *
 * This is NOT a pipeline — it loads ONE local JSON file the operator produces. No fetchers,
 * no scrapers. Point it at the file with `POS_DATA_PATH`, or drop it at the default path.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Weather payload is loose for now (the operator's enrichment may grow). */
export type WeatherInfo = Record<string, unknown> | null;

/**
 * One enriched event attached to a service (the operator's calendar join). Football entries
 * carry the competition + clubs, so the Historian can isolate "Champions League nights" etc.
 * Loose by design — the enrichment may grow; only `type` is relied on.
 */
export interface PosEvent {
  /** "football" | "holiday" | "school" | "commercial" */
  type: string;
  name?: string;
  category?: string;
  /** football only: e.g. "Ligue 1", "Champions League", "Premier League" */
  competition?: string;
  french_club?: string;
  marquee_club?: string;
  time?: string;
  impact?: string | null;
  [key: string]: unknown;
}

/** One service (lunch or dinner) on one day. */
export interface ServiceRecord {
  /** ISO date, e.g. "2023-06-02" */
  date: string;
  /** lowercase weekday, e.g. "friday" */
  day: string;
  /** "lunch" | "dinner" (kept as a string — don't assume the full set) */
  service: string;
  is_open: boolean;
  is_weekend: boolean;
  season: string;

  total_orders: number;
  total_items: number;
  total_revenue: number;
  avg_basket: number;
  delivery_orders: number;
  takeaway_orders: number;
  discount_total: number;

  /** category name → units sold that service */
  sales_by_category: Record<string, number>;
  /** product name → units sold that service (the forecast target) */
  sales_by_product: Record<string, number>;

  /** contextual signals the SOLO baseline ignores and the TEAM will exploit */
  weather: WeatherInfo;
  school_break: boolean;
  is_holiday: boolean;
  is_commercial_event: boolean;
  football_count: number;
  events: PosEvent[];
}

/** Default location for the operator's JSON (override with POS_DATA_PATH). */
export const DEFAULT_POS_PATH = fileURLToPath(new URL("../data/pos.json", import.meta.url));

export interface LoadResult {
  records: ServiceRecord[];
  path: string;
  /** false when the file is missing — the harness reports this instead of crashing */
  found: boolean;
}

/**
 * Load the POS records from a JSON file (an array of ServiceRecord). Missing file →
 * `{ found: false, records: [] }` so callers can print a friendly "drop your data here".
 */
export function loadServiceRecords(path: string = process.env.POS_DATA_PATH ?? DEFAULT_POS_PATH): LoadResult {
  if (!existsSync(path)) return { records: [], path, found: false };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`[seed/pos] ${path} must be a JSON array of service records`);
  // Keep only open services with sales — closed days carry no demand signal.
  const records = (raw as ServiceRecord[]).filter((r) => r && r.is_open !== false);
  records.sort((a, b) => a.date.localeCompare(b.date));
  return { records, path, found: true };
}

/** Add `years` calendar years to an ISO date string (date-only, no TZ math needed). */
function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface Split {
  train: ServiceRecord[];
  holdout: ServiceRecord[];
  /** records with date < splitDate are train; >= are holdout */
  splitDate: string;
}

/**
 * Split into VISIBLE train (year 1) and HIDDEN holdout (years 2–3).
 *
 * Default split = earliest date + `trainYears` (1). Pass an explicit `splitDate` to override.
 */
export function splitTrainHoldout(
  records: ServiceRecord[],
  opts: { splitDate?: string; trainYears?: number } = {},
): Split {
  if (records.length === 0) return { train: [], holdout: [], splitDate: opts.splitDate ?? "" };
  const earliest = records[0].date; // records are date-sorted by the loader
  const splitDate = opts.splitDate ?? addYears(earliest, opts.trainYears ?? 1);
  const train = records.filter((r) => r.date < splitDate);
  const holdout = records.filter((r) => r.date >= splitDate);
  return { train, holdout, splitDate };
}

/** Every distinct product name seen across the given records. */
export function allProducts(records: ServiceRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) for (const p of Object.keys(r.sales_by_product ?? {})) set.add(p);
  return [...set].sort();
}
