# packages/agents — the Brigade roster (DOMAIN code)

Domain logic lives here — keep it OUT of `orchestration`/`observability`.

- `roles.ts` — the **manifest**: each role's authority + its REQUIRED conflict/dependency.
  `assertEveryRoleHasConflict()` enforces the rule — **a role with no conflict is decorative
  and must not ship.**
- `tools/` — parameterized, Weave-traced tools the agents call. `history.ts` = the Historian's
  POS tools over the REAL export (`baseline_demand` + `effect_of_football`/`effect_of_weather`/
  `effect_of_calendar` + `service_on`); `realtime.ts` = the four Scout signals
  (`get_weather`/`get_games`/`get_holidays`/`get_events`) + `get_menu`; `pos-analytics.ts` = the
  pure aggregation behind the history tools (base rate + isolated marginal effects, each with
  its sample size `n`). The Historian reasons base-rate-plus-per-factor-deltas: ONE query per
  factor over many nights (so samples stay healthy) rather than one filter stacking all
  conditions at once (which collapses to n≈1). It reads `packages/seed` `pos.json` via
  `loadServiceRecords()` — NOT the curated `orders.ts` slice.
- `stations.ts` — the four LLM agents (Chef/Historian/Scout/Prep) built on
  `runtime.runToolAgent`. Each run is a Weave op (`agent.<station>`).
- `discussion.ts` — `runFridayPrep()`: the coordination loop, one Weave span
  (`brigade.friday_prep`).

## Rules

- **Tools, not hardcoded numbers.** Agents reach data only through tools, so every claim is
  grounded and traceable. Never bake a quantity into a prompt.
- **The conflict is the point.** Historian (baseline) vs Scout (today) genuinely disagree; Prep
  reconciles. If you add an agent, give it a real conflict/dependency in `roles.ts`.
- **HITL:** anything `sensitive: true` (Content post, Promo offer, Forge code) or a big swing
  → escalate, never auto-apply. The Chef flags big prep swings for owner sign-off.
- **Build order:** the prep discussion is live. Next is **Content + Critic** (the 5→8.5 jump),
  then the numeric solo-vs-team eval over the team — **DONE**: `pnpm eval` (recent-holdout
  backtest vs real actuals; `forecasters.ts` = naive/solo/team, `forecast-eval.ts` = the harness,
  leakage guarded by `setAsOf` in `pos-analytics.ts`). Promo/Reviews/Forge after.
- Wrap every agent call and tool call in `observability.traced()` — the Weave trace tree IS the demo.
