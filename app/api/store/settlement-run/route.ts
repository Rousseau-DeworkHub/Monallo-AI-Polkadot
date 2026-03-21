import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import {
  getStoreUsersWithUsageInRange,
  getStoreSettlementByUniqueId,
  insertStoreSettlement,
} from "@/lib/db";
import { getCreditBalance, pickStoreLedgerForDailySettle, settle } from "@/lib/creditLedger";
import {
  getCreditLedgerAddressForChain,
  getStaticNetworkForStoreChain,
  getStoreChainRpc,
  STORE_INJECTIVE_EVM_CHAIN_ID,
  STORE_POLKADOT_HUB_CHAIN_ID,
} from "@/lib/storeChainConfig";

const MON_RAW = 1e6;

/** Yesterday UTC date string YYYY-MM-DD */
function getSettlementDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Start and end of date (UTC) in Unix seconds */
function dateToRange(dateStr: string): { start: number; end: number } {
  const start = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
  const end = start + 86400;
  return { start, end };
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    const cronSecret = process.env.STORE_SETTLEMENT_CRON_SECRET;
    if (cronSecret && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const operatorPk = process.env.STORE_OPERATOR_PRIVATE_KEY;
    const hubLedger = getCreditLedgerAddressForChain(STORE_POLKADOT_HUB_CHAIN_ID);
    const injLedger = getCreditLedgerAddressForChain(STORE_INJECTIVE_EVM_CHAIN_ID);
    if (!operatorPk || (!hubLedger && !injLedger)) {
      return NextResponse.json(
        { error: "Credit ledger (Hub and/or Injective) or operator not configured" },
        { status: 503 }
      );
    }

    const dateStr = getSettlementDate();
    const { start, end } = dateToRange(dateStr);
    const usersWithUsage = getStoreUsersWithUsageInRange(start, end);
    const results: { wallet: string; status: string; tx_hash?: string }[] = [];

    for (const row of usersWithUsage) {
      const uniqueId = `${row.wallet_address}_${dateStr}`;
      if (getStoreSettlementByUniqueId(uniqueId)) {
        results.push({ wallet: row.wallet_address, status: "already_settled" });
        continue;
      }
      const usageMon = row.usage_mon / MON_RAW;
      const userAddress = ethers.getAddress(row.wallet_address);
      const pick = await pickStoreLedgerForDailySettle(row.wallet_address, usageMon);
      let openingRaw: number;
      let ledgerProvider: ethers.JsonRpcProvider;
      let ledgerAddress: string;
      if (pick) {
        openingRaw = Math.round(pick.openingMon * MON_RAW);
        ledgerProvider = pick.provider;
        ledgerAddress = pick.contractAddress;
      } else {
        try {
          const hubRpc = getStoreChainRpc(STORE_POLKADOT_HUB_CHAIN_ID);
          const hubNet = getStaticNetworkForStoreChain(STORE_POLKADOT_HUB_CHAIN_ID);
          if (hubRpc && hubLedger && hubNet) {
            ledgerProvider = new ethers.JsonRpcProvider(hubRpc, hubNet);
            ledgerAddress = hubLedger;
          } else {
            const injRpc = getStoreChainRpc(STORE_INJECTIVE_EVM_CHAIN_ID);
            const injNet = getStaticNetworkForStoreChain(STORE_INJECTIVE_EVM_CHAIN_ID);
            if (!injRpc || !injLedger || !injNet) throw new Error("No ledger RPC");
            ledgerProvider = new ethers.JsonRpcProvider(injRpc, injNet);
            ledgerAddress = injLedger;
          }
          const balanceMon = await getCreditBalance(ledgerProvider, ledgerAddress, row.wallet_address);
          openingRaw = Math.round(balanceMon * MON_RAW);
        } catch (e) {
          results.push({ wallet: row.wallet_address, status: "error", tx_hash: (e as Error).message });
          continue;
        }
      }
      const closingRaw = Math.max(0, openingRaw - row.usage_mon);
      try {
        const signer = new ethers.Wallet(operatorPk, ledgerProvider);
        const { hash } = await settle(signer, ledgerAddress, userAddress, usageMon, dateStr, uniqueId);
        insertStoreSettlement({
          user_id: row.user_id,
          wallet_address: row.wallet_address,
          settlement_date: dateStr,
          opening_balance: openingRaw,
          usage_mon: row.usage_mon,
          closing_balance: closingRaw,
          tx_hash: hash,
          status: "success",
          unique_id: uniqueId,
        });
        results.push({ wallet: row.wallet_address, status: "success", tx_hash: hash });
      } catch (e) {
        insertStoreSettlement({
          user_id: row.user_id,
          wallet_address: row.wallet_address,
          settlement_date: dateStr,
          opening_balance: openingRaw,
          usage_mon: row.usage_mon,
          closing_balance: closingRaw,
          tx_hash: null,
          status: "failed",
          unique_id: uniqueId,
        });
        results.push({ wallet: row.wallet_address, status: "failed", tx_hash: (e as Error).message });
      }
    }

    return NextResponse.json({ date: dateStr, results });
  } catch (e) {
    console.error("POST /api/store/settlement-run", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
