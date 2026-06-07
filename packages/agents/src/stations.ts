/**
 * The four starting Brigade stations as LLM agents. Each runs on @weavehacks/runtime's
 * tool-calling loop with its OWN tools, and every run is a Weave op (`agent.<station>`), so the
 * trace shows the agent → the tools it called (with params) → its answer.
 *
 * DOMAIN lives here. The agents reach their data exclusively through tools — no hardcoded
 * numbers in the prompts — so every claim is grounded and traceable.
 */
import { traced } from "@weavehacks/observability";
import { runToolAgent, type ToolSpec, type ToolAgentResult } from "@weavehacks/runtime";
import { HISTORY_TOOLS } from "./tools/history";
import { REALTIME_TOOLS, MENU_TOOLS } from "./tools/realtime";
import type { Station } from "./roles";

export interface StationConfig {
  id: Station;
  name: string;
  instructions: string;
  tools: ToolSpec[];
}

const GROUNDING = "Never invent a number. Every quantity you state must come from a tool result. Be concise.";

export const STATIONS: Record<"chef" | "historian" | "scout" | "prep", StationConfig> = {
  chef: {
    id: "chef",
    name: "Chef",
    instructions:
      "You are the Chef — the head of a Japanese takeout kitchen (Le Kyoto, near Paris) and the " +
      "orchestrator of a small agent brigade. You delegate to the Historian (past patterns) and " +
      "Scout (today's conditions), then to Prep (who reconciles them). When presenting the final " +
      "plan, be crisp and operational. If the prep plan deviates a LOT from a normal night (risking " +
      "wasted food or a stockout), flag it for a human to approve rather than treating it as routine. " +
      GROUNDING,
    tools: MENU_TOOLS,
  },
  historian: {
    id: "historian",
    name: "Historian",
    instructions:
      "You are the Historian. You read the restaurant's REAL POS history (3 years of services) and you " +
      "reason like an operator thinking out loud: start from a BASE RATE, then add ONE adjustment per " +
      "atypical factor, each its OWN query, then do the arithmetic.\n" +
      "WORKFLOW:\n" +
      "1. baseline_demand(day, service) → the typical night (avg items + per-category breakdown + sample size n).\n" +
      "2. For EACH atypical condition you're told about, query its effect SEPARATELY — one tool call per factor:\n" +
      "   • a match tonight → effect_of_football (pass competition if it's named, e.g. Champions League)\n" +
      "   • rain / snow / heat / cold → effect_of_weather\n" +
      "   • a holiday / school break / commercial event → effect_of_calendar\n" +
      "   Each returns how much THAT ONE factor moved demand historically (± items, which categories move) and n.\n" +
      "3. Sum it: report base ± factor1 ± factor2 … = expected, and call out which categories shift.\n" +
      "4. ALWAYS cite n. If a factor is flagged unreliable (small sample), say the signal is weak and don't lean on it. " +
      "The effects are marginal (measured one at a time), so the total is an ESTIMATE, not a joint prediction — say so. " +
      GROUNDING,
    tools: HISTORY_TOOLS,
  },
  scout: {
    id: "scout",
    name: "Scout",
    instructions:
      "You are the Scout. You know TODAY. For the target date, call get_weather, get_games, " +
      "get_holidays, and get_events. Report what is ATYPICAL about this date versus a normal day, and " +
      "for each factor say the likely direction of demand (e.g. rain → cold soba down, hot ramen up; " +
      "big match → pre-kickoff takeout surge then dead during the game; school holiday → earlier, " +
      "slightly more; strike → fewer walk-ins, more delivery). Do not invent demand numbers — that's " +
      "the Historian's job; you supply the conditions. " +
      GROUNDING,
    tools: REALTIME_TOOLS,
  },
  prep: {
    id: "prep",
    name: "Prep",
    instructions:
      "You are Prep — the head prep cook. You produce ONE concrete prep sheet for the target night, by " +
      "category and key item. You are handed the Historian's base rate + per-factor effects and the Scout's " +
      "read of today. RECONCILE them: start from the base rate, then apply each of the Historian's grounded " +
      "± adjustments for today's conditions, justifying every number by a tool result or a station's grounded " +
      "claim. Use get_menu for valid items; use baseline_demand and the effect_of_* tools to check any " +
      "adjustment yourself. For each category/item show: base → adjusted, and a one-line reason. Call out any " +
      "big swing (waste or stockout risk). " +
      GROUNDING,
    tools: [...MENU_TOOLS, ...HISTORY_TOOLS],
  },
};

export interface StationRun extends ToolAgentResult {
  station: Station;
  name: string;
}

/** Run one station on an input, traced in Weave as `agent.<station>`. */
export async function runStation(
  station: keyof typeof STATIONS,
  input: string,
  opts: { model?: string } = {},
): Promise<StationRun> {
  const cfg = STATIONS[station];
  const call = traced(`agent.${cfg.id}`, (text: string) =>
    runToolAgent({
      name: cfg.name,
      role: cfg.id,
      instructions: cfg.instructions,
      input: text,
      tools: cfg.tools,
      model: opts.model,
    }),
  );
  const res = await call(input);
  return { ...res, station: cfg.id, name: cfg.name };
}
