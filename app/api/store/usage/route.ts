import { NextRequest, NextResponse } from "next/server";
import { listStoreUsageEventsByWallet } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;
    const rows = listStoreUsageEventsByWallet(address.trim(), limit);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("GET /api/store/usage", e);
    return NextResponse.json({ error: "Failed to list usage" }, { status: 500 });
  }
}
