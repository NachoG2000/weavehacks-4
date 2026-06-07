/**
 * @weavehacks/agents — the Brigade roster (DOMAIN code lives here, not in the core).
 *
 * Starting team: Chef (orchestrator) + Historian (past patterns) + Scout (today's conditions)
 * + Prep (reconciler). They coordinate in `runFridayPrep()` — the Historian's baseline and the
 * Scout's read of today disagree, and Prep reconciles. Built on the resolved direct-call
 * orchestrator + W&B Inference runtime; every agent call and tool call is a Weave op.
 *
 * Content / Critic / Promo / Reviews / Forge are next, additive, and cuttable.
 */

export {
  AGENT_ROLES,
  assertEveryRoleHasConflict,
  role,
  type RoleManifest,
  type Station,
} from "./roles";

export { STATIONS, runStation, type StationConfig, type StationRun } from "./stations";
export {
  runFridayPrep,
  type DiscussionResult,
  type DiscussionTurn,
  type DiscussionOptions,
} from "./discussion";

export {
  HISTORY_TOOLS,
  REALTIME_TOOLS,
  MENU_TOOLS,
  getWeatherTool,
  getGamesTool,
  getHolidaysTool,
  getEventsTool,
  getMenuTool,
  baselineDemandTool,
  effectOfFootballTool,
  effectOfWeatherTool,
  effectOfCalendarTool,
  serviceOnTool,
  baselineDemand,
  baselineDay,
  footballEffect,
  weatherEffect,
  calendarEffect,
  serviceOn,
  COMPETITIONS,
  POS_INFO,
  setAsOf,
  getAsOf,
  dataRange,
  holdoutCutoff,
  holdoutServices,
  conditionsOf,
  conditionsSentence,
  actualTotalItems,
  trainBefore,
  type Conditions,
} from "./tools";

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

// Forecasters (naive/solo/team) + the solo-vs-team holdout eval.
export {
  naiveForecastValue,
  soloForecast,
  teamForecast,
  extractTotal,
  type ForecastQ,
  type ForecastValue,
} from "./forecasters";
export {
  runForecastEval,
  pickScenarios,
  type Arm,
  type EvalScenario,
  type ScenarioResult,
  type ArmSummary,
  type ForecastEvalResult,
  type ForecastEvalOptions,
} from "./forecast-eval";
