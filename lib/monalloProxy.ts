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

/**
 * Normalize request model to canonical id used in store_token_balances so that
 * "GPT-5.2" / "gpt-5.2" match the same balance as "gpt-5.2", etc.
 */
export function normalizeModelIdForBalance(model: string): string {
  if (!model || typeof model !== "string") return model || "default";
  const m = model.trim().toLowerCase();
  if (m.includes("gpt-5") || m === "gpt-5.2") return "gpt-5.2";
  if ((m.includes("minimax") && m.includes("m2")) || m.includes("m2.5")) return "MiniMax-M2.5";
  if (m.includes("gemini") && (m.includes("3.1") || m.includes("pro"))) return "gemini-3.1-pro-preview";
  return model.trim();
}
