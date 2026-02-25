import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_URL = "https://api.minimaxi.com/v1/text/chatcompletion_v2";
const MODEL = "M2-her";

const SYSTEM_PROMPT = `You are a DeFi intent parser for Monallo AI Pay. Given a user message, determine the action and extract all relevant fields.

Output ONLY a single valid JSON object, no markdown, no code block, no explanation. Use this exact structure:
{
  "action": "Send" | "Swap" | "Bridge" | "Stake" | "Unknown",
  "sender": "sender address or empty string",
  "receiver": "recipient address or empty string",
  "amount": "numeric amount as string",
  "token": "token symbol e.g. ETH, PAS",
  "source_network": "source chain/network name or empty",
  "target_network": "target chain/network name or empty",
  "from_token": "for Swap only, source token symbol",
  "to_token": "for Swap only, destination token symbol"
}

Rules:
- action must be one of: Send, Swap, Bridge, Stake, Unknown. Use Unknown if the message is unclear or not a DeFi action.
- For Send/Transfer: extract receiver (0x... or address), amount, token. sender can be empty (current user).
  **Monallo AI Pay Send is restricted by network:** (1) Polkadot Hub supports ONLY PAS for Send. (2) Sepolia supports ONLY ETH for Send.
  Infer network from token: if user says PAS or Polkadot Hub → set source_network and target_network to "Polkadot Hub", token to "PAS". If user says ETH or Sepolia → set source_network and target_network to "Sepolia", token to "ETH".
- For Swap: extract amount, from_token, to_token. source_network/target_network if mentioned.
- For Bridge: extract amount, token, source_network, target_network, receiver if mentioned.
  **Bridge direction (lock vs unlock):**
  - "Bridge X ETH to Polkadot Hub" or "Bridge X ETH to Polkadot" = lock: source_network = "Sepolia", target_network = "Polkadot Hub", token = "ETH".
  - "Bridge X PAS to Sepolia" (native PAS from Polkadot Hub to Sepolia) = lock from Polkadot Hub: source_network = "Polkadot Hub", target_network = "Sepolia", token = "PAS".
  - "Bridge X maoETH.Sepolia to Sepolia" or "bridge maoETH to Sepolia" = UNLOCK (bridge back): user holds wrapped maoETH.Sepolia on Polkadot Hub and wants native ETH on Sepolia. Set source_network = "Polkadot Hub", target_network = "Sepolia", token = "maoETH.Sepolia".
  - "Bridge X maoPAS to Polkadot Hub" or "bridge maoPAS.Polkadot-Hub to Polkadot Hub" = UNLOCK (bridge back): user holds wrapped maoPAS on Sepolia and wants native PAS on Polkadot Hub. Set source_network = "Sepolia", target_network = "Polkadot Hub", token = "maoPAS.PH".
  Rule: wrapped token (maoETH.Sepolia, maoPAS.PH) always indicates the chain where the user currently holds it = source_network; the chain they say "to X" = target_network.
- For Stake: extract amount, token. receiver can be validator or empty.
- Use empty string "" for any missing field. Amount must be a string number.`;

export interface ParsedIntent {
  action: string;
  sender: string;
  receiver: string;
  amount: string;
  token: string;
  source_network: string;
  target_network: string;
  from_token: string;
  to_token: string;
}

function extractJson(text: string): ParsedIntent | null {
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
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const action = String(parsed.action ?? "Unknown").trim();
    const validActions = ["Send", "Swap", "Bridge", "Stake", "Unknown"];
    const actionNorm = validActions.includes(action) ? action : "Unknown";
    return {
      action: actionNorm,
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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "MINIMAX_API_KEY or OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const res = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", name: "AI Assistant", content: SYSTEM_PROMPT },
          { role: "user", name: "User", content: message },
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_completion_tokens: 512,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("MiniMax API error", res.status, errText);
      return NextResponse.json(
        { error: "Intent parsing failed", details: errText },
        { status: 502 }
      );
    }

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      return NextResponse.json(
        { error: "Invalid response from MiniMax API" },
        { status: 502 }
      );
    }

    if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
      const msg = data.base_resp?.status_msg ?? "API error";
      return NextResponse.json(
        { error: msg, code: data.base_resp?.status_code },
        { status: 502 }
      );
    }

    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    const parsed = extractJson(content);
    if (!parsed) {
      return NextResponse.json(
        { error: "Could not parse intent from model response", raw: content.slice(0, 500) },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("parse-intent error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
