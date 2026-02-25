/**
 * 从链上获取真实余额，从 CoinGecko 获取代币价格，用于 Your Balance 与 Total Value 同步。
 */

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

export interface TokenSpec {
  symbol: string;
  name: string;
  decimals: number;
  contract?: string;
  icon: string;
}

export interface TokenBalanceResult extends TokenSpec {
  balance: string;
  priceUsd: number;
  valueUsd: number;
}

// CoinGecko id 映射（用于 simple/price）
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SEPOLIA_ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  DOT: "polkadot",
  PAS: "polkadot", // Polkadot Hub 代币，用 DOT 价格近似
  "maoPAS.PH": "polkadot", // maoPAS.Polkadot-Hub 用 DOT 价格近似
  "maoETH.Sepolia": "ethereum", // Polkadot Hub 上的 maoETH.Sepolia 用 ETH 价格
};

const OKX_ETH_SYMBOLS = ["ETH", "SEPOLIA_ETH", "maoETH.Sepolia"];
const OKX_DOT_SYMBOLS = ["DOT", "PAS", "maoPAS.PH"];

/** 从 OKX 获取永续合约最新价（last） */
async function fetchOkxTicker(instId: string): Promise<number> {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    const data = (await res.json()) as { code?: string; data?: Array<{ last?: string }> };
    if (data.code !== "0" || !data.data?.[0]?.last) return 0;
    return parseFloat(data.data[0].last) || 0;
  } catch (e) {
    console.warn("fetchOkxTicker failed", instId, e);
    return 0;
  }
}

/** 从 OKX 获取 Sepolia ETH 与 Polkadot Hub PAS(DOT) 的美元价，用于 Your Balance */
export async function fetchOkxPrices(): Promise<{ ETH: number; DOT: number }> {
  const [ETH, DOT] = await Promise.all([
    fetchOkxTicker("ETH-USD-SWAP"),
    fetchOkxTicker("DOT-USD-SWAP"),
  ]);
  return { ETH, DOT };
}

/** 根据 symbol 从 OKX 价格对象取价（仅对 ETH/DOT 相关符号有效） */
export function getOkxPriceForSymbol(symbol: string, prices: { ETH: number; DOT: number }): number {
  if (OKX_ETH_SYMBOLS.includes(symbol)) return prices.ETH;
  if (OKX_DOT_SYMBOLS.includes(symbol)) return prices.DOT;
  return 0;
}

/** 从 CoinGecko 获取代币美元单价（无需 API Key）；ETH/DOT/PAS/mao* 使用 OKX */
export async function fetchTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const okxSymbols = symbols.filter((s) => OKX_ETH_SYMBOLS.includes(s) || OKX_DOT_SYMBOLS.includes(s));
  const cgSymbols = symbols.filter((s) => !OKX_ETH_SYMBOLS.includes(s) && !OKX_DOT_SYMBOLS.includes(s));

  let okx: { ETH: number; DOT: number } = { ETH: 0, DOT: 0 };
  if (okxSymbols.length > 0) okx = await fetchOkxPrices();

  const out: Record<string, number> = {};
  for (const symbol of symbols) {
    if (OKX_ETH_SYMBOLS.includes(symbol)) out[symbol] = okx.ETH;
    else if (OKX_DOT_SYMBOLS.includes(symbol)) out[symbol] = okx.DOT;
    else out[symbol] = 0;
  }

  if (cgSymbols.length > 0) {
    const ids = Array.from(new Set(cgSymbols.map((s) => COINGECKO_IDS[s] || s.toLowerCase()).filter(Boolean)));
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
      const res = await fetch(url);
      const data = (await res.json()) as Record<string, { usd?: number }>;
      for (const symbol of cgSymbols) {
        const id = COINGECKO_IDS[symbol] || symbol.toLowerCase();
        out[symbol] = data[id]?.usd ?? 0;
      }
    } catch (e) {
      console.warn("fetchTokenPrices CoinGecko failed", e);
    }
  }
  return out;
}

/** 从 EVM 链上获取原生币 + ERC20 余额（需在服务端/客户端调用，使用 ethers） */
export async function fetchEvmBalances(
  rpcUrl: string,
  address: string,
  tokens: TokenSpec[]
): Promise<{ symbol: string; balance: string; decimals: number }[]> {
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const results: { symbol: string; balance: string; decimals: number }[] = [];

  for (const token of tokens) {
    try {
      if (!token.contract || token.contract === "0x0000000000000000000000000000000000000000") {
        const raw = await provider.getBalance(address);
        const balance = ethers.formatUnits(raw, token.decimals);
        results.push({ symbol: token.symbol, balance, decimals: token.decimals });
      } else {
        const contract = new ethers.Contract(token.contract, ERC20_ABI, provider);
        const raw = await contract.balanceOf(address);
        const balance = ethers.formatUnits(raw, token.decimals);
        results.push({ symbol: token.symbol, balance, decimals: token.decimals });
      }
    } catch (e) {
      console.warn(`fetch balance ${token.symbol} failed`, e);
      results.push({ symbol: token.symbol, balance: "0", decimals: token.decimals });
    }
  }
  return results;
}

/** 依次尝试多个 RPC，任一成功即返回 */
export async function fetchEvmBalancesWithFallback(
  rpcUrls: string[],
  address: string,
  tokens: TokenSpec[]
): Promise<{ symbol: string; balance: string; decimals: number }[]> {
  let lastErr: unknown;
  for (const rpcUrl of rpcUrls) {
    try {
      const result = await fetchEvmBalances(rpcUrl, address, tokens);
      return result;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr;
}

/** 从 Subscan 获取 Polkadot 账户 DOT 余额（公开接口，可能限流） */
export async function fetchPolkadotBalance(ss58Address: string): Promise<string> {
  try {
    const res = await fetch("https://polkadot.api.subscan.io/api/scan/account/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: ss58Address }),
    });
    const data = (await res.json()) as {
      data?: { list?: Array<{ balance?: string; symbol?: string; decimals?: number }> };
      code?: number;
    };
    if (data.data?.list?.length) {
      const native = data.data.list.find((t) => t.symbol === "DOT" || !t.symbol) ?? data.data.list[0];
      const raw = native.balance ?? "0";
      const decimals = native.decimals ?? 10;
      const value = Number(BigInt(raw)) / 10 ** decimals;
      return value.toFixed(decimals);
    }
    return "0";
  } catch (e) {
    console.warn("fetchPolkadotBalance failed", e);
    return "0";
  }
}

/** 合并余额与价格，得到带 valueUsd 的列表并计算 totalValueUsd */
export function mergeBalancesWithPrices(
  tokens: TokenSpec[],
  balances: { symbol: string; balance: string; decimals: number }[],
  prices: Record<string, number>
): { list: TokenBalanceResult[]; totalValueUsd: number } {
  let total = 0;
  const list: TokenBalanceResult[] = tokens.map((t) => {
    const b = balances.find((x) => x.symbol === t.symbol);
    const balance = b?.balance ?? "0";
    const priceUsd = prices[t.symbol] ?? prices[t.symbol.toLowerCase()] ?? 0;
    const valueUsd = parseFloat(balance) * priceUsd;
    total += valueUsd;
    return { ...t, balance, priceUsd, valueUsd };
  });
  return { list, totalValueUsd: total };
}
