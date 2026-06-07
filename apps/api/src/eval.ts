/**
 * pnpm eval                 → FREE: naive baseline only on a 4-week holdout (proves the harness)
 * pnpm eval all             → naive + solo + team (solo/team spend inference credits)
 * pnpm eval solo team       → just the two LLM arms
 * pnpm eval all --weeks=2 --n=8 [--model=...]
 *
 * Holds out the last `weeks` of REAL POS data, hides it from every history tool, has each
 * forecaster predict the held-out services, and scores them against what actually happened.
 * Objective ground truth, no LLM judge. Prints a scoreboard AND (with a W&B key) logs each arm
 * as a Weave Evaluation so you can compare them side by side in the Evals tab.
 */

import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { runForecastEval, type Arm } from "@weavehacks/agents";
import { initWeave, isWeaveActive, runModelEvaluation, flushWeave } from "@weavehacks/observability";

loadRootEnv();

function parseArgs(argv: string[]) {
  const arms: Arm[] = [];
  let weeks = 4;
  let n = 10;
  let model: string | undefined;
  for (const a of argv) {
    if (a === "all") arms.push("naive", "solo", "team");
    else if (a === "naive" || a === "solo" || a === "team") arms.push(a);
    else if (a.startsWith("--weeks=")) weeks = Number(a.slice(8)) || weeks;
    else if (a.startsWith("--n=")) n = Number(a.slice(4)) || n;
    else if (a.startsWith("--model=")) model = a.slice(8);
  }
  const uniq = [...new Set(arms)] as Arm[];
  return { arms: uniq.length ? uniq : (["naive"] as Arm[]), weeks, n, model };
}

const padR = (s: unknown, w: number) => String(s).padEnd(w);
const padL = (s: unknown, w: number) => String(s).padStart(w);

async function main() {
  const { arms, weeks, n, model } = parseArgs(process.argv.slice(2));
  const spends = arms.some((a) => a !== "naive");

  await initWeave(); // so agent calls trace and the Evals log; no-op without a W&B key

  console.log(`\n=== FORECAST EVAL · solo vs team on a ${weeks}-week holdout ===`);
  console.log(`arms: ${arms.join(", ")}${spends ? "  (solo/team spend inference credits)" : "  (FREE — naive only; run 'pnpm eval all' for the real solo-vs-team)"}\n`);

  const res = await runForecastEval({
    weeks,
    n,
    arms,
    model,
    onScenario: (r, i, total) => {
      const s = r.scenario;
      const cells = arms.map((arm) => `${arm}=${r.preds[arm]?.totalItems ?? "—"}`).join("  ");
      console.log(`  [${padL(i + 1, 2)}/${total}] ${s.date} ${padR(s.day, 9)} ${padR(s.service, 6)} actual=${padL(s.actual, 4)}   ${cells}   (${s.conditionsText})`);
    },
  });

  console.log(
    `\ndata ${res.dataFrom} → ${res.dataTo}   |   train < ${res.cutoff} ≤ holdout   |   ${res.scenarios} scenarios` +
      (res.skippedClosed ? `   (${res.skippedClosed} effectively-closed service(s) excluded)` : ""),
  );
  console.log("\n  arm     scored   MAE(items)   MAPE   accuracy");
  for (const arm of res.arms) {
    const s = res.summary[arm];
    console.log(`  ${padR(arm, 6)}  ${padL(s.scored, 6)}   ${padL(s.mae, 9)}   ${padL(s.mape + "%", 4)}   ${padL((s.accuracy * 100).toFixed(0) + "%", 7)}`);
  }
  if (res.summary.solo && res.summary.team) {
    const d = res.summary.team.accuracy - res.summary.solo.accuracy;
    console.log(`\nSCOREBOARD  solo ${(res.summary.solo.accuracy * 100).toFixed(0)}%  ·  team ${(res.summary.team.accuracy * 100).toFixed(0)}%  ·  delta ${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)} pts (team − solo)`);
  }

  // Weave Evals tab (side-by-side). Replay the precomputed predictions — no extra inference.
  if (isWeaveActive()) {
    const rows = res.results.map((r) => ({
      date: r.scenario.date,
      day: r.scenario.day,
      service: r.scenario.service,
      conditions: r.scenario.conditionsText,
      actual: r.scenario.actual,
    }));
    for (const arm of res.arms) {
      const cache = new Map(res.results.map((r) => [`${r.scenario.date}|${r.scenario.service}`, r.preds[arm] ?? null]));
      await runModelEvaluation({
        evaluation: `forecast-holdout-${res.weeks}w`,
        model: `forecast-${arm}`,
        rows,
        predict: (row) => {
          const p = cache.get(`${row.date}|${row.service}`);
          return p ? { totalItems: p.totalItems, toolCalls: p.toolCalls, reasoning: p.rationale } : { totalItems: null };
        },
        // Numeric scorers only (both lower-is-better) so the Evals comparison reads as a
        // gradient — a boolean here renders as a red ✗ per row and looks like a failure when
        // it just means "this guess wasn't within tolerance".
        scorers: {
          // the arm's forecast — surfaced as a column so you can read each arm's number directly
          predicted_items: ({ modelOutput }) => modelOutput.totalItems,
          // |predicted − actual|, items (lower = better)
          abs_error_items: ({ modelOutput, datasetRow }) =>
            modelOutput.totalItems == null ? null : Math.round(Math.abs(modelOutput.totalItems - datasetRow.actual) * 10) / 10,
          // predicted − actual: negative = UNDER-prepped (stockout risk), positive = OVER (waste)
          signed_error: ({ modelOutput, datasetRow }) =>
            modelOutput.totalItems == null ? null : Math.round((modelOutput.totalItems - datasetRow.actual) * 10) / 10,
          // % off from what actually sold, capped at 200% so one weird day can't dominate
          pct_off: ({ modelOutput, datasetRow }) =>
            modelOutput.totalItems == null ? null : Math.round(Math.min(200, (Math.abs(modelOutput.totalItems - datasetRow.actual) / Math.max(datasetRow.actual, 1)) * 100)),
        },
      });
    }
    await flushWeave(); // ← wait for the batched uploads to land, or the Evals tab stays empty
    console.log(`\nWeave: logged ${res.arms.length} eval run(s) → open the Evals tab, select them, compare side by side.`);
  } else {
    console.log(`\n(Weave inactive — set WANDB_API_KEY to log these as comparable Evals in the W&B UI.)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[eval] error:", e);
      process.exit(1);
    });
}
