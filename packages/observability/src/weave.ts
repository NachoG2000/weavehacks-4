import * as weave from "weave";

/**
 * Weave wrapper — observability is MANDATORY in this project, but the wrapper is
 * defensive on purpose: if WANDB_API_KEY is missing or init fails, tracing degrades
 * to a no-op so the spine (and the scoreboard) still runs. It never throws.
 */

let initialized = false;
let active = false;
let client: unknown = null;

export async function initWeave(
  project: string = process.env.WEAVE_PROJECT ?? "weavehacks-4",
): Promise<unknown> {
  if (initialized) return client;
  initialized = true;
  if (!process.env.WANDB_API_KEY) {
    console.warn("[weave] WANDB_API_KEY not set — tracing disabled (no-op).");
    return null;
  }
  try {
    client = await weave.init(project);
    active = true;
    console.log(`[weave] initialized — project "${project}"`);
    return client;
  } catch (e) {
    console.warn(`[weave] init failed — tracing disabled: ${(e as Error).message}`);
    return null;
  }
}

export function isWeaveActive(): boolean {
  return active;
}

/**
 * Flush pending uploads to W&B. The client batches calls and uploads asynchronously, so a
 * short-lived CLI that calls process.exit() right after its work can cut off the final batch
 * (e.g. an Evaluation never lands in the Evals tab). Await this before exiting. Best-effort.
 */
export async function flushWeave(): Promise<void> {
  if (!active) return;
  try {
    const c: any = client ?? (weave as any).getGlobalClient?.();
    if (c && typeof c.waitForBatchProcessing === "function") await c.waitForBatchProcessing();
  } catch {
    /* best-effort — never block exit on a flush error */
  }
}

/**
 * Wrap a function as a traced Weave op. Instrument EVERY agent call and EVERY
 * conflict resolution with this. Wrapping is lazy (on first call) so ops can be
 * declared before initWeave() runs; if Weave is inactive it just calls through.
 */
export function traced<T extends (...args: any[]) => any>(name: string, fn: T): T {
  let wrapped: T | null = null;
  return ((...args: Parameters<T>): ReturnType<T> => {
    if (!active) return fn(...args);
    if (!wrapped) {
      try {
        wrapped = weave.op(fn, { name }) as T;
      } catch {
        wrapped = fn;
      }
    }
    return (wrapped as T)(...args);
  }) as T;
}
