import { NextRequest, NextResponse } from "next/server";
import { getOrCreateStoreUser, getStoreUserByKeyHash, insertStoreApiKey } from "@/lib/db";
import { createHash } from "crypto";

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
    insertStoreApiKey(user.id, keyHash);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/store/register-key", e);
    return NextResponse.json({ error: "Failed to register key" }, { status: 500 });
  }
}
