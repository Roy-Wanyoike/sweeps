/** Static price table for the cost ledger (estimates, USD). */

export const TEXT_PRICE_PER_MTOK: Record<string, number> = {
  'sandbox-big': 2.5,
  'sandbox-fast': 0.5,
  'sandbox-vision': 1.5,
  'qwen3.7-max': 1.6,
  'qwen-plus': 0.4,
  'qwen-vl-plus': 1.2,
};

export const IMAGE_COST_USD = 0.04;
export const VIDEO_COST_PER_SEC_USD = 0.1;
export const TTS_COST_USD = 0.02;
export const CARD_COST_USD = 0.0005; // procedural storyboard card (deterministic render)

/** Stage budget shares of show.budgetUsd. */
export const STAGE_SHARE: Record<string, number> = {
  BIBLE: 0.05,
  WRITER: 0.25,
  RENDER: 0.45,
  AUDIENCE: 0.2,
  ANALYTICS: 0.02,
  OPTIMIZER: 0.08,
};

export function textCostUsd(model: string, chars: number): number {
  const tokens = Math.ceil(chars / 4);
  const price = TEXT_PRICE_PER_MTOK[model] ?? 1.0;
  return (tokens / 1_000_000) * price;
}

export function tokensOf(chars: number): number {
  return Math.ceil(chars / 4);
}
