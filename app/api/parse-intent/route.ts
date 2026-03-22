import { NextRequest, NextResponse } from "next/server";

/**
 * MiniMax 文本对话（与官方 curl 示例一致：api.minimaxi.com、Bearer、JSON body）。
 * 意图解析需非流式响应（stream: false）以便解析完整 JSON。
 * 覆盖项：MINIMAX_API_URL、MINIMAX_MODEL、MINIMAX_TEMPERATURE、MINIMAX_MAX_COMPLETION_TOKENS、MINIMAX_TIMEOUT_MS
 */
const MINIMAX_API_URL =
  process.env.MINIMAX_API_URL?.trim() || "https://api.minimaxi.com/v1/text/chatcompletion_v2";
const MODEL = process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7";

const UPSTREAM_TIMEOUT_MS = Math.min(Math.max(Number(process.env.MINIMAX_TIMEOUT_MS) || 45000, 5000), 120000);

const MINIMAX_TEMPERATURE = (() => {
  const t = Number(process.env.MINIMAX_TEMPERATURE);
  return Number.isFinite(t) && t > 0 && t <= 1 ? t : 0.3;
})();

const MINIMAX_MAX_COMPLETION_TOKENS = (() => {
  const n = Number(process.env.MINIMAX_MAX_COMPLETION_TOKENS);
  if (Number.isFinite(n) && n >= 64 && n <= 16384) return Math.floor(n);
  return 2048;
})();

const SYSTEM_PROMPT = `You are a DeFi intent parser for Monallo AI Pay. Given a user message, determine the action and extract all relevant fields.

Output ONLY a single valid JSON object, no markdown, no code block, no explanation. Use this exact structure:
{
  "action": "Send" | "Bridge" | "Stake" | "Unknown",
  "sender": "sender address or empty string",
  "receiver": "recipient address or empty string",
  "amount": "numeric amount as string",
  "token": "token symbol e.g. ETH, PAS, INJ, LAT",
  "source_network": "source chain/network name or empty",
  "target_network": "target chain/network name or empty",
  "from_token": "empty string (Swap not supported)",
  "to_token": "empty string (Swap not supported)"
}

Rules:
- action must be one of: Send, Bridge, Stake, Unknown. Use Unknown if the message is unclear or not a DeFi action.
- **Swap is under development.** If the user asks to swap or exchange tokens, output action: "Unknown" and leave from_token/to_token empty.
- For Send/Transfer: extract receiver (0x... or address), amount, token. sender can be empty (current user).
  **Monallo AI Pay Send is restricted by network:** (1) Polkadot Hub supports ONLY PAS for Send. (2) Sepolia supports ONLY ETH for Send. (3) Injective (Injective EVM testnet) supports ONLY INJ for Send. (4) PlatON Dev supports ONLY LAT for Send.
  Infer network from token: if user says PAS or Polkadot Hub → set source_network and target_network to "Polkadot Hub", token to "PAS". If user says ETH or Sepolia → set source_network and target_network to "Sepolia", token to "ETH". If user says INJ or Injective → set source_network and target_network to "Injective", token to "INJ". If user says LAT or PlatON or PlatON Dev → set source_network and target_network to "PlatON Dev", token to "LAT".
- For Bridge: extract amount, token, source_network, target_network, receiver if mentioned.
  **Supported networks (Monallo lock-mint / unlock):** "Sepolia", "Polkadot Hub", "Injective" (Injective EVM testnet).
  **Open lock directions (native token on source → wrapped on target):** Sepolia ETH → Polkadot Hub or Injective; Polkadot Hub PAS → Sepolia or Injective; Injective INJ → Sepolia or Polkadot Hub.
  **Open unlock directions (wrapped on source → native on target):** maoETH.Sepolia from Polkadot Hub or Injective → Sepolia ETH; maoPAS.PH from Sepolia or Injective → Polkadot Hub PAS; maoINJ.Injective from Sepolia or Polkadot Hub → Injective INJ.
  **NOT supported (do NOT output as a normal executable Bridge — use action "Unknown" or set token/source/target so the product can reject):** moving wrapped to another chain as the same wrapped asset (e.g. Sepolia maoPAS.PH → Injective maoPAS.PH; Hub maoETH.Sepolia → Injective maoETH.Sepolia; cross-chain maoINJ between Sepolia and Hub only as wrapped; etc.). These are "wrapped-to-wrapped" hops and are closed.
  **Bridge direction (lock vs unlock):**
  - Lock examples: "Bridge X ETH to Polkadot Hub" → source Sepolia, target Polkadot Hub, token ETH. "Bridge X ETH to Injective" → Sepolia, Injective, ETH. "Bridge X PAS to Injective" → Polkadot Hub, Injective, PAS. "Bridge X INJ to Sepolia" → Injective, Sepolia, INJ.
  - Unlock examples: maoETH.Sepolia on Polkadot Hub → Sepolia native ETH: source Polkadot Hub, target Sepolia, token maoETH.Sepolia. maoPAS on Sepolia → Polkadot Hub: source Sepolia, target Polkadot Hub, token maoPAS.PH. maoINJ on Sepolia → Injective: source Sepolia, target Injective, token maoINJ.Injective.
  Rule: for wrapped tokens, source_network = chain where the user holds the wrapped token; target_network = chain where they want the native asset (unlock) or wrapped mint (lock uses native token on source only).
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

/** LLM token consumption (MiniMax / OpenAI-style usage) */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
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
    const validActions = ["Send", "Bridge", "Stake", "Unknown"];
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(MINIMAX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          stream: false,
          temperature: MINIMAX_TEMPERATURE,
          top_p: 0.95,
          max_completion_tokens: MINIMAX_MAX_COMPLETION_TOKENS,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const aborted = e instanceof Error && e.name === "AbortError";
      console.error("MiniMax fetch error", aborted ? "timeout" : e);
      return NextResponse.json(
        {
          error: aborted ? "MiniMax request timed out" : "MiniMax connection failed",
          hint: "Check MINIMAX_API_KEY and network access; default https://api.minimaxi.com (override with MINIMAX_API_URL).",
        },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("MiniMax API error", MINIMAX_API_URL, res.status, errText.slice(0, 500));
      return NextResponse.json(
        {
          error: "MiniMax HTTP error",
          upstreamStatus: res.status,
          details: errText.slice(0, 800),
        },
        { status: 502 }
      );
    }

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: { status_code?: number; status_msg?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
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
      const code = data.base_resp.status_code;
      const msg = data.base_resp?.status_msg ?? "API error";
      console.error("MiniMax base_resp", code, msg);
      return NextResponse.json(
        {
          error: msg,
          code,
          hint:
            code === 1004
              ? "Invalid or expired API key; check MINIMAX_API_KEY"
              : code === 1008
                ? "Insufficient account balance"
                : code === 1002
                  ? "Rate limited; try again later"
                  : undefined,
        },
        { status: 502 }
      );
    }

    const choiceMsg = data.choices?.[0]?.message;
    const content = (choiceMsg?.content ?? "").trim();
    const parsed = extractJson(content);
    if (!parsed) {
      console.error("parse-intent extractJson failed, raw length", content.length, content.slice(0, 200));
      return NextResponse.json(
        {
          error: "Could not parse intent from model response",
          raw: content.slice(0, 500),
          hint: "Model did not return parseable JSON; check MINIMAX_MODEL (default MiniMax-M2.7) or lower MINIMAX_TEMPERATURE.",
        },
        { status: 502 }
      );
    }

    const promptTokens = Number(data.usage?.prompt_tokens ?? 0);
    const completionTokens = Number(data.usage?.completion_tokens ?? 0);
    const usage: TokenUsage | undefined = data.usage
      ? {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: Number(data.usage.total_tokens) || promptTokens + completionTokens,
        }
      : undefined;

    return NextResponse.json(
      usage ? { ...parsed, usage } : parsed
    );
  } catch (e) {
    console.error("parse-intent error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
