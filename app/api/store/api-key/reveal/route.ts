import { NextRequest, NextResponse } from "next/server";
import { consumeStoreApiKeyNonce, getLatestStoreApiKeyEncryptedByWallet } from "@/lib/db";
import { decryptApiKey } from "@/lib/apiKeyCrypto";
import { ethers } from "ethers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return NextResponse.json({ error: "wallet_address (valid) required" }, { status: 400 });
    }
    if (!nonce || !signature || !message) {
      return NextResponse.json({ error: "nonce, message, signature required" }, { status: 400 });
    }

    // Verify nonce is valid and consume it (one-time).
    const okNonce = consumeStoreApiKeyNonce(walletAddress, nonce);
    if (!okNonce) {
      return NextResponse.json({ error: "Invalid or expired nonce" }, { status: 401 });
    }

    // Verify signature.
    const recovered = ethers.verifyMessage(message, signature);
    if (ethers.getAddress(recovered) !== ethers.getAddress(walletAddress)) {
      return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
    }

    const row = getLatestStoreApiKeyEncryptedByWallet(walletAddress);
    if (!row?.encrypted_key) {
      return NextResponse.json({ error: "No api key found for wallet" }, { status: 404 });
    }
    const apiKey = decryptApiKey(row.encrypted_key);
    return NextResponse.json({ api_key: apiKey });
  } catch (e) {
    console.error("POST /api/store/api-key/reveal", e);
    return NextResponse.json({ error: "Failed to reveal api key" }, { status: 500 });
  }
}

