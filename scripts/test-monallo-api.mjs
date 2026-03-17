#!/usr/bin/env node
/**
 * Test Monallo Store proxy: call chat completions with Monallo Base URL + API Key.
 * Usage: node scripts/test-monallo-api.mjs
 * Env (optional): BASE_URL, API_KEY, MODEL
 */
const BASE_URL = process.env.BASE_URL || "http://192.168.31.97:3000/api/monallo/v1";
const API_KEY = process.env.API_KEY || "ms_live_78r75b446zyupxcbh3di55mgzold5iee";
const MODEL = process.env.MODEL || "gpt-5.2";

const url = `${BASE_URL}/chat/completions`;
const body = {
  model: MODEL,
  messages: [{ role: "user", content: "Say this is a test!" }],
  temperature: 0.7,
};

console.log("Monallo API test");
console.log("  Base URL:", BASE_URL);
console.log("  Model:   ", MODEL);
console.log("  Key:     ", API_KEY.slice(0, 24) + "...");
console.log("");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify(body),
});

const warning = res.headers.get("x-monallo-warning");
if (warning) console.log("  [Header] X-Monallo-Warning:", warning);

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.log("  Response (raw):", text.slice(0, 500));
  process.exit(1);
}

console.log("  Status:", res.status);
console.log("  Response:", JSON.stringify(data, null, 2));

if (data.error) {
  console.log("\n  Error:", data.error);
  process.exit(1);
}
if (data.choices?.[0]?.message?.content) {
  console.log("\n  Reply:", data.choices[0].message.content);
  console.log("\n  Done. Monallo proxy is working.");
} else {
  console.log("\n  No choices in response.");
  process.exit(1);
}
