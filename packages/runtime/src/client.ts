import OpenAI from "openai";
import { getProviders, providerForRole, defaultProvider, type ProviderName } from "./providers";
import { parseJsonLoose } from "./json";

/** Construct an OpenAI-compatible client (W&B Inference or OpenAI). */
export function createClient(provider: ProviderName = defaultProvider()): OpenAI {
  const cfg = getProviders()[provider];
  if (!cfg.apiKey) {
    throw new Error(`[runtime] missing API key for provider '${provider}' — set it in .env`);
  }
  // W&B Inference uses the openai-project header for usage attribution when set.
  const defaultHeaders = cfg.project ? { "OpenAI-Project": cfg.project } : undefined;
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, defaultHeaders });
}

export interface GenerateOptions {
  /** the calling agent's role — drives provider routing */
  role?: string;
  /** force a specific provider for this call */
  provider?: ProviderName;
  model?: string;
  system?: string;
  temperature?: number;
}

/**
 * Single reasoning turn via raw chat completions (the lightweight path; the OpenAI
 * Agents SDK path lives in agents.ts). Wrap calls with observability.traced().
 */
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const provider = opts.provider ?? (opts.role ? providerForRole(opts.role) : defaultProvider());
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

/** Reasoning turn that returns parsed JSON (provider-agnostic, raw chat completions). */
export async function reason<T = unknown>(prompt: string, opts: GenerateOptions = {}): Promise<T> {
  const text = await generate(
    `${prompt}\n\nRespond with ONLY valid JSON — no prose, no code fences.`,
    opts,
  );
  return parseJsonLoose<T>(text);
}

/** List model ids the provider exposes (W&B Inference / OpenAI /models endpoint). */
export async function listInferenceModels(provider: ProviderName = defaultProvider()): Promise<string[]> {
  const client = createClient(provider);
  const page = await client.models.list();
  return page.data.map((m) => m.id).sort();
}

/** Describe runtime config WITHOUT making an API call (health checks must not burn credits). */
export function describeRuntime() {
  const p = getProviders();
  return {
    default: defaultProvider(),
    framework: "openai-agents-sdk",
    wandbConfigured: Boolean(p.wandb.apiKey),
    openaiConfigured: Boolean(p.openai.apiKey),
    wandbModel: p.wandb.defaultModel,
    wandbBaseURL: p.wandb.baseURL,
    wandbProject: p.wandb.project ?? null,
    note: "Runtime = W&B Inference (OpenAI-compatible) via the OpenAI Agents SDK. Switch with RUNTIME_PROVIDER=openai.",
  };
}
