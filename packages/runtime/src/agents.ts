import OpenAI from "openai";
import { getProviders, defaultProvider } from "./providers";
import { parseJsonLoose } from "./json";

/**
 * OpenAI Agents SDK runtime, pointed at W&B Inference.
 *
 * W&B Inference is OpenAI-compatible, so we hand the Agents SDK a custom OpenAI client
 * (W&B base URL + W&B API key) and tell it to use chat completions (W&B doesn't speak the
 * Responses API). The SDK's own tracing is DISABLED — it would upload to OpenAI's platform
 * and need an OpenAI key; we trace with W&B Weave instead (wrap calls in observability.traced()).
 *
 * `@openai/agents` is imported lazily so the deterministic scoreboard never loads it.
 */

let configured = false;

export async function configureAgents(): Promise<void> {
  if (configured) return;
  const cfg = getProviders()[defaultProvider()];
  if (!cfg.apiKey) {
    throw new Error(`[runtime] missing API key for provider '${cfg.name}' — set it in .env`);
  }

  const { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } = await import("@openai/agents");
  const defaultHeaders = cfg.project ? { "OpenAI-Project": cfg.project } : undefined;
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, defaultHeaders });

  setDefaultOpenAIClient(client);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
  configured = true;
}

export interface RunAgentOptions {
  /** agent name (also its label) */
  name: string;
  /** system prompt — what role this agent plays */
  instructions: string;
  /** the user input for this turn */
  input: string;
  /** model id override (defaults to the provider's default model) */
  model?: string;
}

/**
 * Build a single OpenAI Agents SDK agent over W&B Inference and return its final text.
 * This is the unit a domain agent's act() is built from (post A/B decision).
 */
export async function runAgent(opts: RunAgentOptions): Promise<string> {
  await configureAgents();
  const { Agent, run } = await import("@openai/agents");
  const model = opts.model ?? getProviders()[defaultProvider()].defaultModel;

  const agent = new Agent({ name: opts.name, instructions: opts.instructions, model });
  const result = await run(agent, opts.input);

  const out = result.finalOutput;
  return typeof out === "string" ? out : JSON.stringify(out ?? "");
}

/** Agent turn that returns parsed JSON. */
export async function reasonAgent<T = unknown>(opts: RunAgentOptions): Promise<T> {
  const text = await runAgent({
    ...opts,
    input: `${opts.input}\n\nRespond with ONLY valid JSON — no prose, no code fences.`,
  });
  return parseJsonLoose<T>(text);
}
