/**
 * PREP station — demand forecasting (the agent that answers "how many of product X this
 * Friday dinner?"). This file is the DETERMINISTIC core: a naive baseline forecaster + a
 * backtest harness. NO LLM, NO credits — this is the SOLO baseline the thesis needs to
 * "visibly fail" so a coordinated TEAM can later beat its error number in Weave.
 *
 * The naive baseline predicts a product's count as the MEAN of that product over training
 * records with the same (day, service). It deliberately IGNORES weather / football / events /
 * holidays — that blind spot is exactly where the specialized team agents will win.
 */

import type { ServiceRecord } from "@weavehacks/seed";
import { allProducts } from "@weavehacks/seed";

export interface ForecastQuery {
  /** lowercase weekday, e.g. "friday" */
  day: string;
  /** "lunch" | "dinner" */
  service: string;
  /** a single product to predict; omit to predict the whole prep sheet */
  product?: string;
}

export interface ProductPrediction {
  product: string;
  /** predicted units for the queried service */
  predicted: number;
  /** how many comparable past services backed this number */
  basis: number;
}

export interface Forecast {
  query: ForecastQuery;
  predictions: ProductPrediction[];
  /** plain-language "why", grounded in the comparable services used */
  why: string;
}

/** A forecaster: training records + a query → a forecast. (The LLM Prep agent will match this.) */
export type Forecaster = (train: ServiceRecord[], query: ForecastQuery) => Forecast;

/** Round to 1 decimal — counts are integers but a mean of 2.6 is information, keep it. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Training records matching the same weekday + service as the query. */
function comparable(train: ServiceRecord[], q: ForecastQuery): ServiceRecord[] {
  return train.filter((r) => r.day === q.day && r.service === q.service);
}

/**
 * NAIVE BASELINE (the SOLO agent). Mean units per comparable service, per product.
 * A product absent from a service counts as 0 — so a product sold on 2 of 8 Fridays
 * correctly averages low. No context signals used. This is meant to be beatable.
 */
export const naiveForecast: Forecaster = (train, query) => {
  const peers = comparable(train, query);
  const basis = peers.length;
  const products = query.product ? [query.product] : allProducts(peers);

  const predictions: ProductPrediction[] = products
    .map((product) => {
      const total = peers.reduce((sum, r) => sum + (r.sales_by_product?.[product] ?? 0), 0);
      return { product, predicted: basis ? round1(total / basis) : 0, basis };
    })
    .sort((a, b) => b.predicted - a.predicted);

  const why = basis
    ? `Average of ${basis} past ${query.day} ${query.service} service(s). ` +
      `Context signals (weather, football, events, holidays) NOT used — naive baseline.`
    : `No comparable ${query.day} ${query.service} services in the training window — predicting 0.`;

  return { query, predictions, why };
};

// ─── Backtest: score a forecaster on the HIDDEN holdout ──────────────────────────────────

export interface BacktestMetrics {
  forecaster: string;
  trainServices: number;
  holdoutServices: number;
  /** (service, product) prediction pairs scored */
  pairs: number;
  /** mean absolute error per product per service (the headline number) */
  productMAE: number;
  /** mean absolute error on per-service TOTAL items (predicted sheet sum vs actual) */
  totalItemsMAE: number;
  /** symmetric MAPE on per-service totals, 0–100% (scale-free, good for the scoreboard) */
  totalItemsSMAPE: number;
}

/**
 * Run `forecaster` on every holdout service and score it against the hidden actuals.
 * Lower is better. This is the numeric difference the solo-vs-team comparison reports.
 */
export function backtest(
  train: ServiceRecord[],
  holdout: ServiceRecord[],
  forecaster: Forecaster,
  name = forecaster.name || "forecaster",
): BacktestMetrics {
  let absErrSum = 0;
  let pairs = 0;
  let totalsAbsErrSum = 0;
  let smapeSum = 0;

  for (const actual of holdout) {
    const f = forecaster(train, { day: actual.day, service: actual.service });
    const predByProduct = new Map(f.predictions.map((p) => [p.product, p.predicted]));

    // union of predicted + actually-sold products for this service
    const products = new Set<string>([...predByProduct.keys(), ...Object.keys(actual.sales_by_product ?? {})]);
    let predTotal = 0;
    for (const product of products) {
      const pred = predByProduct.get(product) ?? 0;
      const real = actual.sales_by_product?.[product] ?? 0;
      absErrSum += Math.abs(pred - real);
      predTotal += pred;
      pairs++;
    }

    const realTotal = actual.total_items ?? Object.values(actual.sales_by_product ?? {}).reduce((a, b) => a + b, 0);
    totalsAbsErrSum += Math.abs(predTotal - realTotal);
    const denom = Math.abs(predTotal) + Math.abs(realTotal);
    if (denom > 0) smapeSum += (2 * Math.abs(predTotal - realTotal)) / denom;
  }

  const n = holdout.length || 1;
  return {
    forecaster: name,
    trainServices: train.length,
    holdoutServices: holdout.length,
    pairs,
    productMAE: round1(absErrSum / (pairs || 1)),
    totalItemsMAE: round1(totalsAbsErrSum / n),
    totalItemsSMAPE: Math.round((smapeSum / n) * 100),
  };
}
