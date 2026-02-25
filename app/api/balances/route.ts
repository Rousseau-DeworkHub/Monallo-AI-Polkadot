import { NextRequest, NextResponse } from "next/server";
import { fetchEvmBalancesWithFallback, fetchTokenPrices, mergeBalancesWithPrices } from "@/lib/balances";
import type { TokenSpec } from "@/lib/balances";

const SEPOLIA_TOKENS: TokenSpec[] = [
  { symbol: "ETH", name: "Sepolia ETH", decimals: 18, icon: "SEPOLIA_ETH" },
  ...(process.env.WRAPPED_PAS_SEPOLIA?.trim()
    ? [{ symbol: "maoPAS.PH", name: "maoPAS.Polkadot-Hub", decimals: 18, contract: process.env.WRAPPED_PAS_SEPOLIA!.trim(), icon: "PAS" } as TokenSpec]
    : []),
];

const SEPOLIA_RPC_URLS =
  process.env.RPC_SEPOLIA?.trim()
    ? [process.env.RPC_SEPOLIA.trim()]
    : ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"];

const POLKADOT_HUB_RPC_URLS =
  process.env.RPC_Polkadot_Hub?.trim()
    ? [process.env.RPC_Polkadot_Hub.trim()]
    : ["https://eth-rpc-testnet.polkadot.io", "https://services.polkadothub-rpc.com/testnet"];

const EVM_CHAINS: Record<
  number,
  { rpcUrls: string[]; tokens: TokenSpec[] }
> = {
  11155111: {
    rpcUrls: SEPOLIA_RPC_URLS,
    tokens: SEPOLIA_TOKENS,
  },
  420420417: {
    rpcUrls: POLKADOT_HUB_RPC_URLS,
    tokens: [
      { symbol: "PAS", name: "Polkadot Hub", decimals: 18, icon: "PAS" },
      ...(process.env.WRAPPED_ETH_POLKADOT_HUB?.trim()
        ? [{ symbol: "maoETH.Sepolia", name: "maoETH.Sepolia", decimals: 18, contract: process.env.WRAPPED_ETH_POLKADOT_HUB!.trim(), icon: "SEPOLIA_ETH" } as TokenSpec]
        : []),
    ],
  },
};

function parseChainId(param: string | null): number | null {
  if (param == null || param === "") return null;
  const trimmed = param.trim();
  if (/^0x[a-fA-F0-9]+$/.test(trimmed)) return parseInt(trimmed, 16);
  const decimal = parseInt(trimmed, 10);
  return Number.isNaN(decimal) ? null : decimal;
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const chainIdParam = request.nextUrl.searchParams.get("chainId");
    if (!address || typeof address !== "string" || !address.trim() || !/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
      return NextResponse.json({ error: "Valid address (0x...) required" }, { status: 400 });
    }
    const chainId = parseChainId(chainIdParam);
    const config = chainId == null ? null : EVM_CHAINS[chainId];
    if (!config) {
      return NextResponse.json({ error: "Unsupported chainId for balances" }, { status: 400 });
    }
    const { rpcUrls, tokens } = config;
    const balances = await fetchEvmBalancesWithFallback(rpcUrls, address.trim(), tokens);
    const symbols = tokens.map((t) => t.symbol);
    const prices = await fetchTokenPrices(symbols);
    const { list, totalValueUsd } = mergeBalancesWithPrices(tokens, balances, prices);
    return NextResponse.json({ list, totalValueUsd });
  } catch (e) {
    console.error("GET /api/balances", e);
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 500 });
  }
}
