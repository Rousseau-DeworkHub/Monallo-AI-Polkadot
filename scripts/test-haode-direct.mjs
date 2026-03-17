/**
 * Directly test Haode chat completions endpoint (bypass Monallo proxy).
 *
 * Usage:
 *   HAODE_API_KEY=xxx node scripts/test-haode-direct.mjs
 *   HAODE_API_KEY=xxx HAODE_BASE_URL=https://api.haode.wang node scripts/test-haode-direct.mjs
 *   HAODE_API_KEY=xxx MODEL=gpt-3.5-turbo node scripts/test-haode-direct.mjs
 *   HAODE_API_KEY=xxx PROMPT="Say this is a test!" node scripts/test-haode-direct.mjs
 *
 * Notes:
 * - Prints HTTP status + response text (truncated).
 * - Retries a few times on transient network errors (e.g. ECONNRESET).
 */
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = (process.env.HAODE_BASE_URL ?? "https://api.haode.wang").replace(/\/$/, "");
const API_KEY = process.env.HAODE_API_KEY ?? "";
const MODEL = process.env.MODEL ?? "gpt-5.2";
const PROMPT = process.env.PROMPT ?? "Say this is a test!";
const TEMPERATURE = Number.isFinite(Number(process.env.TEMPERATURE)) ? Number(process.env.TEMPERATURE) : 0.7;

const MAX_ATTEMPTS = Number.isFinite(Number(process.env.ATTEMPTS)) ? Math.max(1, Number(process.env.ATTEMPTS)) : 3;
const TIMEOUT_MS = Number.isFinite(Number(process.env.TIMEOUT_MS)) ? Math.max(1_000, Number(process.env.TIMEOUT_MS)) : 60_000;

function maskKey(key) {
  if (!key) return "—";
  if (key.length <= 12) return `${key.slice(0, 4)}…${key.slice(-2)}`;
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

function isTransientError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  const cause = e && typeof e === "object" ? e.cause : undefined;
  const code = cause && typeof cause === "object" ? cause.code : undefined;
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    msg.includes("fetch failed")
  );
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function attemptOnce(i) {
  const url = `${BASE_URL}/v1/chat/completions`;
  const body = {
    model: MODEL,
    messages: [{ role: "user", content: PROMPT }],
    temperature: TEMPERATURE,
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_MS
  );

  const text = await res.text();
  console.log(`Attempt ${i}/${MAX_ATTEMPTS}`);
  console.log("  Status:", res.status);
  console.log("  Body:", text.length > 2000 ? text.slice(0, 2000) + "\n... (truncated)" : text);
  console.log();

  return res.ok;
}

async function main() {
  console.log("Haode direct API test");
  console.log("  URL:     ", `${BASE_URL}/v1/chat/completions`);
  console.log("  Model:   ", MODEL);
  console.log("  Key:     ", maskKey(API_KEY));
  console.log("  Attempts:", MAX_ATTEMPTS);
  console.log("  Timeout:", `${TIMEOUT_MS}ms`);
  console.log();

  if (!API_KEY) {
    console.error("Missing HAODE_API_KEY. Example:");
    console.error("  HAODE_API_KEY=YOUR_API_KEY node scripts/test-haode-direct.mjs");
    process.exitCode = 2;
    return;
  }

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const ok = await attemptOnce(i);
      if (ok) return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cause = e && typeof e === "object" ? e.cause : undefined;
      const code = cause && typeof cause === "object" ? cause.code : undefined;
      console.log(`Attempt ${i}/${MAX_ATTEMPTS}`);
      console.log("  Error:", code ? `${code}: ${msg}` : msg);
      console.log();

      if (!isTransientError(e) || i === MAX_ATTEMPTS) {
        process.exitCode = 1;
        return;
      }
      await sleep(300 * i);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

