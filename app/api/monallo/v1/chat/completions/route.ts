import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { ethers } from "ethers";
import { getStoreUserByKeyHash, insertStoreUsageEvent, getStoreUsageSumByUserAndRange } from "@/lib/db";
import { getCostMonFromUsage } from "@/lib/monalloProxy";
import { getCreditBalance } from "@/lib/creditLedger";

const HAODE_BASE_URL = process.env.HAODE_BASE_URL ?? "";
const HAODE_API_KEY = process.env.HAODE_API_KEY ?? "";
const RPC = process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";
const CREDIT_LEDGER_ADDRESS = process.env.CREDIT_LEDGER_ADDRESS ?? "";
const LOW_BALANCE_THRESHOLD_MON = 0.1;
const BALANCE_WARNING = "Insufficient balance. Please recharge soon.";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function getAuthKey(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function POST(request: NextRequest) {
  if (!HAODE_BASE_URL || !HAODE_API_KEY) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }
  const apiKey = getAuthKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  const keyHash = hashApiKey(apiKey);
  const user = getStoreUserByKeyHash(keyHash);
  if (!user) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  let lowBalanceWarning: string | null = null;
  if (CREDIT_LEDGER_ADDRESS && user.wallet_address) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC);
      const balanceMon = await getCreditBalance(provider, CREDIT_LEDGER_ADDRESS, user.wallet_address);
      const now = Math.floor(Date.now() / 1000);
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      const todayStart = Math.floor(d.getTime() / 1000);
      const unsettledRaw = getStoreUsageSumByUserAndRange(user.id, todayStart, now);
      const availableMon = balanceMon - unsettledRaw / 1e6;
      if (availableMon < LOW_BALANCE_THRESHOLD_MON) lowBalanceWarning = BALANCE_WARNING;
    } catch (_) {}
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;
  const stream = !!obj.stream;
  const model = typeof obj.model === "string" ? obj.model : "default";
  const url = HAODE_BASE_URL.replace(/\/$/, "") + "/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${HAODE_API_KEY}`,
    // Avoid stale keep-alive sockets being reset by upstream.
    Connection: "close",
  };
  const forwardBody = { ...obj };
  if (request.headers.get("x-request-id")) {
    headers["x-request-id"] = request.headers.get("x-request-id")!;
  }

  try {
    const doFetch = async (attempt: number): Promise<Response> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        return await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(forwardBody),
          signal: controller.signal,
        } as RequestInit);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const cause = (e as { cause?: unknown })?.cause as { code?: string } | undefined;
        const code = cause?.code;
        const isTransient =
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          code === "UND_ERR_CONNECT_TIMEOUT" ||
          code === "UND_ERR_SOCKET" ||
          msg.includes("fetch failed");
        if (attempt < 4 && isTransient) {
          // Exponential-ish backoff: 300ms, 800ms, 1500ms
          const backoff = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
          await new Promise((r) => setTimeout(r, backoff));
          return await doFetch(attempt + 1);
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    };

    const res = await doFetch(1);

    if (!res.ok) {
      const text = await res.text();
      try {
        const errJson = JSON.parse(text) as { error?: { message?: string } };
        return NextResponse.json(
          { error: errJson?.error?.message ?? "Upstream error" },
          { status: res.status }
        );
      } catch {
        return NextResponse.json({ error: text || "Upstream error" }, { status: res.status });
      }
    }

    if (stream) {
      const reader = res.body;
      if (!reader) return NextResponse.json({ error: "No body" }, { status: 502 });
      let lastLine = "";
      const streamResponse = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(value);
            const lines = (lastLine + chunk).split("\n");
            lastLine = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const json = JSON.parse(line.slice(6)) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
                  if (json.usage?.prompt_tokens != null && json.usage?.completion_tokens != null) {
                    const costMon = getCostMonFromUsage(model, json.usage.prompt_tokens, json.usage.completion_tokens);
                    insertStoreUsageEvent({
                      user_id: user.id,
                      model,
                      prompt_tokens: json.usage.prompt_tokens,
                      completion_tokens: json.usage.completion_tokens,
                      cost_mon: costMon,
                    });
                  }
                } catch (_) {}
              }
            }
          }
          if (lastLine.startsWith("data: ") && lastLine !== "data: [DONE]") {
            try {
              const json = JSON.parse(lastLine.slice(6)) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
              if (json.usage?.prompt_tokens != null && json.usage?.completion_tokens != null) {
                const costMon = getCostMonFromUsage(model, json.usage.prompt_tokens, json.usage.completion_tokens);
                insertStoreUsageEvent({
                  user_id: user.id,
                  model,
                  prompt_tokens: json.usage.prompt_tokens,
                  completion_tokens: json.usage.completion_tokens,
                  cost_mon: costMon,
                });
              }
            } catch (_) {}
          }
          controller.close();
        },
      });
      const streamHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      };
      if (lowBalanceWarning) streamHeaders["X-Monallo-Warning"] = lowBalanceWarning;
      return new Response(streamResponse, { headers: streamHeaders });
    }

    const data = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; [k: string]: unknown };
    if (data.usage?.prompt_tokens != null && data.usage?.completion_tokens != null) {
      const costMon = getCostMonFromUsage(
        model,
        data.usage.prompt_tokens,
        data.usage.completion_tokens
      );
      insertStoreUsageEvent({
        user_id: user.id,
        model,
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
        cost_mon: costMon,
      });
    }
    const jsonHeaders = new Headers();
    if (lowBalanceWarning) jsonHeaders.set("X-Monallo-Warning", lowBalanceWarning);
    return NextResponse.json(data, { headers: jsonHeaders });
  } catch (e) {
    console.error("Monallo proxy error", e);
    const cause = (e as { cause?: unknown })?.cause as { code?: string } | undefined;
    const code = cause?.code;
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Proxy error", detail: code ? `${code}: ${message}` : message },
      { status: 502 }
    );
  }
}
