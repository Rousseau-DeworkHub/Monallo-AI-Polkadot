import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getOrCreateStoreUser, isStoreCreditMinted, insertStoreCreditMint } from "@/lib/db";
import { mintCredit } from "@/lib/creditLedger";

const POLKADOT_HUB_CHAIN_ID = 420420417;
const CHAIN_RPC: Record<number, string> = {
  [POLKADOT_HUB_CHAIN_ID]: process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const txHash = typeof body.tx_hash === "string" ? body.tx_hash.trim() : "";
    const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const amountMon = typeof body.amount_mon === "number" ? body.amount_mon : parseFloat(String(body.amount_mon));
    const chainId = typeof body.chain_id === "number" ? body.chain_id : parseInt(String(body.chain_id), 10);

    if (!txHash || !walletAddress || !ethers.isAddress(walletAddress)) {
      return NextResponse.json({ error: "tx_hash and valid wallet_address required" }, { status: 400 });
    }
    if (!Number.isFinite(amountMon) || amountMon <= 0) {
      return NextResponse.json({ error: "amount_mon must be a positive number" }, { status: 400 });
    }
    if (!Number.isInteger(chainId) || !CHAIN_RPC[chainId]) {
      return NextResponse.json({ error: "Unsupported chain_id" }, { status: 400 });
    }

    const contractAddress = process.env.CREDIT_LEDGER_ADDRESS;
    const operatorPk = process.env.STORE_OPERATOR_PRIVATE_KEY;
    if (!contractAddress || !operatorPk) {
      return NextResponse.json({ error: "Credit ledger not configured" }, { status: 503 });
    }

    if (isStoreCreditMinted(txHash, chainId)) {
      return NextResponse.json({ error: "Payment already credited", already_minted: true }, { status: 409 });
    }

    const rpc = CHAIN_RPC[chainId];
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(operatorPk, provider);
    const userAddress = ethers.getAddress(walletAddress);

    const { hash } = await mintCredit(signer, contractAddress, userAddress, amountMon);

    getOrCreateStoreUser(walletAddress);
    insertStoreCreditMint({ tx_hash: txHash, chain_id: chainId, wallet_address: walletAddress.toLowerCase(), amount_mon: Math.round(amountMon * 1e6) });

    return NextResponse.json({ ok: true, mint_tx_hash: hash });
  } catch (e) {
    console.error("POST /api/store/confirm-payment", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to confirm payment" }, { status: 500 });
  }
}
