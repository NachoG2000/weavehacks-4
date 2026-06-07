/**
 * pnpm content ["<brief>"]   → the Content → Critic hero loop, live.
 *
 * Shows a SOLO agent write a bold caption (and invent an ungrounded hook), then the TEAM:
 * the writer drafts, an independent Critic rejects every claim not traceable to a fact, and
 * the writer rewrites until grounded. Prints the grounding jump. Spends a little W&B Inference.
 */

import { fileURLToPath } from "node:url";
import { loadRootEnv } from "@weavehacks/shared";
import { soloContent, teamContent, scoreGrounding } from "@weavehacks/agents";
import { initWeave, flushWeave } from "@weavehacks/observability";

loadRootEnv();

const brief = process.argv.slice(2).join(" ").trim() || "Friday dinner rush — get people to pre-order ramen tonight";

async function main() {
  await initWeave();
  console.log(`\n=== CONTENT → CRITIC · "${brief}" ===\n`);

  // SOLO — one bold shot, no gate.
  const solo = await soloContent(brief);
  const sg = scoreGrounding(solo.draft.claims);
  console.log("── SOLO (one agent, no gate) ──");
  console.log(solo.draft.post);
  console.log(`grounding: ${sg.grounded}/${sg.total} claims (${sg.pct}%)`);
  for (const u of sg.ungrounded) console.log(`   ✗ "${u.text}" — ${u.reason}`);

  // TEAM — writer + independent Critic, narrated turn by turn.
  console.log("\n── TEAM (writer + independent Critic) ──");
  const team = await teamContent(brief, {
    onStep: (s) => {
      if (s.draft) console.log(`\n[${s.label}]\n${s.draft.post}`);
      if (s.ungrounded) {
        console.log(`[${s.label}] ${s.approved ? "APPROVED ✅" : "REJECTED ❌"}`);
        for (const r of s.ungrounded) console.log(`   ✗ "${r.text}" — ${r.reason}`);
      }
    },
  });
  const tg = scoreGrounding(team.draft.claims);
  console.log(`\nteam grounding: ${tg.grounded}/${tg.total} claims (${tg.pct}%)  ·  Critic caught ${team.rejections.length} ungrounded claim(s) over ${team.rounds} round(s)`);
  console.log(`\nSCOREBOARD  solo ${sg.pct}% grounded  ·  team ${tg.pct}% grounded  ·  +${tg.pct - sg.pct} pts`);

  await flushWeave();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[content] error:", e);
      process.exit(1);
    });
}
