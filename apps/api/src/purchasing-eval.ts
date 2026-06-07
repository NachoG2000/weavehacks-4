/**
 * pnpm purchasing:eval            → greedy + solo + team on constraint feasibility
 * pnpm purchasing:eval solo team  → a subset of arms
 * pnpm purchasing:eval [--model=...]
 *
 * Headline metric = % of scenarios with a FEASIBLE order (covers demand, under budget, whole
 * cases, no perishable over-stock) — checked deterministically against authored constraints, no
 * outcome data. Greedy (no LLM) shows a feasible order always exists; solo busts constraints;
 * the team's gate loops to feasible. Logs each arm as a Weave Evaluation under `purchasing-feasibility`.
 */
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { runPurchaseEval, type PurchaseArm } from "@weavehacks/agents";
import { initWeave, isWeaveActive, runModelEvaluation, flushWeave } from "@weavehacks/observability";

loadRootEnv();

function parseArgs(argv: string[]) {
  const arms: PurchaseArm[] = [];
  let model: string | undefined;
  for (const a of argv) {
    if (a === "all") arms.push("greedy", "solo", "team");
    else if (a === "greedy" || a === "solo" || a === "team") arms.push(a);
    else if (a.startsWith("--model=")) model = a.slice(8);
  }
  const uniq = [...new Set(arms)] as PurchaseArm[];
  return { arms: uniq.length ? uniq : (["greedy", "solo", "team"] as PurchaseArm[]), model };
}

const padR = (s: unknown, w: number) => String(s).padEnd(w);
const padL = (s: unknown, w: number) => String(s).padStart(w);

async function main() {
  const { arms, model } = parseArgs(process.argv.slice(2));
  await initWeave();
  console.log(`\n=== PURCHASING FEASIBILITY EVAL · ${arms.join(", ")} ===\n`);

  const res = await runPurchaseEval({
    arms,
    model,
    onResult: (r, i, total) => {
      const c = r.result.check;
      const tag = c.feasible ? "feasible ✅" : `${c.violations.length} violation(s) ❌`;
      console.log(`  [${padL(i + 1, 2)}/${total}] ${padR(r.arm, 7)} ${padR(r.scenario, 18)} ${padR(tag, 18)} €${c.cost}/${c.budget}`);
    },
  });

  console.log(`\n  arm      scored   feasible%   constraints-met%   violations   avg€`);
  for (const arm of res.arms) {
    const s = res.summary[arm];
    console.log(`  ${padR(arm, 7)}  ${padL(s.scored, 6)}   ${padL(s.feasibleRate + "%", 8)}   ${padL(s.avgSatisfiedPct + "%", 16)}   ${padL(s.totalViolations, 10)}   ${padL(s.avgCost, 5)}`);
  }
  if (res.summary.solo && res.summary.team) {
    console.log(`\nSCOREBOARD  solo ${res.summary.solo.feasibleRate}% feasible  ·  team ${res.summary.team.feasibleRate}% feasible  ·  delta ${res.summary.team.feasibleRate - res.summary.solo.feasibleRate >= 0 ? "+" : ""}${res.summary.team.feasibleRate - res.summary.solo.feasibleRate} pts`);
  }

  if (isWeaveActive()) {
    const scenarios = [...new Set(res.results.map((r) => r.scenario))];
    const rows = scenarios.map((scenario) => ({ scenario }));
    for (const arm of res.arms) {
      const cache = new Map(res.results.filter((r) => r.arm === arm).map((r) => [r.scenario, r.result.check]));
      await runModelEvaluation({
        evaluation: "purchasing-feasibility",
        model: `purchasing-${arm}`,
        rows,
        predict: (row) => {
          const c = cache.get(row.scenario);
          return c ? { feasible: c.feasible, constraints_met_pct: Math.round((c.satisfied / c.total) * 100), violations: c.violations.length, cost: c.cost } : { feasible: false };
        },
        scorers: {
          feasible: ({ modelOutput }) => !!modelOutput.feasible,
          constraints_met_pct: ({ modelOutput }) => modelOutput.constraints_met_pct ?? null,
          violations: ({ modelOutput }) => modelOutput.violations ?? null,
          cost: ({ modelOutput }) => modelOutput.cost ?? null,
        },
      });
    }
    await flushWeave();
    console.log(`\nWeave: logged ${res.arms.length} arm(s) under "purchasing-feasibility" → Evals tab, compare.`);
  } else {
    console.log(`\n(Weave inactive — set WANDB_API_KEY to log these as comparable Evals.)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[purchasing:eval] error:", e);
      process.exit(1);
    });
}
