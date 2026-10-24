/** What one call to the model used, in tokens, as `response.usage` counts them. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * What each model costs, in US dollars per million tokens, and the month the prices were last checked against
 * Anthropic's price list. Haiku 5.5 is $0.10 in and $0.50 out for prompts up to 100K tokens, and a help prompt is far
 * below that. The cost in `ai_usage` is an estimate made from these numbers: change them here when the list changes.
 */
export const PRICES = {
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5, asOf: '2026-10' },
} as const;

export type PricedModel = keyof typeof PRICES;

/** The model every explanation and translation comes from. It has a price above, which the type checks. */
export const HELP_MODEL = 'claude-haiku-5-5' satisfies PricedModel;

/** The `ai_usage.cost_usd` column keeps 6 decimals. */
const COST_DECIMALS = 1e6;

/**
 * What a call that used `usage` tokens cost, in US dollars, to the 6 decimals `ai_usage.cost_usd` keeps, so the number
 * is the one stored and has no floating point noise.
 */
export function costUsd(model: PricedModel, usage: TokenUsage): number {
  const price = PRICES[model];
  const dollars = (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
  return Math.round(dollars * COST_DECIMALS) / COST_DECIMALS;
}
