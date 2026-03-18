import { NextRequest, NextResponse } from "next/server";
import { listStorePurchases, insertStorePurchase, getOrCreateStoreUser, addStoreModelTokens, setStoreModelTokens, updateStorePurchaseModelId } from "@/lib/db";
import { ethers } from "ethers";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const normalized = address.trim().toLowerCase();
    if (!ethers.isAddress(normalized)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;
    const rows = listStorePurchases(normalized, limit);

    // Backfill: infer model_id for old package rows, and rebuild token balances from purchases.
    const user = getOrCreateStoreUser(normalized);
    const tokenSums: Record<string, number> = {};
    const inferModelId = (name: string): string | null => {
      const n = (name || "").toLowerCase();
      if (n.includes("gpt-5.2") || n.includes("gpt5.2") || n.includes("gpt 5.2")) return "gpt-5.2";
      if (n.includes("minimax") && n.includes("m2.5")) return "MiniMax-M2.5";
      if (n.includes("gemini") && (n.includes("3.1") || n.includes("3.1 pro"))) return "gemini-3.1-pro-preview";
      return null;
    };
    for (const r of rows as any[]) {
      if (r.kind !== "package") continue;
      const mid: string | null = r.model_id || inferModelId(r.model_name);
      if (mid && !r.model_id) {
        try { updateStorePurchaseModelId(Number(r.id), mid); } catch (_) {}
        r.model_id = mid;
      }
      if (mid && Number(r.token_count) > 0) {
        tokenSums[mid] = (tokenSums[mid] ?? 0) + Number(r.token_count);
      }
    }
    for (const [mid, sum] of Object.entries(tokenSums)) {
      try { setStoreModelTokens(user.id, mid, sum); } catch (_) {}
    }
    return NextResponse.json(rows);
  } catch (e) {
    console.error("GET /api/store/purchases", e);
    return NextResponse.json({ error: "Failed to list purchases" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallet_address = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "package";
    const model_id = typeof body.model_id === "string" ? body.model_id.trim() : "";
    const model_name = typeof body.model_name === "string" ? body.model_name.trim() : "";
    const token_count = typeof body.token_count === "number" ? body.token_count : parseInt(String(body.token_count), 10);
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const amount_usd = typeof body.amount_usd === "number" ? body.amount_usd : parseFloat(String(body.amount_usd));
    const chain_id = typeof body.chain_id === "number" ? body.chain_id : parseInt(String(body.chain_id), 10);

    if (!wallet_address || !model_name || Number.isNaN(token_count) || !amount || !token || !Number.isFinite(amount_usd) || Number.isNaN(chain_id)) {
      return NextResponse.json({ error: "wallet_address, model_name, token_count, amount, token, amount_usd, chain_id required" }, { status: 400 });
    }
    if (kind !== "package" && kind !== "recharge") {
      return NextResponse.json({ error: "kind must be package|recharge" }, { status: 400 });
    }

    const row = insertStorePurchase({
      wallet_address,
      kind,
      model_id: model_id || null,
      model_name,
      token_count,
      amount,
      token,
      amount_usd,
      tx_hash: typeof body.tx_hash === "string" ? body.tx_hash.trim() || null : null,
      chain_id,
    });

    // Update off-chain token balance for packages (authoritative for charge-method display).
    if (kind === "package" && model_id && token_count > 0) {
      const user = getOrCreateStoreUser(wallet_address);
      addStoreModelTokens(user.id, model_id, token_count);
    }
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/store/purchases", e);
    return NextResponse.json({ error: "Failed to save purchase" }, { status: 500 });
  }
}
