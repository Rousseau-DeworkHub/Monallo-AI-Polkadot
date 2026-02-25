import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";

export async function GET() {
  try {
    const { activeUsers, volume } = getStats();
    return NextResponse.json({ activeUsers, volume });
  } catch (e) {
    console.error("GET /api/stats", e);
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}
