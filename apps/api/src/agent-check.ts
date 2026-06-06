import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { initWeave, traced } from "@weavehacks/observability";
import { runAgent, describeRuntime } from "@weavehacks/runtime";

loadRootEnv();

/**
 * Proves the runtime end-to-end: ONE OpenAI-Agents-SDK agent run over W&B Inference,
 * traced in Weave. This is the unit the (post-A/B) domain agents are built from — each
 * agent's act() calls runtime.runAgent(...) like this; the orchestration core combines
 * the turns into the multi-agent conflict loop.
 *
 * Needs WANDB_API_KEY and spends a little W&B Inference credit. NOT run by health/start.sh.
 */
export async function agentCheck(): Promise<void> {
  await initWeave();
  const rt = describeRuntime();

  if (rt.default === "wandb" && !rt.wandbConfigured) {
    console.log("[agent:check] WANDB_API_KEY not set — add it to .env (https://wandb.ai/authorize).");
    console.log("              runtime config:", JSON.stringify(rt, null, 2));
    return;
  }

  console.log(`[agent:check] running one OpenAI-Agents-SDK agent via '${rt.default}' (model ${rt.wandbModel})…`);

  const verify = traced("agent.verifier", (input: string) =>
    runAgent({
      name: "Verifier",
      instructions:
        "You are a VERIFIER agent resolving a conflict. The rule: the agent CLOSEST TO THE " +
        "SOURCE OF TRUTH (highest authority) wins. Reply with ONLY a JSON object " +
        '{"winner": <value>, "reason": <one sentence>}.',
      input,
    }),
  );

  const out = await verify(
    "record_1 has two competing claims: 'available' from an agent with authority 100 " +
      "(closest to the source of truth), and 'sold_out' from an agent with authority 10. " +
      "Which value wins, and why?",
  );

  console.log("[agent:check] agent replied:\n" + out);
}

// Run directly: `pnpm --filter @weavehacks/api agent:check`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  agentCheck()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[agent:check] error:", e);
      process.exit(1);
    });
}
