# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> These are operating instructions to yourself, not a repo brochure. Read the STATUS and
> OPEN DECISIONS first — the project is **not chosen**, and most project-specific work is
> blocked until it is.

---

## STATUS: WE HAVE NOT CHOSEN THE PROJECT YET

We are deciding between two projects, A and B. They are EQUAL candidates right now.
Do NOT assume one. Your job in this setup pass is to build ONLY the shared spine
that both need, and then STOP and ask us which one we picked before building
anything project-specific.

**Project A — Restaurant truth-sync (service-as-software).** A multi-agent system that keeps
a restaurant's digital presence consistent against a SINGLE SOURCE OF TRUTH (owner-loaded:
menu, prices, hours, available dishes). External surfaces (Google Maps, social, delivery apps,
the site) drift; a solo agent updates one and silently leaves the others broken. Agents with
distinct roles (inventory, marketing, presence-sync, verifier, orchestrator) MUST coordinate
because their outputs contradict (Marketing wants to promote a dish Inventory knows is sold
out). Conflict rule: the agent closest to the source of truth wins; money/reputation changes
escalate to a human.

**Project B — Self-improving agent over a vector DB ("ruvector").** A team of agents debates
and improves a vector database / retrieval agent over time. The orchestration IS agents
reasoning about how to improve store/retrieval quality. (Thesis still needs sharpening — see
OPEN DECISION #2.)

**What's COMMON (already built — the shared spine):** the domain-agnostic multi-agent core
(roles, coordination loop, conflict/decision resolution), Weave as a SCOREBOARD (instrument
every agent call + every resolution; a solo-vs-team comparison harness that reports a numeric
difference), Redis for shared state + pub/sub, the monorepo, one-command setup, env, health checks.

**What is PROJECT-SPECIFIC (do NOT build until we choose):** any domain model, any
domain-tied agent roles, any UI beyond a neutral shell. These live as empty placeholders in
`packages/_project-a` and `packages/_project-b` with a TODO until the decision is made.

### The thesis (applies to whichever we pick — this is what gets judged)
- Multi-agent only earns its place when a SOLO agent visibly fails and a coordinated team
  visibly succeeds, and we can prove it with numbers in Weave.
- Coordination only matters when there's a real CONFLICT to resolve. No decorative parallel agents.
- The demo's star is the moment the system catches a contradiction and resolves it (or
  escalates). Build toward showing that in 3 minutes.
- Whichever project we choose must produce a "solo scores X, team scores Y" number by Saturday night.

---

## OPEN DECISIONS — do NOT pick these for us. Scaffold neutrally and ASK before hardcoding.

1. **PROJECT CHOICE: A or B.** Not decided. This is the big one — most project-specific
   work is blocked on it.
2. **(If B) Sharpen the thesis:** what exactly does a solo agent get WRONG about improving
   the vector DB that a team gets right? If we can't answer this, B is weaker than A.
3. **RUNTIME PROVIDER — RESOLVED (2026-06-06):** Runtime LLM = **Cursor Agents SDK**
   (`@cursor/sdk`), billed on Cursor's pricing (the team has no OpenAI tokens). OpenAI and
   W&B Inference stay as switchable fallbacks via `RUNTIME_PROVIDER=openai|wandb` (both
   OpenAI-compatible). Role-based routing still lives in `providerForRole()` if we later want
   a cheaper model for high-frequency agents.
4. **AGENT FRAMEWORK — RESOLVED (2026-06-06):** **Cursor Agents SDK.** Correction to an
   earlier note: Cursor is NOT just a build tool — it shipped a programmatic TypeScript SDK
   (Apr 2026) that runs its agent runtime headlessly. Product agents are single-shot Cursor
   agents that REASON and return an answer (not code edits): `runtime.reason(prompt, {role})`.
   The orchestration core is framework-agnostic, so domain agents drop straight in after A/B.

Still open: **#1 (A or B)** and **#2 (sharpen B's thesis, if B).**

When you hit any open decision, STOP and ask a concise question rather than guessing.

---

## Rules for any agent working here

- **Keep the core domain-agnostic.** `packages/orchestration` and `packages/observability`
  must NEVER leak Project A or B concepts (no restaurant/menu/surface, no vector/retrieval terms).
  Domain code goes in `packages/_project-a|b` only, and only after the decision.
- **Runtime LLM = Cursor SDK (billed to Cursor).** This is the team's choice (no OpenAI
  tokens). The OpenAI ($50) + W&B ($50) inference credits are unused by default but remain
  available via `RUNTIME_PROVIDER`. Either way: do NOT make LLM calls in health
  checks/scaffolding — no burning runtime usage (Cursor or credits) on tooling.
- **Every agent needs a clear role and at least ONE conflict with another agent, or it doesn't
  ship.** No decorative parallel agents.
- **Verifier-type roles validate SEMANTICALLY**, not just "did it run?".
- **Money/reputation (or otherwise irreversible) changes escalate to a human, never auto-apply.**
- **Everything is instrumented in Weave.** Every agent call and every conflict resolution is a
  traced op. The solo-vs-team comparison must stay runnable at all times.
- **2-day hackathon:** if torn between "robust" and "demoable tomorrow," choose demoable. No
  speculative abstractions, complex auth, multi-tenancy, elaborate CI/CD, or scheduled scanners.
- **Integrate early, commit often.** Judges read git history as proof.

---

## Commands

```bash
./start.sh        # one-command setup: tools → install → .env → Redis → health → dev
pnpm dev          # turbo dev: web (:3000) + api (:3001)
pnpm health       # Redis ping + Weave hello-world (also: GET /health on the api)
pnpm baseline     # run the SOLO agent alone (watch it fail)
pnpm compare      # THE SCOREBOARD: solo vs team, numeric delta (also: GET /compare)
pnpm demo         # narrated 3-min demo: catch contradiction → resolve/escalate → the number
pnpm --filter @weavehacks/api agent:check   # prove the Cursor runtime end-to-end (needs CURSOR_API_KEY)
pnpm typecheck    # turbo typecheck (tsc --noEmit) across all packages
pnpm build        # turbo build (next build for web; typecheck gate for packages)
pnpm format       # prettier
```

Run one package: `pnpm --filter @weavehacks/api <script>`. Redis runs as the
`weavehacks-redis` docker container on `:6379`. Weave needs `WANDB_API_KEY` in `.env`;
without it, tracing degrades to a no-op (the spine still runs).

## Architecture

pnpm + Turborepo monorepo. TypeScript ESM throughout; packages export `src/*.ts` directly
(no build step — `tsx` runs the api, Next transpiles the web). The data flow that matters:

- **`packages/orchestration`** — the domain-agnostic core. `Agent` = a `role` (with an
  `authority`: higher = closer to the source of truth) + an `act()` that emits `Claim`s.
  `runSolo()` applies claims last-write-wins (the failing baseline). `runTeam()` gathers
  claims → a verifier detects conflicts → `resolveConflict()` decides: **highest authority
  wins; `sensitive` claims escalate to a human instead of auto-applying.** `SharedState` is
  Redis-backed (`createSharedState`) with an in-memory fallback so runs work offline.
- **`packages/observability`** — `initWeave()` + `traced()` (defensive: no-ops without a key)
  wrap every agent call/resolution. `compareSoloVsTeam()` is the scoreboard: runs the same
  scenario two ways, traces both, returns `{ solo, team, delta }`.
- **`packages/runtime`** — inference. Default provider = **Cursor SDK** (`cursorGenerate` /
  `reason` → single-shot reasoning, returns text/JSON, billed to Cursor). OpenAI / W&B
  Inference are switchable via `RUNTIME_PROVIDER`. `generate()` / `reason()` route by role
  through `providerForRole()`. `describeRuntime()` reports config without spending usage.
- **`packages/shared`** — `createRedis()`, `loadRootEnv()` (walks up to the workspace root),
  and cross-cutting types (`Scoreboard`, `RunResult`).
- **`apps/api`** — orchestration runtime entrypoint. HTTP `/health` + `/compare`, and the
  `baseline`/`compare`/`demo` CLI scripts. `src/scenario.ts` is a **NEUTRAL placeholder**
  scenario (generic `record_*` keys) so the scoreboard runs from minute one; it gets replaced
  by the chosen project's real scenario after the A/B decision.
- **`apps/web`** — neutral Next.js shell. A "Run scoreboard" button hits the api. No domain UI.

The whole point: orchestration + observability are the reusable spine; the placeholder scenario
proves the thesis (solo 60% → team 100%) without committing to A or B.
