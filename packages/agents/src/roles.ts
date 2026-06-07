/**
 * The Brigade roster, as DATA.
 *
 * This manifest encodes the project's hard rule — **every agent needs a clear role AND at
 * least one real conflict/dependency, or it doesn't ship** — as something you can assert
 * against, not just a comment. `act()` implementations land in this package next, built on the
 * resolved direct-call orchestrator (@weavehacks/orchestration) + @weavehacks/runtime.
 *
 * `authority` mirrors @weavehacks/orchestration: higher = closer to the source of truth, so it
 * wins conflicts. The Critic is deliberately HIGH — it can block a producer until grounded.
 */

export type Station =
  | "chef"
  | "historian"
  | "scout"
  | "prep"
  | "purchasing"
  | "promo"
  | "content"
  | "reviews"
  | "critic"
  | "forge";

export interface RoleManifest {
  id: Station;
  name: string;
  /** what this station does, in one line */
  does: string;
  /** higher = closer to source of truth; wins conflicts */
  authority: number;
  /** the REQUIRED conflict or dependency with another agent — no entry ⇒ doesn't ship */
  conflictsWith: { with: Station | "human"; over: string }[];
  /** does its output touch money or public reputation? → HITL, never auto-apply */
  sensitive: boolean;
  /** build priority */
  tier: "hero" | "breadth" | "coda";
}

export const AGENT_ROLES: RoleManifest[] = [
  {
    id: "critic",
    name: "Critic",
    does: "Scores EVERY agent output 1–10 and demands rewrites until claims are grounded.",
    authority: 90,
    conflictsWith: [
      { with: "content", over: "blocks ungrounded/generic drafts until they cite real data" },
      { with: "prep", over: "rejects demand numbers not traceable to POS/weather" },
    ],
    sensitive: false,
    tier: "hero",
  },
  {
    id: "content",
    name: "Content",
    does: "Writes data-grounded social posts from Prep output + review highlights.",
    authority: 30,
    conflictsWith: [{ with: "critic", over: "wants to ship; Critic wants it grounded + specific" }],
    sensitive: true, // a published post is public reputation → HITL
    tier: "hero",
  },
  {
    id: "historian",
    name: "Historian",
    does: "Reads POS history — what a typical day looks like, and how past conditions moved demand.",
    authority: 55,
    conflictsWith: [{ with: "scout", over: "its baseline average vs the Scout's claim that today is atypical" }],
    sensitive: false,
    tier: "hero",
  },
  {
    id: "scout",
    name: "Scout",
    does: "Reads today's real-world conditions — weather, games, holidays, local events.",
    authority: 58,
    conflictsWith: [{ with: "historian", over: "today's specific conditions vs the historical average" }],
    sensitive: false,
    tier: "hero",
  },
  {
    id: "prep",
    name: "Prep",
    does: "Reconciles Historian (baseline) + Scout (today) into ONE concrete prep sheet.",
    authority: 60,
    conflictsWith: [
      { with: "historian", over: "refuses a flat historical average when today is abnormal" },
      { with: "scout", over: "tempers raw 'today is unusual' against what history actually supports" },
      { with: "critic", over: "every demand number must trace to a tool result" },
    ],
    sensitive: false,
    tier: "hero",
  },
  {
    id: "chef",
    name: "Chef",
    does: "Orchestrator — receives requests, delegates to stations, presents results.",
    authority: 80,
    conflictsWith: [{ with: "human", over: "escalates money/reputation changes for approval" }],
    sensitive: false,
    tier: "hero",
  },
  {
    id: "purchasing",
    name: "Purchasing",
    does: "Turns Prep's demand into a feasible supplier order within budget, case-sizes, and shelf-life.",
    authority: 60,
    conflictsWith: [
      { with: "prep", over: "Prep wants full coverage; Purchasing is bounded by budget + shelf-life + supplier minimums" },
      { with: "human", over: "escalates an order that cannot cover demand within budget" },
    ],
    sensitive: true, // spends money → HITL
    tier: "breadth",
  },
  {
    id: "promo",
    name: "Promo",
    does: "Finds slow periods → targeted offers.",
    authority: 30,
    conflictsWith: [
      { with: "prep", over: "can't promote an item Prep predicts will sell out" },
      { with: "critic", over: "offers must be grounded + on-brand" },
    ],
    sensitive: true, // an offer is money → HITL
    tier: "breadth",
  },
  {
    id: "reviews",
    name: "Reviews",
    does: "Analyzes Google reviews (Redis vector search) → insights other agents cite.",
    authority: 50,
    conflictsWith: [{ with: "content", over: "supplies the grounded hooks Content must use" }],
    sensitive: false,
    tier: "breadth",
  },
  {
    id: "forge",
    name: "Forge",
    does: "Meta-agent — detects a capability gap and scaffolds a NEW agent. Coda only.",
    authority: 70,
    conflictsWith: [{ with: "human", over: "a new agent's code is reviewed before it runs" }],
    sensitive: true, // writes/activates code → HITL
    tier: "coda",
  },
];

/** Guard the project rule: a role without a conflict/dependency is decorative — fail loudly. */
export function assertEveryRoleHasConflict(roles: RoleManifest[] = AGENT_ROLES): void {
  const decorative = roles.filter((r) => r.conflictsWith.length === 0);
  if (decorative.length) {
    throw new Error(
      `[agents] decorative agents (no conflict/dependency) are not allowed: ${decorative
        .map((r) => r.id)
        .join(", ")}`,
    );
  }
}

export function role(id: Station): RoleManifest {
  const r = AGENT_ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`[agents] unknown station: ${id}`);
  return r;
}
