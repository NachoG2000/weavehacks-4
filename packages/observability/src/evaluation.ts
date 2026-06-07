import * as weave from "weave";
import { initWeave, isWeaveActive } from "./weave";

/**
 * Thin, domain-agnostic wrapper over `weave.Evaluation` so an "arm" shows up in the W&B Evals
 * tab — that's the view that lets you compare two runs SIDE BY SIDE (raw traces don't aggregate).
 *
 * Usage is REPLAY: you've already computed each row's prediction elsewhere; `predict` just hands
 * the precomputed output back, so logging the eval costs no extra inference. Run it once per arm
 * (distinct `name`s) and compare them in the UI. No-op (returns null) when there's no W&B key.
 */
export interface ModelEvaluationSpec {
  /** the Evaluation/suite name — keep it the SAME across arms so they compare as one evaluation */
  evaluation: string;
  /** the model/arm name shown per run (e.g. "forecast-naive", "forecast-solo", "forecast-team") */
  model: string;
  /** dataset rows (plain JSON objects) */
  rows: Record<string, unknown>[];
  /** return the (precomputed) prediction for a row — keep cheap; do NOT re-run a model here */
  predict: (row: any) => unknown | Promise<unknown>;
  /** scorers: name → fn({ modelOutput, datasetRow }) → number | boolean */
  scorers: Record<string, (a: { modelOutput: any; datasetRow: any }) => unknown>;
}

export async function runModelEvaluation(spec: ModelEvaluationSpec): Promise<unknown | null> {
  await initWeave();
  if (!isWeaveActive()) return null; // no key → skip the UI eval; the caller's own scoreboard still stands

  const dataset = new weave.Dataset({ name: `${spec.evaluation}-dataset`, rows: spec.rows as any });
  const scorers = Object.entries(spec.scorers).map(([name, fn]) => weave.op(fn as any, { name }));
  const model = weave.op(async ({ datasetRow }: any) => spec.predict(datasetRow), { name: spec.model });

  const evaluation = new weave.Evaluation({ name: spec.evaluation, dataset, scorers } as any);
  return evaluation.evaluate({ model: model as any });
}
