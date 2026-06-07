/**
 * Purchasing constraints + recipes — the AUTHORED ground truth for the Prep→Purchasing loop.
 *
 * No outcome data needed: we don't measure whether the food sold, we check whether the ORDER is
 * FEASIBLE against rules we define — covers demand, under budget, whole cases, no perishable
 * over-stock. Those constraints conflict (coverage pushes up; budget + shelf-life push down;
 * case sizes force lumpy rounding), which is exactly what makes a checker necessary.
 *
 * ⚠️ Demo data — plausible, not Le Kyoto's real supplier terms. Keep the SHAPE, swap the VALUES.
 */

export interface Sku {
  id: string;
  name: string;
  unit: string; // "kg", "nest", "piece", "pack"
  /** € per unit */
  costPerUnit: number;
  /** must order in whole multiples of this many units */
  caseSize: number;
  /** perishable window in days (you can hold at most shelfLifeDays × daily demand before waste) */
  shelfLifeDays: number;
  /** units already on hand */
  stock: number;
  perishable: boolean;
}

export interface RecipeLine {
  sku: string;
  /** units of this SKU per ONE serving of the menu item */
  qty: number;
}

/** Ingredient SKUs the kitchen buys. */
export const SKUS: Sku[] = [
  { id: "pork_belly", name: "Pork belly", unit: "kg", costPerUnit: 9.0, caseSize: 1, shelfLifeDays: 4, stock: 2, perishable: true },
  { id: "ramen_noodles", name: "Ramen noodle nests", unit: "nest", costPerUnit: 0.45, caseSize: 50, shelfLifeDays: 12, stock: 20, perishable: false },
  { id: "soba_noodles", name: "Soba noodle nests", unit: "nest", costPerUnit: 0.55, caseSize: 30, shelfLifeDays: 10, stock: 10, perishable: false },
  { id: "gyoza_pieces", name: "Gyoza (raw)", unit: "piece", costPerUnit: 0.22, caseSize: 50, shelfLifeDays: 5, stock: 30, perishable: true },
  { id: "green_onion", name: "Green onion", unit: "kg", costPerUnit: 3.0, caseSize: 1, shelfLifeDays: 4, stock: 0.5, perishable: true },
  { id: "edamame_pack", name: "Edamame (frozen pack)", unit: "pack", costPerUnit: 1.1, caseSize: 20, shelfLifeDays: 60, stock: 8, perishable: false },
];

/** Bill of materials: one serving of a menu item → the SKUs it consumes. */
export const RECIPES: Record<string, RecipeLine[]> = {
  tonkotsu_ramen: [
    { sku: "pork_belly", qty: 0.12 },
    { sku: "ramen_noodles", qty: 1 },
    { sku: "green_onion", qty: 0.02 },
  ],
  shoyu_ramen: [
    { sku: "pork_belly", qty: 0.06 },
    { sku: "ramen_noodles", qty: 1 },
    { sku: "green_onion", qty: 0.02 },
  ],
  gyoza: [{ sku: "gyoza_pieces", qty: 6 }], // one order = 6 pieces
  cold_soba: [
    { sku: "soba_noodles", qty: 1 },
    { sku: "green_onion", qty: 0.01 },
  ],
  edamame: [{ sku: "edamame_pack", qty: 1 }],
};

export interface PurchaseScenario {
  name: string;
  /** servings forecast per menu item id */
  demand: Record<string, number>;
  /** € available for this order */
  budget: number;
}

/** Demand profiles (the "Prep forecast" input). Tuned so a careful order is feasible but a sloppy one busts a constraint. */
// Budgets are realistically TIGHT (~5-10% over the minimal feasible order) — a real kitchen runs
// thin margins, so a sloppy over-order busts budget and a careless under-order leaves a stockout.
export const PURCHASE_SCENARIOS: PurchaseScenario[] = [
  { name: "Busy Friday", demand: { tonkotsu_ramen: 18, shoyu_ramen: 10, gyoza: 32, cold_soba: 6, edamame: 12 }, budget: 108 },
  { name: "Quiet Tuesday", demand: { tonkotsu_ramen: 8, shoyu_ramen: 5, gyoza: 14, cold_soba: 4, edamame: 6 }, budget: 28 },
  { name: "Match-night surge", demand: { tonkotsu_ramen: 22, shoyu_ramen: 12, gyoza: 40, cold_soba: 3, edamame: 15 }, budget: 128 },
  { name: "Rainy day", demand: { tonkotsu_ramen: 20, shoyu_ramen: 14, gyoza: 18, cold_soba: 1, edamame: 8 }, budget: 70 },
];
