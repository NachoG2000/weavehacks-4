/**
 * The Content → Critic hero loop, as three comparable arms on one brief.
 *
 * The key to an HONEST result (not a rigged tie): the writer produces FREE-FORM copy — it does
 * NOT tag its own claims — and an INDEPENDENT auditor extracts every factual claim and matches
 * it to a real fact (or null). Grounding is then scored deterministically (grounding.ts). So a
 * bold solo copywriter that invents "#1 ramen in Paris" gets caught by the same auditor that
 * scores everyone; nobody grades their own work.
 *
 *   • solo          — bold copywriter, one shot, no grounding gate → invents unbacked hooks.
 *   • solo_grounded — same writer, told to ground itself. Better, but self-judges → still leaks.
 *   • team          — writer drafts, the auditor+gate rejects ungrounded claims, writer rewrites,
 *                     looping until grounded. Wins by CONSTRUCTION: an independent gate solo lacks.
 */

import { traced } from "@weavehacks/observability";
import { runToolAgent } from "@weavehacks/runtime";
import { GROUNDING_TOOLS } from "./tools";
import { scoreGrounding, type Claim, type ContentDraft, type Ungrounded } from "./grounding";

export type ContentArm = "solo" | "solo_grounded" | "team";

export interface ContentResult {
  arm: ContentArm;
  brief: string;
  /** final caption + the INDEPENDENT auditor's extracted claims */
  draft: ContentDraft;
  /** writer passes (1 for solo arms; team = 1 + rewrites) */
  rounds: number;
  /** ungrounded claims the gate caught across the loop (team only) — the "caught the lie" number */
  rejections: Ungrounded[];
  toolCalls: number;
}

const WRITER =
  "You are a bold social-media copywriter for Le Kyoto, a Japanese takeout/delivery spot near Paris. " +
  "Write ONE short, scroll-stopping Instagram caption for the brief: a punchy hook, a few specific claims, and a CTA. " +
  "Output ONLY the caption text — no preamble, no quotes.";
const GROUND_SELF =
  " You may call get_facts; only state things you can back with a real fact from it — if a hook has no source, cut it.";
const AUDITOR =
  "You are an independent fact-checker. Read the caption and call get_facts. Extract EVERY factual or checkable claim the " +
  "caption makes (a statistic, a superlative like 'best in Paris', a price, an opening hour, any specific). For each claim, set " +
  "factId to the id of the fact that supports it, or null if NOTHING in get_facts supports it; set citedValue to the number the " +
  "claim states, or null. Be literal — do not stretch a fact to cover a claim it doesn't actually support. Output ONLY:\n" +
  'AUDIT_JSON: {"claims": [{"text": "<claim>", "factId": "<id or null>", "citedValue": <number or null>}]}';

/** Find the first balanced {...} after a tag and JSON.parse it (handles nested braces + strings). */
function extractTaggedJson(text: string, tag: string): any | null {
  const at = text.indexOf(tag);
  const start = text.indexOf("{", at >= 0 ? at + tag.length : 0);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const cleanCaption = (t: string) => t.trim().replace(/^["']|["']$/g, "").trim();

function writer(instructions: string, input: string, model?: string) {
  return runToolAgent({ name: "Content", role: "content", instructions, input, tools: GROUNDING_TOOLS, model, maxSteps: 4 });
}

/** Independent audit: extract claims from a caption and match each to a fact (or null). */
async function audit(post: string, model?: string): Promise<{ claims: Claim[]; toolCalls: number }> {
  const res = await traced("agent.auditor", (p: string) =>
    runToolAgent({ name: "Critic", role: "critic", instructions: AUDITOR, input: `Caption:\n"${p}"`, tools: GROUNDING_TOOLS, model, maxSteps: 3 }),
  )(post);
  const o = extractTaggedJson(res.text, "AUDIT_JSON") ?? {};
  const claims: Claim[] = Array.isArray(o.claims)
    ? o.claims.map((c: any) => ({ text: String(c?.text ?? ""), factId: c?.factId ?? null, citedValue: c?.citedValue ?? null }))
    : [];
  return { claims, toolCalls: res.toolCalls.length };
}

async function oneShot(arm: ContentArm, span: string, instructions: string, brief: string, model?: string): Promise<ContentResult> {
  const w = await traced(span, (b: string) => writer(instructions, `Brief: ${b}`, model))(brief);
  const post = cleanCaption(w.text);
  const a = await audit(post, model);
  return { arm, brief, draft: { post, claims: a.claims }, rounds: 1, rejections: [], toolCalls: w.toolCalls.length + a.toolCalls };
}

/** SOLO — bold one shot, no gate. */
export function soloContent(brief: string, opts: ContentOptions = {}): Promise<ContentResult> {
  return oneShot("solo", "agent.content_solo", WRITER, brief, opts.model);
}

/** SOLO-GROUNDED — same writer, told to ground itself (but it grades its own work). */
export function soloGroundedContent(brief: string, opts: ContentOptions = {}): Promise<ContentResult> {
  return oneShot("solo_grounded", "agent.content_solo_grounded", WRITER + GROUND_SELF, brief, opts.model);
}

export interface ContentOptions {
  model?: string;
  maxRounds?: number;
  /** narrate the team loop (live demo) */
  onStep?: (step: { label: string; draft?: ContentDraft; ungrounded?: Ungrounded[]; approved?: boolean }) => void;
}

/** TEAM — writer drafts, independent auditor+gate rejects ungrounded claims, writer rewrites until grounded. */
export function teamContent(brief: string, opts: ContentOptions = {}): Promise<ContentResult> {
  const maxRounds = opts.maxRounds ?? 3;
  return traced("brigade.content", async (b: string): Promise<ContentResult> => {
    let toolCalls = 0;
    let w = await writer(WRITER, `Brief: ${b}`, opts.model);
    toolCalls += w.toolCalls.length;
    let post = cleanCaption(w.text);
    opts.onStep?.({ label: "draft v1", draft: { post, claims: [] } });

    let a = await audit(post, opts.model);
    toolCalls += a.toolCalls;
    let claims = a.claims;
    const rejections: Ungrounded[] = [];
    let rounds = 1;

    for (let i = 0; i < maxRounds; i++) {
      const g = scoreGrounding(claims);
      opts.onStep?.({ label: `critic (round ${i + 1}) — ${g.grounded}/${g.total} grounded`, ungrounded: g.ungrounded, approved: g.ungrounded.length === 0 });
      if (g.ungrounded.length === 0 || i === maxRounds - 1) break;
      rejections.push(...g.ungrounded);
      const rw = await writer(
        WRITER + GROUND_SELF,
        `Brief: ${b}\n\nPrevious caption:\n"${post}"\n\nA fact-checker flagged these claims as UNGROUNDED (no real source):\n${g.ungrounded.map((u) => `- "${u.text}" (${u.reason})`).join("\n")}\n\nRemove or replace each with something backed by get_facts. Keep it punchy and keep a CTA. Output ONLY the caption text.`,
        opts.model,
      );
      toolCalls += rw.toolCalls.length;
      post = cleanCaption(rw.text);
      rounds++;
      opts.onStep?.({ label: `draft v${rounds}`, draft: { post, claims: [] } });
      a = await audit(post, opts.model);
      toolCalls += a.toolCalls;
      claims = a.claims;
    }
    return { arm: "team", brief, draft: { post, claims }, rounds, rejections, toolCalls };
  })(brief);
}

export const CONTENT_ARMS: Record<ContentArm, (brief: string, opts?: ContentOptions) => Promise<ContentResult>> = {
  solo: soloContent,
  solo_grounded: soloGroundedContent,
  team: teamContent,
};
