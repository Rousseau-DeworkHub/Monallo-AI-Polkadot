import { NextRequest, NextResponse } from "next/server";
import { getOrCreateStoreUser, getStoreUserByKeyHash, insertStoreApiKeyEncrypted } from "@/lib/db";
import { createHash } from "crypto";
import { encryptApiKey } from "@/lib/apiKeyCrypto";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!walletAddress || walletAddress.length < 40) {
      return NextResponse.json({ error: "wallet_address required" }, { status: 400 });
    }
    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json({ error: "api_key required" }, { status: 400 });
    }
    const normalizedWallet = walletAddress.toLowerCase();
    const keyHash = hashApiKey(apiKey);
    const existing = getStoreUserByKeyHash(keyHash);
    if (existing) {
      if (existing.wallet_address !== normalizedWallet) {
        return NextResponse.json({ error: "API key already registered to another wallet" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, message: "Already registered" });
    }
    const user = getOrCreateStoreUser(normalizedWallet);
    const keyPrefix = apiKey.slice(0, 10);
    const keyLast4 = apiKey.slice(-4);
    const encrypted = encryptApiKey(apiKey);
    insertStoreApiKeyEncrypted({ user_id: user.id, key_hash: keyHash, encrypted_key: encrypted, key_prefix: keyPrefix, key_last4: keyLast4 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/store/register-key", e);
    return NextResponse.json({ error: "Failed to register key" }, { status: 500 });
  }
}
