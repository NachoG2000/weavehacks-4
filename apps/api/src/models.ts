import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { cursorListModels } from "@weavehacks/runtime";

loadRootEnv();

/**
 * List the Cursor models your API key can use, with ids + aliases. Use it to find the
 * exact Composer 2.5 id, then set CURSOR_MODEL in .env. Needs CURSOR_API_KEY.
 */
export async function listModels(): Promise<void> {
  if (!process.env.CURSOR_API_KEY) {
    console.log("[models] CURSOR_API_KEY not set — add it to .env first (cursor.com/dashboard/integrations).");
    return;
  }
  const models = await cursorListModels();
  console.log(`\n=== Cursor models available to your key (${models.length}) ===`);
  for (const m of models) {
    const aliases = m.aliases?.length ? `  [aliases: ${m.aliases.join(", ")}]` : "";
    console.log(`  ${m.id}${aliases}  — ${m.displayName}`);
  }
  console.log("\nSet the one you want as CURSOR_MODEL in .env (e.g. the Composer 2.5 id).");
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
