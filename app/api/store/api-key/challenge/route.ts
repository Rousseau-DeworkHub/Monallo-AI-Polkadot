import { NextRequest, NextResponse } from "next/server";
import { upsertStoreApiKeyNonce } from "@/lib/db";
import { ethers } from "ethers";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return NextResponse.json({ error: "wallet_address (valid) required" }, { status: 400 });
    }
    const nonce = randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 5 * 60; // 5 minutes
    upsertStoreApiKeyNonce(walletAddress, nonce, expiresAt);

    const message = `Monallo API Key reveal\nWallet: ${ethers.getAddress(walletAddress)}\nNonce: ${nonce}\nExpiresAt: ${new Date(expiresAt * 1000).toISOString()}`;
    return NextResponse.json({ nonce, expires_at: expiresAt, message });
  } catch (e) {
    console.error("POST /api/store/api-key/challenge", e);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}

