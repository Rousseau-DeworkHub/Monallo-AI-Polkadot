import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getOrCreateStoreUser, isStoreCreditMinted, insertStoreCreditMint } from "@/lib/db";
import { mintCredit } from "@/lib/creditLedger";
import {
  getCreditLedgerAddressForChain,
  getStaticNetworkForStoreChain,
  getStoreChainRpc,
  isStorePaymentChainConfigured,
} from "@/lib/storeChainConfig";

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const txHash = typeof body.tx_hash === "string" ? body.tx_hash.trim() : "";
    const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const amountMon = typeof body.amount_mon === "number" ? body.amount_mon : parseFloat(String(body.amount_mon));
    const chainId = typeof body.chain_id === "number" ? body.chain_id : parseInt(String(body.chain_id), 10);
    const paymentTo = typeof body.payment_to === "string" ? body.payment_to.trim() : "";
    const paymentTokenSymbol = typeof body.payment_token_symbol === "string" ? body.payment_token_symbol.trim() : "";
    const paymentTokenContract =
      typeof body.payment_token_contract === "string" && body.payment_token_contract.trim()
        ? body.payment_token_contract.trim()
        : null;
    const paymentAmount = typeof body.payment_amount === "string" ? body.payment_amount.trim() : "";
    const paymentDecimals = typeof body.payment_decimals === "number" ? body.payment_decimals : parseInt(String(body.payment_decimals), 10);

    if (!txHash || !walletAddress || !ethers.isAddress(walletAddress)) {
      return NextResponse.json({ error: "tx_hash and valid wallet_address required" }, { status: 400 });
    }
    if (!Number.isFinite(amountMon) || amountMon <= 0) {
      return NextResponse.json({ error: "amount_mon must be a positive number" }, { status: 400 });
    }
    if (!Number.isInteger(chainId) || !isStorePaymentChainConfigured(chainId)) {
      return NextResponse.json({ error: "Unsupported chain_id or ledger not configured for this chain" }, { status: 400 });
    }
    if (!paymentTo || !ethers.isAddress(paymentTo)) {
      return NextResponse.json({ error: "payment_to (valid address) required" }, { status: 400 });
    }
    if (!paymentTokenSymbol) {
      return NextResponse.json({ error: "payment_token_symbol required" }, { status: 400 });
    }
    if (paymentTokenContract && !ethers.isAddress(paymentTokenContract)) {
      return NextResponse.json({ error: "payment_token_contract must be a valid address" }, { status: 400 });
    }
    if (!paymentAmount) {
      return NextResponse.json({ error: "payment_amount required" }, { status: 400 });
    }
    if (!Number.isInteger(paymentDecimals) || paymentDecimals < 0 || paymentDecimals > 36) {
      return NextResponse.json({ error: "payment_decimals invalid" }, { status: 400 });
    }

    const contractAddress = getCreditLedgerAddressForChain(chainId);
    const operatorPk = process.env.STORE_OPERATOR_PRIVATE_KEY;
    if (!contractAddress || !operatorPk) {
      return NextResponse.json({ error: "Credit ledger not configured for this chain" }, { status: 503 });
    }

    if (isStoreCreditMinted(txHash, chainId)) {
      return NextResponse.json({ error: "Payment already credited", already_minted: true }, { status: 409 });
    }

    const rpc = getStoreChainRpc(chainId)!;
    const staticNet = getStaticNetworkForStoreChain(chainId)!;
    const provider = new ethers.JsonRpcProvider(rpc, staticNet);
    const signer = new ethers.Wallet(operatorPk, provider);
    const userAddress = ethers.getAddress(walletAddress);

    // Verify the payment tx on-chain (basic anti-bypass).
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return NextResponse.json({ error: "Transaction not confirmed or failed" }, { status: 409 });
    }
    if (!tx.from || ethers.getAddress(tx.from) !== userAddress) {
      return NextResponse.json({ error: "Transaction sender mismatch" }, { status: 400 });
    }
    const expectedTo = ethers.getAddress(paymentTo);
    if (!paymentTokenContract) {
      // Native token payment: tx.to must be the recipient and value must match.
      if (!tx.to || ethers.getAddress(tx.to) !== expectedTo) {
        return NextResponse.json({ error: "Transaction recipient mismatch" }, { status: 400 });
      }
      let expectedWei: bigint;
      try {
        expectedWei = ethers.parseUnits(paymentAmount, paymentDecimals);
      } catch {
        return NextResponse.json({ error: "Invalid payment_amount" }, { status: 400 });
      }
      if (tx.value < expectedWei) {
        return NextResponse.json({ error: "Insufficient payment value" }, { status: 400 });
      }
    } else {
      // ERC20 payment: tx.to should be token contract, and receipt must contain a Transfer(from,to,value).
      if (!tx.to || ethers.getAddress(tx.to) !== ethers.getAddress(paymentTokenContract)) {
        return NextResponse.json({ error: "Token contract mismatch" }, { status: 400 });
      }
      let expectedAmount: bigint;
      try {
        expectedAmount = ethers.parseUnits(paymentAmount, paymentDecimals);
      } catch {
        return NextResponse.json({ error: "Invalid payment_amount" }, { status: 400 });
      }
      const iface = new ethers.Interface(ERC20_ABI);
      const transferEvent = iface.getEvent("Transfer");
      if (!transferEvent) {
        return NextResponse.json({ error: "ERC20 ABI missing Transfer event" }, { status: 500 });
      }
      const transferTopic = transferEvent.topicHash;
      const expectedFrom = userAddress;
      let ok = false;
      for (const log of receipt.logs) {
        if (log.topics?.[0] !== transferTopic) continue;
        if (ethers.getAddress(log.address) !== ethers.getAddress(paymentTokenContract)) continue;
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (!parsed) continue;
          const from = ethers.getAddress(String(parsed.args.from));
          const to = ethers.getAddress(String(parsed.args.to));
          const value = BigInt(parsed.args.value.toString());
          if (from === expectedFrom && to === expectedTo && value >= expectedAmount) {
            ok = true;
            break;
          }
        } catch (_) {}
      }
      if (!ok) {
        return NextResponse.json({ error: "Token Transfer not found for payment" }, { status: 400 });
      }
    }

    const { hash } = await mintCredit(signer, contractAddress, userAddress, amountMon);

    getOrCreateStoreUser(walletAddress);
    insertStoreCreditMint({
      tx_hash: txHash,
      mint_tx_hash: hash,
      chain_id: chainId,
      wallet_address: walletAddress.toLowerCase(),
      amount_mon: Math.round(amountMon * 1e6),
    });

    return NextResponse.json({ ok: true, mint_tx_hash: hash });
  } catch (e) {
    console.error("POST /api/store/confirm-payment", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to confirm payment" }, { status: 500 });
  }
}
