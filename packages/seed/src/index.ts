/**
 * Curated SEED SLICE — the demo's real-data stand-in.
 *
 * We have the real thing (3yr Hiboutik POS, public Google reviews, weather, fixtures) but the
 * demo runs on a small hardcoded slice so there's NO live integration to break on stage. This
 * is PITCH CREDIBILITY ("grounded in real data"), not a technical dependency. Keep it easy to
 * edit — these files are the knobs we turn to stage the demo.
 *
 * The split: orders (POS history) + the four "signal" datasets the Scout reads — weather,
 * fixtures, holidays, events. The Historian learns patterns from `orders` joined with these;
 * the Scout reports them for the TARGET date.
 */

export * from "./types";
export { ORDERS } from "./orders";
export { REVIEWS } from "./reviews";
export { WEATHER } from "./weather";
export { FIXTURES } from "./fixtures";
export { HOLIDAYS } from "./holidays";
export { EVENTS } from "./events";
export { SKUS, RECIPES, PURCHASE_SCENARIOS, type Sku, type RecipeLine, type PurchaseScenario } from "./purchasing";

import { ORDERS } from "./orders";
import { REVIEWS } from "./reviews";
import { WEATHER } from "./weather";
import { FIXTURES } from "./fixtures";
import { HOLIDAYS } from "./holidays";
import { EVENTS } from "./events";

// Real Le Kyoto POS daily-service records + train/holdout split (the forecast data contract).
// (The `Order` line type lives in ./types and is re-exported above, so no duplicate here.)
export * from "./pos";

/**
 * The date the demo asks the team to prep for: a Friday that is rain + a PSG derby + a school
 * holiday + an RER strike — i.e. NOT an average Friday. This is what makes the Historian's
 * baseline and the Scout's "today" disagree.
 */
export const TARGET_DATE = "2026-06-12";

/** Counts for the seed health check (no LLM, no credits). */
export function seedSummary() {
  const fivers = REVIEWS.filter((r) => r.stars === 5);
  const brothMentions = fivers.filter((r) => r.mentions.includes("tonkotsu_ramen")).length;
  return {
    orders: ORDERS.length,
    reviews: REVIEWS.length,
    weatherDays: WEATHER.length,
    fixtures: FIXTURES.length,
    holidays: HOLIDAYS.length,
    events: EVENTS.length,
    /** the demo's grounding stat: % of 5★ reviews mentioning the broth */
    pctFiveStarMentionBroth: fivers.length ? Math.round((brothMentions / fivers.length) * 100) : 0,
  };
}
