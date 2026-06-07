/**
 * Purchasing feasibility eval — solo vs team (+ a deterministic greedy reference) on constraint
 * satisfaction. No outcome data: we score whether each order is FEASIBLE against the authored
 * constraints. Solo (one pass) racks up violations; the team's gate loops to a feasible order.
 */
import { PURCHASE_SCENARIOS, type PurchaseScenario } from "@weavehacks/seed";
import { greedyPurchase, soloPurchase, teamPurchase, type PurchaseArm, type PurchaseResult } from "./purchasing";

export interface PurchaseScenarioResult {
  scenario: string;
  arm: PurchaseArm;
  result: PurchaseResult;
}

export interface PurchaseArmSummary {
  arm: PurchaseArm;
  scored: number;
  /** % of scenarios with a fully feasible order */
  feasibleRate: number;
  /** mean constraints-satisfied % */
  avgSatisfiedPct: number;
  /** total constraint violations across scenarios */
  totalViolations: number;
  avgCost: number;
}

export interface PurchaseEvalResult {
  scenarios: number;
  arms: PurchaseArm[];
  results: PurchaseScenarioResult[];
  summary: Record<PurchaseArm, PurchaseArmSummary>;
}

export interface PurchaseEvalOptions {
  scenarios?: PurchaseScenario[];
  arms?: PurchaseArm[];
  model?: string;
  onResult?: (r: PurchaseScenarioResult, index: number, total: number) => void;
}

async function runArm(arm: PurchaseArm, scenario: PurchaseScenario, model?: string): Promise<PurchaseResult> {
  if (arm === "greedy") return greedyPurchase(scenario);
  if (arm === "solo") return soloPurchase(scenario, { model });
  return teamPurchase(scenario, { model });
}

export async function runPurchaseEval(opts: PurchaseEvalOptions = {}): Promise<PurchaseEvalResult> {
  const scenarios = opts.scenarios ?? PURCHASE_SCENARIOS;
  const arms = opts.arms ?? (["greedy", "solo", "team"] as PurchaseArm[]);
  const results: PurchaseScenarioResult[] = [];
  const total = scenarios.length * arms.length;
  let i = 0;
  for (const scenario of scenarios) {
    for (const arm of arms) {
      const result = await runArm(arm, scenario, opts.model);
      const r: PurchaseScenarioResult = { scenario: scenario.name, arm, result };
      results.push(r);
      opts.onResult?.(r, i++, total);
    }
  }

  const summary = {} as Record<PurchaseArm, PurchaseArmSummary>;
  for (const arm of arms) {
    const rs = results.filter((r) => r.arm === arm);
    const scored = rs.length;
    const feasibleRate = scored ? Math.round((rs.filter((r) => r.result.check.feasible).length / scored) * 100) : 0;
    const avgSatisfiedPct = scored ? Math.round((rs.reduce((s, r) => s + (r.result.check.satisfied / r.result.check.total) * 100, 0) / scored)) : 0;
    const totalViolations = rs.reduce((s, r) => s + r.result.check.violations.length, 0);
    const avgCost = scored ? Math.round((rs.reduce((s, r) => s + r.result.check.cost, 0) / scored) * 100) / 100 : 0;
    summary[arm] = { arm, scored, feasibleRate, avgSatisfiedPct, totalViolations, avgCost };
  }

  return { scenarios: scenarios.length, arms, results, summary };
}
