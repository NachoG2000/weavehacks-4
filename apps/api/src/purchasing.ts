/**
 * pnpm purchasing ["<scenario>"]   → the Prep → Purchasing constraint loop, live.
 *
 * Shows a deterministic greedy reference, then a SOLO agent produce an order that busts a
 * constraint, then the TEAM: a proposer + an independent constraint gate that rejects violations
 * and loops to a feasible order. Spends a little W&B Inference.
 */
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { PURCHASE_SCENARIOS } from "@weavehacks/seed";
import { greedyPurchase, soloPurchase, teamPurchase, type OrderCheck } from "@weavehacks/agents";
import { initWeave, flushWeave } from "@weavehacks/observability";

loadRootEnv();

const name = process.argv.slice(2).join(" ").trim();
const scenario = PURCHASE_SCENARIOS.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? PURCHASE_SCENARIOS[0];

const fmtOrder = (o: Record<string, number>) =>
  Object.entries(o)
    .filter(([, q]) => q > 0)
    .map(([s, q]) => `${s}×${q}`)
    .join(", ") || "(empty)";
const fmtCheck = (c: OrderCheck) => `${c.feasible ? "FEASIBLE ✅" : "INFEASIBLE ❌"} — ${c.satisfied}/${c.total} constraints · €${c.cost}/${c.budget}`;

async function main() {
  await initWeave();
  console.log(`\n=== PREP → PURCHASING · "${scenario.name}" (budget €${scenario.budget}) ===\n`);

  const g = greedyPurchase(scenario);
  console.log(`reference (deterministic greedy): ${fmtCheck(g.check)}`);

  const solo = await soloPurchase(scenario);
  console.log(`\n── SOLO (one agent, no gate) ──`);
  console.log(`order: ${fmtOrder(solo.order)}`);
  console.log(fmtCheck(solo.check));
  for (const v of solo.check.violations) console.log(`   ✗ [${v.type}] ${v.sku ? v.sku + ": " : ""}${v.detail}`);

  console.log(`\n── TEAM (proposer + constraint gate) ──`);
  const team = await teamPurchase(scenario, {
    onStep: (s) => {
      console.log(`[${s.label}] ${fmtOrder(s.order ?? {})}`);
      if (s.check && !s.check.feasible) for (const v of s.check.violations) console.log(`   ✗ [${v.type}] ${v.sku ? v.sku + ": " : ""}${v.detail}`);
    },
  });
  console.log(`${fmtCheck(team.check)}  · gate caught ${team.rejections.length} violation(s) over ${team.rounds} round(s)`);

  console.log(
    `\nSCOREBOARD  solo ${solo.check.satisfied}/${solo.check.total} (${solo.check.feasible ? "feasible" : "INFEASIBLE"})  ·  team ${team.check.satisfied}/${team.check.total} (${team.check.feasible ? "feasible" : "INFEASIBLE"})`,
  );
  await flushWeave();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[purchasing] error:", e);
      process.exit(1);
    });
}
