import { NextRequest, NextResponse } from "next/server";
import { listStoreConsumption, insertStoreConsumption } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;
    const rows = listStoreConsumption(address.trim(), limit);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("GET /api/store/consumption", e);
    return NextResponse.json({ error: "Failed to list consumption" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallet_address = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const model_name = typeof body.model_name === "string" ? body.model_name.trim() : "";
    const tokens_consumed = typeof body.tokens_consumed === "number" ? body.tokens_consumed : parseInt(String(body.tokens_consumed), 10);

    if (!wallet_address || !model_name || Number.isNaN(tokens_consumed) || tokens_consumed < 0) {
      return NextResponse.json({ error: "wallet_address, model_name, tokens_consumed required" }, { status: 400 });
    }

    const row = insertStoreConsumption({
      wallet_address,
      model_name,
      tokens_consumed,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/store/consumption", e);
    return NextResponse.json({ error: "Failed to save consumption" }, { status: 500 });
  }
}
