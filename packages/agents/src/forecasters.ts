/**
 * Three forecasters that all answer ONE question — "how many total items for this service?" —
 * so they're directly comparable on the same held-out days:
 *
 *   • naive  — deterministic, no LLM (the existing prep.ts baseline). FREE. Proves the harness.
 *   • solo   — ONE LLM agent with ALL the history tools, one shot.
 *   • team   — the Brigade split: Historian grounds base-rate + each factor, Prep reconciles.
 *
 * Solo and team get the SAME tools and the SAME (perfect-Scout) conditions for the day — the
 * only variable is one-shot vs structured coordination. The day's SALES are never visible: the
 * eval sets an as-of cutoff so every tool is blind to the holdout window (see pos-analytics).
 */

import { runToolAgent } from "@weavehacks/runtime";
import { naiveForecast } from "./prep";
import { runStation } from "./stations";
import { HISTORY_TOOLS, MENU_TOOLS, trainBefore } from "./tools";

export interface ForecastQ {
  date: string;
  day: string; // lowercase weekday
  service: string; // "lunch" | "dinner"
}

export interface ForecastValue {
  forecaster: "naive" | "solo" | "team";
  /** predicted total items; null if we couldn't extract a number from the model */
  totalItems: number | null;
  rationale: string;
  /** how many tool calls the model made (0 for naive) */
  toolCalls: number;
}

/** Pull the predicted number out of an agent's reply (it's told to end with FORECAST_JSON). */
export function extractTotal(text: string): number | null {
  const tagged = text.match(/FORECAST_JSON\s*:?\s*(\{[^}]*\})/i);
  if (tagged) {
    try {
      const o = JSON.parse(tagged[1]);
      if (typeof o.totalItems === "number") return o.totalItems;
    } catch {
      /* fall through */
    }
  }
  const nearTotal = text.match(/total[^0-9]{0,24}?(\d+(?:\.\d+)?)/i);
  if (nearTotal) return Number(nearTotal[1]);
  const nums = text.match(/\d+(?:\.\d+)?/g);
  return nums ? Number(nums[nums.length - 1]) : null;
}

// ─── naive (deterministic, free) ─────────────────────────────────────────────────────────

/** Mean over comparable past (day, service) services, summed to a total. Leak-free via trainBefore. */
export function naiveForecastValue(q: ForecastQ, cutoff: string): ForecastValue {
  const f = naiveForecast(trainBefore(cutoff), { day: q.day, service: q.service });
  const total = f.predictions.reduce((s, p) => s + p.predicted, 0);
  return { forecaster: "naive", totalItems: Math.round(total * 10) / 10, rationale: f.why, toolCalls: 0 };
}

// ─── solo (one agent, all tools, one shot) ───────────────────────────────────────────────

const SOLO_INSTRUCTIONS =
  "You are a restaurant demand forecaster. Predict the TOTAL number of items that will be sold for ONE service. " +
  "You have POS-history tools: baseline_demand (the typical night), effect_of_football / effect_of_weather / " +
  "effect_of_calendar (how one factor historically moved demand, with a sample size n), and service_on. " +
  "Ground every number in a tool result — never invent one. Reason like an operator: a base rate, then adjust " +
  "for each stated condition, then add it up. End your reply with EXACTLY this line:\n" +
  'FORECAST_JSON: {"totalItems": <number>}';

export async function soloForecast(q: ForecastQ, conditions: string, opts: { model?: string } = {}): Promise<ForecastValue> {
  const input =
    `Forecast the TOTAL items for ${q.day} ${q.service} on ${q.date}. ` +
    `Known conditions for that day: ${conditions}. ` +
    `Use the tools to ground a base rate and each adjustment, then give one number.`;
  const res = await runToolAgent({
    name: "Solo Forecaster",
    instructions: SOLO_INSTRUCTIONS,
    input,
    tools: [...HISTORY_TOOLS, ...MENU_TOOLS],
    model: opts.model,
    maxSteps: 8,
  });
  return { forecaster: "solo", totalItems: extractTotal(res.text), rationale: res.text, toolCalls: res.toolCalls.length };
}

// ─── team (Historian grounds, Prep reconciles) ───────────────────────────────────────────

export async function teamForecast(q: ForecastQ, conditions: string, opts: { model?: string } = {}): Promise<ForecastValue> {
  const histInput =
    `Forecast ${q.day} ${q.service} on ${q.date}. Conditions for that day: ${conditions}. ` +
    `Give the BASE RATE with baseline_demand, then quantify EACH condition SEPARATELY with the effect tools ` +
    `(one call per factor), citing n. Then sum: base ± each effect = expected TOTAL items.`;
  const hist = await runStation("historian", histInput, opts);

  const prepInput =
    `Target: ${q.day} ${q.service} on ${q.date}. Conditions: ${conditions}.\n\n` +
    `HISTORIAN'S WORK:\n${hist.text}\n\n` +
    `Reconcile this into ONE final number — the expected TOTAL items for the service. ` +
    `If a factor's signal was weak (small n), discount it. End with EXACTLY this line:\n` +
    'FORECAST_JSON: {"totalItems": <number>}';
  const prep = await runStation("prep", prepInput, opts);

  return {
    forecaster: "team",
    totalItems: extractTotal(prep.text),
    rationale: prep.text,
    toolCalls: hist.toolCalls.length + prep.toolCalls.length,
  };
}
