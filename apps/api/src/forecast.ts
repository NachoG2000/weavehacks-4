/**
 * pnpm --filter @weavehacks/api forecast            → backtest the naive baseline
 * pnpm --filter @weavehacks/api forecast friday dinner ["Maki Saumon (6 pièces)"]
 *                                                    → one-off "how many of X?" prediction
 *
 * Deterministic, NO LLM, NO credits. Loads the operator's POS JSON, splits year-1 (visible)
 * from years 2–3 (hidden), and reports the error of the SOLO baseline on the hidden future.
 * That error is the number the coordinated team must beat.
 */

import { loadServiceRecords, splitTrainHoldout } from "@weavehacks/seed";
import { naiveForecast, backtest } from "@weavehacks/agents";

const [, , dayArg, serviceArg, productArg] = process.argv;

const { records, path, found } = loadServiceRecords();

if (!found || records.length === 0) {
  console.log("\n=== FORECAST ===");
  console.log(found ? `Loaded 0 usable records from ${path}.` : `No POS data file at ${path}.`);
  console.log("Drop the operator's JSON (an array of service records) there, or set POS_DATA_PATH.\n");
  process.exit(0);
}

const { train, holdout, splitDate } = splitTrainHoldout(records);
console.log("\n=== FORECAST DATA ===");
console.log(`source:   ${path}`);
console.log(`records:  ${records.length}  (${records[0].date} → ${records[records.length - 1].date})`);
console.log(`split:    train < ${splitDate} ≤ holdout   →   train ${train.length} · holdout ${holdout.length}`);

// One-off prediction mode: `forecast friday dinner ["product"]`
if (dayArg && serviceArg) {
  const f = naiveForecast(train, { day: dayArg.toLowerCase(), service: serviceArg.toLowerCase(), product: productArg });
  console.log(`\n=== PREDICTION — ${dayArg} ${serviceArg}${productArg ? ` · ${productArg}` : ""} ===`);
  for (const p of f.predictions.slice(0, productArg ? 1 : 15)) {
    console.log(`  ${String(p.predicted).padStart(5)}  ${p.product}`);
  }
  console.log(`\nwhy: ${f.why}\n`);
  process.exit(0);
}

// Backtest mode: score the baseline on the hidden holdout.
if (holdout.length === 0) {
  console.log("\nNo holdout services yet (need >1 year of data to score the future).\n");
  process.exit(0);
}

const m = backtest(train, holdout, naiveForecast, "naive-baseline (solo)");
console.log("\n=== BACKTEST — solo baseline on the hidden future ===");
console.log(`  forecaster:        ${m.forecaster}`);
console.log(`  holdout services:  ${m.holdoutServices}`);
console.log(`  product MAE:        ${m.productMAE}   (avg units off, per product per service)`);
console.log(`  total-items MAE:    ${m.totalItemsMAE}   (avg units off on the full service total)`);
console.log(`  total-items sMAPE:  ${m.totalItemsSMAPE}%   (scale-free service-total error)`);
console.log(`\nThis is the SOLO number. The coordinated team must drive these DOWN.\n`);
