/**
 * Prep → Purchasing constraint loop — pillar #2.
 *
 * Prep wants COVERAGE (never run out); Purchasing is bounded by BUDGET + supplier CASE-SIZES +
 * perishable SHELF-LIFE. Those conflict, so a checker has to exist — and "is the order feasible?"
 * is verifiable against rules we author, with NO outcome data. Same shape as Content→Critic:
 *
 *   • greedy — deterministic minimal-cover order (no LLM). Feasibility certificate + reference.
 *   • solo   — one Purchasing agent juggles coverage + budget + cases + shelf-life in one pass.
 *   • team   — proposer + an INDEPENDENT deterministic constraint gate that rejects violations
 *              and sends the order back to fix, looping until feasible. Wins by construction.
 *
 * The gate (checkOrder) is deterministic — constraints are exactly checkable, so the verifier
 * doesn't need an LLM and can't be argued to be grading anyone.
 */
import { traced } from "@weavehacks/observability";
import { runToolAgent } from "@weavehacks/runtime";
import type { PurchaseScenario } from "@weavehacks/seed";
import { PURCHASING_TOOLS, requirementsFor, skuById, setPurchaseContext } from "./tools/purchasing";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ViolationType = "coverage" | "budget" | "case_size" | "shelf_life";
export interface Violation {
  type: ViolationType;
  sku?: string;
  detail: string;
}
export interface OrderCheck {
  feasible: boolean;
  violations: Violation[];
  /** constraints satisfied / checked (fixed per scenario, so arms are comparable) */
  satisfied: number;
  total: number;
  cost: number;
  budget: number;
}

/** Deterministic gate: does this order satisfy every authored constraint for the scenario? */
export function checkOrder(order: Record<string, number>, scenario: PurchaseScenario): OrderCheck {
  const req = requirementsFor(scenario.demand);
  const violations: Violation[] = [];
  let total = 0;

  for (const [id, need] of Object.entries(req)) {
    const sku = skuById(id);
    const stock = sku?.stock ?? 0;
    const qty = Math.max(0, order[id] ?? 0);

    total++; // coverage
    if (round2(stock + qty) + 1e-9 < need) violations.push({ type: "coverage", sku: id, detail: `stock ${stock} + order ${qty} = ${round2(stock + qty)} < needed ${need}` });

    total++; // case size
    if (sku && qty > 0 && Math.abs(qty / sku.caseSize - Math.round(qty / sku.caseSize)) > 1e-6)
      violations.push({ type: "case_size", sku: id, detail: `ordered ${qty} is not a whole multiple of case ${sku.caseSize}` });

    if (sku?.perishable) {
      total++; // shelf life
      const maxHold = round2(sku.shelfLifeDays * need);
      if (round2(stock + qty) > maxHold + 1e-9) violations.push({ type: "shelf_life", sku: id, detail: `would hold ${round2(stock + qty)} but only ${maxHold} keeps fresh (${sku.shelfLifeDays}d × ${need}/day) → waste` });
    }
  }

  let cost = 0;
  for (const [id, q] of Object.entries(order)) {
    const sku = skuById(id);
    if (sku) cost += Math.max(0, q) * sku.costPerUnit;
  }
  cost = round2(cost);
  total++; // budget
  if (cost > scenario.budget + 1e-9) violations.push({ type: "budget", detail: `order €${cost} exceeds budget €${scenario.budget}` });

  return { feasible: violations.length === 0, violations, satisfied: total - violations.length, total, cost, budget: scenario.budget };
}

/** Deterministic minimal-cover order in whole cases — a feasibility certificate + non-LLM reference arm. */
export function greedyOrder(scenario: PurchaseScenario): Record<string, number> {
  const req = requirementsFor(scenario.demand);
  const order: Record<string, number> = {};
  for (const [id, need] of Object.entries(req)) {
    const sku = skuById(id);
    if (!sku) continue;
    const deficit = Math.max(0, round2(need - sku.stock));
    order[id] = Math.ceil(deficit / sku.caseSize - 1e-9) * sku.caseSize;
  }
  return order;
}

export type PurchaseArm = "greedy" | "solo" | "team";
export interface PurchaseResult {
  arm: PurchaseArm;
  scenario: string;
  order: Record<string, number>;
  check: OrderCheck;
  rounds: number;
  /** violations the gate caught across the loop (team only) */
  rejections: Violation[];
  escalated: boolean;
  toolCalls: number;
}

const PURCHASER =
  "You are the Purchasing manager for Le Kyoto. Produce tonight's ingredient order. Call get_requirements (units needed to " +
  "cover demand), get_skus (costPerUnit; caseSize — order ONLY whole multiples; shelfLifeDays — a perishable spoils if stock+order " +
  "exceeds shelfLifeDays × its requirement; current stock), and get_budget. RULES: (1) cover demand — stock+order ≥ required for " +
  "every SKU; (2) total cost ≤ budget; (3) every SKU ordered in whole case multiples; (4) don't over-stock perishables past shelf " +
  "life. Output ONLY:\n" +
  'ORDER_JSON: {"order": [{"sku": "<id>", "units": <number>}], "escalate": <true only if demand cannot be covered within budget>}';

function extractTaggedJson(text: string, tag: string): any | null {
  const at = text.indexOf(tag);
  const start = text.indexOf("{", at >= 0 ? at + tag.length : 0);
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

function parseOrder(text: string): { order: Record<string, number>; escalate: boolean } {
  const o = extractTaggedJson(text, "ORDER_JSON") ?? {};
  const order: Record<string, number> = {};
  if (Array.isArray(o.order)) for (const l of o.order) if (l?.sku) order[String(l.sku)] = Number(l.units ?? l.qty ?? 0) || 0;
  return { order, escalate: !!o.escalate };
}

function propose(input: string, model?: string) {
  return runToolAgent({ name: "Purchasing", role: "prep", instructions: PURCHASER, input, tools: PURCHASING_TOOLS, model, maxSteps: 5 });
}

export interface PurchaseOptions {
  model?: string;
  maxRounds?: number;
  onStep?: (step: { label: string; order?: Record<string, number>; check?: OrderCheck }) => void;
}

/** GREEDY — deterministic, no LLM. */
export function greedyPurchase(scenario: PurchaseScenario): PurchaseResult {
  const order = greedyOrder(scenario);
  return { arm: "greedy", scenario: scenario.name, order, check: checkOrder(order, scenario), rounds: 0, rejections: [], escalated: false, toolCalls: 0 };
}

/** SOLO — one pass, no gate. */
export async function soloPurchase(scenario: PurchaseScenario, opts: PurchaseOptions = {}): Promise<PurchaseResult> {
  setPurchaseContext(scenario);
  try {
    const res = await traced("agent.purchasing_solo", (s: string) => propose(`Scenario: ${s}. Produce the order.`, opts.model))(scenario.name);
    const { order, escalate } = parseOrder(res.text);
    return { arm: "solo", scenario: scenario.name, order, check: checkOrder(order, scenario), rounds: 1, rejections: [], escalated: escalate, toolCalls: res.toolCalls.length };
  } finally {
    setPurchaseContext(null);
  }
}

/** TEAM — proposer + deterministic constraint gate + revise loop until feasible. */
export function teamPurchase(scenario: PurchaseScenario, opts: PurchaseOptions = {}): Promise<PurchaseResult> {
  const maxRounds = opts.maxRounds ?? 3;
  return traced("brigade.purchasing", async (): Promise<PurchaseResult> => {
    setPurchaseContext(scenario);
    try {
      let toolCalls = 0;
      let res = await propose(`Scenario: ${scenario.name}. Produce the order.`, opts.model);
      toolCalls += res.toolCalls.length;
      let { order, escalate } = parseOrder(res.text);
      let check = checkOrder(order, scenario);
      let rounds = 1;
      const rejections: Violation[] = [];
      opts.onStep?.({ label: "order v1", order, check });

      for (let i = 0; i < maxRounds - 1 && !check.feasible; i++) {
        rejections.push(...check.violations);
        res = await propose(
          `Scenario: ${scenario.name}. Your previous order violated these constraints — FIX every one (re-check coverage, budget, whole cases, and perishable shelf-life):\n${check.violations.map((v) => `- [${v.type}] ${v.sku ? v.sku + ": " : ""}${v.detail}`).join("\n")}\n\nProduce a corrected order.`,
          opts.model,
        );
        toolCalls += res.toolCalls.length;
        ({ order, escalate } = parseOrder(res.text));
        check = checkOrder(order, scenario);
        rounds++;
        opts.onStep?.({ label: `order v${rounds} (gate: ${check.feasible ? "feasible ✅" : check.violations.length + " left"})`, order, check });
      }
      return { arm: "team", scenario: scenario.name, order, check, rounds, rejections, escalated: escalate, toolCalls };
    } finally {
      setPurchaseContext(null);
    }
  })();
}

export const PURCHASE_ARMS = { greedy: greedyPurchase, solo: soloPurchase, team: teamPurchase };
