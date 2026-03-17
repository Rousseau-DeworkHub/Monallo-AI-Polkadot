import { NextRequest, NextResponse } from "next/server";
import { listStorePurchases, insertStorePurchase } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;
    const rows = listStorePurchases(address.trim(), limit);
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
    const model_name = typeof body.model_name === "string" ? body.model_name.trim() : "";
    const token_count = typeof body.token_count === "number" ? body.token_count : parseInt(String(body.token_count), 10);
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const amount_usd = typeof body.amount_usd === "number" ? body.amount_usd : parseFloat(String(body.amount_usd));
    const chain_id = typeof body.chain_id === "number" ? body.chain_id : parseInt(String(body.chain_id), 10);

    if (!wallet_address || !model_name || Number.isNaN(token_count) || !amount || !token || !Number.isFinite(amount_usd) || Number.isNaN(chain_id)) {
      return NextResponse.json({ error: "wallet_address, model_name, token_count, amount, token, amount_usd, chain_id required" }, { status: 400 });
    }

    const row = insertStorePurchase({
      wallet_address,
      model_name,
      token_count,
      amount,
      token,
      amount_usd,
      tx_hash: typeof body.tx_hash === "string" ? body.tx_hash.trim() || null : null,
      chain_id,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/store/purchases", e);
    return NextResponse.json({ error: "Failed to save purchase" }, { status: 500 });
  }
}
