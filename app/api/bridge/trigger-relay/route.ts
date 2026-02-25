import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const SEPOLIA_CHAIN_ID = 11155111;
const POLKADOT_HUB_CHAIN_ID = 420420417;

/** POST: 前端在 lock/unlock 成功后调用，按源链执行一次 relay（后台运行，不阻塞响应，便于前端快速轮询） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceChainId =
      typeof body?.sourceChainId === "number" ? body.sourceChainId : undefined;
    const trigger =
      sourceChainId === SEPOLIA_CHAIN_ID
        ? String(SEPOLIA_CHAIN_ID)
        : sourceChainId === POLKADOT_HUB_CHAIN_ID
          ? String(POLKADOT_HUB_CHAIN_ID)
          : "all";
    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "relayer-bridge.mjs"
    );
    const child = spawn("node", [scriptPath, `--trigger=${trigger}`], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
      detached: true,
    });
    child.stderr?.on("data", (chunk) => {
      const msg = String(chunk).trim();
      if (msg) console.error("[relayer-bridge]", msg);
    });
    child.on("error", (e) => console.error("POST /api/bridge/trigger-relay spawn error", e));
    child.unref();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/bridge/trigger-relay", e);
    return NextResponse.json(
      { error: "Trigger relay failed" },
      { status: 500 }
    );
  }
}
