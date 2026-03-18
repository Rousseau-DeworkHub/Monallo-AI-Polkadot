import { NextRequest, NextResponse } from "next/server";
import { getLatestStoreApiKeyMetaByWallet } from "@/lib/db";
import { ethers } from "ethers";

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
    const normalized = wallet.trim();
    if (!normalized || !ethers.isAddress(normalized)) {
      return NextResponse.json({ error: "wallet (valid address) required" }, { status: 400 });
    }
    const meta = getLatestStoreApiKeyMetaByWallet(normalized);
    if (!meta) {
      return NextResponse.json({ has_key: false });
    }
    return NextResponse.json({
      has_key: true,
      masked: `${meta.key_prefix}${"•".repeat(20)}${meta.key_last4}`,
      has_encrypted: meta.has_encrypted,
    });
  } catch (e) {
    console.error("GET /api/store/api-key/status", e);
    return NextResponse.json({ error: "Failed to get api key status" }, { status: 500 });
  }
}

