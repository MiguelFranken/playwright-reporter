/**
 * Deployment configuration of the AI analysis of visual differences: whether
 * a gateway key is set, which models a project may pick, and the prices the
 * budget reserves with. Parsed on every call, so tests can flip a variable.
 *
 * Prices are per million tokens, in micro-dollars, with a version so a job
 * records which table it was costed with. They are the published list prices
 * at the time of writing (verify against the provider before trusting them
 * for a bill): the default model's are time-limited and rise later.
 */

export interface ModelPrice {
  /** Per million input tokens, micro-dollars. */
  inputPerMillion: number;
  /** Per million output tokens (reasoning included where billed), micro-dollars. */
  outputPerMillion: number;
  /** Tokens one image costs at most, when the provider bills images as tokens. */
  tokensPerImage: number;
}

export const PRICE_VERSION = '2026-10-01';

export const DEFAULT_MODEL = 'google/gemini-3.8-flash';

/** The models this deployment may route to, with the prices their reservations are computed from. */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'google/gemini-3.8-flash': { inputPerMillion: 750_000, outputPerMillion: 3_750_000, tokensPerImage: 1_120 },
  'google/gemini-2.5-flash-lite': { inputPerMillion: 100_000, outputPerMillion: 400_000, tokensPerImage: 1_120 },
};

/** `VISUAL_AI_MODELS`: a comma-separated allow list; default: every model with a price. */
export function allowedModels(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.VISUAL_AI_MODELS;
  const known = Object.keys(MODEL_PRICES);
  if (!raw) return known;
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m && known.includes(m));
}

export const gatewayKey = (env: Record<string, string | undefined> = process.env) => env.AI_GATEWAY_API_KEY?.trim() || null;

/** Why this deployment cannot run analyses, or null when it can. */
export function aiUnavailableReason(env: Record<string, string | undefined> = process.env): string | null {
  if (!gatewayKey(env)) return 'This deployment has no AI gateway key (AI_GATEWAY_API_KEY): analyses cannot run here. The settings apply where it does.';
  if (allowedModels(env).length === 0) return 'VISUAL_AI_MODELS allows no model with a known price.';
  return null;
}

/** The model a project uses: its own when allowed, else the first allowed one. */
export function modelFor(projectModel: string | null, env: Record<string, string | undefined> = process.env): string | null {
  const allowed = allowedModels(env);
  if (projectModel && allowed.includes(projectModel)) return projectModel;
  return allowed.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (allowed[0] ?? null);
}

/** The most a call could cost, in micro-dollars, from its bounded inputs. Conservative on purpose. */
export function costCeiling(model: string, input: { images: number; textTokens: number; maxOutputTokens: number }): number {
  const price = MODEL_PRICES[model];
  if (!price) throw new Error(`No price for ${model}.`);
  const inputTokens = input.textTokens + input.images * price.tokensPerImage;
  return Math.ceil((inputTokens * price.inputPerMillion + input.maxOutputTokens * price.outputPerMillion) / 1_000_000);
}
