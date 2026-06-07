/**
 * pnpm content:eval            → solo vs solo_grounded vs team on the grounding metric
 * pnpm content:eval team solo  → a subset of arms
 * pnpm content:eval [--model=...]
 *
 * Headline metric = % of each arm's final claims that are GROUNDED (deterministic check, no LLM
 * judge). Team wins by construction (the Critic gate). Also reports the Critic's rejection count
 * — the "caught the lie" number. Logs each arm as a Weave Evaluation under `content-grounding`.
 * All arms are LLM → this spends W&B Inference.
 */

import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { runContentEval, type ContentArm } from "@weavehacks/agents";
import { initWeave, isWeaveActive, runModelEvaluation, flushWeave } from "@weavehacks/observability";

loadRootEnv();

function parseArgs(argv: string[]) {
  const arms: ContentArm[] = [];
  let model: string | undefined;
  for (const a of argv) {
    if (a === "all") arms.push("solo", "solo_grounded", "team");
    else if (a === "solo" || a === "solo_grounded" || a === "team") arms.push(a);
    else if (a.startsWith("--model=")) model = a.slice(8);
  }
  const uniq = [...new Set(arms)] as ContentArm[];
  return { arms: uniq.length ? uniq : (["solo", "solo_grounded", "team"] as ContentArm[]), model };
}

const padR = (s: unknown, w: number) => String(s).padEnd(w);
const padL = (s: unknown, w: number) => String(s).padStart(w);

async function main() {
  const { arms, model } = parseArgs(process.argv.slice(2));
  await initWeave();

  console.log(`\n=== CONTENT GROUNDING EVAL · ${arms.join(", ")} (spends inference) ===\n`);

  const res = await runContentEval({
    arms,
    model,
    onResult: (r, i, total) => {
      const caught = r.result.rejections.length ? `  · critic caught ${r.result.rejections.length}` : "";
      console.log(`  [${padL(i + 1, 2)}/${total}] ${padR(r.arm, 13)} grounding ${padL(r.grounding.pct + "%", 4)} (${r.grounding.grounded}/${r.grounding.total})${caught}   "${r.brief.slice(0, 36)}…"`);
    },
  });

  console.log(`\n  arm            scored   grounded%   claims   rejections`);
  for (const arm of res.arms) {
    const s = res.summary[arm];
    console.log(`  ${padR(arm, 13)}  ${padL(s.scored, 6)}   ${padL(s.groundingPct + "%", 8)}   ${padL(s.avgClaims, 6)}   ${padL(s.totalRejections, 10)}`);
  }
  if (res.summary.solo && res.summary.team) {
    const d = res.summary.team.groundingPct - res.summary.solo.groundingPct;
    console.log(`\nSCOREBOARD  solo ${res.summary.solo.groundingPct}% grounded  ·  team ${res.summary.team.groundingPct}% grounded  ·  delta ${d >= 0 ? "+" : ""}${d} pts`);
  }

  // Weave Evals tab — one Evaluation, one model run per arm (replay; no extra inference).
  if (isWeaveActive()) {
    const briefs = [...new Set(res.results.map((r) => r.brief))];
    const rows = briefs.map((brief) => ({ brief }));
    for (const arm of res.arms) {
      const cache = new Map(res.results.filter((r) => r.arm === arm).map((r) => [r.brief, r]));
      await runModelEvaluation({
        evaluation: "content-grounding",
        model: `content-${arm}`,
        rows,
        predict: (row) => {
          const r = cache.get(row.brief);
          return r ? { post: r.result.draft.post, grounded_pct: r.grounding.pct, claims: r.grounding.total, ungrounded: r.grounding.ungrounded.length } : { grounded_pct: null };
        },
        scorers: {
          grounded_pct: ({ modelOutput }) => modelOutput.grounded_pct,
          claims: ({ modelOutput }) => modelOutput.claims ?? null,
          ungrounded_claims: ({ modelOutput }) => modelOutput.ungrounded ?? null,
        },
      });
    }
    await flushWeave();
    console.log(`\nWeave: logged ${res.arms.length} arm(s) under "content-grounding" → Evals tab, select them, compare.`);
  } else {
    console.log(`\n(Weave inactive — set WANDB_API_KEY to log these as comparable Evals.)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[content:eval] error:", e);
      process.exit(1);
    });
}
