/**
 * Runtime provider config.
 *
 * Default: **Cursor Agents SDK** (`@cursor/sdk`) — billed on Cursor's pricing, so it
 * needs no OpenAI tokens. OpenAI and W&B Inference remain available (both
 * OpenAI-compatible: one client, different base URLs) and can be selected with
 * `RUNTIME_PROVIDER=openai|wandb`.
 *
 * These keys fund RUNTIME PRODUCT AGENTS — not build tooling / codegen.
 */

export type ProviderName = "cursor" | "openai" | "wandb";

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  /** for OpenAI-compatible providers only */
  baseURL?: string;
  defaultModel: string;
  /** true → use the OpenAI client; false → use the provider's native SDK (Cursor) */
  openaiCompatible: boolean;
}

export function getProviders(): Record<ProviderName, ProviderConfig> {
  return {
    cursor: {
      name: "cursor",
      apiKey: process.env.CURSOR_API_KEY,
      defaultModel: process.env.CURSOR_MODEL ?? "composer-2",
      openaiCompatible: false,
    },
    openai: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: "gpt-4o-mini",
      openaiCompatible: true,
    },
    wandb: {
      name: "wandb",
      apiKey: process.env.WANDB_API_KEY,
      baseURL: process.env.WANDB_INFERENCE_BASE_URL ?? "https://api.inference.wandb.ai/v1",
      defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
      openaiCompatible: true,
    },
  };
}

/** The runtime provider for product agents. Default: Cursor. Override: RUNTIME_PROVIDER. */
export function defaultProvider(): ProviderName {
  const p = process.env.RUNTIME_PROVIDER as ProviderName | undefined;
  return p === "openai" || p === "wandb" || p === "cursor" ? p : "cursor";
}

/**
 * Map a role to a provider. Today: one provider for every role. This is the single
 * place role-based routing would live (OPEN DECISION #3) — e.g. a cheap model for
 * high-frequency agents, a stronger one for verifier/orchestrator.
 */
export function providerForRole(_role: string): ProviderName {
  return defaultProvider();
}
