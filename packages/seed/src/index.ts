/**
 * Curated SEED SLICE — the demo's real-data stand-in.
 *
 * We have the real thing (3yr Hiboutik POS, public Google reviews, weather, menu) but the
 * demo runs on a small hardcoded slice so there's NO live integration to break on stage.
 * This is PITCH CREDIBILITY ("grounded in real data"), not a technical dependency.
 *
 * Keep it EASY TO EDIT — we stage the demo by tweaking these arrays. Agents cite these as
 * their grounding sources; the Critic checks that every approved claim traces back to one.
 *
 * ⚠️ PLACEHOLDER VALUES — representative, not Le Kyoto's actual records. Replace with the
 * real curated slice (target ~50 orders, ~20 reviews, one weekend's weather). Keep the SHAPE.
 */

import type { MenuItem } from "@weavehacks/truth";

// Real Le Kyoto POS daily-service records + train/holdout split (the forecast data contract).
export * from "./pos";

/** A single POS order line (flattened for the demo). */
export interface Order {
  /** ISO date */
  date: string;
  /** 0=Sun … 6=Sat (denormalized for fast "last 8 Fridays" queries) */
  dow: number;
  /** local hour 0–23 */
  hour: number;
  /** menu item id (see @weavehacks/truth) */
  itemId: MenuItem["id"];
  qty: number;
}

export interface Review {
  id: string;
  /** 1–5 stars */
  stars: number;
  text: string;
  /** menu item ids this review mentions — agents cite these */
  mentions: MenuItem["id"][];
}

export interface WeatherDay {
  /** ISO date */
  date: string;
  dow: number;
  condition: "clear" | "cloud" | "rain";
  tempC: number;
}

// ── Orders (TODO: expand to ~50 real curated rows) ───────────────────────────
// A few Fridays so Prep's "last N Fridays" demand prediction has something to chew on.
export const ORDERS: Order[] = [
  { date: "2026-05-08", dow: 5, hour: 19, itemId: "gyoza", qty: 28 },
  { date: "2026-05-08", dow: 5, hour: 20, itemId: "shoyu_ramen", qty: 14 },
  { date: "2026-05-08", dow: 5, hour: 20, itemId: "tonkotsu_ramen", qty: 22 },
  { date: "2026-05-15", dow: 5, hour: 19, itemId: "gyoza", qty: 33 },
  { date: "2026-05-15", dow: 5, hour: 20, itemId: "shoyu_ramen", qty: 16 },
  { date: "2026-05-15", dow: 5, hour: 20, itemId: "cold_soba", qty: 12 },
  { date: "2026-05-22", dow: 5, hour: 19, itemId: "gyoza", qty: 31 },
  { date: "2026-05-22", dow: 5, hour: 20, itemId: "tonkotsu_ramen", qty: 25 },
  { date: "2026-05-22", dow: 5, hour: 21, itemId: "cold_soba", qty: 4 }, // rainy Friday → soba collapses
];

// ── Reviews (TODO: expand to ~20 real curated reviews) ───────────────────────
export const REVIEWS: Review[] = [
  { id: "r1", stars: 5, text: "The tonkotsu broth is unreal, 18 hours you can taste it.", mentions: ["tonkotsu_ramen"] },
  { id: "r2", stars: 5, text: "Best broth in the area, gyoza crispy too.", mentions: ["tonkotsu_ramen", "gyoza"] },
  { id: "r3", stars: 4, text: "Solid shoyu, fast delivery.", mentions: ["shoyu_ramen"] },
  { id: "r4", stars: 5, text: "That broth keeps me coming back every week.", mentions: ["tonkotsu_ramen"] },
  { id: "r5", stars: 3, text: "Soba was fine, nothing special.", mentions: ["cold_soba"] },
];

// ── Weather (one weekend) ────────────────────────────────────────────────────
export const WEATHER: WeatherDay[] = [
  { date: "2026-06-12", dow: 5, condition: "rain", tempC: 14 }, // the demo's "rainy Friday"
  { date: "2026-06-13", dow: 6, condition: "cloud", tempC: 17 },
];

/** Counts for the seed health check (no LLM, no credits). */
export function seedSummary() {
  const fivers = REVIEWS.filter((r) => r.stars === 5);
  const brothMentions = fivers.filter((r) => r.mentions.includes("tonkotsu_ramen")).length;
  return {
    orders: ORDERS.length,
    reviews: REVIEWS.length,
    weatherDays: WEATHER.length,
    /** the demo's grounding stat: % of 5★ reviews mentioning the broth */
    pctFiveStarMentionBroth: fivers.length ? Math.round((brothMentions / fivers.length) * 100) : 0,
  };
}
