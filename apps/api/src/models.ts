import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { listInferenceModels, describeRuntime } from "@weavehacks/runtime";

loadRootEnv();

/**
 * List the model ids your provider exposes (W&B Inference by default), so you can set
 * WANDB_INFERENCE_MODEL to a valid one. Needs WANDB_API_KEY.
 */
export async function listModels(): Promise<void> {
  const rt = describeRuntime();
  if (rt.default === "wandb" && !rt.wandbConfigured) {
    console.log("[models] WANDB_API_KEY not set — add it to .env (https://wandb.ai/authorize).");
    return;
  }
  const ids = await listInferenceModels();
  console.log(`\n=== Models available on '${rt.default}' (${ids.length}) ===`);
  for (const id of ids) console.log(`  ${id}`);
  console.log("\nSet the one you want as WANDB_INFERENCE_MODEL in .env.");
}

// Run directly: `pnpm --filter @weavehacks/api models`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  listModels()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[models] error:", e);
      process.exit(1);
    });
}
