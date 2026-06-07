/**
 * Purchasing tools — the SKU constraints, the requirements (forecast × recipes), and the budget.
 * Parameter-free + Weave-traced; they read the ACTIVE scenario set by the arm (agents can't pick
 * it), mirroring the as-of pattern in pos-analytics so every figure is a traced tool result.
 */
import { traced } from "@weavehacks/observability";
import type { ToolSpec } from "@weavehacks/runtime";
import { SKUS, RECIPES, type PurchaseScenario } from "@weavehacks/seed";

const round2 = (n: number) => Math.round(n * 100) / 100;
const BY_ID = new Map(SKUS.map((s) => [s.id, s]));
export function skuById(id: string) {
  return BY_ID.get(id);
}

/** Units of each SKU needed to FULLY cover a demand profile (bill-of-materials expansion). */
export function requirementsFor(demand: Record<string, number>): Record<string, number> {
  const req: Record<string, number> = {};
  for (const [item, servings] of Object.entries(demand)) {
    for (const line of RECIPES[item] ?? []) req[line.sku] = round2((req[line.sku] ?? 0) + line.qty * servings);
  }
  return req;
}

let ACTIVE: PurchaseScenario | null = null;
export function setPurchaseContext(s: PurchaseScenario | null): void {
  ACTIVE = s;
}

export const getSkusTool: ToolSpec = {
  name: "get_skus",
  description:
    "Ingredient SKUs you can order. caseSize = order ONLY in whole multiples of this. shelfLifeDays = a perishable spoils if you hold more than shelfLifeDays × its daily requirement. Also: costPerUnit, current stock, perishable.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: traced("tool.get_skus", () => SKUS),
};

export const getRequirementsTool: ToolSpec = {
  name: "get_requirements",
  description: "Units of each SKU needed to FULLY cover tonight's forecast demand. Your order PLUS current stock must reach these.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: traced("tool.get_requirements", () => (ACTIVE ? requirementsFor(ACTIVE.demand) : {})),
};

export const getBudgetTool: ToolSpec = {
  name: "get_budget",
  description: "Total euros available for tonight's order — your order cost must not exceed this.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: traced("tool.get_budget", () => ({ budget: ACTIVE?.budget ?? 0 })),
};

export const PURCHASING_TOOLS: ToolSpec[] = [getSkusTool, getRequirementsTool, getBudgetTool];
