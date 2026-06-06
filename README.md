# WeaveHacks 4

A multi-agent orchestration spine for our hackathon project. **The project (A or B) is
NOT chosen yet** — this repo currently contains only the *shared spine* both candidates
need. See [`CLAUDE.md`](./CLAUDE.md) for the open decisions.

## What this is

The thesis we're being judged on: **multi-agent only earns its place when a solo agent
visibly fails and a coordinated team visibly succeeds — and we can prove it with numbers
in Weave.** So the spine is built around exactly that:

- **`packages/orchestration`** — domain-agnostic multi-agent core: roles, a coordination
  loop, and conflict/decision resolution (highest-authority-wins; sensitive/irreversible
  changes escalate to a human). No project-specific concepts.
- **`packages/observability`** — W&B Weave wrapper + a **solo-vs-team comparison harness**
  that runs the same scenario two ways and reports a numeric difference.
- **`packages/runtime`** — inference. Default = **Cursor Agents SDK** (`@cursor/sdk`, billed
  to Cursor — no OpenAI tokens needed); OpenAI / W&B Inference switchable via `RUNTIME_PROVIDER`.
- **`packages/shared`** — shared types/utils + Redis client (shared agent state + pub/sub).
- **`apps/api`** — orchestration runtime entrypoint (HTTP `/health`, `/compare`; the
  `baseline`/`compare`/`demo` scripts).
- **`apps/web`** — neutral demo shell (no domain UI yet).
- **`packages/_project-a`, `packages/_project-b`** — empty placeholders, await the decision.

The bundled scenario is a **neutral placeholder** (generic "conflicting claims →
reconcile to a consistent state"). It already produces a `solo scores X, team scores Y`
number so the scoreboard is runnable from minute one. It gets replaced by the chosen
project's real scenario after we pick A or B.

## Run it

```bash
./start.sh          # one command: checks tools, installs, .env, Redis, health, dev
```

Or manually:

```bash
pnpm install
pnpm dev            # web + api
pnpm health         # Redis ping + Weave hello-world
pnpm baseline       # run the SOLO agent alone
pnpm compare        # the SCOREBOARD: solo vs team, numeric delta
pnpm demo           # narrated demo: catch the contradiction, resolve/escalate, score
pnpm --filter @weavehacks/api agent:check   # prove the Cursor runtime (needs CURSOR_API_KEY)
```

Requirements: Node 20+, pnpm, Docker (for Redis; otherwise bring your own `REDIS_URL`).
Copy `.env.example` → `.env` and fill in `CURSOR_API_KEY` (runtime agents) and `WANDB_API_KEY`
(Weave). The deterministic scoreboard (`pnpm compare`/`demo`) runs with no keys at all.

## Status

Project **A** (restaurant truth-sync) vs **B** (self-improving agent over a vector DB) is
**undecided**. Nothing project-specific has been built. See `CLAUDE.md` → *Open decisions*.
