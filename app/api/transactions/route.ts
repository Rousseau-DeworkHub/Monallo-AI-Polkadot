import { NextRequest, NextResponse } from "next/server";
import { listTransactions, listTransactionsPaginated, insertTransaction } from "@/lib/db";

const DEFAULT_PAGE_SIZE = 5;

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const pageParam = request.nextUrl.searchParams.get("page");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const usePagination = pageParam != null && pageParam !== "" && limitParam != null && limitParam !== "";
    if (usePagination) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE));
      const { items, total } = listTransactionsPaginated(address.trim(), page, limit);
      return NextResponse.json({ items, total });
    }
    const rows = listTransactions(address.trim());
    return NextResponse.json(rows);
  } catch (e) {
    console.error("GET /api/transactions", e);
    return NextResponse.json({ error: "Failed to list transactions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wallet_address = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!wallet_address || !action) {
      return NextResponse.json({ error: "wallet_address and action required" }, { status: 400 });
    }
    const allowed = ["Send", "Swap", "Bridge", "Stake"];
    if (!allowed.includes(action)) {
      return NextResponse.json({ error: "action must be Send, Swap, Bridge, or Stake" }, { status: 400 });
    }
    const row = insertTransaction({
      wallet_address,
      action,
      tx_hash: body.tx_hash ?? null,
      explorer_url: body.explorer_url ?? null,
      amount: body.amount ?? null,
      token: body.token ?? null,
      receiver: body.receiver ?? null,
      source_network: body.source_network ?? null,
      target_network: body.target_network ?? null,
      from_token: body.from_token ?? null,
      to_token: body.to_token ?? null,
      amount_usd: typeof body.amount_usd === "number" && !Number.isNaN(body.amount_usd) ? body.amount_usd : null,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/transactions", e);
    return NextResponse.json({ error: "Failed to insert transaction" }, { status: 500 });
  }
}
