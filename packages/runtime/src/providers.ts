/**
 * Runtime provider config.
 *
 * Default: **W&B Inference** (OpenAI-compatible) — authenticated with the W&B API key,
 * the same key that powers Weave. The agent framework on top of it is the **OpenAI
 * Agents SDK** (see agents.ts). OpenAI proper is a switchable fallback
 * (`RUNTIME_PROVIDER=openai`).
 *
 * The W&B API key funds RUNTIME PRODUCT AGENTS (W&B Inference credits) — not build tooling.
 */

export type ProviderName = "wandb" | "openai";

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  /** OpenAI-compatible base URL (undefined → OpenAI's default endpoint) */
  baseURL?: string;
  defaultModel: string;
  /** W&B Inference usage attribution: "entity/project", sent as the openai-project header */
  project?: string;
}

export function getProviders(): Record<ProviderName, ProviderConfig> {
  return {
    wandb: {
      name: "wandb",
      apiKey: process.env.WANDB_API_KEY,
      baseURL: process.env.WANDB_INFERENCE_BASE_URL ?? "https://api.inference.wandb.ai/v1",
      // Discover ids with `pnpm --filter @weavehacks/api models`; override via WANDB_INFERENCE_MODEL.
      defaultModel: process.env.WANDB_INFERENCE_MODEL ?? "zai-org/GLM-5.1",
      project: process.env.WANDB_PROJECT, // optional "entity/project"
    },
    openai: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
  };
}

/** The runtime provider for product agents. Default: W&B Inference. Override: RUNTIME_PROVIDER. */
export function defaultProvider(): ProviderName {
  return process.env.RUNTIME_PROVIDER === "openai" ? "openai" : "wandb";
}

/**
 * Map a role to a provider. Today: one provider for every role. This is the single
 * place role-based routing would live — e.g. a cheaper model for high-frequency agents,
 * a stronger one for verifier/orchestrator.
 */
export function providerForRole(_role: string): ProviderName {
  return defaultProvider();
}
