#!/usr/bin/env node
/**
 * MiniMax 意图解析测试：用大模型分析用户输入，得到 JSON 结构化信息
 * 使用方式: node scripts/test-minimax.mjs [用户消息]
 * 默认测试消息: "Send 0.01 ETH to 0x1234..."
 * 会读取项目根目录 .env 中的 MINIMAX_API_KEY 或 OPENAI_API_KEY
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const envPath = join(rootDir, ".env");

function loadEnv() {
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      process.env[key] = value;
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

loadEnv();

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/text/chatcompletion_v2";
const MODEL = "M2-her";

const SYSTEM_PROMPT = `You are a DeFi intent parser. Given a user message, determine the action and extract all relevant fields.

Output ONLY a single valid JSON object, no markdown, no code block, no explanation. Use this exact structure:
{
  "action": "Send" | "Swap" | "Bridge" | "Stake" | "Unknown",
  "sender": "sender address or empty string",
  "receiver": "recipient address or empty string",
  "amount": "numeric amount as string",
  "token": "token symbol e.g. ETH, USDT, PAS, DOT",
  "source_network": "source chain/network name or empty",
  "target_network": "target chain/network name or empty",
  "from_token": "for Swap only, source token symbol",
  "to_token": "for Swap only, destination token symbol"
}

Rules:
- action must be one of: Send, Swap, Bridge, Stake, Unknown. Use Unknown if the message is unclear or not a DeFi action.
- For Send/Transfer: extract receiver (0x... or address), amount, token. sender can be empty (current user).
- For Swap: extract amount, from_token, to_token. source_network/target_network if mentioned.
- For Bridge: extract amount, token, source_network, target_network, receiver if mentioned.
- For Stake: extract amount, token. receiver can be validator or empty.
- Use empty string "" for any missing field. Amount must be a string number.`;

function extractJson(text) {
  let trimmed = text.trim();
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const jsonStr = end === -1 ? trimmed.slice(start) : trimmed.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    const action = String(parsed.action ?? "Unknown").trim();
    const validActions = ["Send", "Swap", "Bridge", "Stake", "Unknown"];
    return {
      action: validActions.includes(action) ? action : "Unknown",
      sender: String(parsed.sender ?? "").trim(),
      receiver: String(parsed.receiver ?? "").trim(),
      amount: String(parsed.amount ?? "").trim(),
      token: String(parsed.token ?? "").trim(),
      source_network: String(parsed.source_network ?? "").trim(),
      target_network: String(parsed.target_network ?? "").trim(),
      from_token: String(parsed.from_token ?? "").trim(),
      to_token: String(parsed.to_token ?? "").trim(),
    };
  } catch {
    return null;
  }
}

const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("错误: 未找到 MINIMAX_API_KEY 或 OPENAI_API_KEY，请在 .env 中配置");
  process.exit(1);
}

const testMessage = process.argv[2] ?? "Send 0.01 ETH to 0x1234567890123456789012345678901234567890";

console.log("MiniMax 意图解析测试（大模型 → JSON 结构化）");
console.log("URL:", MINIMAX_API_URL);
console.log("模型:", MODEL);
console.log("用户消息:", testMessage);
console.log("");

const body = {
  model: MODEL,
  messages: [
    { role: "system", name: "AI Assistant", content: SYSTEM_PROMPT },
    { role: "user", name: "User", content: testMessage },
  ],
  temperature: 0.2,
  top_p: 0.95,
  max_completion_tokens: 512,
};

try {
  const res = await fetch(MINIMAX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok) {
    console.error("请求失败");
    console.error("HTTP 状态:", res.status, res.statusText);
    console.error("响应:", text.slice(0, 800));
    process.exit(1);
  }

  if (data?.base_resp && data.base_resp.status_code !== 0 && data.base_resp.status_code !== undefined) {
    console.error("MiniMax 业务错误");
    console.error("status_code:", data.base_resp.status_code);
    console.error("status_msg:", data.base_resp.status_msg ?? "");
    process.exit(1);
  }

  const rawContent = data?.choices?.[0]?.message?.content ?? "";
  const intent = extractJson(rawContent);

  if (!intent) {
    console.error("模型返回内容无法解析为 JSON");
    console.error("原始回复:", rawContent.slice(0, 500));
    process.exit(1);
  }

  console.log("解析成功，结构化意图 (JSON):");
  console.log(JSON.stringify(intent, null, 2));
  console.log("");
  console.log("字段摘要: action=%s, amount=%s, token=%s, receiver=%s, source_network=%s, target_network=%s",
    intent.action,
    intent.amount || "(空)",
    intent.token || "(空)",
    intent.receiver ? intent.receiver.slice(0, 10) + "..." : "(空)",
    intent.source_network || "(空)",
    intent.target_network || "(空)"
  );
} catch (e) {
  console.error("请求异常:", e.message);
  if (e.cause) console.error("原因:", e.cause);
  process.exit(1);
}
