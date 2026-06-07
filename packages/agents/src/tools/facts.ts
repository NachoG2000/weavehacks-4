/**
 * The grounding source-of-truth for Content/Critic: a fixed set of VERIFIABLE facts derived
 * from the real data — public reviews, the POS export, and the canon menu. Each fact has an
 * `id` a claim must cite to count as grounded. Anything a Content agent says that doesn't map
 * to one of these is, by definition, ungrounded (the "#1 ramen in Paris" hallucination).
 *
 * Deterministic, no LLM. The Content agent calls `get_facts`; the grounding scorer checks each
 * claim's cited factId (and number) against `factById`.
 */
import { traced } from "@weavehacks/observability";
import type { ToolSpec } from "@weavehacks/runtime";
import { REVIEWS, loadServiceRecords } from "@weavehacks/seed";
import { TRUTH, menuItem } from "@weavehacks/truth";

export interface Fact {
  /** stable id a claim must cite */
  id: string;
  /** human phrasing the Content agent can lift */
  statement: string;
  /** the checkable value (numbers are matched within tolerance) */
  value: number | string;
  unit?: string;
  source: "reviews" | "pos" | "menu";
  /** sample size, where relevant — surfaced so thin facts (small n) are visible */
  n?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function buildFacts(): Fact[] {
  const facts: Fact[] = [];

  // ── reviews ──
  const fivers = REVIEWS.filter((r) => r.stars === 5);
  if (fivers.length) {
    const counts = new Map<string, number>();
    for (const r of fivers) for (const m of r.mentions) counts.set(m, (counts.get(m) ?? 0) + 1);
    const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const topName = menuItem(topId)?.name ?? topId;
    const pct = Math.round((topCount / fivers.length) * 100);
    facts.push({ id: "broth_5star_pct", statement: `${pct}% of 5★ reviews mention the ${topName} broth`, value: pct, unit: "%", source: "reviews", n: fivers.length });
    facts.push({ id: "top_reviewed_dish", statement: `${topName} is the most-mentioned dish in 5★ reviews`, value: topName, source: "reviews", n: fivers.length });
  }
  const avg = REVIEWS.length ? round1(REVIEWS.reduce((s, r) => s + r.stars, 0) / REVIEWS.length) : 0;
  facts.push({ id: "avg_rating", statement: `Average rating ${avg}★ across ${REVIEWS.length} reviews`, value: avg, unit: "★", source: "reviews", n: REVIEWS.length });

  // ── menu (canon) ──
  const tonkotsu = menuItem("tonkotsu_ramen");
  if (tonkotsu) facts.push({ id: "tonkotsu_price", statement: `${tonkotsu.name} is €${tonkotsu.price}`, value: tonkotsu.price, unit: "€", source: "menu" });
  const gyoza = menuItem("gyoza");
  if (gyoza) facts.push({ id: "gyoza_price", statement: `${gyoza.name} is €${gyoza.price}`, value: gyoza.price, unit: "€", source: "menu" });
  facts.push({ id: "broth_hours", statement: "The tonkotsu broth simmers 18 hours", value: 18, unit: "h", source: "menu" }); // canon note on the dish
  facts.push({ id: "city", statement: `Le Kyoto is in ${TRUTH.restaurant.city}`, value: TRUTH.restaurant.city, source: "menu" });
  const fri = TRUTH.hours[5];
  if (fri) facts.push({ id: "friday_hours", statement: `Open Friday ${fri}`, value: fri, source: "menu" });

  // ── POS (real export) ──
  const { records, found } = loadServiceRecords();
  if (found && records.length) {
    const agg = new Map<string, { items: number; n: number }>();
    for (const r of records) {
      const k = `${r.day} ${r.service}`;
      const a = agg.get(k) ?? { items: 0, n: 0 };
      a.items += r.total_items ?? 0;
      a.n += 1;
      agg.set(k, a);
    }
    let bestK = "";
    let bestAvg = 0;
    for (const [k, a] of agg) {
      const avgI = a.items / a.n;
      if (avgI > bestAvg) {
        bestAvg = avgI;
        bestK = k;
      }
    }
    if (bestK) facts.push({ id: "busiest_service", statement: `${bestK} is our busiest service (~${Math.round(bestAvg)} dishes)`, value: Math.round(bestAvg), unit: "dishes", source: "pos" });
    facts.push({ id: "services_recorded", statement: `${records.length} services of real sales history`, value: records.length, source: "pos" });
  }

  return facts;
}

export const FACTS: Fact[] = buildFacts();
const BY_ID = new Map(FACTS.map((f) => [f.id, f]));

/** Look up a fact by the id a claim cited. */
export function factById(id: string): Fact | undefined {
  return BY_ID.get(id);
}

export const getFactsTool: ToolSpec = {
  name: "get_facts",
  description:
    "The ONLY verifiable facts you may cite about Le Kyoto (each has an id, a statement, a value, and a source: reviews/pos/menu). " +
    "Every claim you make MUST cite one of these factIds — anything not backed by a fact here is ungrounded and will be rejected.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: traced("tool.get_facts", () => FACTS),
};

export const GROUNDING_TOOLS: ToolSpec[] = [getFactsTool];
