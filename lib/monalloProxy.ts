/**
 * Monallo proxy: map model id to cost per 1M tokens (USD). 1 USD = 1 MON (1e6 raw).
 */
export function getCostMonFromUsage(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricePer1M = getPriceUsdPer1M(model);
  const promptUsd = (promptTokens / 1e6) * pricePer1M.prompt;
  const completionUsd = (completionTokens / 1e6) * pricePer1M.completion;
  const usd = promptUsd + completionUsd;
  return Math.round(usd * 1e6);
}

function getPriceUsdPer1M(model: string): { prompt: number; completion: number } {
  const m = model.toLowerCase();
  if (m.includes("gpt-5") || m.includes("gpt-4")) return { prompt: 5.25, completion: 42 };
  if (m.includes("minimax") || m.includes("m2")) return { prompt: 6.3, completion: 25.2 };
  if (m.includes("gemini")) return { prompt: 12, completion: 72 };
  return { prompt: 10, completion: 40 };
}
