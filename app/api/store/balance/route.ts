import { NextRequest, NextResponse } from "next/server";
import { getCreditBalance } from "@/lib/creditLedger";
import { getOrCreateStoreUser, getStoreAllTokenBalancesByUserId } from "@/lib/db";
import {
  getCreditLedgerAddressForChain,
  getStaticNetworkForStoreChain,
  getStoreChainRpc,
  STORE_POLKADOT_HUB_CHAIN_ID,
} from "@/lib/storeChainConfig";
import { ethers } from "ethers";

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

    const chainId = chainIdParam ? parseInt(chainIdParam, 10) : STORE_POLKADOT_HUB_CHAIN_ID;
    const rpc = getStoreChainRpc(chainId);
    const contractAddress = getCreditLedgerAddressForChain(chainId);
    let balanceMon: number | null = null;
    const staticNet = getStaticNetworkForStoreChain(chainId);
    if (contractAddress && rpc && staticNet) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, staticNet);
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
