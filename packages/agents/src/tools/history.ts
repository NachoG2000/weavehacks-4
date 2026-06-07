/**
 * Historian's tools — read PAST patterns from the REAL POS export. The Historian reasons like
 * an operator: ONE base-rate query, then ONE query per atypical factor (each isolated over
 * many nights), then it does the arithmetic. Each call is a Weave op, so the trace shows
 * exactly which numbers — and which sample sizes — grounded every ± in its estimate.
 */
import { traced } from "@weavehacks/observability";
import type { ToolSpec } from "@weavehacks/runtime";
import { baselineDemand, baselineDay, footballEffect, weatherEffect, calendarEffect, serviceOn, COMPETITIONS } from "./pos-analytics";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const services = ["lunch", "dinner"];

export const baselineDemandTool: ToolSpec = {
  name: "baseline_demand",
  description:
    "The BASE RATE for a typical service: average ORDERS, items, revenue, a per-category breakdown, and top " +
    "products over the most recent matching (weekday, service). OMIT `service` to get BOTH lunch and dinner " +
    "broken out separately. This is the naive 'normal day' — it does NOT account for weather, football, or " +
    "holidays. Add those separately with the effect_of_* tools, then sum.",
  parameters: {
    type: "object",
    properties: {
      day: { type: "string", enum: weekdays, description: "weekday (lowercase), e.g. 'friday'" },
      service: { type: "string", enum: services, description: "'lunch' or 'dinner'; omit to get both separated" },
      lastN: { type: "integer", description: "how many recent matching services to average (default 8 ≈ last 2 months)" },
    },
    required: ["day"],
    additionalProperties: false,
  },
  execute: traced("tool.baseline_demand", ({ day, service, lastN }: { day: string; service?: string; lastN?: number }) =>
    service ? baselineDemand(day, service, lastN ?? 8) : baselineDay(day, lastN ?? 8),
  ),
};

export const effectOfFootballTool: ToolSpec = {
  name: "effect_of_football",
  description:
    "Marginal effect of a FOOTBALL match night on demand: average on match nights vs non-match nights, " +
    "with how each category moves and the sample size on each side. Optionally narrow to one competition. " +
    `Known competitions: ${COMPETITIONS.join(", ") || "(none in data)"}.`,
  parameters: {
    type: "object",
    properties: {
      service: { type: "string", enum: services, description: "optional: restrict to 'lunch' or 'dinner'" },
      competition: { type: "string", description: "optional competition filter, e.g. 'Champions League' or 'Ligue 1'" },
    },
    additionalProperties: false,
  },
  execute: traced("tool.effect_of_football", (o: { service?: string; competition?: string }) => footballEffect(o)),
};

export const effectOfWeatherTool: ToolSpec = {
  name: "effect_of_weather",
  description:
    "Marginal effect of WEATHER on demand: average on nights matching the condition vs the rest, with the " +
    "category movers (e.g. rain → cold sushi down, hot ramen up) and the sample size on each side.",
  parameters: {
    type: "object",
    properties: {
      condition: { type: "string", enum: ["rain", "snow", "hot", "cold"], description: "weather condition to isolate" },
      service: { type: "string", enum: services, description: "optional: restrict to 'lunch' or 'dinner'" },
    },
    required: ["condition"],
    additionalProperties: false,
  },
  execute: traced("tool.effect_of_weather", ({ condition, service }: { condition: "rain" | "snow" | "hot" | "cold"; service?: string }) =>
    weatherEffect(condition, { service }),
  ),
};

export const effectOfCalendarTool: ToolSpec = {
  name: "effect_of_calendar",
  description:
    "Marginal effect of a CALENDAR flag on demand: a public holiday, a school break, or a commercial event " +
    "(e.g. Black Friday) vs ordinary days, with category movers and the sample size on each side.",
  parameters: {
    type: "object",
    properties: {
      factor: { type: "string", enum: ["holiday", "school_break", "commercial_event"], description: "calendar flag to isolate" },
      service: { type: "string", enum: services, description: "optional: restrict to 'lunch' or 'dinner'" },
    },
    required: ["factor"],
    additionalProperties: false,
  },
  execute: traced("tool.effect_of_calendar", ({ factor, service }: { factor: "holiday" | "school_break" | "commercial_event"; service?: string }) =>
    calendarEffect(factor, { service }),
  ),
};

export const serviceOnTool: ToolSpec = {
  name: "service_on",
  description: "Raw record(s) for one date (totals, per-category, per-product, weather, events). Use to spot-check a specific day.",
  parameters: {
    type: "object",
    properties: { date: { type: "string", description: "ISO date YYYY-MM-DD" } },
    required: ["date"],
    additionalProperties: false,
  },
  execute: traced("tool.service_on", ({ date }: { date: string }) => serviceOn(date)),
};

export const HISTORY_TOOLS: ToolSpec[] = [baselineDemandTool, effectOfFootballTool, effectOfWeatherTool, effectOfCalendarTool, serviceOnTool];
