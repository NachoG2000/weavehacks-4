/**
 * pnpm improve                  → multi-month self-improvement trend (default 5 months)
 * pnpm improve --months=1       → a single learn→test round, with full detail
 * pnpm improve [--weeks=4] [--model=...]
 *
 * Phase 1: a naive forecaster predicts a FEEDBACK month; a judge reads the misses and writes
 * correction rules. Phase 2: on the UNSEEN next month, score the forecaster WITHOUT vs WITH the
 * rules, against real sales. The series slides this forward month after month — a small gain that
 * shows up every month is real, not a fluke. Spends ~1 LLM call per month (the judge).
 */
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { runSelfImprove, runSelfImproveSeries } from "@weavehacks/agents";
import { initWeave, isWeaveActive, runModelEvaluation, flushWeave } from "@weavehacks/observability";

loadRootEnv();

function parseArgs(argv: string[]) {
  let weeks = 4;
  let months = 5;
  let model: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--weeks=")) weeks = Number(a.slice(8)) || weeks;
    else if (a.startsWith("--months=")) months = Number(a.slice(9)) || months;
    else if (a.startsWith("--model=")) model = a.slice(8);
  }
  return { weeks, months, model };
}

const padR = (s: unknown, w: number) => String(s).padEnd(w);
const padL = (s: unknown, w: number) => String(s).padStart(w);

async function logBeforeAfter(rows: { date: string; service: string; before: number; after: number; actual: number }[], evalName: string) {
  if (!isWeaveActive()) return;
  const dsRows = rows.map((t) => ({ key: t.date + "|" + t.service, actual: t.actual }));
  for (const variant of ["before", "after"] as const) {
    const cache = new Map(rows.map((t) => [t.date + "|" + t.service, t[variant]]));
    await runModelEvaluation({
      evaluation: evalName,
      model: `forecast-${variant}-feedback`,
      rows: dsRows,
      predict: (row) => ({ predicted: cache.get(row.key) ?? null }),
      scorers: {
        abs_error_items: ({ modelOutput, datasetRow }) => (modelOutput.predicted == null ? null : Math.round(Math.abs(modelOutput.predicted - datasetRow.actual) * 10) / 10),
      },
    });
  }
  await flushWeave();
}

async function single(weeks: number, model?: string) {
  const r = await runSelfImprove({ weeks, model });
  console.log(`feedback month: ${r.feedbackStart} → ${r.testStart} (${r.feedbackServices} services)`);
  console.log(`test month:     ${r.testStart} → ${r.end} (${r.testServices} services, never seen)\n`);
  console.log(`PHASE 1 — naive error on feedback month: MAE ${r.m1Mae}; misses by condition:`);
  for (const a of r.residuals) console.log(`    ${padR(a.condition, 13)} ${a.meanResidual >= 0 ? "+" : ""}${a.meanResidual} (n=${a.n})`);
  console.log(`PHASE 1 — judge's correction rules:`);
  for (const rule of r.rules) console.log(`    ${padR(rule.condition, 13)} ${rule.adjust >= 0 ? "+" : ""}${rule.adjust} — ${rule.reason}`);
  console.log(`\nPHASE 2 — unseen test month:  before MAE ${r.m2BeforeMae}  →  after MAE ${r.m2AfterMae}`);
  console.log(`SCOREBOARD  ${r.m2BeforeMae} → ${r.m2AfterMae} items off  ·  ${r.improvementPct}% better on a month it never saw`);
  await logBeforeAfter(r.testRows, "self-improve-2phase");
  if (isWeaveActive()) console.log(`\nWeave: logged before/after under "self-improve-2phase".`);
}

async function series(weeks: number, months: number, model?: string) {
  console.log(`Sliding a ${weeks}-week feedback→test window forward ${months} months (expanding feedback)...\n`);
  const res = await runSelfImproveSeries({
    weeks,
    months,
    model,
    onRound: (r) => {
      const arrow = r.afterMae < r.beforeMae ? "↓ better" : r.afterMae > r.beforeMae ? "↑ worse" : "= same";
      console.log(`  ${padR(r.testStart + "→" + r.testEnd, 24)} before ${padL(r.beforeMae, 5)}  after ${padL(r.afterMae, 5)}  ${arrow}  (rules: ${r.rules.map((x) => x.condition + (x.adjust >= 0 ? "+" : "") + x.adjust).join(" ") || "none"})`);
    },
  });
  const dir = res.meanImprovementPct > 0 ? `${res.meanImprovementPct}% better` : res.meanImprovementPct < 0 ? `${-res.meanImprovementPct}% WORSE` : "no change";
  console.log(`\n  mean across ${months} unseen months:  before ${res.meanBefore}  →  after ${res.meanAfter}  items off`);
  console.log(`SCOREBOARD  ${dir} on average  ·  helped in ${res.monthsImproved}/${months} months (but the misses are big — see the over-correction)`);
  await logBeforeAfter(res.allRows, `self-improve-series-${months}m`);
  if (isWeaveActive()) console.log(`\nWeave: logged before/after over all ${res.allRows.length} test-month services under "self-improve-series-${months}m".`);
}

async function main() {
  const { weeks, months, model } = parseArgs(process.argv.slice(2));
  await initWeave();
  console.log(`\n=== SELF-IMPROVEMENT ${months === 1 ? "(single round)" : `· ${months}-month trend`} ===\n`);
  if (months === 1) await single(weeks, model);
  else await series(weeks, months, model);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[improve] error:", e);
      process.exit(1);
    });
}
