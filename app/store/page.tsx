"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Store, Wallet, Loader2, Globe, X, CheckCircle2, Sparkles, Key, Copy, RefreshCw, Coins, Info, History, ExternalLink, ChevronRight, AlertCircle } from "lucide-react";
import { useWallet, formatAddress, SUPPORTED_CHAINS, ChainInfo, WalletType, isMetaMaskAvailable } from "@/hooks/useWallet";
import { fetchTokenPrices } from "@/lib/balances";
import { sendViaWallet } from "@/lib/sendTransaction";
import { ethers } from "ethers";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const CREDIT_LEDGER_ADDRESS = typeof process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS === "string" ? process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS.trim() : "";

const STORE_CHAINS = SUPPORTED_CHAINS.filter((c) => c.id === "polkadot-hub-testnet");

/** Pack discount by index: 1M=95%, 5M=92%, 10M=90%, 20M=85%, 50M=80%, 100M=70% */
const PACK_DISCOUNTS = [0.95, 0.92, 0.9, 0.85, 0.8, 0.7] as const;
const PACK_DISCOUNT_LABELS = ["1M: 5% off", "5M: 8% off", "10M: 10% off", "20M: 15% off", "50M: 20% off", "100M: 30% off"] as const;

interface LLMModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  comingSoon?: boolean;
  price1M?: number;
  promptPer1M?: number;
  completionPer1M?: number;
}

const LLM_MODELS: LLMModelInfo[] = [
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", description: "Latest flagship model", price1M: 47.25, promptPer1M: 5.25, completionPer1M: 42 },
  { id: "MiniMax-M2.5", name: "MiniMax M2.5", provider: "MiniMax", description: "Strong reasoning & code", price1M: 31.5, promptPer1M: 6.3, completionPer1M: 25.2 },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "Google", description: "Multimodal & long context", price1M: 84, promptPer1M: 12, completionPer1M: 72 },
  { id: "qwen-3.5", name: "Qwen 3.5", provider: "Alibaba", description: "Efficient & capable", comingSoon: true },
  { id: "seed-1.8", name: "Seed 1.8", provider: "Doubao", description: "Fast inference", comingSoon: true },
];

const QUANTITY_PRESETS = [
  { value: 1, label: "1M", tokens: 1_000_000 },
  { value: 5, label: "5M", tokens: 5_000_000 },
  { value: 10, label: "10M", tokens: 10_000_000 },
  { value: 20, label: "20M", tokens: 20_000_000 },
  { value: 50, label: "50M", tokens: 50_000_000 },
  { value: 100, label: "100M", tokens: 100_000_000 },
] as const;

interface PaymentToken {
  symbol: string;
  name: string;
  chainId: string;
  iconKey: string;
  contract?: string;
  decimals: number;
}

const PAYMENT_TOKENS: PaymentToken[] = [
  { symbol: "PAS", name: "Polkadot Hub PAS", chainId: "polkadot-hub-testnet", iconKey: "PAS", decimals: 18 },
  ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim()
    ? [{ symbol: "maoETH.Sepolia", name: "maoETH (Polkadot Hub)", chainId: "polkadot-hub-testnet", iconKey: "ETH", contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim(), decimals: 18 }]
    : []),
];

const SEPOLIA_CHAIN_ID = 11155111;
const POLKADOT_HUB_CHAIN_ID = 420420417;
function getChainIdForPayment(chainIdKey: string): number {
  return chainIdKey === "sepolia" ? SEPOLIA_CHAIN_ID : POLKADOT_HUB_CHAIN_ID;
}

const TokenLogos: Record<string, string> = {
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  PAS: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png",
};

const STORE_BALANCE_KEY = "monallo_store_balance";
const STORE_RECHARGE_KEY = "monallo_store_recharge_mon";

/** Recharge MON presets (1 USD = 1 MON) */
const RECHARGE_PRESETS_MON = [1, 6, 18, 68, 128, 328] as const;
const STORE_HISTORY_KEY = "monallo_store_history";
const MAX_HISTORY_ENTRIES = 20;
const HISTORY_DISPLAY = 5;

export interface PurchaseRecord {
  id: string;
  timestamp: number;
  kind: "package" | "recharge";
  modelName: string;
  tokenCount: number;
  amount: string;
  token: string;
  amountUsd: number;
  txHash?: string;
  chainId: number;
}

const EXPLORER_BY_CHAIN_ID: Record<number, string> = {
  [11155111]: "https://sepolia.etherscan.io",
  [420420417]: "https://blockscout-testnet.polkadot.io",
};

function getBalanceKey(address: string) {
  return `${STORE_BALANCE_KEY}_${(address || "").toLowerCase()}`;
}
function getRechargeKey(address: string) {
  return `${STORE_RECHARGE_KEY}_${(address || "").toLowerCase()}`;
}

/** Map raw payment/transaction errors to user-friendly modal message */
function getPaymentErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("insufficient balance") || lower.includes("insufficient funds")) {
    return "Insufficient balance. Please check your wallet balance and try again.";
  }
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction was cancelled.";
  }
  if (lower.includes("execution reverted") || lower.includes("revert")) {
    if (lower.includes("balance")) return "Insufficient balance. Please check your wallet balance and try again.";
    return "Transaction failed. Please check your balance and try again.";
  }
  return msg.length > 200 ? "Transaction failed. Please try again." : msg;
}
function getHistoryKey(address: string) {
  return `${STORE_HISTORY_KEY}_${(address || "").toLowerCase()}`;
}
// API key is stored server-side (DB). Client should not persist plaintext keys in localStorage.

function generateApiKey(): string {
  const prefix = "ms_live_";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 32; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return prefix + suffix;
}

function WalletModal({
  isOpen,
  onClose,
  onConnect,
  isConnecting,
  error,
  connectingWallet,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (wallet: WalletType) => void | Promise<void>;
  isConnecting: boolean;
  error: string | null;
  connectingWallet: WalletType | null;
}) {
  const hasMetaMask = isMetaMaskAvailable();
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={isConnecting ? undefined : onClose} />
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-md bg-[#0d0d14] border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Connect Wallet</h2>
            <div className="space-y-3">
              <button
                onClick={() => onConnect("metamask")}
                disabled={isConnecting || !hasMetaMask}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#111] border border-white/10 hover:border-[#F68521]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="font-medium text-white">MetaMask</span>
                <span className="text-xs text-gray-500">EVM / Polkadot EVM</span>
                {connectingWallet === "metamask" && isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />}
              </button>
            </div>
            {!hasMetaMask && <p className="mt-3 text-sm text-amber-400">Please install MetaMask extension first.</p>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NetworkSelector({
  isOpen,
  onClose,
  currentChain,
  onSelect,
  switchError,
  onClearSwitchError,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentChain: ChainInfo | null;
  onSelect: (chain: ChainInfo) => void | Promise<void>;
  switchError?: string | null;
  onClearSwitchError?: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const handleSelect = async (chain: ChainInfo) => {
    if (chain.id === currentChain?.id) {
      onClose();
      return;
    }
    onClearSwitchError?.();
    setSwitching(true);
    try {
      await onSelect(chain);
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSwitching(false);
    }
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm bg-[#0d0d14] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Select Network</h2>
              <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {switchError && <p className="mb-4 text-sm text-red-400">{switchError}</p>}
            <div className="space-y-3">
              {STORE_CHAINS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  disabled={switching}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left ${currentChain?.id === c.id ? "bg-[#F68521]/20 border-2 border-[#F68521]/50" : "bg-white/5 border border-white/10 hover:border-white/20"}`}
                >
                  {c.logo?.startsWith("http") ? (
                    <img src={c.logo} alt={c.name} className="w-10 h-10 rounded-full object-contain" />
                  ) : (
                    <span className="w-10 h-10 flex items-center justify-center text-2xl">{c.icon}</span>
                  )}
                  <div className="flex-1">
                    <div className="font-bold text-white">{c.name}</div>
                    <div className="text-xs text-gray-500">Testnet</div>
                  </div>
                  {currentChain?.id === c.id && <CheckCircle2 className="w-5 h-5 text-[#F68521]" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Balance: Recharge balance (MON, 1 USD = 1 MON) + Token balance by model */
function BalanceModal({
  isOpen,
  onClose,
  rechargeBalanceMon,
  balanceByModel,
  onTopUp,
}: {
  isOpen: boolean;
  onClose: () => void;
  rechargeBalanceMon: number;
  balanceByModel: Record<string, number>;
  onTopUp: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative w-full max-w-md bg-[#0d0d14] border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#F68521]" />
                <h2 className="text-xl font-bold text-white">My Balance</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {/* 1. Recharge balance (points in MON, 1 USD = 1 MON) */}
            <section className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Recharge balance</div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
                <div className="text-2xl font-bold text-white">{rechargeBalanceMon.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-semibold text-gray-400">MON</span></div>
                <div className="text-xs text-gray-500 mt-0.5">1 USD = 1 MON</div>
              </div>
            </section>

            {/* 2. Token balance by model */}
            <section className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Token balance by model</div>
              <div className="space-y-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
                {LLM_MODELS.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-black/20 border border-white/[0.04]">
                    <span className="text-sm text-white">{m.name}</span>
                    <span className="font-mono font-medium text-white">{(balanceByModel[m.id] ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => { onTopUp(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#F68521] to-[#FFB347] text-white font-semibold hover:opacity-95"
            >
              <Store className="w-4 h-4" />
              Top up
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** API Key: view (masked), copy, regenerate */
function ApiKeyModal({
  isOpen,
  onClose,
  apiKey,
  apiKeyMasked,
  apiKeyHasServer,
  apiKeyLoading,
  models,
  balanceByModel,
  monBalance,
  onSpendModelTokens,
  onSpendMon,
  onCopy,
  onRegenerate,
  onRevealFromServer,
}: {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string | null;
  apiKeyMasked: string | null;
  apiKeyHasServer: boolean;
  apiKeyLoading: boolean;
  models: LLMModelInfo[];
  balanceByModel: Record<string, number>;
  monBalance: number;
  onSpendModelTokens: (modelId: string, spentTokens: number) => void;
  onSpendMon: (spentMon: number) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onRevealFromServer: () => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [baseUrlCopied, setBaseUrlCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [testPrompt, setTestPrompt] = useState("Say this is a test!");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; title: string; details?: string } | null>(null);
  const [codeTab, setCodeTab] = useState<"curl" | "js" | "py">("curl");
  const [codeCopied, setCodeCopied] = useState(false);
  const openModels = models.filter((m) => !m.comingSoon);
  const defaultTestModelId = openModels[0]?.id ?? models[0]?.id ?? "";
  const [testModelId, setTestModelId] = useState<string>(defaultTestModelId);
  const selectedTestModel = models.find((m) => m.id === testModelId) ?? openModels[0] ?? models[0];
  const modelTokenBalance = selectedTestModel ? Math.max(0, Math.floor(balanceByModel[selectedTestModel.id] ?? 0)) : 0;
  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(`${window.location.origin}/api/monallo/v1`);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const current = models.find((m) => m.id === testModelId);
    if (!current || current.comingSoon) setTestModelId(openModels[0]?.id ?? models[0]?.id ?? "");
  }, [isOpen]);
  const masked = apiKey
    ? `${apiKey.slice(0, 10)}${"•".repeat(20)}${apiKey.slice(-4)}`
    : apiKeyMasked ?? "—";
  const copy = async () => {
    if (!apiKey) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(apiKey);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = apiKey;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      // clipboard failed, do not set copied
    }
  };
  const copyBaseUrl = async () => {
    if (!baseUrl) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(baseUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = baseUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setBaseUrlCopied(true);
      setTimeout(() => setBaseUrlCopied(false), 2000);
    } catch (_) {}
  };

  const baseUrlForCode = baseUrl || "https://YOUR_DOMAIN/api/monallo/v1";
  const exampleModel = testModelId || "gpt-5.2";
  const curlExample = `curl ${baseUrlForCode}/chat/completions \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -d '{\n    \"model\": \"${exampleModel}\",\n    \"messages\": [{\"role\": \"user\", \"content\": \"Say this is a test!\"}],\n    \"temperature\": 0.78\n  }'`;
  const jsExample = `// Node.js 18+ (or modern browsers)\nconst baseUrl = \"${baseUrlForCode}\";\nconst apiKey = process.env.MONALLO_API_KEY || \"YOUR_API_KEY\";\n\nconst res = await fetch(baseUrl + \"/chat/completions\", {\n  method: \"POST\",\n  headers: {\n    \"Content-Type\": \"application/json\",\n    \"Authorization\": \"Bearer \" + apiKey,\n  },\n  body: JSON.stringify({\n    model: \"${exampleModel}\",\n    messages: [{ role: \"user\", content: \"Say this is a test!\" }],\n    temperature: 0.78,\n  }),\n});\n\nconsole.log(\"Status:\", res.status);\nconsole.log(await res.text());`;
  const pyExample = `# Python 3.9+\nimport os\nimport requests\n\nbase_url = \"${baseUrlForCode}\"\napi_key = os.getenv(\"MONALLO_API_KEY\", \"YOUR_API_KEY\")\n\nresp = requests.post(\n    base_url + \"/chat/completions\",\n    headers={\n        \"Content-Type\": \"application/json\",\n        \"Authorization\": f\"Bearer {api_key}\",\n    },\n    json={\n        \"model\": \"${exampleModel}\",\n        \"messages\": [{\"role\": \"user\", \"content\": \"Say this is a test!\"}],\n        \"temperature\": 0.78,\n    },\n    timeout=60,\n)\n\nprint(\"Status:\", resp.status_code)\nprint(resp.text)`;
  const codeByTab = codeTab === "curl" ? curlExample : codeTab === "js" ? jsExample : pyExample;
  const copyCode = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeByTab);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = codeByTab;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (_) {}
  };

  const runModelTest = async () => {
    if (!baseUrl || testLoading || !selectedTestModel) return;
    if (selectedTestModel.comingSoon) {
      setTestResult({ ok: false, title: "This model is not available yet." });
      return;
    }
    if ((modelTokenBalance ?? 0) <= 0 && (monBalance ?? 0) <= 0) {
      setTestResult({ ok: false, title: "Insufficient balance.", details: "You need either model Token balance or MON balance to run the test." });
      return;
    }
    const promptPer1M = selectedTestModel.promptPer1M;
    const completionPer1M = selectedTestModel.completionPer1M;
    if (promptPer1M == null || completionPer1M == null) {
      setTestResult({ ok: false, title: "Pricing is not configured for this model yet." });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const keyForTest = apiKey ?? (apiKeyHasServer ? await onRevealFromServer() : null);
      if (!keyForTest) {
        setTestResult({ ok: false, title: "API key not available.", details: "Please generate an API key first." });
        return;
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyForTest}`,
        },
        body: JSON.stringify({
          model: testModelId,
          messages: [{ role: "user", content: testPrompt }],
          temperature: 0.78,
        }),
      });
      const text = await res.text();

      if (!res.ok) {
        setTestResult({ ok: false, title: "Network is busy. Please retry later or contact the administrator." });
        return;
      }

      // Success: show important info only.
      let reply = "";
      let promptTokens = 0;
      let completionTokens = 0;
      try {
        const json = JSON.parse(text) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        reply = String(json?.choices?.[0]?.message?.content ?? "");
        promptTokens = Number(json?.usage?.prompt_tokens ?? 0);
        completionTokens = Number(json?.usage?.completion_tokens ?? 0);
      } catch (_) {}
      const replyLine = reply ? reply.slice(0, 280) : "(no reply)";
      setTestResult({
        ok: true,
        title: "Success",
        details: `Reply: ${replyLine}\nUsage: prompt=${promptTokens || 0}, completion=${completionTokens || 0}`,
      });

      // Only charge when call succeeded and contains usage.
      try {
        if (Number.isFinite(promptTokens) && Number.isFinite(completionTokens) && (promptTokens + completionTokens) > 0) {
          const availableTokens = Math.max(0, Math.floor(modelTokenBalance ?? 0));
          const coverPrompt = Math.min(promptTokens, availableTokens);
          const remainingAfterPrompt = availableTokens - coverPrompt;
          const coverCompletion = Math.min(completionTokens, remainingAfterPrompt);
          const spentTokens = coverPrompt + coverCompletion;
          if (spentTokens > 0) onSpendModelTokens(testModelId, spentTokens);

          const remainingPrompt = Math.max(0, promptTokens - coverPrompt);
          const remainingCompletion = Math.max(0, completionTokens - coverCompletion);
          const promptCostPerTokenMon = promptPer1M / 1_000_000;
          const completionCostPerTokenMon = completionPer1M / 1_000_000;
          const costMon =
            remainingPrompt * promptCostPerTokenMon +
            remainingCompletion * completionCostPerTokenMon;

          const spendableMon = Math.max(0, monBalance ?? 0);
          const spentMon = Math.min(spendableMon, costMon);
          if (spentMon > 0) onSpendMon(spentMon);
        }
      } catch (_) {}
    } catch (e) {
      setTestResult({ ok: false, title: "Network is busy. Please retry later or contact the administrator." });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative w-full max-w-4xl bg-[#0d0d14] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[#F68521]" />
                <h2 className="text-xl font-bold text-white">API Key</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Left: key + test */}
              <div className="p-6">
                <p className="text-sm text-gray-400 mb-4">{apiKey ? "Use this key to call Monallo LLM APIs. Keep it secret." : "Generate an API key to use Monallo LLM endpoints."}</p>

                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4">
                  {baseUrl && (
                    <div className="mb-3">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Monallo Base URL</div>
                      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 font-mono text-sm text-gray-300 break-all">
                        <span className="flex-1 min-w-0 truncate">{baseUrl}</span>
                        <button
                          type="button"
                          onClick={copyBaseUrl}
                          className="shrink-0 p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                          title="Copy Base URL"
                        >
                          {baseUrlCopied ? <CheckCircle2 className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">Use with Authorization: Bearer &lt;API Key&gt;</p>
                    </div>
                  )}
                  {apiKey ? (
                    <>
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">API Key</div>
                      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 mb-3 font-mono text-sm text-gray-300 break-all">
                        {masked}
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={copy}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 border border-white/10 text-white font-medium hover:bg-white/15"
                        >
                          {copied ? <CheckCircle2 className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={onRegenerate}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium hover:bg-amber-500/20"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Regenerate
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {apiKeyHasServer && (
                        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 font-mono text-sm text-gray-300 break-all">
                          {masked}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={onRegenerate}
                          disabled={apiKeyLoading}
                          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition ${
                            apiKeyLoading ? "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed" : "bg-gradient-to-r from-[#F68521] to-[#FFB347] text-white hover:opacity-95"
                          }`}
                        >
                          <Key className="w-4 h-4" />
                          Generate API Key
                        </button>
                        {apiKeyHasServer && (
                          <button
                            type="button"
                            onClick={onRevealFromServer}
                            disabled={apiKeyLoading}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border font-semibold transition ${
                              apiKeyLoading ? "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed" : "bg-white/10 border border-white/10 text-white hover:bg-white/15"
                            }`}
                          >
                            {apiKeyLoading ? "Loading…" : "Reveal"}
                          </button>
                        )}
                      </div>
                      {apiKeyHasServer && (
                        <p className="text-xs text-gray-500">
                          Key is stored in database. Click <span className="text-gray-300">Reveal</span> and sign with your wallet to view/copy it.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">Model Test</div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Current model</div>
                      <div className="flex flex-wrap gap-2">
                        {models.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            disabled={!!m.comingSoon}
                            onClick={() => !m.comingSoon && setTestModelId(m.id)}
                            className={`rounded-xl px-3 py-2 text-sm font-medium border transition ${
                              m.comingSoon
                                ? "border-white/10 bg-white/[0.02] text-gray-500 cursor-not-allowed"
                                : testModelId === m.id
                                  ? "border-[#F68521] bg-[#F68521]/15 text-[#F68521]"
                                  : "border-white/10 bg-white/[0.04] text-gray-300 hover:border-white/20 hover:text-white"
                            }`}
                          >
                            <span className="truncate">{m.name}</span>
                            {m.comingSoon && <span className="ml-1.5 text-[10px] text-amber-400/90">Coming Soon</span>}
                          </button>
                        ))}
                      </div>
                      {selectedTestModel && (
                        <div className="mt-2 text-xs text-gray-500">
                          Available: <span className="text-gray-200">{modelTokenBalance.toLocaleString()}</span> tokens ·{" "}
                          <span className="text-gray-200">{Math.max(0, (monBalance ?? 0)).toFixed(6)}</span> MON
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Prompt</div>
                      <input
                        value={testPrompt}
                        onChange={(e) => setTestPrompt(e.target.value)}
                        className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-gray-200 outline-none focus:border-white/20"
                        placeholder="Say this is a test!"
                        disabled={testLoading}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={runModelTest}
                      disabled={!baseUrl || testLoading || selectedTestModel?.comingSoon || ((modelTokenBalance ?? 0) <= 0 && (monBalance ?? 0) <= 0)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold transition ${
                        !baseUrl || testLoading || selectedTestModel?.comingSoon || ((modelTokenBalance ?? 0) <= 0 && (monBalance ?? 0) <= 0)
                          ? "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                          : "bg-white/10 border border-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      {testLoading ? "Testing..." : "Test model availability"}
                    </button>
                  </div>
              {testResult && (
                <div className={`mt-3 rounded-2xl border px-4 py-3 text-xs whitespace-pre-wrap break-words ${
                  testResult.ok ? "bg-[#14F195]/10 border-[#14F195]/20 text-[#B7F7D1]" : "bg-red-500/10 border-red-500/20 text-red-200"
                }`}>
                  <div className="mb-1 text-[11px] tracking-widest uppercase opacity-80">
                    {testResult.ok ? "SUCCESS" : "ERROR"}
                  </div>
                  <div className="font-medium">{testResult.title}</div>
                  {testResult.details && <div className="mt-1 font-mono">{testResult.details}</div>}
                </div>
              )}
                  {!apiKey && <p className="mt-2 text-xs text-gray-500">Generate an API key first to run the test.</p>}
                </div>
              </div>

              {/* Right: code examples */}
              <div className="p-6 border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-white/[0.02] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Code Examples</div>
                    <div className="text-sm font-semibold text-white mt-1">Quick start</div>
                  </div>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-sm hover:bg-white/15"
                    title="Copy example"
                  >
                    {codeCopied ? <CheckCircle2 className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
                    {codeCopied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setCodeTab("curl")}
                    className={`px-3 py-2 text-sm font-medium rounded-xl border transition ${
                      codeTab === "curl" ? "border-[#F68521] text-white bg-[#F68521]/15" : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    curl
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeTab("js")}
                    className={`px-3 py-2 text-sm font-medium rounded-xl border transition ${
                      codeTab === "js" ? "border-[#F68521] text-white bg-[#F68521]/15" : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    JavaScript
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeTab("py")}
                    className={`px-3 py-2 text-sm font-medium rounded-xl border transition ${
                      codeTab === "py" ? "border-[#F68521] text-white bg-[#F68521]/15" : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    Python
                  </button>
                </div>

                <div className="rounded-2xl border border-white/[0.08] overflow-hidden flex-1 min-h-[320px]">
                  <div className="h-full overflow-auto">
                    <SyntaxHighlighter
                      language={codeTab === "curl" ? "bash" : codeTab === "js" ? "javascript" : "python"}
                      style={{
                        ...oneDark,
                        'pre[class*="language-"]': {
                          ...(oneDark as any)['pre[class*="language-"]'],
                          background: "transparent",
                        },
                        'code[class*="language-"]': {
                          ...(oneDark as any)['code[class*="language-"]'],
                          background: "transparent",
                        },
                      } as any}
                      customStyle={{
                        margin: 0,
                        background: "transparent",
                        fontSize: "12px",
                        lineHeight: "1.55",
                        padding: "16px",
                        height: "100%",
                      }}
                      wrapLongLines
                    >
                      {codeByTab}
                    </SyntaxHighlighter>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Replace <span className="text-gray-300 font-mono">YOUR_API_KEY</span> with your Monallo API Key.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Full history modal: Purchase history, Consumption history, Model call records */
function HistoryModal({
  isOpen,
  onClose,
  loading,
  purchaseHistory,
  consumptionHistory,
  models,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  purchaseHistory: PurchaseRecord[];
  consumptionHistory: { id: number; model: string; prompt_tokens: number; completion_tokens: number; cost_mon: number; charged_tokens: number; charged_mon: number; charge_method: string; created_at: number }[];
  models: LLMModelInfo[];
}) {
  const [tab, setTab] = useState<"purchase" | "consumption" | "calls">("purchase");
  const salesNameById = useRef<Record<string, string>>({});
  useEffect(() => {
    salesNameById.current = Object.fromEntries((models ?? []).map((m) => [m.id, m.name]));
  }, [models]);
  const PAGE_SIZE = 10;
  const [consumptionPage, setConsumptionPage] = useState(1);
  const [callsPage, setCallsPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setTab("purchase");
    setConsumptionPage(1);
    setCallsPage(1);
  }, [isOpen]);

  useEffect(() => {
    if (tab === "consumption") setConsumptionPage(1);
    if (tab === "calls") setCallsPage(1);
  }, [tab]);

  const consumptionTotalPages = Math.max(1, Math.ceil(consumptionHistory.length / PAGE_SIZE));
  const consumptionPageClamped = Math.min(consumptionTotalPages, Math.max(1, consumptionPage));
  const consumptionStart = (consumptionPageClamped - 1) * PAGE_SIZE;
  const consumptionRows = consumptionHistory.slice(consumptionStart, consumptionStart + PAGE_SIZE);

  const callsTotalPages = Math.max(1, Math.ceil(consumptionHistory.length / PAGE_SIZE));
  const callsPageClamped = Math.min(callsTotalPages, Math.max(1, callsPage));
  const callsStart = (callsPageClamped - 1) * PAGE_SIZE;
  const callsRows = consumptionHistory.slice(callsStart, callsStart + PAGE_SIZE);

  const Pagination = ({
    page,
    totalPages,
    onPrev,
    onNext,
  }: {
    page: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
  }) => (
    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={onPrev}
        disabled={page <= 1}
        className={`px-3 py-1.5 rounded-xl text-sm border transition ${
          page <= 1 ? "border-white/10 text-gray-600 bg-white/[0.02] cursor-not-allowed" : "border-white/10 text-gray-200 hover:bg-white/10"
        }`}
      >
        Prev
      </button>
      <div className="text-xs text-gray-500">
        Page <span className="text-gray-200">{page}</span> / <span className="text-gray-200">{totalPages}</span>
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className={`px-3 py-1.5 rounded-xl text-sm border transition ${
          page >= totalPages ? "border-white/10 text-gray-600 bg-white/[0.02] cursor-not-allowed" : "border-white/10 text-gray-200 hover:bg-white/10"
        }`}
      >
        Next
      </button>
    </div>
  );
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#0d0d14] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#F68521]" />
                <h2 className="text-xl font-bold text-white">History</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {/* Tab options */}
            <div className="flex flex-wrap border-b border-white/[0.06] px-6 gap-1">
              <button
                type="button"
                onClick={() => setTab("purchase")}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === "purchase"
                    ? "border-[#F68521] text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                Purchase history
              </button>
              <button
                type="button"
                onClick={() => setTab("consumption")}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === "consumption"
                    ? "border-[#F68521] text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                Consumption history
              </button>
              <button
                type="button"
                onClick={() => setTab("calls")}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === "calls"
                    ? "border-[#F68521] text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                Model call records
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#F68521]" />
                </div>
              ) : tab === "purchase" ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                  {purchaseHistory.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">No purchases yet.</p>
                  ) : (
                    <ul className="divide-y divide-white/[0.06]">
                      {purchaseHistory.map((r) => (
                        <li key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-white flex items-center gap-2 min-w-0">
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${
                                  r.kind === "recharge"
                                    ? "text-[#14F195] border-[#14F195]/30 bg-[#14F195]/10"
                                    : "text-[#F68521] border-[#F68521]/30 bg-[#F68521]/10"
                                }`}
                              >
                                {r.kind === "recharge" ? "Recharge" : "Package"}
                              </span>
                              <span className="truncate">{r.modelName}</span>
                            </span>
                            <span className="text-gray-500 text-xs">
                              {r.kind === "recharge" ? `+${r.amountUsd.toFixed(2)} MON` : `${r.tokenCount.toLocaleString()} tokens`} · {new Date(r.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white">{r.amount} {r.token}</span>
                            {r.txHash && EXPLORER_BY_CHAIN_ID[r.chainId] && (
                              <a
                                href={`${EXPLORER_BY_CHAIN_ID[r.chainId]}/tx/${r.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#F68521] hover:underline flex items-center gap-1 text-xs"
                              >
                                Tx <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : tab === "consumption" ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                  {consumptionHistory.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">No consumption records yet.</p>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white/[0.02]">
                          <tr className="text-xs uppercase tracking-widest text-gray-500">
                            <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Model</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Prompt</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Completion</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Total</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Est. MON</th>
                            <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Charge</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {consumptionRows.map((c) => (
                            <tr key={c.id} className="text-gray-300">
                              <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{salesNameById.current[c.model] ?? c.model}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{c.prompt_tokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{c.completion_tokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{(c.prompt_tokens + c.completion_tokens).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-200">{(c.charged_mon / 1e6).toFixed(6)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                                {c.charge_method === "token" ? "Package" : c.charge_method === "mixed" ? "Package + MON" : "MON"}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">{new Date(c.created_at * 1000).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {consumptionHistory.length > 0 && (
                    <Pagination
                      page={consumptionPageClamped}
                      totalPages={consumptionTotalPages}
                      onPrev={() => setConsumptionPage((p) => Math.max(1, p - 1))}
                      onNext={() => setConsumptionPage((p) => Math.min(consumptionTotalPages, p + 1))}
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                  {consumptionHistory.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">No model call records yet.</p>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white/[0.02]">
                          <tr className="text-xs uppercase tracking-widest text-gray-500">
                            <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Model</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Prompt</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Completion</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Total</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Est. MON</th>
                            <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">Charge</th>
                            <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {callsRows.map((c) => (
                            <tr key={c.id} className="text-gray-300">
                              <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{salesNameById.current[c.model] ?? c.model}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{c.prompt_tokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{c.completion_tokens.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">{(c.prompt_tokens + c.completion_tokens).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap text-gray-200">{(c.charged_mon / 1e6).toFixed(6)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                                {c.charge_method === "token" ? "Package" : c.charge_method === "mixed" ? "Package + MON" : "MON"}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">{new Date(c.created_at * 1000).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {consumptionHistory.length > 0 && (
                    <Pagination
                      page={callsPageClamped}
                      totalPages={callsTotalPages}
                      onPrev={() => setCallsPage((p) => Math.max(1, p - 1))}
                      onNext={() => setCallsPage((p) => Math.min(callsTotalPages, p + 1))}
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function StorePage() {
  const { address, chain, isConnected, isConnecting, error: walletError, connect, switchChain, disconnect } = useWallet();
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [networkSwitchError, setNetworkSwitchError] = useState<string | null>(null);

  const [selectedModelId, setSelectedModelId] = useState<string>(LLM_MODELS[0].id);
  const [quantityMode, setQuantityMode] = useState<"preset" | "recharge">("preset");
  const [presetIndex, setPresetIndex] = useState(0);
  const [rechargePresetIndex, setRechargePresetIndex] = useState<number>(0);
  const [customRechargeInput, setCustomRechargeInput] = useState("");
  const [paymentToken, setPaymentToken] = useState<PaymentToken>(PAYMENT_TOKENS[0]);

  const paymentTokensForChain = chain?.id ? PAYMENT_TOKENS.filter((t) => t.chainId === chain.id) : [];
  const effectivePaymentTokens = isConnected && chain?.id ? paymentTokensForChain : PAYMENT_TOKENS;
  const currentPaymentToken = effectivePaymentTokens.some((t) => t.symbol === paymentToken.symbol && t.chainId === paymentToken.chainId)
    ? paymentToken
    : effectivePaymentTokens[0] ?? paymentToken;
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    if (!isConnected || !chain?.id) return;
    const forChain = PAYMENT_TOKENS.filter((t) => t.chainId === chain.id);
    if (forChain.length > 0 && !forChain.some((t) => t.symbol === paymentToken.symbol && t.chainId === paymentToken.chainId)) {
      setPaymentToken(forChain[0]);
    }
  }, [isConnected, chain?.id]);

  const [balanceByModel, setBalanceByModel] = useState<Record<string, number>>({});
  const [rechargeBalanceMon, setRechargeBalanceMon] = useState<number>(0);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiKeyHasServer, setApiKeyHasServer] = useState<boolean>(false);
  const [apiKeyLoading, setApiKeyLoading] = useState<boolean>(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [paymentTokenPriceUsd, setPaymentTokenPriceUsd] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
  const [consumptionHistory, setConsumptionHistory] = useState<{ id: number; model: string; prompt_tokens: number; completion_tokens: number; cost_mon: number; charged_tokens: number; charged_mon: number; charge_method: string; created_at: number }[]>([]);
  const [recordIndex, setRecordIndex] = useState(0);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showPurchaseSuccessModal, setShowPurchaseSuccessModal] = useState(false);
  const [showPaymentErrorModal, setShowPaymentErrorModal] = useState(false);
  const [paymentErrorModalMessage, setPaymentErrorModalMessage] = useState("");
  const [chainBalanceMon, setChainBalanceMon] = useState<number | null>(null);
  const [optimisticMonSpent, setOptimisticMonSpent] = useState<number>(0);
  const purchaseHistoryRef = useRef<HTMLDivElement>(null);

  const fetchChainBalance = useCallback(() => {
    if (!address || !chain?.id) return;
    const chainId = getChainIdForPayment(chain.id);
    fetch(`/api/store/balance?wallet=${encodeURIComponent(address)}&chain_id=${chainId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (typeof data.balance_mon === "number") setChainBalanceMon(data.balance_mon);
        if (data.balance_by_model && typeof data.balance_by_model === "object" && !Array.isArray(data.balance_by_model)) {
          setBalanceByModel(data.balance_by_model as Record<string, number>);
          if (typeof window !== "undefined" && address) {
            localStorage.setItem(getBalanceKey(address), JSON.stringify(data.balance_by_model));
          }
        }
      })
      .catch(() => setChainBalanceMon(null));
  }, [address, chain?.id]);

  useEffect(() => {
    if (address && chain?.id) fetchChainBalance();
  }, [address, chain?.id, fetchChainBalance]);

  // Refetch balance when opening My Balance modal so token counts stay in sync after API usage from outside.
  useEffect(() => {
    if (showBalanceModal && address && chain?.id) fetchChainBalance();
  }, [showBalanceModal, address, chain?.id, fetchChainBalance]);

  // When switching wallet or chain balance updates, reset optimistic spend for a clean view.
  useEffect(() => {
    setOptimisticMonSpent(0);
  }, [address, chain?.id]);

  const displayedRecords = purchaseHistory.slice(0, HISTORY_DISPLAY);
  const currentRecord = displayedRecords[recordIndex] ?? null;
  useEffect(() => {
    const n = displayedRecords.length;
    setRecordIndex((i) => (n <= 0 ? 0 : Math.min(i, n - 1)));
  }, [purchaseHistory.length]);

  const fetchPurchaseHistory = useCallback(async () => {
    if (!address?.trim()) return;
    try {
      const res = await fetch(`/api/store/purchases?address=${encodeURIComponent(address.trim())}&limit=100`);
      if (!res.ok) return;
      const rows = (await res.json()) as { id: number; kind?: string; model_name: string; token_count: number; amount: string; token: string; amount_usd: number; tx_hash: string | null; chain_id: number; created_at: number }[];
      setPurchaseHistory(
        (Array.isArray(rows) ? rows : []).map((r) => ({
          id: String(r.id),
          timestamp: r.created_at * 1000,
          kind: (r.kind === "recharge" ? "recharge" : "package"),
          modelName: r.model_name,
          tokenCount: r.token_count,
          amount: r.amount,
          token: r.token,
          amountUsd: r.amount_usd,
          txHash: r.tx_hash ?? undefined,
          chainId: r.chain_id,
        }))
      );
    } catch (_) {
      setPurchaseHistory([]);
    }
  }, [address]);

  const fetchConsumptionHistory = useCallback(async () => {
    if (!address?.trim()) return;
    try {
      const res = await fetch(`/api/store/usage?address=${encodeURIComponent(address.trim())}&limit=100`);
      if (!res.ok) return;
      const rows = (await res.json()) as { id: number; model: string; prompt_tokens: number; completion_tokens: number; cost_mon: number; charged_tokens: number; charged_mon: number; charge_method: string; created_at: number }[];
      setConsumptionHistory(Array.isArray(rows) ? rows : []);
    } catch (_) {
      setConsumptionHistory([]);
    }
  }, [address]);

  useEffect(() => {
    if (address) fetchPurchaseHistory();
  }, [address, fetchPurchaseHistory]);

  useEffect(() => {
    if (!showHistoryModal || !address) return;
    setHistoryLoading(true);
    Promise.all([fetchPurchaseHistory(), fetchConsumptionHistory()]).finally(() => setHistoryLoading(false));
  }, [showHistoryModal, address, fetchPurchaseHistory, fetchConsumptionHistory]);

  useEffect(() => {
    if (typeof window === "undefined" || !address) return;
    try {
      const raw = localStorage.getItem(getBalanceKey(address));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        if (parsed && typeof parsed === "object") {
          // Backward-compat: migrate old model ids to new ones.
          const next: Record<string, number> = { ...parsed };
          if (next["minimax-m2.5"] != null && next["MiniMax-M2.5"] == null) {
            next["MiniMax-M2.5"] = next["minimax-m2.5"];
            delete next["minimax-m2.5"];
          }
          if (next["gemini-3.1"] != null && next["gemini-3.1-pro-preview"] == null) {
            next["gemini-3.1-pro-preview"] = next["gemini-3.1"];
            delete next["gemini-3.1"];
          }
          setBalanceByModel(next);
          localStorage.setItem(getBalanceKey(address), JSON.stringify(next));
        }
      }
    } catch (_) {}
  }, [address]);
  useEffect(() => {
    if (typeof window === "undefined" || !address) return;
    try {
      const raw = localStorage.getItem(getRechargeKey(address));
      if (raw != null) {
        const n = parseFloat(String(raw));
        if (Number.isFinite(n) && n >= 0) setRechargeBalanceMon(n);
      }
    } catch (_) {}
  }, [address]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!address) {
      setApiKey(null);
      setApiKeyMasked(null);
      setApiKeyHasServer(false);
      return;
    }
    setApiKey(null);
    setApiKeyLoading(true);
    fetch(`/api/store/api-key/status?wallet=${encodeURIComponent(address)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.has_key) {
          setApiKeyHasServer(true);
          if (typeof data.masked === "string") setApiKeyMasked(data.masked);
        } else {
          setApiKeyHasServer(false);
          setApiKeyMasked(null);
        }
      })
      .catch(() => {})
      .finally(() => setApiKeyLoading(false));
  }, [address]);

  const saveBalance = (next: Record<string, number>) => {
    setBalanceByModel(next);
    if (address && typeof window !== "undefined") localStorage.setItem(getBalanceKey(address), JSON.stringify(next));
  };
  const saveRechargeMon = (mon: number) => {
    setRechargeBalanceMon(mon);
    if (address && typeof window !== "undefined") localStorage.setItem(getRechargeKey(address), String(mon));
  };
  const handleRegenerateApiKey = () => {
    const newKey = generateApiKey();
    setApiKey(newKey);
    setApiKeyMasked(`${newKey.slice(0, 10)}${"•".repeat(20)}${newKey.slice(-4)}`);
    setApiKeyHasServer(true);
    if (address) {
      fetch("/api/store/register-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address, api_key: newKey }),
      }).catch(() => {});
    }
  };

  const spendModelTokens = (modelId: string, tokens: number) => {
    const t = Math.max(0, Math.floor(tokens));
    if (!t || !address) return;
    const current = Math.max(0, Math.floor(balanceByModel[modelId] ?? 0));
    const next = Math.max(0, current - t);
    saveBalance({ ...balanceByModel, [modelId]: next });
  };

  const spendMon = (mon: number) => {
    const m = Math.max(0, mon);
    if (!m) return;
    // Keep 6 decimals.
    const rounded = Math.round(m * 1e6) / 1e6;
    setOptimisticMonSpent((prev) => Math.round((prev + rounded) * 1e6) / 1e6);
  };

  const revealApiKeyFromServer = async (): Promise<string | null> => {
    if (!address || typeof window === "undefined" || !window.ethereum) return null;
    setApiKeyLoading(true);
    try {
      const ch = await fetch("/api/store/api-key/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address }),
      });
      const challenge = ch.ok ? await ch.json() : null;
      if (!challenge?.message || !challenge?.nonce) throw new Error("Failed to create challenge");
      const provider = new ethers.BrowserProvider(window.ethereum as unknown as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(String(challenge.message));
      const res = await fetch("/api/store/api-key/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          nonce: challenge.nonce,
          message: challenge.message,
          signature,
        }),
      });
      const data = res.ok ? await res.json() : await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to reveal key");
      if (typeof data?.api_key === "string") {
        setApiKey(data.api_key);
        setApiKeyMasked(`${data.api_key.slice(0, 10)}${"•".repeat(20)}${data.api_key.slice(-4)}`);
        return data.api_key as string;
      }
      return null;
    } catch (_) {
      // ignore; modal can show masked only
      return null;
    } finally {
      setApiKeyLoading(false);
    }
  };
  const purchaseFormRef = useRef<HTMLDivElement>(null);
  const scrollToPurchase = () => purchaseFormRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    if (isConnected && showWalletModal) {
      setShowWalletModal(false);
      setConnectingWallet(null);
    }
  }, [isConnected, showWalletModal]);

  const selectedModel = LLM_MODELS.find((m) => m.id === selectedModelId) ?? LLM_MODELS[0];
  const tokenCount = quantityMode === "preset" ? QUANTITY_PRESETS[presetIndex].tokens : 0;
  const rechargeAmountMon =
    quantityMode === "recharge"
      ? rechargePresetIndex >= 0 && rechargePresetIndex < RECHARGE_PRESETS_MON.length
        ? RECHARGE_PRESETS_MON[rechargePresetIndex]
        : Math.max(0, parseFloat(customRechargeInput) || 0)
      : 0;
  const canPay = currentPaymentToken && currentPaymentToken.chainId === chain?.id;
  const purchaseDisabled =
    !isConnected ||
    isPurchasing ||
    (quantityMode !== "recharge" && tokenCount <= 0) ||
    (quantityMode === "recharge" && rechargeAmountMon <= 0) ||
    !canPay ||
    selectedModel?.comingSoon;
  const purchaseDisabledReason = !isConnected
    ? "Connect wallet to purchase"
    : selectedModel?.comingSoon
      ? "This model is coming soon"
      : quantityMode === "recharge" && rechargeAmountMon <= 0
        ? "Select or enter recharge amount (MON)"
        : quantityMode !== "recharge" && tokenCount <= 0
          ? "Select a package"
          : !canPay && chain
            ? `Switch network to ${currentPaymentToken?.chainId === "sepolia" ? "Sepolia" : "Polkadot Hub"} to pay with ${currentPaymentToken?.symbol ?? "crypto"}`
            : !canPay
              ? "Select network"
              : null;
  const orderTotalUsd =
    quantityMode === "preset" && selectedModel?.price1M != null
      ? selectedModel.price1M * (QUANTITY_PRESETS[presetIndex].tokens / 1_000_000) * PACK_DISCOUNTS[presetIndex]
      : quantityMode === "recharge" && rechargeAmountMon > 0
        ? rechargeAmountMon
        : null;

  useEffect(() => {
    if (!currentPaymentToken?.symbol) {
      setPaymentTokenPriceUsd(null);
      return;
    }
    let cancelled = false;
    fetchTokenPrices([currentPaymentToken.symbol]).then((prices) => {
      if (!cancelled) setPaymentTokenPriceUsd(prices[currentPaymentToken.symbol] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPaymentToken?.symbol]);

  return (
    <div className="min-h-screen bg-[#06060a]">
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={async (w) => {
          setConnectingWallet(w);
          try {
            await connect(w);
          } catch (e) {
            console.warn(e);
          } finally {
            setConnectingWallet(null);
          }}
        }
        isConnecting={isConnecting}
        error={walletError}
        connectingWallet={connectingWallet}
      />
      <NetworkSelector
        isOpen={showNetworkSelector}
        onClose={() => { setShowNetworkSelector(false); setNetworkSwitchError(null); }}
        currentChain={chain}
        onSelect={async (c) => {
          try {
            await switchChain(c.chainId);
          } catch (e) {
            setNetworkSwitchError(e instanceof Error ? e.message : "Failed to switch network.");
          }
        }}
        switchError={networkSwitchError}
        onClearSwitchError={() => setNetworkSwitchError(null)}
      />
      <BalanceModal
        isOpen={showBalanceModal}
        onClose={() => setShowBalanceModal(false)}
        rechargeBalanceMon={chainBalanceMon ?? rechargeBalanceMon}
        balanceByModel={balanceByModel}
        onTopUp={scrollToPurchase}
      />
      <AnimatePresence>
        {showComingSoonModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowComingSoonModal(false)} />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative rounded-2xl bg-[#0d0d14] border border-white/10 px-6 py-5 shadow-xl">
              <p className="text-white font-medium">Integrating…</p>
              <p className="text-sm text-gray-400 mt-1">Coming soon.</p>
              <button onClick={() => setShowComingSoonModal(false)} className="mt-4 w-full py-2 rounded-xl bg-[#F68521]/20 text-[#F68521] font-medium">OK</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        apiKey={apiKey}
        apiKeyMasked={apiKeyMasked}
        apiKeyHasServer={apiKeyHasServer}
        apiKeyLoading={apiKeyLoading}
        models={LLM_MODELS}
        balanceByModel={balanceByModel}
        monBalance={Math.max(0, Math.round(((chainBalanceMon ?? rechargeBalanceMon) - optimisticMonSpent) * 1e6) / 1e6)}
        onSpendModelTokens={spendModelTokens}
        onSpendMon={spendMon}
        onCopy={() => {}}
        onRegenerate={handleRegenerateApiKey}
        onRevealFromServer={revealApiKeyFromServer}
      />

      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        loading={historyLoading}
        purchaseHistory={purchaseHistory}
        consumptionHistory={consumptionHistory}
        models={LLM_MODELS}
      />

      <AnimatePresence>
        {showPurchaseSuccessModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowPurchaseSuccessModal(false)} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm bg-[#0d0d14] border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-[#14F195]/20 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-[#14F195]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Successfully</h3>
              <p className="text-sm text-gray-400 mb-6">Thank you for your support.</p>
              <button
                type="button"
                onClick={() => setShowPurchaseSuccessModal(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F68521] to-[#FFB347] text-white font-semibold hover:opacity-95"
              >
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPaymentErrorModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => { setShowPaymentErrorModal(false); setPaymentErrorModalMessage(""); }} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm bg-[#0d0d14] border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Transaction failed</h3>
              <p className="text-sm text-gray-400 mb-6">{paymentErrorModalMessage || "Something went wrong. Please try again."}</p>
              <button
                type="button"
                onClick={() => { setShowPaymentErrorModal(false); setPaymentErrorModalMessage(""); }}
                className="w-full py-3 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/15"
              >
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-[#06060a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChevronLeft className="w-5 h-5 text-gray-500" />
            <img src="/logo.png" className="h-10" alt="Monallo" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNetworkSelector(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20"
            >
              {chain ? (
                <>
                  {chain.logo?.startsWith("http") ? <img src={chain.logo} alt="" className="w-5 h-5 rounded-full" /> : <span className="w-5 h-5 flex items-center justify-center text-sm">{chain.icon}</span>}
                  <span className="text-sm text-white">{chain.name}</span>
                  <span className="text-xs" style={{ color: "#FB923C" }}>Testnet</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Select</span>
                </>
              )}
            </button>
            {isConnected ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <span className="text-sm text-white font-mono">{formatAddress(address)}</span>
                <button onClick={disconnect} className="text-xs text-gray-400 hover:text-white">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => setShowWalletModal(true)} disabled={isConnecting} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F68521] to-[#FFB347] text-sm font-semibold text-white">
                <Wallet className="w-4 h-4" />
                {isConnecting ? "..." : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F68521]/10 border border-[#F68521]/20 mb-6">
            <Store className="w-4 h-4 text-[#F68521]" />
            <span className="text-sm text-[#F68521]">LLM Token Store</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Monallo <span className="bg-gradient-to-r from-[#F68521] to-[#FFB347] bg-clip-text text-transparent">Store</span>
          </h1>
          <p className="text-gray-400 mb-6">Purchase compute tokens for GPT-5.2, MiniMax M2.5, Gemini 3.1, Qwen 3.5, Seed 1.8 and more. Pay with ETH, PAS, or wrapped assets.</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => isConnected ? setShowBalanceModal(true) : setShowWalletModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:border-[#F68521]/30 hover:bg-[#F68521]/5 transition-all text-sm font-medium text-white"
            >
              <Coins className="w-4 h-4 text-[#F68521]" />
              My Balance
            </button>
            <button
              type="button"
              onClick={() => isConnected ? setShowApiKeyModal(true) : setShowWalletModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:border-[#F68521]/30 hover:bg-[#F68521]/5 transition-all text-sm font-medium text-white"
            >
              <Key className="w-4 h-4 text-[#F68521]" />
              API Key
            </button>
            <button
              type="button"
              onClick={() => (isConnected ? setShowHistoryModal(true) : setShowWalletModal(true))}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:border-[#F68521]/30 hover:bg-[#F68521]/5 transition-all text-sm font-medium text-white"
            >
              <History className="w-4 h-4 text-[#F68521]" />
              History
            </button>
          </div>
        </motion.div>

        <div ref={purchaseFormRef} className="grid lg:grid-cols-[1fr_340px] gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0d0d14] to-[#08080c] shadow-2xl shadow-black/30 overflow-hidden"
          >
            <div className="px-6 md:px-8 pt-6 md:pt-8 pb-1 border-b border-white/[0.06]">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Purchase</span>
              <h2 className="text-lg font-semibold text-white mt-1">Select model & amount</h2>
            </div>

            <div className="p-6 md:p-8 space-y-8">
              {/* Model selection */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">Model</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {LLM_MODELS.map((model) => {
                    const hasPricing = model.price1M != null && model.promptPer1M != null && model.completionPer1M != null;
                    const isHovered = hoveredModelId === model.id;
                    return (
                      <div key={model.id} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (model.comingSoon) setShowComingSoonModal(true);
                            else setSelectedModelId(model.id);
                          }}
                          onMouseEnter={() => setHoveredModelId(model.id)}
                          onMouseLeave={() => setHoveredModelId(null)}
                          className={`flex flex-col items-start gap-1 p-4 rounded-2xl border text-left transition-all w-full ${
                            model.comingSoon ? "opacity-75 cursor-default" : ""
                          } ${
                            selectedModelId === model.id && !model.comingSoon
                              ? "bg-[#F68521]/10 border-[#F68521]/40 text-white shadow-[0_0_20px_-5px_rgba(246,133,33,0.2)]"
                              : "bg-[#0a0a0f] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <span className="font-semibold text-white">{model.name}</span>
                          <span className="text-xs text-gray-500">{model.provider}</span>
                          {hasPricing && (
                            <span className="absolute top-2 right-2 text-gray-500 hover:text-[#F68521]" title="Pricing info">
                              <Info className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </button>
                        {hasPricing && isHovered && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-10 px-3 py-2 rounded-xl bg-[#0d0d14] border border-white/10 shadow-xl text-left">
                            <div className="text-xs text-white">
                              <div>Prompt {model.promptPer1M} USD/1M, Completion {model.completionPer1M} USD/1M</div>
                              <div className="text-gray-400 mt-1">1M total {model.price1M} USD (prompt + completion).</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">Token amount</span>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["preset", "recharge"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setQuantityMode(mode)}
                      className={`px-4 py-2 rounded-xl font-medium text-sm capitalize transition-all ${
                        quantityMode === mode ? "bg-[#F68521]/20 text-[#F68521] border border-[#F68521]/40" : "bg-white/5 text-gray-400 border border-white/10 hover:text-white"
                      }`}
                    >
                      {mode === "preset" ? "Packages" : "Recharge"}
                    </button>
                  ))}
                </div>
                {quantityMode === "preset" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {QUANTITY_PRESETS.map((p, i) => {
                      const discount = PACK_DISCOUNTS[i];
                      const discountPct = Math.round((1 - discount) * 100);
                      const price1M = selectedModel?.price1M;
                      const totalUsd = price1M != null ? (price1M * (p.tokens / 1_000_000) * discount) : null;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setPresetIndex(i)}
                          className={`flex flex-col items-center justify-center gap-1 min-h-[72px] px-4 py-3 rounded-2xl border transition-all ${
                            presetIndex === i ? "bg-[#F68521]/10 border-[#F68521]/40 text-white" : "bg-[#0a0a0f] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 shrink-0" />
                            <span className="font-semibold">{p.label}</span>
                          </div>
                          {totalUsd != null ? (
                            <>
                              <span className="text-sm font-medium text-[#F68521]">{totalUsd.toFixed(2)} USD</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#F68521]/20 text-[#F68521] border border-[#F68521]/40">
                                {discountPct}% off
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {quantityMode === "recharge" && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">Top up MON balance (1 USD = 1 MON). Select a preset or enter a custom amount.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {RECHARGE_PRESETS_MON.map((mon, idx) => (
                        <button
                          key={mon}
                          type="button"
                          onClick={() => {
                            setRechargePresetIndex(idx);
                            setCustomRechargeInput("");
                          }}
                          className={`min-h-[52px] flex items-center justify-center rounded-xl border font-semibold transition-all ${
                            rechargePresetIndex === idx && !customRechargeInput
                              ? "bg-[#F68521]/15 border-[#F68521]/50 text-[#F68521]"
                              : "bg-white/[0.04] border-white/[0.08] text-gray-300 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {mon} MON
                        </button>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
                      <label className="block text-xs font-medium text-gray-500 mb-2">Custom amount (MON)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="Enter amount"
                        value={customRechargeInput}
                        onChange={(e) => {
                          setCustomRechargeInput(e.target.value);
                          setRechargePresetIndex(-1);
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-white placeholder-gray-500 focus:border-[#F68521]/40 focus:outline-none focus:ring-1 focus:ring-[#F68521]/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pay with — only tokens for current network when connected */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">Pay with</span>
                <div className="flex flex-wrap gap-3">
                  {effectivePaymentTokens.map((t) => (
                    <button
                      key={t.symbol + t.chainId}
                      type="button"
                      onClick={() => setPaymentToken(t)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                        currentPaymentToken?.symbol === t.symbol && currentPaymentToken?.chainId === t.chainId
                          ? "bg-[#F68521]/10 border-[#F68521]/40 text-white"
                          : "bg-[#0a0a0f] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <img src={TokenLogos[t.iconKey]} alt="" className="w-7 h-7 rounded-full object-contain ring-1 ring-white/10" />
                      <span className="font-semibold">{t.symbol}</span>
                      <span className="text-[10px] text-gray-500">{t.chainId === "sepolia" ? "Sepolia" : "Polkadot Hub"}</span>
                    </button>
                  ))}
                </div>
                {isConnected && !chain && (
                  <p className="mt-2 text-xs text-amber-400/90">Select a network to see payment options.</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Right column: Summary + Purchase history */}
          <div className="flex flex-col gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0d0d14] to-[#08080c] shadow-2xl shadow-black/30 overflow-hidden h-fit"
          >
            <div className="px-6 pt-6 pb-1 border-b border-white/[0.06]">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Summary</span>
              <h2 className="text-lg font-semibold text-white mt-1">Order</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Model</span>
                <span className="font-medium text-white">{selectedModel.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{quantityMode === "recharge" ? "Recharge" : "Tokens"}</span>
                <span className="font-medium text-white">
                  {quantityMode === "recharge"
                    ? `${rechargeAmountMon > 0 ? rechargeAmountMon.toLocaleString() : "—"} MON`
                    : QUANTITY_PRESETS[presetIndex].tokens.toLocaleString()}
                </span>
              </div>
              {orderTotalUsd != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium text-white">{orderTotalUsd.toFixed(2)} USD</span>
                </div>
              )}
              <div className="flex justify-between text-sm items-start gap-2">
                <span className="text-gray-500 shrink-0">Pay with</span>
                <span className="font-medium text-white text-right">
                  {currentPaymentToken?.symbol ?? "—"}
                  {orderTotalUsd != null && currentPaymentToken && paymentTokenPriceUsd != null && paymentTokenPriceUsd > 0 && (
                    <span className="block text-xs text-gray-400 mt-0.5">
                      ≈ {(orderTotalUsd / paymentTokenPriceUsd).toFixed(6)} {currentPaymentToken.symbol}
                    </span>
                  )}
                  {orderTotalUsd != null && currentPaymentToken && (paymentTokenPriceUsd == null || paymentTokenPriceUsd === 0) && (
                    <span className="block text-xs text-gray-400 mt-0.5">Fetching price…</span>
                  )}
                </span>
              </div>
              <div className="pt-4 border-t border-white/[0.06]">
                <p className="text-xs text-gray-500 mb-4">Pricing is indicative. Final amount may vary by model and network.</p>
                <button
                  type="button"
                  disabled={purchaseDisabled}
                  onClick={async () => {
                    if (purchaseDisabled) return;
                    setPaymentError(null);
                    setIsPurchasing(true);
                    try {
                      if (quantityMode === "recharge") {
                        if (!rechargeAmountMon || rechargeAmountMon <= 0 || !currentPaymentToken || !paymentTokenPriceUsd || paymentTokenPriceUsd <= 0) {
                          setPaymentError("Invalid recharge amount or price.");
                          setIsPurchasing(false);
                          return;
                        }
                        if (typeof window === "undefined" || !window.ethereum) {
                          setPaymentError("No wallet found. Install MetaMask.");
                          setIsPurchasing(false);
                          return;
                        }
                        const rechargeUsd = rechargeAmountMon;
                        const cryptoAmount = rechargeUsd / paymentTokenPriceUsd;
                        const amountStr = cryptoAmount < 1e-10 ? "0.000001" : cryptoAmount.toFixed(9).replace(/\.?0+$/, "") || "0.000001";
                        const chainId = getChainIdForPayment(currentPaymentToken.chainId);
                        const recipient = typeof process.env.NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT === "string"
                          ? process.env.NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT.trim()
                          : "";
                        if (!recipient || recipient.length < 40) {
                          setPaymentError("Store payment recipient not configured (NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT).");
                          setIsPurchasing(false);
                          return;
                        }
                        const { hash: txHash } = await sendViaWallet(window.ethereum, {
                          chainId,
                          to: recipient,
                          amount: amountStr,
                          tokenSymbol: currentPaymentToken.symbol,
                          tokenContract: currentPaymentToken.contract,
                          decimals: currentPaymentToken.decimals,
                        });
                        const provider = new ethers.BrowserProvider(window.ethereum as unknown as ethers.Eip1193Provider);
                        await provider.waitForTransaction(txHash);
                        try {
                          await fetch("/api/store/confirm-payment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              tx_hash: txHash,
                              wallet_address: address,
                              amount_mon: rechargeUsd,
                              chain_id: chainId,
                              payment_to: recipient,
                              payment_token_symbol: currentPaymentToken.symbol,
                              payment_token_contract: currentPaymentToken.contract ?? null,
                              payment_amount: amountStr,
                              payment_decimals: currentPaymentToken.decimals,
                            }),
                          });
                          // Record recharge in purchases (Records module).
                          await fetch("/api/store/purchases", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              wallet_address: address,
                              kind: "recharge",
                              model_id: null,
                              model_name: "Recharge",
                              token_count: 0,
                              amount: amountStr,
                              token: currentPaymentToken.symbol,
                              amount_usd: rechargeUsd,
                              tx_hash: txHash,
                              chain_id: chainId,
                            }),
                          });
                          fetchChainBalance();
                          fetchPurchaseHistory();
                        } catch (_) {}
                        saveRechargeMon(rechargeBalanceMon + rechargeUsd);
                        setShowPurchaseSuccessModal(true);
                        setIsPurchasing(false);
                        return;
                      }
                      if (!orderTotalUsd || !currentPaymentToken || !paymentTokenPriceUsd || paymentTokenPriceUsd <= 0) {
                        setPaymentError("Invalid amount or price.");
                        setIsPurchasing(false);
                        return;
                      }
                      if (typeof window === "undefined" || !window.ethereum) {
                        setPaymentError("No wallet found. Install MetaMask.");
                        setIsPurchasing(false);
                        return;
                      }
                      const cryptoAmount = orderTotalUsd / paymentTokenPriceUsd;
                      const amountStr = cryptoAmount < 1e-10 ? "0.000001" : cryptoAmount.toFixed(9).replace(/\.?0+$/, "") || "0.000001";
                      const chainId = getChainIdForPayment(currentPaymentToken.chainId);
                      let txHash: string;
                      const recipient = typeof process.env.NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT === "string"
                        ? process.env.NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT.trim()
                        : "";
                      if (!recipient || recipient.length < 40) {
                        setPaymentError("Store payment recipient not configured (NEXT_PUBLIC_STORE_PAYMENT_RECIPIENT).");
                        setIsPurchasing(false);
                        return;
                      }
                      const res = await sendViaWallet(window.ethereum, {
                        chainId,
                        to: recipient,
                        amount: amountStr,
                        tokenSymbol: currentPaymentToken.symbol,
                        tokenContract: currentPaymentToken.contract,
                        decimals: currentPaymentToken.decimals,
                      });
                      txHash = res.hash;
                      const provider = new ethers.BrowserProvider(window.ethereum as unknown as ethers.Eip1193Provider);
                      await provider.waitForTransaction(txHash);
                      saveBalance({
                        ...balanceByModel,
                        [selectedModelId]: (balanceByModel[selectedModelId] ?? 0) + tokenCount,
                      });
                      const selectedModelForRecord = LLM_MODELS.find((m) => m.id === selectedModelId);
                      try {
                        await fetch("/api/store/purchases", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            wallet_address: address,
                            kind: "package",
                            model_id: selectedModelId,
                            model_name: selectedModelForRecord?.name ?? selectedModelId,
                            token_count: tokenCount,
                            amount: amountStr,
                            token: currentPaymentToken.symbol,
                            amount_usd: orderTotalUsd,
                            tx_hash: txHash,
                            chain_id: chainId,
                          }),
                        });
                      } catch (_) {}
                      fetchPurchaseHistory();
                      setShowPurchaseSuccessModal(true);
                    } catch (e) {
                      setPaymentError(null);
                      setPaymentErrorModalMessage(getPaymentErrorMessage(e));
                      setShowPaymentErrorModal(true);
                    } finally {
                      setIsPurchasing(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl bg-gradient-to-r from-[#F68521] to-[#FFB347] text-white text-lg font-bold shadow-xl shadow-[#F68521]/30 hover:shadow-[#F68521]/40 hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                >
                  {isPurchasing ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Store className="w-6 h-6" />
                  )}
                  {isPurchasing ? "Processing…" : quantityMode === "recharge" ? "Recharge balance" : "Purchase tokens"}
                </button>
                {purchaseDisabledReason && (
                  <p className="mt-3 text-center text-xs text-amber-400/90">{purchaseDisabledReason}</p>
                )}
                {paymentError && (
                  <p className="mt-3 text-center text-xs text-red-400">{paymentError}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Purchase history — one record, arrows to browse */}
          <motion.div
            ref={purchaseHistoryRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0d0d14] to-[#08080c] shadow-2xl shadow-black/30 overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Records</span>
                <h2 className="text-sm font-semibold text-white">Purchase history</h2>
              </div>
              {displayedRecords.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordIndex((i) => (i <= 0 ? displayedRecords.length - 1 : i - 1))}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                    title="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-gray-500 min-w-[3ch] text-center">{recordIndex + 1}/{displayedRecords.length}</span>
                  <button
                    type="button"
                    onClick={() => setRecordIndex((i) => (i >= displayedRecords.length - 1 ? 0 : i + 1))}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                    title="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="p-4">
              {!currentRecord ? (
                <p className="text-xs text-gray-500 text-center py-4">No purchases yet.</p>
              ) : (
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 space-y-1.5">
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-gray-500">Type</span>
                    <span className={`text-[11px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                      currentRecord.kind === "recharge"
                        ? "text-[#14F195] border-[#14F195]/30 bg-[#14F195]/10"
                        : "text-[#F68521] border-[#F68521]/30 bg-[#F68521]/10"
                    }`}>
                      {currentRecord.kind === "recharge" ? "Recharge" : "Package"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-gray-500">Model</span>
                    <span className="text-white font-medium truncate">{currentRecord.modelName ?? "—"}</span>
                  </div>
                  {currentRecord.kind === "recharge" ? (
                    <div className="flex justify-between items-center gap-2 text-xs">
                      <span className="text-gray-500">Recharge</span>
                      <span className="text-white">+{currentRecord.amountUsd.toFixed(2)} MON</span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center gap-2 text-xs">
                      <span className="text-gray-500">Tokens</span>
                      <span className="text-white">{(currentRecord.tokenCount ?? 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-gray-500">Time</span>
                    <span className="text-white truncate">{new Date(currentRecord.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-gray-500">Payment</span>
                    <span className="text-white truncate">{currentRecord.amount} {currentRecord.token} ({currentRecord.amountUsd.toFixed(2)} USD)</span>
                  </div>
                  {currentRecord.txHash && EXPLORER_BY_CHAIN_ID[currentRecord.chainId] && (
                    <div className="flex justify-between items-center gap-2 text-xs pt-1 border-t border-white/[0.06]">
                      <span className="text-gray-500">Tx</span>
                      <a
                        href={`${EXPLORER_BY_CHAIN_ID[currentRecord.chainId]}/tx/${currentRecord.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[#F68521] hover:underline truncate max-w-[140px] flex items-center gap-1"
                        title={currentRecord.txHash}
                      >
                        {currentRecord.txHash.slice(0, 8)}…{currentRecord.txHash.slice(-6)}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
