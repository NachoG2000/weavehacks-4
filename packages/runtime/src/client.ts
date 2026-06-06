import OpenAI from "openai";
import { getProviders, providerForRole, defaultProvider, type ProviderName } from "./providers";
import { cursorGenerate, parseJsonLoose } from "./cursor";

/** Construct an OpenAI-compatible client (OpenAI or W&B Inference). Not for Cursor. */
export function createClient(provider: ProviderName): OpenAI {
  const cfg = getProviders()[provider];
  if (!cfg.openaiCompatible) {
    throw new Error(`[runtime] provider '${provider}' is not OpenAI-compatible — use its native client`);
  }
  if (!cfg.apiKey) {
    throw new Error(`[runtime] missing API key for provider '${provider}' — set it in .env`);
  }
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
}

export interface GenerateOptions {
  /** the calling agent's role — drives provider routing (OPEN DECISION #3) */
  role?: string;
  /** force a specific provider for this call */
  provider?: ProviderName;
  model?: string;
  system?: string;
  temperature?: number;
}

/**
 * Single reasoning turn for a runtime agent. Dispatches to the Cursor SDK (default)
 * or an OpenAI-compatible provider. Wrap calls with observability.traced() so every
 * agent call lands in Weave.
 */
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const provider = opts.provider ?? (opts.role ? providerForRole(opts.role) : defaultProvider());

  if (provider === "cursor") {
    return cursorGenerate(prompt, { model: opts.model, system: opts.system });
  }

  const cfg = getProviders()[provider];
  const client = createClient(provider);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });

  const res = await client.chat.completions.create({
    model: opts.model ?? cfg.defaultModel,
    temperature: opts.temperature ?? 0.2,
    messages,
  });
  return res.choices[0]?.message?.content ?? "";
}

/** Reasoning turn that returns parsed JSON (provider-agnostic). */
export async function reason<T = unknown>(prompt: string, opts: GenerateOptions = {}): Promise<T> {
  const text = await generate(
    `${prompt}\n\nRespond with ONLY valid JSON — no prose, no code fences.`,
    opts,
  );
  return parseJsonLoose<T>(text);
}

/** Describe runtime config WITHOUT making an API call (health checks must not burn credits). */
export function describeRuntime() {
  const p = getProviders();
  return {
    default: defaultProvider(),
    cursorConfigured: Boolean(p.cursor.apiKey),
    openaiConfigured: Boolean(p.openai.apiKey),
    wandbConfigured: Boolean(p.wandb.apiKey),
    cursorModel: p.cursor.defaultModel,
    note: "Runtime LLM = Cursor SDK (billed to Cursor; no OpenAI tokens needed). Switch with RUNTIME_PROVIDER=openai|wandb.",
  };
}
