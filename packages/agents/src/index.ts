/**
 * @weavehacks/agents — the Brigade roster (DOMAIN lives here, not in the core).
 *
 * Today this exports the role MANIFEST only (see roles.ts). The agent `act()` implementations
 * — chef/prep/promo/content/reviews/critic/forge, each built on @weavehacks/runtime and wired
 * into @weavehacks/orchestration (the resolved direct-call orchestrator) — drop in next.
 *
 * BUILD ORDER (non-negotiable): the HERO LOOP first — Prep → Content → Critic → rewrite →
 * visible 5→8.5 jump, traced in Weave — before Promo, Reviews, or Forge.
 */

export {
  AGENT_ROLES,
  assertEveryRoleHasConflict,
  role,
  type RoleManifest,
  type Station,
} from "./roles";

// PREP station: deterministic naive forecaster + backtest (the SOLO demand baseline).
export {
  naiveForecast,
  backtest,
  type Forecaster,
  type ForecastQuery,
  type Forecast,
  type ProductPrediction,
  type BacktestMetrics,
} from "./prep";
