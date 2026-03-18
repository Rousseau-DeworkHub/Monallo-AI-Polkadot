import { NextRequest, NextResponse } from "next/server";
import { getCreditBalance } from "@/lib/creditLedger";
import { getOrCreateStoreUser, getStoreAllTokenBalancesByUserId } from "@/lib/db";
import { ethers } from "ethers";

const POLKADOT_HUB_CHAIN_ID = 420420417;
const CHAIN_RPC: Record<number, string> = {
  [POLKADOT_HUB_CHAIN_ID]: process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io",
};

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    const chainIdParam = request.nextUrl.searchParams.get("chain_id");
    if (!wallet || !ethers.isAddress(wallet)) {
      return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
    }
    const normalized = ethers.getAddress(wallet);
    const user = getOrCreateStoreUser(normalized);
    const balanceByModel = getStoreAllTokenBalancesByUserId(user.id);

    const contractAddress = process.env.CREDIT_LEDGER_ADDRESS;
    let balanceMon: number | null = null;
    if (contractAddress) {
      try {
        const chainId = chainIdParam ? parseInt(chainIdParam, 10) : POLKADOT_HUB_CHAIN_ID;
        const rpc = CHAIN_RPC[chainId] ?? CHAIN_RPC[POLKADOT_HUB_CHAIN_ID];
        const provider = new ethers.JsonRpcProvider(rpc);
        balanceMon = await getCreditBalance(provider, contractAddress, normalized);
      } catch (_) {
        balanceMon = null;
      }
    }
    return NextResponse.json({
      balance_mon: balanceMon ?? 0,
      balance_by_model: balanceByModel,
    });
  } catch (e) {
    console.error("GET /api/store/balance", e);
    return NextResponse.json({ error: "Failed to get balance" }, { status: 500 });
  }
}
