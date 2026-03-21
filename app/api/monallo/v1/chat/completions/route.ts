import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { ethers } from "ethers";
import {
  getStoreUserByKeyHash,
  insertStoreUsageEvent,
  getStoreUsageSumByUserAndRange,
  spendStoreModelTokens,
  getStoreModelTokens,
  setStoreUsageEventSettledMon,
} from "@/lib/db";
import { getCostMonFromUsage, normalizeModelIdForBalance } from "@/lib/monalloProxy";
import { getCombinedStoreCreditMon, settleStoreCreditOnBestLedger } from "@/lib/creditLedger";

const HAODE_BASE_URL = process.env.HAODE_BASE_URL ?? "";
const HAODE_API_KEY = process.env.HAODE_API_KEY ?? "";
const LOW_BALANCE_THRESHOLD_MON = 0.1;
const BALANCE_WARNING = "Insufficient balance. Please recharge soon.";
const STORE_OPERATOR_PRIVATE_KEY = process.env.STORE_OPERATOR_PRIVATE_KEY ?? "";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function getAuthKey(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

type UsageTriple = { prompt: number; completion: number; total: number };

function parseUsage(data: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }): UsageTriple | null {
  const u = data?.usage;
  if (!u) return null;
  const prompt = Number(u.prompt_tokens ?? 0);
  const completion = Number(u.completion_tokens ?? 0);
  const totalFromFields = prompt + completion;
  const totalTokens = Number(u.total_tokens ?? 0) || totalFromFields;
  if (totalTokens <= 0) return null;
  if (prompt > 0 || completion > 0) {
    return { prompt, completion, total: prompt + completion };
  }
  return { prompt: totalTokens, completion: 0, total: totalTokens };
}

/** availableMonRaw: max MON (raw, 1e6=1 MON) we can charge for this request; used to cap charged_mon. */
function applyChargeAndInsert(
  user: { id: number },
  model: string,
  modelForBalance: string,
  prompt: number,
  completion: number,
  availableMonRaw: number,
): { usageEventId: number; chargedMonRaw: number } | null {
  const totalTokens = Math.max(0, prompt + completion);
  if (totalTokens <= 0) return null;
  const costMon = getCostMonFromUsage(model, prompt, completion);
  const chargedTokens = spendStoreModelTokens(user.id, modelForBalance, totalTokens);
  const coverPrompt = Math.min(prompt, chargedTokens);
  const coverCompletion = Math.min(completion, Math.max(0, chargedTokens - coverPrompt));
  const remainingPrompt = Math.max(0, prompt - coverPrompt);
  const remainingCompletion = Math.max(0, completion - coverCompletion);
  let chargedMon = (totalTokens - chargedTokens) > 0 ? getCostMonFromUsage(model, remainingPrompt, remainingCompletion) : 0;
  if (chargedMon <= 0 && costMon > 0 && chargedTokens < totalTokens) chargedMon = costMon;
  chargedMon = Math.min(chargedMon, Math.max(0, availableMonRaw));
  const method = chargedTokens > 0 && chargedMon > 0 ? "mixed" : chargedTokens > 0 ? "token" : "mon";
  const usageEventId = insertStoreUsageEvent({
    user_id: user.id,
    model,
    prompt_tokens: prompt,
    completion_tokens: completion,
    cost_mon: costMon,
    charged_tokens: chargedTokens,
    charged_mon: chargedMon,
    charge_method: method,
  });
  return { usageEventId, chargedMonRaw: chargedMon };
}

function getUtcDateString(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;
  const stream = !!obj.stream;
  const model = typeof obj.model === "string" ? obj.model : "default";
  const modelForBalance = normalizeModelIdForBalance(model);

  let availableMonRaw = 0;
  let lowBalanceWarning: string | null = null;
  if (user.wallet_address) {
    try {
      const balanceMon = await getCombinedStoreCreditMon(user.wallet_address);
      const now = Math.floor(Date.now() / 1000);
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      const todayStart = Math.floor(d.getTime() / 1000);
      const unsettledRaw = getStoreUsageSumByUserAndRange(user.id, todayStart, now);
      availableMonRaw = Math.max(0, Math.round(balanceMon * 1e6) - unsettledRaw);
      const availableMon = balanceMon - unsettledRaw / 1e6;
      if (availableMon < LOW_BALANCE_THRESHOLD_MON) lowBalanceWarning = BALANCE_WARNING;
    } catch (_) {}
  }

  const tryImmediateSettle = async (usageEventId: number, chargedMonRaw: number) => {
    try {
      if (!STORE_OPERATOR_PRIVATE_KEY || !user.wallet_address) return;
      if (chargedMonRaw <= 0) return;

      const dayId = getUtcDateString();
      const settlementId = `${user.wallet_address}_${dayId}_${usageEventId}`;
      const userAddress = ethers.getAddress(user.wallet_address);
      const amountMon = chargedMonRaw / 1e6; // convert raw(1e6) => MON

      const settled = await settleStoreCreditOnBestLedger(
        STORE_OPERATOR_PRIVATE_KEY,
        userAddress,
        amountMon,
        dayId,
        settlementId
      );
      if (settled) setStoreUsageEventSettledMon(usageEventId, chargedMonRaw, settled.hash);
    } catch (e) {
      // If on-chain settle fails, leave settled_mon=0 so daily settlement-run can retry.
      console.warn("Immediate MON settle failed", e);
    }
  };

  const modelTokenBalance = getStoreModelTokens(user.id, modelForBalance);
  if (modelTokenBalance <= 0 && availableMonRaw <= 0) {
    return NextResponse.json(
      { error: "Insufficient balance. Please recharge or purchase model tokens before calling the API." },
      { status: 402 }
    );
  }

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
      const body = res.body;
      if (!body) return NextResponse.json({ error: "No body" }, { status: 502 });
      const reader = body.getReader();
      let lastLine = "";
      let lastUsage: UsageTriple | null = null;
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
                  const json = JSON.parse(line.slice(6)) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
                  const u = parseUsage(json);
                  if (u) lastUsage = u;
                } catch (_) {}
              }
            }
          }
          if (lastLine.startsWith("data: ") && lastLine !== "data: [DONE]") {
            try {
              const json = JSON.parse(lastLine.slice(6)) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
              const u = parseUsage(json);
              if (u) lastUsage = u;
            } catch (_) {}
          }
          if (lastUsage) {
            const chargeRes = applyChargeAndInsert(user, model, modelForBalance, lastUsage.prompt, lastUsage.completion, availableMonRaw);
            if (chargeRes && chargeRes.chargedMonRaw > 0) {
              await tryImmediateSettle(chargeRes.usageEventId, chargeRes.chargedMonRaw);
            }
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

    const data = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; [k: string]: unknown };
    const usageTriple = parseUsage(data as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } });
    if (usageTriple) {
      const chargeRes = applyChargeAndInsert(user, model, modelForBalance, usageTriple.prompt, usageTriple.completion, availableMonRaw);
      if (chargeRes && chargeRes.chargedMonRaw > 0) {
        await tryImmediateSettle(chargeRes.usageEventId, chargeRes.chargedMonRaw);
      }
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
