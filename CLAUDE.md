# CLAUDE.md

This file is operating instructions to yourself, not a repo brochure. Read the THESIS first.
The project IS decided (Brigade) and the two implementation choices (runtime provider,
orchestration framework) are now RESOLVED (see below). Next up: build the Content → Critic
HERO LOOP.

---

## WHAT WE'RE BUILDING: Brigade

A **service-as-software** multi-agent system for a REAL restaurant we operate — **Le Kyoto**,
a small Japanese takeout/delivery spot near Paris. Named after the kitchen brigade: a head
chef delegates to specialized stations. Specialized AI agents handle different restaurant
operations, **every agent's output is scored by a Critic, and the system measurably improves
from that feedback.**

Grounded in real data and a real operator ("I run this restaurant, this is the system I wish
I had"). **That founder story is a core asset — protect it.** Never let fabricated data dilute
"this is real": seed files are clearly-marked curated slices that the operator replaces with
the real numbers; we never pass a guess off as Le Kyoto's truth.

20h hackathon (WeaveHacks 4), team of 2, all coding with AI. Optimize for a **working 3-minute
demo**, not production.

---

## THE THESIS — this is what gets judged. Never lose sight of it.

- Multi-agent only earns its place when a **SOLO agent visibly FAILS** and a **coordinated
  team visibly SUCCEEDS**, and we can **PROVE it with numbers in Weave**.
- Coordination only matters when there's a real **CONFLICT** to resolve. The Critic wants
  data-grounded, specific output; the producing agent just wants to ship. **That clash — and
  the visible quality jump when it resolves — is the star of the demo.**
- **No decorative agents.** Every agent needs a role AND at least one real conflict or
  dependency with another agent, or it doesn't ship.
- The deliverable that proves all of this: **"solo scores X, team scores Y"** in Weave, by
  Saturday night, runnable at all times.

---

## OBSERVABILITY + THE BASELINE COME FIRST

Before any breadth, the scoreboard must exist and stay green:
1. A **SOLO baseline** that does a task alone (e.g. writes the Instagram post in one shot).
2. The **agent-TEAM** version (producer + Critic loop).
3. **Weave on BOTH**, same scenario through each, reporting a numeric difference (output
   quality score; % of claims grounded in a real data source).

Weave is our **SCOREBOARD, not just logging.** Headline demo line: *"solo agent scores 5/10
and hallucinates; our team scores 8.5/10 with every claim traced to POS/reviews — here's the
Weave trace."* Keep `pnpm compare` runnable after every change.

> Current state: the **Brigade discussion team is live** (`pnpm prep`) — real LLM agents
> (Chef/Historian/Scout/Prep) coordinating on a "prep for Friday" turn over W&B Inference, with
> tools + every turn traced in Weave. The numeric **solo-vs-team eval is now real** (`pnpm eval`):
> it holds out the last N weeks of the real POS export, hides them from every history tool via an
> **as-of leakage guard**, has a solo agent (all tools, one shot) and the team (Historian grounds
> base+per-factor deltas → Prep reconciles) each predict the held-out services, and scores both
> against what ACTUALLY happened — objective MAE/sMAPE, no LLM judge. `pnpm eval` (no args) runs
> the FREE deterministic naive baseline; `pnpm eval all` adds the credit-spending solo/team arms.
> Each arm is logged as a Weave **Evaluation** (compare side-by-side in the Evals tab). The
> deterministic `compare`/`demo` stand-in (`apps/api/src/scenario.ts`) stays green/free for the
> always-runnable scoreboard; `compareSoloVsTeam` is unchanged.

---

## THE HERO LOOP — build this end-to-end FIRST (Day 1, non-negotiable)

The one thing worth showing deeply. A single "Friday prep" turn, exactly this shape:

```
USER: "Prep for Friday dinner."

CHEF (orchestrator): Friday dinner request. Needs demand prediction + content push.
  → delegates to Prep, then Content

PREP AGENT: [pulls POS: last 8 Fridays] [pulls weather: rain, 14C]
  "Friday 19-21h: pre-prep ~32 gyoza, ~15 shoyu ramen. Rain → cold soba drops 40%, skip it."
  → emits prep sheet

CONTENT AGENT: [reads Prep output + review highlights]
  draft v1: "Rainy Friday? Hot ramen's calling." → emits

CRITIC: [scores v1] "5/10. Generic, no data hook, no CTA. Reviews: 83% of 5-star reviews
  mention the broth — use it." → feedback back to Content

CONTENT AGENT: [rewrites with feedback]
  draft v2: "Our 18-hour tonkotsu broth — the one 83% of you can't stop reviewing.
  Rainy Friday, 6:30pm. Pre-order now." → emits

CRITIC: [scores v2] "8.5/10. Grounded, specific, has CTA. ✅"

CHEF: → presents prep sheet + approved post to user
```

What makes it real multi-agent (not one LLM in a trenchcoat): **the Critic wants something
different than Content and BLOCKS it until grounded.** The 5→8.5 jump is visible live and fully
traced in Weave. This loop is the demo's spine. Everything else is additive.

---

## AGENT ROSTER

**Starting team — BUILT and running (`pnpm prep`):** the "Friday prep" discussion.
- **Chef** (orchestrator): receives the request, delegates, presents, escalates big swings (HITL).
- **Historian**: reads POS history via tools — the typical night + how past conditions moved demand.
- **Scout**: reads today's real-world conditions via tools — weather, games, holidays, local events.
- **Prep**: reconciles Historian (baseline) vs Scout (today) into ONE grounded prep sheet.

  The conflict that earns the multi-agent setup: Historian's *average* Friday vs Scout's "*this*
  Friday is rain + a PSG derby + a school holiday + a transport strike." A solo agent picks one
  lens and is wrong; the team surfaces the contradiction and Prep reconciles it.

**Next layer (additive, cuttable):**
- **Content** + **Critic**: data-grounded social post; Critic scores 1–10 and BLOCKS until grounded
  (the 5→8.5 jump — the eventual scoreboard star).
- **Promo**: slow periods → targeted offers.  **Reviews**: review vector search → insights.
- **Forge** (coda): detects a capability gap, scaffolds a NEW agent. 15-second coda only.

Each agent's role + its conflict/dependency live as data in `packages/agents/src/roles.ts`
(`assertEveryRoleHasConflict()` enforces it). If an agent has no conflict listed, it doesn't ship.

> **Tools, not hardcoded prompts.** Agents reach data ONLY through parameterized tools
> (`packages/agents/src/tools/`), driven by the runtime's chat-completions tool loop
> (`runToolAgent`, model-agnostic). Every tool call is a Weave op, so each claim is traceable to
> the exact query that grounded it. The Scout's tools are the four realtime signals (weather,
> games, holidays, events); the Historian's are POS analytics over the REAL `pos.json` export —
> a base-rate query plus one isolated marginal-effect query per factor (football/weather/
> calendar), each carrying its sample size `n` so confidence is visible.

## SELF-IMPROVEMENT (3 layers — Layer 1 is the hero, 2 and 3 are bonus)

- **Layer 1 (within session):** Critic forces rewrites until quality threshold. **THE STAR.**
- **Layer 2 (across runs):** Redis stores scores + feedback so agents don't repeat mistakes.
- **Layer 3 (lifetime):** Forge spawns new agents. Coda only.

---

## RESOLVED DECISIONS (2026-06-06) — do not re-litigate

Both went to the zero-friction option to protect the 20h / 2-person window. If you want to
revisit either, STOP and ask the team first.

1. **RUNTIME PROVIDER — RESOLVED: keep W&B Inference as the day-one default**, OpenAI as a
   switchable fallback. `RUNTIME_PROVIDER` selects `wandb` (default) or `openai`; the one W&B
   API key powers both Weave AND W&B Inference, so the W&B credits fund the agents. If a stronger
   model is ever needed for Critic/Chef, role-based routing lives in `providerForRole()` — but
   only split if it maps to ROLES, and ask first.

2. **ORCHESTRATION FRAMEWORK — RESOLVED: keep the direct-call orchestrator** (`packages/
   orchestration`: `runSolo`/`runTeam` + conflict resolution) and the plain Next.js shell that
   polls `/compare`. No LangGraph, no CopilotKit — the Critic-rewrite loop fits the direct-call
   model directly, and the scoreboard is already green. (CopilotKit/LangGraph stay on the table
   only as a post-hero-loop polish if time allows — ask before adopting.)

---

## RULES FOR ANY AGENT WORKING HERE

- **Canon vs non-canon.** `packages/truth` is the ONLY source of truth (menu, prices, hours) —
  CANON. Surface states, drafts, seed-derived outputs, and anything an agent generates are
  DERIVED and may be stale. **Never treat a generated output as truth.** `packages/seed` is a
  curated demo slice — credibility for the pitch, NOT canon.
- **Every agent needs a clear role and at least ONE conflict/dependency with another agent, or
  it doesn't ship.** No decorative parallel agents.
- **The Critic validates SEMANTICALLY** — is the claim grounded in a real data source? — not
  just "did it run?". Target: **0 ungrounded claims in approved output.**
- **Anything touching money or public reputation (a live promo, a published post) requires HITL
  approval — never auto-publish.**
- **Build the HERO LOOP end-to-end before breadth.** Promo / Reviews / Forge are additive and
  cuttable. Keep the solo-vs-team scoreboard runnable after every change.
- **Everything is instrumented in Weave.** Every agent call AND every Critic scoring/rewrite is
  a traced op. The solo-vs-team comparison stays runnable at all times.
- **Keep the orchestration + observability core domain-agnostic.** `packages/orchestration` and
  `packages/observability` must not leak restaurant concepts (no menu/dish/surface). Domain code
  lives in `packages/agents`, `packages/truth`, `packages/seed`.
- **DATA: do NOT build a pipeline.** We have real data (3yr Hiboutik POS, public Google reviews,
  weather, menu) but the demo uses a **curated seed slice** in `packages/seed` (hardcoded). Real
  data is PITCH CREDIBILITY, not a technical dependency. No live integrations. Make seed easy to
  edit so we can stage the demo.
- **Credits power RUNTIME agents, not build tooling.** OpenAI ($50) + W&B Inference ($50) fund
  the agents *inside* Brigade. ~$123 Cursor credit is for BUILD TOOLING (coding agent), NOT
  runtime. **Exception:** the Forge coda, if it actually WRITES a new agent's code live, is a
  coding task — the only place Cursor credits may touch the product, and only as a Sunday stretch.
  Never burn runtime credits in health checks / scaffolding.
- **20h hackathon discipline (2 people):** if torn between "robust" and "demoable tomorrow," choose
  demoable. No complex auth, multi-tenancy, elaborate CI/CD, YAML owners, scheduled scanners, or
  speculative abstractions.
- **Integrate early, commit often.** Judges read git history as proof we built it here. No
  backend/frontend silos merged in the last hour.

---

## COMMANDS

```bash
./start.sh        # one-command setup: tools → install → .env → Redis → seed → health → dev
pnpm dev          # turbo dev: web (:3000) + api (:3001)
pnpm health       # Redis ping + Weave hello-world (also: GET /health on the api)
pnpm seed         # load + validate the curated seed slice (no LLM, no credits)
pnpm prep         # ⭐ the Brigade discussion: Chef→Historian+Scout→Prep, live (real LLMs, traced)
pnpm baseline     # run the SOLO agent alone (deterministic stand-in scenario)
pnpm compare      # the stand-in scoreboard: solo vs team, numeric delta (also: GET /compare)
pnpm eval         # ⭐ REAL solo-vs-team forecast eval on a recent holdout (no args = FREE naive;
                  #   'pnpm eval all' adds solo+team LLM arms; logs Weave Evaluations to compare)
pnpm demo         # narrated stand-in demo: catch contradiction → resolve/escalate → the number
pnpm ask "..."    # one-off free-form prompt through the configured runtime (spends credits)
pnpm --filter @weavehacks/api models       # list runtime model ids your key can use
pnpm --filter @weavehacks/api agent:check  # prove a single agent run (spends a little credit)
pnpm --filter @weavehacks/api tool:check   # prove tool-calling works on the model (a little credit)
pnpm typecheck    # turbo typecheck (tsc --noEmit) across all packages
pnpm build        # turbo build (next build for web; typecheck gate for packages)
pnpm format       # prettier
```

Run one package: `pnpm --filter @weavehacks/<name> <script>`. Redis runs as the
`weavehacks-redis` docker container on `:6379`. Weave needs `WANDB_API_KEY` in `.env`; without
it, tracing degrades to a no-op (the spine still runs).

## ARCHITECTURE

pnpm + Turborepo monorepo. TypeScript ESM throughout; packages export `src/*.ts` directly (no
build step — `tsx` runs the api, Next transpiles the web).

- **`packages/orchestration`** — domain-agnostic core. `Agent` = a `role` (with `authority`:
  higher = closer to the source of truth) + an `act()` that emits `Claim`s. `runSolo()` applies
  claims last-write-wins (the failing baseline). `runTeam()` gathers claims → a verifier detects
  conflicts → `resolveConflict()` decides: **highest authority wins; `sensitive` claims escalate
  to a human.** `SharedState` is Redis-backed with an in-memory fallback. (The Critic-rewrite
  loop is modeled here too once we build it — keep it generic.)
- **`packages/observability`** — `initWeave()` + `traced()` (no-ops without a key) wrap every
  agent call/resolution. `compareSoloVsTeam()` is the scoreboard: runs the same scenario two
  ways, traces both, returns `{ solo, team, delta }`.
- **`packages/runtime`** — inference. OpenAI-compatible client(s) for **OpenAI** and
  **W&B Inference**, switchable via `RUNTIME_PROVIDER` (default `wandb`, per the resolved
  decision). `generate()`/`reason()` = raw chat completions; `runToolAgent()` = the tool-calling
  loop (model-agnostic function-calling — what the Brigade agents run on); `runAgent()` = the
  OpenAI Agents SDK path. `describeRuntime()` reports config without spending credits.
- **`packages/agents`** — **DOMAIN lives here.** `roles.ts` is the manifest (authority + required
  conflict per role). `tools/` are the parameterized, Weave-traced tools agents call —
  `history.ts` (Historian POS tools over the real export: base rate + isolated marginal effects,
  in `pos-analytics.ts`) + `realtime.ts` (the four signals + menu).
  `stations.ts` defines the four LLM agents (Chef/Historian/Scout/Prep) on `runToolAgent`.
  `discussion.ts` = `runFridayPrep()`, the coordination loop (one Weave span). Content/Critic/
  Promo/Reviews/Forge are next.
- **`packages/truth`** — **CANON.** Canonical restaurant data (menu, prices, hours) + schema.
  The single source of truth conflicts resolve toward.
- **`packages/seed`** — curated demo slice, split into editable files: `orders` (POS history),
  `weather`, `fixtures`, `holidays`, `events` (the four realtime signals), `reviews`. `TARGET_DATE`
  is the Friday the team preps for. Derived, NOT canon.
- **`packages/memory`** — Redis: performance scores, Critic feedback, review vector search,
  Forge gap log, agent blueprints (Layers 2 & 3 of self-improvement).
- **`packages/shared`** — `createRedis()`, `loadRootEnv()`, cross-cutting types (`Scoreboard`,
  `RunResult`).
- **`apps/api`** — orchestration runtime entrypoint. HTTP `/health` + `/compare`, and the
  `baseline`/`compare`/`demo`/`seed`/`ask` CLI scripts.
- **`apps/web`** — dashboard: the Critic score jump, live agent cards, HITL approve/reject.
  Plain Next.js polling `/compare` (direct-call orchestrator, per the resolved decision).

The point: orchestration + observability are the reusable spine; the agents/truth/seed/memory
packages are Brigade; the scoreboard proves the thesis (solo → team) after every change.
