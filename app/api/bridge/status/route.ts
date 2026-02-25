import { NextRequest, NextResponse } from "next/server";
import { getBridgeTransferBySourceTx, getBridgeUnlockBySourceTx } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const sourceChainIdParam = request.nextUrl.searchParams.get("sourceChainId");
    const sourceTxHash = request.nextUrl.searchParams.get("sourceTxHash");
    if (!sourceChainIdParam || !sourceTxHash || !sourceTxHash.trim()) {
      return NextResponse.json({ error: "sourceChainId and sourceTxHash required" }, { status: 400 });
    }
    const sourceChainId = parseInt(sourceChainIdParam, 10);
    if (Number.isNaN(sourceChainId)) {
      return NextResponse.json({ error: "Invalid sourceChainId" }, { status: 400 });
    }
    const txHash = sourceTxHash.trim();
    const lockRow = getBridgeTransferBySourceTx(sourceChainId, txHash);
    if (lockRow) {
      return NextResponse.json({
        status: lockRow.status,
        destinationTxHash: lockRow.destination_tx_hash ?? undefined,
        type: "lock",
      });
    }
    const unlockRow = getBridgeUnlockBySourceTx(sourceChainId, txHash);
    if (unlockRow) {
      return NextResponse.json({
        status: unlockRow.status,
        destinationTxHash: unlockRow.destination_tx_hash ?? undefined,
        type: "unlock",
      });
    }
    return NextResponse.json({ status: "pending" });
  } catch (e) {
    console.error("GET /api/bridge/status", e);
    return NextResponse.json({ error: "Failed to get bridge status" }, { status: 500 });
  }
}
