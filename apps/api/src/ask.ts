import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { initWeave, traced } from "@weavehacks/observability";
import { runAgent, describeRuntime } from "@weavehacks/runtime";

loadRootEnv();

/**
 * Ask the model a free-form question through the configured runtime
 * (OpenAI Agents SDK → W&B Inference). Traced in Weave.
 */
export async function ask(prompt: string): Promise<string> {
  await initWeave();
  const call = traced("ask", (input: string) =>
    runAgent({
      name: "Assistant",
      instructions: "You are a helpful assistant. Answer concisely.",
      input,
    }),
  );
  return call(prompt);
}

// Run directly: pnpm ask "your question"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.log('Usage: pnpm ask "your question here"');
    process.exit(1);
  }
  const rt = describeRuntime();
  if (rt.default === "wandb" && !rt.wandbConfigured) {
    console.log("[ask] WANDB_API_KEY not set in .env — add it (https://wandb.ai/authorize).");
    process.exit(1);
  }
  console.log(`(${rt.default} · ${rt.wandbModel})\n`);
  ask(prompt)
    .then((out) => {
      console.log(out);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[ask] error:", e);
      process.exit(1);
    });
}
