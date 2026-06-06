import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { initWeave, traced } from "@weavehacks/observability";
import { reason, describeRuntime } from "@weavehacks/runtime";

loadRootEnv();

/**
 * Proves the Cursor runtime works end-to-end: ONE in-role reasoning turn, traced in
 * Weave. This is the unit the (post-A/B) domain agents are built from — each agent's
 * act() calls runtime.reason(...) exactly like this. The orchestration core then
 * combines these turns into the multi-agent conflict loop.
 *
 * Needs CURSOR_API_KEY and costs a small amount of Cursor usage. NOT run by
 * health/start.sh (those must not burn credits).
 */
export async function agentCheck(): Promise<void> {
  await initWeave();
  const rt = describeRuntime();

  if (rt.default === "cursor" && !rt.cursorConfigured) {
    console.log("[agent:check] CURSOR_API_KEY not set — add it to .env to test the Cursor runtime.");
    console.log("              runtime config:", JSON.stringify(rt, null, 2));
    return;
  }

  console.log(`[agent:check] sending one in-role reasoning turn via '${rt.default}' (model ${rt.cursorModel})…`);

  // A VERIFIER-role turn over a neutral conflict (no domain concepts).
  const verify = traced("agent.verifier", (input: { prompt: string }) =>
    reason<{ winner: string; reason: string }>(input.prompt, { role: "verifier" }),
  );

  const out = await verify({
    prompt:
      "You are a VERIFIER agent resolving a conflict. record_1 has two competing claims: " +
      "'available' from an agent with authority 100 (closest to the source of truth), and " +
      "'sold_out' from an agent with authority 10. The rule: the agent closest to the source " +
      'of truth wins. Return {"winner": <value>, "reason": <one sentence>}.',
  });

  console.log("[agent:check] Cursor agent replied:");
  console.log(JSON.stringify(out, null, 2));
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
