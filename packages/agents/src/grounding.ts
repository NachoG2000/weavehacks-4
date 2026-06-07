/**
 * The DETERMINISTIC grounding check — the impartial scorer for the Content→Critic eval.
 *
 * A claim is grounded iff it cites a real factId AND (if it states a number) that number matches
 * the fact within tolerance. No LLM judges this — that's the point: it can't be argued the agents
 * graded themselves. The Critic agent is the MECHANISM that drives grounding up in the team arm;
 * THIS is the scorer that measures every arm's final output the same way.
 */
import { factById } from "./tools/facts";

export interface Claim {
  text: string;
  /** the fact this claim is backed by — null/unknown ⇒ ungrounded */
  factId: string | null;
  /** the number the claim asserts, if any (checked against the fact's value) */
  citedValue?: number | string | null;
}

export interface ContentDraft {
  post: string;
  claims: Claim[];
}

export interface Ungrounded {
  text: string;
  reason: string;
}

export interface GroundingResult {
  total: number;
  grounded: number;
  /** grounded / total, 0..100 */
  pct: number;
  ungrounded: Ungrounded[];
}

export function scoreGrounding(claims: Claim[]): GroundingResult {
  const list = claims ?? [];
  const ungrounded: Ungrounded[] = [];
  let grounded = 0;
  for (const c of list) {
    if (!c.factId) {
      ungrounded.push({ text: c.text, reason: "no source cited" });
      continue;
    }
    const f = factById(c.factId);
    if (!f) {
      ungrounded.push({ text: c.text, reason: `unknown source '${c.factId}'` });
      continue;
    }
    if (typeof f.value === "number" && typeof c.citedValue === "number") {
      const tol = Math.max(0.5, Math.abs(f.value) * 0.05);
      if (Math.abs(c.citedValue - f.value) > tol) {
        ungrounded.push({ text: c.text, reason: `cited ${c.citedValue}, source says ${f.value}` });
        continue;
      }
    }
    grounded++;
  }
  const total = list.length;
  return { total, grounded, pct: total ? Math.round((grounded / total) * 100) : 0, ungrounded };
}
