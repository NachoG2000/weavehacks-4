import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ModelSelection } from "@cursor/sdk";

/**
 * Cursor Agents SDK runtime.
 *
 * Why Cursor and not OpenAI: we have no OpenAI tokens, and the Cursor SDK gives
 * programmatic access to frontier models billed on Cursor's pricing. Each product
 * agent is a single-shot Cursor agent that REASONS and returns an answer — it is
 * NOT asked to edit code (we point it at a scratch cwd and read its final text).
 *
 * `@cursor/sdk` is imported LAZILY (dynamic import inside the call). It pulls in a
 * native module, so the always-on deterministic scoreboard (health/compare/demo,
 * which never call the LLM) must not load it at module level. Only an actual Cursor
 * call triggers the import. Every call should be wrapped with observability.traced().
 */

/** Scratch dir for the local agent store (JSONL backend, set explicitly). */
function stateDir(): string {
  const dir = process.env.CURSOR_STATE_DIR ?? join(process.cwd(), ".cursor-agents");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort */
  }
  return dir;
}

export interface CursorOptions {
  /** Cursor model id, e.g. "composer-2" or "gpt-5.5". Defaults to CURSOR_MODEL. */
  model?: string;
  /** Working dir the agent operates in. Defaults to the scratch state dir. */
  cwd?: string;
  /** Prepended to the prompt (the SDK has no separate system role). */
  system?: string;
}

/**
 * One reasoning turn through a Cursor agent. Returns the agent's final text.
 * Throws if CURSOR_API_KEY is missing or the run errors.
 */
export async function cursorGenerate(prompt: string, opts: CursorOptions = {}): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("[runtime] CURSOR_API_KEY not set — required for the Cursor runtime");
  }

  // Lazy load: keeps the SDK's native deps out of the deterministic paths.
  const { Agent, JsonlLocalAgentStore } = await import("@cursor/sdk");

  const model: ModelSelection = { id: opts.model ?? process.env.CURSOR_MODEL ?? "composer-2" };
  const cwd = opts.cwd ?? stateDir();
  const fullPrompt = opts.system ? `${opts.system}\n\n${prompt}` : prompt;

  const result = await Agent.prompt(fullPrompt, {
    apiKey,
    model,
    local: { cwd, store: new JsonlLocalAgentStore(stateDir()) },
    mode: "agent",
  });

  if (result.status === "error") {
    throw new Error(`[runtime] Cursor agent run errored (run ${result.id})`);
  }
  return result.result ?? "";
}

/** Tolerant JSON extraction from model output (strips code fences / surrounding prose). */
export function parseJsonLoose<T = unknown>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const match = cleaned.match(/[[{][\s\S]*[\]}]/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`[runtime] could not parse JSON from model output: ${text.slice(0, 200)}`);
}

/** Reasoning turn that returns parsed JSON. */
export async function cursorReason<T = unknown>(prompt: string, opts: CursorOptions = {}): Promise<T> {
  const text = await cursorGenerate(
    `${prompt}\n\nRespond with ONLY valid JSON — no prose, no code fences.`,
    opts,
  );
  return parseJsonLoose<T>(text);
}
