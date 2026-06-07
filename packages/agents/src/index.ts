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
  GROUNDING_TOOLS,
  getFactsTool,
  FACTS,
  factById,
  type Fact,
  PURCHASING_TOOLS,
  requirementsFor,
  skuById,
  setPurchaseContext,
} from "./tools";

// Prep → Purchasing constraint loop (pillar #2: coverage vs budget/shelf-life/case-size).
export {
  checkOrder,
  greedyOrder,
  greedyPurchase,
  soloPurchase,
  teamPurchase,
  PURCHASE_ARMS,
  type PurchaseArm,
  type PurchaseResult,
  type PurchaseOptions,
  type OrderCheck,
  type Violation,
  type ViolationType,
} from "./purchasing";
export {
  runPurchaseEval,
  type PurchaseScenarioResult,
  type PurchaseArmSummary,
  type PurchaseEvalResult,
  type PurchaseEvalOptions,
} from "./purchasing-eval";

// Content → Critic grounding loop (the hero: solo hallucinates, the team's Critic gates).
export { scoreGrounding, type Claim, type ContentDraft, type GroundingResult, type Ungrounded } from "./grounding";
export {
  soloContent,
  soloGroundedContent,
  teamContent,
  CONTENT_ARMS,
  type ContentArm,
  type ContentResult,
  type ContentOptions,
} from "./content";
export {
  runContentEval,
  DEFAULT_BRIEFS,
  type ContentScenarioResult,
  type ContentArmSummary,
  type ContentEvalResult,
  type ContentEvalOptions,
} from "./content-eval";

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
