"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, CheckCircle2, ArrowRight, X, Wallet, ChevronLeft, Sparkles, Globe, Activity, RefreshCw, Shield, Layers, Settings, ChevronRight, DollarSign, Lock, Copy, TrendingUp, Upload, ExternalLink, History, ChevronDown, ArrowLeftRight, BookUser, Trash2, Plus, CircleSlash } from "lucide-react";
import { useWallet, formatAddress, SUPPORTED_CHAINS, ChainInfo, WalletType, isMetaMaskAvailable } from "@/hooks/useWallet";
import { fetchTokenPrices, fetchPolkadotBalance, mergeBalancesWithPrices, fetchOkxPrices, getOkxPriceForSymbol } from "@/lib/balances";
import { sendViaWallet } from "@/lib/sendTransaction";
import { lockViaBridge, unlockViaBridge, getBridgeLockAddress, getWrappedTokenAddressForUnlock } from "@/lib/bridge";
import {
  BRIDGE_DIRECTION_CLOSED_MSG,
  isAllowedBridgeLockMint,
  isAllowedBridgeUnlock,
  isBridgeUnlockIntent,
  isForbiddenWrappedWrappedBridge,
  normalizeWrappedKindFromToken,
} from "@/lib/bridgeRules";
import { ethers } from "ethers";

/** Parsed intent from MiniMax M2.5 (matches /api/parse-intent response) */
interface ParsedIntent {
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
interface Message {
  id: string; role: "user" | "assistant" | "system"; content: string; timestamp: number;
  status?: "pending" | "success" | "error";
  txHash?: string; explorerUrl?: string;
  destinationTxHash?: string; destinationExplorerUrl?: string;
  bridgeSourceLabel?: string; bridgeDestLabel?: string; // e.g. "Lock"/"Mint" or "Unlock"/"Release"
  intent?: ParsedIntent; intentConfirmed?: boolean;
  /** User dismissed the confirm modal via Cancel; transaction not submitted */
  intentCancelled?: boolean;
}

function intentsEqual(a: ParsedIntent, b: ParsedIntent): boolean {
  const f = (v: string | undefined) => (v ?? "").trim();
  return (
    f(a.action) === f(b.action) &&
    f(a.sender) === f(b.sender) &&
    f(a.receiver) === f(b.receiver) &&
    f(a.amount) === f(b.amount) &&
    f(a.token) === f(b.token) &&
    f(a.source_network) === f(b.source_network) &&
    f(a.target_network) === f(b.target_network) &&
    f(a.from_token) === f(b.from_token) &&
    f(a.to_token) === f(b.to_token)
  );
}
interface TokenBalance { symbol: string; name: string; balance: string; decimals: number; contract?: string; icon: string; priceUsd?: number; valueUsd?: number; }
/** 历史记录条目（与 /api/transactions 返回一致） */
interface TransactionRecord {
  id: number;
  wallet_address: string;
  action: string;
  tx_hash: string | null;
  explorer_url: string | null;
  amount: string | null;
  token: string | null;
  receiver: string | null;
  source_network: string | null;
  target_network: string | null;
  from_token: string | null;
  to_token: string | null;
  created_at: number;
}

const TokenLogos: Record<string, string> = {
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  USDT: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
  DOT: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png",
  SEPOLIA_ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  PAS: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png",
  INJ: "https://www.okx.com/cdn/oksupport/asset/currency/icon/inj20250424102359.png?x-oss-process=image/format,webp/ignore-error,1",
  LAT: "https://www.okx.com/cdn/oksupport/asset/currency/icon/lat.png?x-oss-process=image/format,webp/ignore-error,1",
};

/** ai-pay 网络选择器：三链 + PlatON Dev EVM 测试网 */
const AI_PAY_EVM_SELECTOR_IDS = new Set(["sepolia", "polkadot-hub-testnet", "injective-testnet", "platon-dev"]);

function isAiPayTestnetChainId(id: string): boolean {
  return AI_PAY_EVM_SELECTOR_IDS.has(id);
}

const TOKENS_BY_CHAIN: Record<string, TokenBalance[]> = {
  ethereum: [
    { symbol: "ETH", name: "Ethereum", balance: "0", decimals: 18, icon: "ETH" },
    { symbol: "USDT", name: "Tether", balance: "0", decimals: 6, contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", icon: "USDT" },
  ],
  sepolia: [
    { symbol: "ETH", name: "Sepolia ETH", balance: "0", decimals: 18, icon: "SEPOLIA_ETH" },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA === "string" && process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA.trim()
      ? [{ symbol: "maoPAS.PH", name: "maoPAS.Polkadot-Hub", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA.trim(), icon: "PAS" }]
      : []),
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_INJ_SEPOLIA === "string" && process.env.NEXT_PUBLIC_WRAPPED_INJ_SEPOLIA.trim()
      ? [{ symbol: "maoINJ.Injective", name: "maoINJ.Injective", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_INJ_SEPOLIA.trim(), icon: "INJ" }]
      : []),
  ],
  polkadot: [
    { symbol: "DOT", name: "Polkadot", balance: "0", decimals: 10, icon: "DOT" },
  ],
  "polkadot-hub-testnet": [
    { symbol: "PAS", name: "Polkadot Hub", balance: "0", decimals: 18, icon: "PAS" },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim()
      ? [{ symbol: "maoETH.Sepolia", name: "maoETH.Sepolia", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim(), icon: "SEPOLIA_ETH" }]
      : []),
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_INJ_POLKADOT_HUB === "string" && process.env.NEXT_PUBLIC_WRAPPED_INJ_POLKADOT_HUB.trim()
      ? [{ symbol: "maoINJ.Injective", name: "maoINJ.Injective", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_INJ_POLKADOT_HUB.trim(), icon: "INJ" }]
      : []),
  ],
  "injective-testnet": [
    { symbol: "INJ", name: "Injective", balance: "0", decimals: 18, icon: "INJ" },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_PAS_INJECTIVE === "string" && process.env.NEXT_PUBLIC_WRAPPED_PAS_INJECTIVE.trim()
      ? [{ symbol: "maoPAS.PH", name: "maoPAS.Polkadot-Hub", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_PAS_INJECTIVE.trim(), icon: "PAS" }]
      : []),
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_INJECTIVE === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_INJECTIVE.trim()
      ? [{ symbol: "maoETH.Sepolia", name: "maoETH.Sepolia", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_INJECTIVE.trim(), icon: "SEPOLIA_ETH" }]
      : []),
  ],
  "platon-dev": [
    { symbol: "LAT", name: "PlatON LAT", balance: "0", decimals: 18, icon: "LAT" },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_PLATON_DEV === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_PLATON_DEV.trim()
      ? [{ symbol: "maoETH.Sepolia", name: "maoETH.Sepolia", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_PLATON_DEV.trim(), icon: "SEPOLIA_ETH" }]
      : []),
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_PAS_PLATON_DEV === "string" && process.env.NEXT_PUBLIC_WRAPPED_PAS_PLATON_DEV.trim()
      ? [{ symbol: "maoPAS.PH", name: "maoPAS.PH", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_PAS_PLATON_DEV.trim(), icon: "PAS" }]
      : []),
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_INJ_PLATON_DEV === "string" && process.env.NEXT_PUBLIC_WRAPPED_INJ_PLATON_DEV.trim()
      ? [{ symbol: "maoINJ.Injective", name: "maoINJ.Injective", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_INJ_PLATON_DEV.trim(), icon: "INJ" }]
      : []),
  ],
};

const SECONDARY_WRAPPED_BRIDGE_MSG_EN = "Secondary cross-chain for wrapped tokens is not available yet.";

interface DollarTokenRow {
  symbol: string;
  name: string;
  icon: string;
}

function kmpBuildLps(pattern: string): number[] {
  const m = pattern.length;
  const lps = new Array(m).fill(0);
  let len = 0;
  for (let i = 1; i < m; i++) {
    while (len > 0 && pattern[i] !== pattern[len]) len = lps[len - 1]!;
    if (pattern[i] === pattern[len]) len++;
    lps[i] = len;
  }
  return lps;
}

/** KMP：needle 是否为 haystack 的子串（调用方传入已小写的字符串） */
function kmpContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  if (haystack.length < needle.length) return false;
  const lps = kmpBuildLps(needle);
  let j = 0;
  for (let i = 0; i < haystack.length; i++) {
    while (j > 0 && haystack[i] !== needle[j]) j = lps[j - 1]!;
    if (haystack[i] === needle[j]) j++;
    if (j === needle.length) return true;
  }
  return false;
}

function tokenMatchesDollarQuery(symbol: string, name: string, queryLower: string): boolean {
  if (!queryLower) return true;
  const s = symbol.toLowerCase();
  const n = name.toLowerCase();
  return s.startsWith(queryLower) || n.startsWith(queryLower) || kmpContains(s, queryLower) || kmpContains(n, queryLower);
}

const quickActions: Array<{
  label: string;
  icon: typeof Send;
  color: string;
  description: string;
  comingSoon?: boolean;
  live?: boolean;
}> = [
  { label: "Send", icon: Send, color: "from-[#9945FF] to-[#B45AFF]", description: "", live: true },
  { label: "Bridge", icon: Layers, color: "from-[#B45AFF] to-[#FF4D9E]", description: "", live: true },
  { label: "Stake", icon: TrendingUp, color: "from-[#F68521] to-[#FFB347]", description: "Rewards", comingSoon: true },
];

const BOT_NAME_KEY = "monallo_bot_name";
const BOT_AVATAR_KEY = "monallo_bot_avatar";
const USER_AVATAR_KEY = "monallo_user_avatar";
const ADDRESS_BOOK_KEY = "monallo_address_book";

/** Replace @Nickname (0x...) in message with raw address for API parsing */
function replaceMentionWithAddress(message: string): string {
  return message.replace(/@[^(]*\(\s*(0x[a-fA-F0-9]{40})\s*\)/g, "$1");
}

/** Text after the last "@": if it is a finished "@Name (0x...)" token, hide the mention menu (avoid sticking open after Enter). */
function isCompletedAddressBookMentionSuffix(afterAt: string): boolean {
  return /^\s*[^(]*\(\s*0x[a-fA-F0-9]{40}\s*\)\s*$/i.test(afterAt.trimEnd());
}

/** Address book entry: nickname + address whitelist */
interface AddressBookContact {
  id: string;
  nickname: string;
  address: string;
}

/** 千分位逗号分隔（用于余额、总价值等展示） */
function formatWithCommas(
  value: number | string,
  options?: { minFrac?: number; maxFrac?: number }
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "0";
  const min = options?.minFrac ?? 0;
  const max = options?.maxFrac ?? 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** Canonical key for链比较（避免 "maoPAS" 子串命中 "pas" 误判为 Hub） */
function getCanonicalChainKey(name: string): string {
  if (!name || !name.trim()) return "";
  const n = name.trim().toLowerCase();
  if (n.includes("maoeth") || n.includes("maopas") || n.includes("maoinj")) return "";
  if (n.includes("sepolia")) return "sepolia";
  if (n.includes("injective")) return "injective-testnet";
  if (n.includes("platon")) return "platon-dev";
  if (n.includes("polkadot") || n.includes("hub")) return "polkadot-hub";
  if (/\bpas\b/.test(n)) return "polkadot-hub";
  return n;
}

/**
 * 将 LLM / 用户写的网络名映射到 SUPPORTED_CHAINS。
 * 须优先匹配 AI Pay 各 EVM 测试网（含 PlatON Dev）：否则 "Polkadot Hub" 会先命中数组里更靠前的主网 Polkadot（id polkadot），导致 Testnet 徽标丢失。
 */
function resolveChainFromNetworkLabel(name: string): ChainInfo | undefined {
  const raw = (name || "").trim();
  if (!raw) return undefined;
  const n = raw.toLowerCase();

  const sep = SUPPORTED_CHAINS.find((c) => c.id === "sepolia");
  const hub = SUPPORTED_CHAINS.find((c) => c.id === "polkadot-hub-testnet");
  const inj = SUPPORTED_CHAINS.find((c) => c.id === "injective-testnet");
  const platonDev = SUPPORTED_CHAINS.find((c) => c.id === "platon-dev");

  if (sep && (n.includes("sepolia") || sep.name.toLowerCase() === n)) return sep;
  if (inj && (n.includes("injective") || inj.name.toLowerCase() === n)) return inj;
  if (platonDev && (n.includes("platon") || platonDev.name.toLowerCase() === n)) return platonDev;
  if (hub) {
    const hn = hub.name.toLowerCase();
    if (
      hn === n ||
      raw === hub.name ||
      n.includes("hub") ||
      /\bpas\b/.test(n) ||
      (n.includes("polkadot") && n.includes("hub"))
    ) {
      return hub;
    }
    if (n.includes("polkadot") && !n.includes("sepolia")) return hub;
  }

  return SUPPORTED_CHAINS.find((c) => {
    const cn = c.name.toLowerCase();
    if (raw === c.name || cn === n) return true;
    if (cn.includes(n) || n.includes(cn)) return true;
    if (c.id === n.replace(/\s+/g, "-")) return true;
    return false;
  });
}

/** Send 规则：Hub 仅 PAS；Sepolia 仅 ETH；Injective 仅 INJ；PlatON Dev 仅 LAT。根据 token 推断网络 */
function inferSendNetworkFromToken(token: string): string {
  const t = (token || "").trim().toUpperCase();
  if (t === "PAS") return "Polkadot Hub";
  if (t === "ETH") return "Sepolia";
  if (t === "INJ") return "Injective";
  if (t === "LAT") return "PlatON Dev";
  return "";
}

/** Bridge Lock 时目标链上显示的 wrapped token 名称 */
function getWrappedTokenSymbolForTargetChain(sourceNetwork: string, targetNetwork: string): string {
  const src = (sourceNetwork || "").trim().toLowerCase();
  const tgt = (targetNetwork || "").trim().toLowerCase();
  if (src.includes("sepolia") && (tgt.includes("polkadot") || tgt.includes("hub") || tgt.includes("pas"))) return "maoETH.Sepolia";
  if (src.includes("sepolia") && tgt.includes("injective")) return "maoETH.Sepolia";
  if ((src.includes("polkadot") || src.includes("hub") || src.includes("pas")) && tgt.includes("sepolia")) return "maoPAS.PH";
  if ((src.includes("polkadot") || src.includes("hub") || src.includes("pas")) && tgt.includes("injective")) return "maoPAS.PH";
  if (src.includes("injective") && tgt.includes("sepolia")) return "maoINJ.Injective";
  if (src.includes("injective") && (tgt.includes("polkadot") || tgt.includes("hub") || tgt.includes("pas"))) return "maoINJ.Injective";
  return "";
}

/** 链的原生资产符号（用于 Unlock 时目标链显示） */
function getNativeTokenSymbolForChain(networkName: string): string {
  const n = (networkName || "").trim().toLowerCase();
  if (n.includes("sepolia")) return "ETH";
  if (n.includes("injective")) return "INJ";
  if (n.includes("platon")) return "LAT";
  if (n.includes("polkadot") || n.includes("hub") || n.includes("pas")) return "PAS";
  return "";
}

/** Normalize intent: default source from token (PAS→Hub, ETH→Sepolia, INJ→Injective, LAT→PlatON Dev) 或当前链名；仅当 source ≠ target 时升为 Bridge。 */
function normalizeSendBridgeIntent(
  intent: ParsedIntent,
  currentChainName: string
): ParsedIntent {
  if (intent.action !== "Send" && intent.action !== "Bridge") return intent;
  const rawToken = intent.token || intent.from_token || "";
  const tokenHint = inferSendNetworkFromToken(rawToken);
  let source = (intent.source_network || "").trim() || tokenHint || currentChainName;
  let target = (intent.target_network || "").trim() || (intent.action === "Send" ? tokenHint || source : "");

  // Bridge 且未写目标链：若当前钱包所在链与源链不同且为允许的 lock 边，则把目标定为当前链（便于在 Injective 上说「把 Sepolia ETH 跨过来」）
  if (intent.action === "Bridge" && !target.trim() && currentChainName?.trim()) {
    const sk = getCanonicalChainKey(source);
    const tk = getCanonicalChainKey(currentChainName);
    const tokUp = rawToken.trim().toUpperCase();
    if (sk && tk && sk !== tk && isAllowedBridgeLockMint(sk, tk, tokUp)) {
      target = currentChainName.trim();
    }
  }

  const sourceKey = getCanonicalChainKey(source) || source.toLowerCase();
  const targetKey = getCanonicalChainKey(target) || target.toLowerCase();
  const isDifferentChains = targetKey.length > 0 && sourceKey !== targetKey;
  return {
    ...intent,
    source_network: source,
    target_network: target,
    action: isDifferentChains ? "Bridge" : "Send",
  };
}

function formatAddressShort(addr: string): string {
  if (!addr || !addr.startsWith("0x") || addr.length < 14) return addr;
  return addr.slice(0, 8) + "......" + addr.slice(-6);
}

/** Address as first 4 + last 4 (e.g. 0x1234...5678) for mention dropdown */
function formatAddressFourFour(addr: string): string {
  if (!addr || !addr.startsWith("0x") || addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button type="button" onClick={copy} className={`p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors ${className}`} title="Copy">
      {copied ? <CheckCircle2 className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function BotSettingsModal({
  isOpen,
  onClose,
  name,
  avatar,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  avatar: string;
  onSave: (name: string, avatar: string) => void;
}) {
  const [editName, setEditName] = useState(name);
  const [editAvatarUrl, setEditAvatarUrl] = useState(avatar.startsWith("data:") ? "" : avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setEditName(name);
      setEditAvatarUrl(avatar.startsWith("data:") ? "" : avatar);
    }
  }, [isOpen, name, avatar]);

  const handleSave = () => {
    const finalAvatar = editAvatarUrl.trim() || avatar;
    onSave(editName.trim() || "Monallo", finalAvatar);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onSave(editName.trim() || "Monallo", dataUrl);
      onClose();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currentAvatar = editAvatarUrl.trim() || avatar;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm bg-[#0d0d14] border border-white/10 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Bot Settings</h2>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Monallo"
                  className="w-full px-4 py-3 rounded-2xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 outline-none text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Avatar</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="Image URL"
                    className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 outline-none text-white placeholder-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-2xl bg-[#111] border border-white/10 hover:border-[#9945FF]/40 text-gray-400 hover:text-white transition-colors shrink-0"
                    title="Upload image"
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
                {currentAvatar ? (
                  <div className="mt-3 w-12 h-12 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    <img src={currentAvatar} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-2xl bg-[#111] border border-white/10 hover:border-white/20 text-white text-sm font-medium transition-colors">Cancel</button>
              <button type="button" onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-sm font-medium hover:shadow-lg hover:shadow-[#9945FF]/20 transition-all">Save</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NetworkSelector({ isOpen, onClose, currentChain, onSelect, switchError, onClearSwitchError, onSwitchError }: { isOpen: boolean; onClose: () => void; currentChain: ChainInfo | null; onSelect: (chain: ChainInfo) => void | Promise<void>; switchError?: string | null; onClearSwitchError?: () => void; onSwitchError?: (message: string) => void; }) {
  const displayChains = SUPPORTED_CHAINS.filter((c) => AI_PAY_EVM_SELECTOR_IDS.has(c.id));
  const [switchingChain, setSwitchingChain] = useState<string | null>(null);
  const handleSelect = async (chain: ChainInfo) => {
    if (chain.id === currentChain?.id) { onClose(); return; }
    onClearSwitchError?.();
    setSwitchingChain(chain.id);
    try {
      await onSelect(chain);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to switch network. Approve the switch in your wallet.";
      onSwitchError?.(msg);
    } finally {
      setSwitchingChain(null);
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
              {displayChains.map((chain) => (
                <button key={chain.id} onClick={() => handleSelect(chain)} className={`w-full flex items-center gap-4 p-4 rounded-2xl ${currentChain?.id === chain.id ? "bg-[#9945FF]/20 border-2 border-[#9945FF]" : "bg-white/5"}`}>
                  {chain.logo && chain.logo.startsWith("http") ? (
                    <img src={chain.logo} alt={chain.name} className="w-10 h-10 rounded-full object-contain" />
                  ) : (
                    <span className="w-10 h-10 flex items-center justify-center text-2xl">{chain.icon}</span>
                  )}
                  <div className="text-left flex-1">
                    <div className="font-bold text-white">{chain.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isAiPayTestnetChainId(chain.id) && <span className="text-xs text-orange-400">Testnet</span>}
                      {chain.type === "PVM" && <span className="text-xs text-[#E6007A]">PVM</span>}
                    </div>
                  </div>
                  {currentChain?.id === chain.id && <CheckCircle2 className="w-5 h-5 text-[#9945FF]" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ACTION_STYLES: Record<string, { icon: typeof Send; label: string; gradient: string; bg: string; border: string; shadow: string }> = {
  Send: { icon: Send, label: "Send", gradient: "from-emerald-500 to-teal-500", bg: "bg-emerald-500/15", border: "border-emerald-500/40", shadow: "shadow-emerald-500/20" },
  Swap: { icon: ArrowLeftRight, label: "Swap", gradient: "from-cyan-500 to-blue-500", bg: "bg-cyan-500/15", border: "border-cyan-500/40", shadow: "shadow-cyan-500/20" },
  Bridge: { icon: Layers, label: "Bridge", gradient: "from-[#9945FF] to-[#E6007A]", bg: "bg-[#9945FF]/15", border: "border-[#9945FF]/40", shadow: "shadow-[#9945FF]/25" },
  Stake: { icon: Lock, label: "Stake", gradient: "from-amber-500 to-orange-500", bg: "bg-amber-500/15", border: "border-amber-500/40", shadow: "shadow-amber-500/20" },
};

function ChainCard({ chain, fallbackName, amountToken, side }: { chain: ChainInfo | undefined; fallbackName: string; amountToken?: string; side: "from" | "to" }) {
  const isTestnet = chain ? isAiPayTestnetChainId(chain.id) : false;
  const name = chain?.name ?? fallbackName;
  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
      <div className="flex justify-center mb-2">
        {chain?.logo && chain.logo.startsWith("http") ? (
          <img src={chain.logo} alt="" className="w-10 h-10 rounded-full object-contain ring-2 ring-white/10" />
        ) : (
          <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">{chain?.icon ?? "●"}</span>
        )}
      </div>
      <div className="font-semibold text-white text-sm truncate">{name}</div>
      {isTestnet && <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-medium uppercase tracking-wide">Testnet</span>}
      {amountToken && <div className="mt-2 text-xs text-gray-400 truncate">{amountToken}</div>}
    </div>
  );
}

function ConfirmIntentModal({
  isOpen,
  onClose,
  onCancel,
  intent,
  bridgeType,
  onBridgeTypeChange,
  onConfirm,
  isConfirming,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  intent: ParsedIntent | null;
  bridgeType: "lock-mint" | "polkadot-bridge" | null;
  onBridgeTypeChange: (t: "lock-mint" | "polkadot-bridge") => void;
  onConfirm: () => void | Promise<void>;
  isConfirming: boolean;
}) {
  const handleCancel = () => (onCancel ?? onClose)();
  if (!intent) return null;
  const isBridge = intent.action === "Bridge";
  const actionKey = ["Send", "Bridge", "Stake"].includes(intent.action) ? intent.action : "Send";
  const actionStyle = ACTION_STYLES[actionKey] ?? ACTION_STYLES.Send;
  const ActionIcon = actionStyle.icon;
  const sourceChain = intent.source_network ? resolveChainFromNetworkLabel(intent.source_network) : undefined;
  const targetChain = intent.target_network ? resolveChainFromNetworkLabel(intent.target_network) : undefined;

  const amountLabel = intent.amount && intent.token ? `${intent.amount} ${intent.token}` : intent.amount || intent.token || "";
  const fromToken = intent.from_token || intent.token;
  const toToken = intent.to_token || intent.token;
  const isBridgeUnlock = isBridge && isBridgeUnlockIntent(intent.token || intent.from_token || "");
  const sourceAmount = fromToken && intent.amount ? `${intent.amount} ${fromToken}` : amountLabel;
  const targetAmount: string =
    isBridge
      ? intent.amount
        ? isBridgeUnlock
          ? `${intent.amount} ${getNativeTokenSymbolForChain(intent.target_network || "") || toToken || ""}`
          : `${intent.amount} ${getWrappedTokenSymbolForTargetChain(intent.source_network || "", intent.target_network || "") || toToken || ""}`
        : amountLabel
      : toToken && intent.amount
        ? `${intent.amount} ${toToken}`
        : amountLabel;

  const showFlow = (intent.source_network || intent.target_network) && (isBridge || intent.source_network !== intent.target_network);
  const showSingleNetwork = (intent.source_network || intent.target_network) && !showFlow;
  const singleNetworkName = showSingleNetwork ? (intent.source_network || intent.target_network) : "";
  const singleChain = showSingleNetwork ? resolveChainFromNetworkLabel(singleNetworkName) : undefined;
  /* SEND 时目标网络若为空或与源一致，则用源网络信息补全目标侧 */
  const isSend = intent.action === "Send";
  const effectiveTargetChain = isSend && (!intent.target_network || intent.target_network === intent.source_network) ? sourceChain : targetChain;
  const effectiveTargetName = isSend && (!intent.target_network || intent.target_network === intent.source_network) ? (intent.source_network || "—") : (intent.target_network || "—");
  const detailRows: { label: string; value: string; isAddress?: boolean }[] = [];
  if (intent.receiver) detailRows.push({ label: "Receiver", value: intent.receiver, isAddress: intent.receiver.startsWith("0x") && intent.receiver.length === 42 });
  if (intent.from_token && intent.to_token && intent.from_token !== intent.to_token) detailRows.push({ label: "From → To", value: `${intent.from_token} → ${intent.to_token}` });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={isConfirming ? undefined : onClose} />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.6), 0 0 80px -20px rgba(153,69,255,0.25)" }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#9945FF]/05 to-transparent pointer-events-none" />
            <div className="relative p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white">Confirm</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{amountLabel || "Review and confirm"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 ${actionStyle.border} ${actionStyle.bg} ${actionStyle.shadow} shadow-lg`}>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${actionStyle.gradient}`}>
                      <ActionIcon className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-bold uppercase tracking-wider text-white">{actionStyle.label}</span>
                  </div>
                  <button type="button" onClick={onClose} disabled={isConfirming} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50" aria-label="Close"><X className="h-5 w-5" /></button>
                </div>
              </div>

              {showFlow && (
                <div className="mb-6">
                  <div className="flex items-stretch gap-0">
                    <ChainCard chain={sourceChain} fallbackName={intent.source_network || "—"} amountToken={isBridge ? sourceAmount : undefined} side="from" />
                    <div className="flex flex-col justify-center px-2 sm:px-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#9945FF] to-[#E6007A] shadow-lg">
                        <ArrowRight className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <ChainCard chain={effectiveTargetChain} fallbackName={effectiveTargetName} amountToken={isBridge ? targetAmount : undefined} side="to" />
                  </div>
                </div>
              )}

              {showSingleNetwork && (
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Network</p>
                  <div className="flex items-stretch gap-0">
                    <ChainCard chain={singleChain} fallbackName={singleNetworkName} amountToken={amountLabel || undefined} side="from" />
                    <div className="flex flex-col justify-center px-2 sm:px-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#9945FF] to-[#E6007A] shadow-lg">
                        <ArrowRight className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <ChainCard chain={singleChain} fallbackName={singleNetworkName} amountToken={amountLabel || undefined} side="to" />
                  </div>
                </div>
              )}

              {amountLabel && !showFlow && !showSingleNetwork && (
                <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Amount</p>
                  <p className="text-xl font-semibold text-white">{amountLabel}</p>
                </div>
              )}

              {detailRows.length > 0 && (
                <div className="mb-6 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  {detailRows.map(({ label, value, isAddress }) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-right text-sm font-medium text-white" title={value}>{isAddress ? formatAddressShort(value) : value}</span>
                        <CopyButton text={value} className="shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isBridge && (
                <div className="mb-6">
                  <p className="mb-3 text-xs uppercase tracking-wider text-gray-500">Route</p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onBridgeTypeChange("lock-mint")}
                      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${bridgeType === "lock-mint" ? "border-[#9945FF]/50 bg-[#9945FF]/10 shadow-lg shadow-[#9945FF]/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#9945FF] to-[#B45AFF]">
                        <Layers className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">Monallo Bridge</div>
                        <div className="text-xs text-gray-500">Professional cross-chain service</div>
                      </div>
                      {bridgeType === "lock-mint" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#9945FF]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onBridgeTypeChange("polkadot-bridge")}
                      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${bridgeType === "polkadot-bridge" ? "border-[#E6007A]/50 bg-[#E6007A]/10 shadow-lg shadow-[#E6007A]/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E6007A] to-[#B45AFF]">
                        <Layers className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">Polkadot Bridge</div>
                        <div className="text-xs text-gray-500">Snowbridge / BridgeHub</div>
                      </div>
                      {bridgeType === "polkadot-bridge" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#E6007A]" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={handleCancel} disabled={isConfirming} className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50">Cancel</button>
                <button
                  type="button"
                  onClick={() => onConfirm()}
                  disabled={isConfirming || (isBridge && !bridgeType)}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#9945FF]/25 transition-all hover:shadow-[#9945FF]/35 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function loadAddressBook(): AddressBookContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADDRESS_BOOK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is AddressBookContact => c && typeof c.id === "string" && typeof c.nickname === "string" && typeof c.address === "string");
  } catch {
    return [];
  }
}

function saveAddressBook(list: AddressBookContact[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(list));
}

function AddressBookModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [list, setList] = useState<AddressBookContact[]>([]);
  const [nickname, setNickname] = useState("");
  const [address, setAddress] = useState("");
  const [addError, setAddError] = useState("");
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  useEffect(() => {
    if (isOpen) setList(loadAddressBook());
  }, [isOpen]);

  const handleAdd = () => {
    setAddError("");
    setShowDuplicateModal(false);
    const trimNick = nickname.trim();
    const trimAddr = address.trim();
    if (!trimNick) {
      setAddError("Please enter a nickname");
      return;
    }
    if (!trimAddr) {
      setAddError("Please enter an address");
      return;
    }
    if (!ethers.isAddress(trimAddr)) {
      setAddError("Please enter a valid 0x address");
      return;
    }
    const normalizedAddr = ethers.getAddress(trimAddr);
    const isDuplicate = list.some((c) => ethers.getAddress(c.address) === normalizedAddr);
    if (isDuplicate) {
      setShowDuplicateModal(true);
      return;
    }
    const next: AddressBookContact[] = [...list, { id: Date.now().toString(), nickname: trimNick, address: normalizedAddr }];
    setList(next);
    saveAddressBook(next);
    setNickname("");
    setAddress("");
  };

  const handleDelete = (id: string) => {
    const next = list.filter((c) => c.id !== id);
    setList(next);
    saveAddressBook(next);
  };

  const initial = (name: string) => (name.slice(0, 1) || "?").toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md max-h-[88vh] flex flex-col rounded-3xl overflow-hidden border border-white/10 bg-[#0a0a0f] shadow-2xl"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 60px -15px rgba(153,69,255,0.15)" }}
          >
            {/* Header */}
            <div className="relative shrink-0 px-6 pt-6 pb-5 border-b border-white/5">
              <div className="absolute inset-0 bg-gradient-to-b from-[#9945FF]/08 to-transparent pointer-events-none rounded-t-3xl" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9945FF] to-[#7C3AED] shadow-lg shadow-[#9945FF]/25">
                    <BookUser className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">Address Book</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Nickname & address whitelist</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="p-2.5 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors" aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              {/* Add contact card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#9945FF]/15">
                    <Plus className="h-4 w-4 text-[#9945FF]" />
                  </div>
                  <span className="text-sm font-semibold text-white">Add contact</span>
                </div>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Nickname"
                  className="w-full px-4 py-3 rounded-xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 focus:ring-1 focus:ring-[#9945FF]/20 outline-none text-white placeholder-gray-500 text-sm transition-colors"
                />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 rounded-xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 focus:ring-1 focus:ring-[#9945FF]/20 outline-none text-white placeholder-gray-500 text-sm font-mono transition-colors"
                />
                {addError && <p className="text-sm text-red-400/90">{addError}</p>}
                <button
                  type="button"
                  onClick={handleAdd}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-sm font-semibold text-white shadow-lg shadow-[#9945FF]/20 hover:shadow-[#9945FF]/30 hover:opacity-95 transition-all"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {/* Saved list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Saved</span>
                  {list.length > 0 && <span className="text-xs text-gray-500">{list.length} contact{list.length !== 1 ? "s" : ""}</span>}
                </div>
                {list.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
                      <BookUser className="h-7 w-7 text-gray-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">No contacts yet</p>
                    <p className="text-xs text-gray-500 mt-1 text-center max-w-[200px]">Add a nickname and address above to build your whitelist.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {list.map((c) => (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:border-white/15 hover:bg-white/[0.04] transition-all"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#9945FF]/20 to-[#7C3AED]/20 text-[#B45AFF] font-semibold text-lg">
                          {initial(c.nickname)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-white truncate">{c.nickname}</div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs font-mono text-gray-400 truncate" title={c.address}>{formatAddressShort(c.address)}</span>
                            <CopyButton text={c.address} className="p-1.5 rounded-lg hover:bg-white/10" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="p-2.5 rounded-xl text-gray-400 hover:bg-red-500/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Duplicate address prompt - unified UI */}
            <AnimatePresence>
              {showDuplicateModal && (
                <>
                  <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm rounded-3xl" onClick={() => setShowDuplicateModal(false)} aria-hidden />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none"
                  >
                    <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 shadow-2xl" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 25px 50px -12px rgba(0,0,0,0.5)" }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                          <Shield className="h-5 w-5 text-amber-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Duplicate address</h3>
                      </div>
                      <p className="text-sm text-gray-400 mb-6">This address is already in your address book. You cannot add duplicate addresses.</p>
                      <button
                        type="button"
                        onClick={() => setShowDuplicateModal(false)}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-sm font-semibold text-white shadow-lg shadow-[#9945FF]/20 hover:opacity-95 transition-opacity"
                      >
                        OK
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const HISTORY_PAGE_SIZE = 4;

function HistoryModal({
  isOpen,
  onClose,
  walletAddress,
}: {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
}) {
  const [list, setList] = useState<TransactionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  useEffect(() => {
    if (isOpen && walletAddress?.trim()) setPage(1);
  }, [isOpen, walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    if (!walletAddress?.trim()) {
      setList([]);
      setTotal(0);
      setPage(1);
      return;
    }
    setLoading(true);
    fetch(`/api/transactions?address=${encodeURIComponent(walletAddress.trim())}&page=${page}&limit=${HISTORY_PAGE_SIZE}`)
      .then((res) => (res.ok ? res.json() : { items: [], total: 0 }))
      .then((data: { items?: TransactionRecord[]; total?: number }) => {
        setList(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch(() => { setList([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [isOpen, walletAddress, page]);

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
  };

  const actionColors: Record<string, string> = {
    Send: "from-[#9945FF] to-[#B45AFF]",
    Swap: "from-[#14F195] to-[#00D9FF]",
    Bridge: "from-[#B45AFF] to-[#FF4D9E]",
    Stake: "from-[#F68521] to-[#FFB347]",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-gradient-to-b from-[#0f0f18] to-[#0a0a12] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="shrink-0 flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <History className="w-5 h-5 text-[#9945FF]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Transaction History</h2>
                  <p className="text-xs text-gray-500">Send · Bridge (multi-chain) · Stake</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {!walletAddress?.trim() && (
                <p className="text-sm text-gray-500 text-center py-8">Connect wallet to view history.</p>
              )}
              {walletAddress?.trim() && loading && (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-[#9945FF]" /></div>
              )}
              {walletAddress?.trim() && !loading && list.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">No transactions yet.</p>
              )}
              {walletAddress?.trim() && !loading && list.length > 0 && list.map((tx) => (
                <div key={tx.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-gradient-to-r ${actionColors[tx.action] || "from-gray-500 to-gray-600"}`}>
                      {tx.action}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(tx.created_at)}</span>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    {tx.amount != null && tx.amount !== "" && (
                      <div>Amount: <span className="text-white">{tx.amount} {tx.token || ""}</span></div>
                    )}
                    {tx.receiver != null && tx.receiver !== "" && (
                      <div>To: <span className="font-mono text-white">{formatAddressShort(tx.receiver)}</span>
                        <CopyButton text={tx.receiver} className="inline-flex ml-1 align-middle p-0.5" />
                      </div>
                    )}
                    {(tx.from_token || tx.to_token) && (
                      <div>{tx.from_token && tx.to_token ? `${tx.from_token} → ${tx.to_token}` : (tx.from_token || tx.to_token)}</div>
                    )}
                    {(tx.source_network || tx.target_network) && (
                      <div>{tx.source_network || "—"} → {tx.action === "Send" && (tx.target_network == null || tx.target_network === "") ? (tx.source_network || "—") : (tx.target_network || "—")}</div>
                    )}
                  </div>
                  {tx.tx_hash && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                      {tx.explorer_url ? (
                        <a href={tx.explorer_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-[#9945FF] hover:underline">
                          {formatAddressShort(tx.tx_hash)}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs font-mono text-gray-500">{formatAddressShort(tx.tx_hash)}</span>
                      )}
                      <CopyButton text={tx.tx_hash} className="p-1 rounded" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {walletAddress?.trim() && total > 0 && (
              <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-t border-white/10 bg-[#0a0a12]">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                >
                  Next
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UserSettingsModal({
  isOpen,
  onClose,
  address,
  avatar,
  onSaveAvatar,
}: {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
  avatar: string;
  onSaveAvatar: (avatar: string) => void;
}) {
  const [editAvatarUrl, setEditAvatarUrl] = useState(avatar.startsWith("data:") ? "" : avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setEditAvatarUrl(avatar.startsWith("data:") ? "" : avatar);
  }, [isOpen, avatar]);

  const handleSave = () => {
    onSaveAvatar(editAvatarUrl.trim() || avatar);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      onSaveAvatar(reader.result as string);
      onClose();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currentAvatar = editAvatarUrl.trim() || avatar;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative w-full max-w-sm bg-[#0d0d14] border border-white/10 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">User settings</h2>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              {address && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Wallet address</label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 font-mono text-sm text-white truncate" title={address}>{formatAddressShort(address)}</span>
                    <CopyButton text={address} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Avatar</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="Image URL"
                    className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 outline-none text-white placeholder-gray-500"
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 rounded-2xl bg-[#111] border border-white/10 hover:border-[#9945FF]/40 text-gray-400 hover:text-white shrink-0" title="Upload image">
                    <Upload className="w-5 h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
                {currentAvatar ? (
                  <div className="mt-3 w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    <img src={currentAvatar} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-2xl bg-[#111] border border-white/10 hover:border-white/20 text-white text-sm font-medium">Cancel</button>
              <button type="button" onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-sm font-medium">Save</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
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
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#111] border border-white/10 hover:border-[#9945FF]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="font-medium text-white">MetaMask</span>
                <span className="text-xs text-gray-500">EVM / Polkadot EVM</span>
                {connectingWallet === "metamask" && isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
            {!hasMetaMask && <p className="mt-3 text-sm text-amber-400">Please install the MetaMask browser extension.</p>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AIPayPage() {
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: "Welcome to Monallo AI Pay!", timestamp: 0 }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  /** Bridge 时选择的桥接方式 */
  const [bridgeType, setBridgeType] = useState<"lock-mint" | "polkadot-bridge" | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** 切换网络后丢弃过期的余额请求结果（避免 Hub 请求晚到覆盖 Injective） */
  const chainRef = useRef<ChainInfo | null>(null);
  const balanceFetchGenRef = useRef(0);
  const { address, evmAddress, chain, isConnected, isConnecting, error: walletError, connect, switchChain, disconnect, getEvmInjectedProvider } = useWallet();
  chainRef.current = chain;
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [networkSwitchError, setNetworkSwitchError] = useState<string | null>(null);
  const [showBotSettingsModal, setShowBotSettingsModal] = useState(false);
  const [showAddressBookModal, setShowAddressBookModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showUserSettingsModal, setShowUserSettingsModal] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const walletDropdownRef = useRef<HTMLDivElement>(null);
  const [botName, setBotName] = useState("Monallo");
  const [botAvatarUrl, setBotAvatarUrl] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [dollarSelectedIndex, setDollarSelectedIndex] = useState(0);
  const [mentionDropdownRect, setMentionDropdownRect] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const getTokensForChain = () => { if (!chain) return []; return TOKENS_BY_CHAIN[chain.id] || []; };

  const lastAtIndex = input.lastIndexOf("@");
  const lastDollarIndex = input.lastIndexOf("$");
  const activeInputTrigger: "at" | "dollar" | null =
    lastDollarIndex > lastAtIndex ? "dollar" : lastAtIndex >= 0 ? "at" : null;

  const afterLastAt = lastAtIndex >= 0 ? input.slice(lastAtIndex + 1) : "";
  const atMentionComplete = lastAtIndex >= 0 && isCompletedAddressBookMentionSuffix(afterLastAt);
  const showAtMentionDropdown = activeInputTrigger === "at" && !atMentionComplete;

  const mentionQueryRaw =
    lastAtIndex >= 0 && showAtMentionDropdown ? input.slice(lastAtIndex + 1).match(/^[^\s]*/)?.[0] ?? "" : "";
  const mentionQuery = mentionQueryRaw;
  const mentionList =
    showAtMentionDropdown && typeof window !== "undefined"
      ? loadAddressBook().filter((c) => {
          const q = mentionQuery.trim().toLowerCase();
          if (q.length === 0) return true;
          return c.nickname.trim().toLowerCase().startsWith(q);
        })
      : [];

  const dollarQueryRaw =
    lastDollarIndex >= 0 && activeInputTrigger === "dollar"
      ? input.slice(lastDollarIndex + 1).match(/^[^\s]*/)?.[0] ?? ""
      : "";
  const dollarQueryLower = dollarQueryRaw.toLowerCase();
  const dollarPickerSupported = !!(chain && isAiPayTestnetChainId(chain.id));
  const dollarList: DollarTokenRow[] =
    activeInputTrigger === "dollar" && dollarPickerSupported && chain
      ? (TOKENS_BY_CHAIN[chain.id] ?? [])
          .filter((t) => tokenMatchesDollarQuery(t.symbol, t.name, dollarQueryLower))
          .map((t) => ({ symbol: t.symbol, name: t.name, icon: t.icon }))
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
      : [];

  const showInputAutocompleteDropdown = activeInputTrigger === "dollar" || showAtMentionDropdown;
  const clampedMentionIndex = Math.min(Math.max(0, mentionSelectedIndex), Math.max(0, mentionList.length - 1));
  const clampedDollarIndex = Math.min(Math.max(0, dollarSelectedIndex), Math.max(0, dollarList.length - 1));

  useEffect(() => {
    setMentionSelectedIndex(0);
    setDollarSelectedIndex(0);
  }, [mentionQuery, dollarQueryRaw, activeInputTrigger, chain?.id]);

  useEffect(() => {
    if (!showInputAutocompleteDropdown || !chatInputRef.current) {
      setMentionDropdownRect(null);
      return;
    }
    const updateRect = () => {
      if (!chatInputRef.current) return;
      const rect = chatInputRef.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width * 0.72, 200), 280);
      setMentionDropdownRect({
        bottom: typeof window !== "undefined" ? window.innerHeight - rect.top + 8 : 0,
        left: rect.left,
        width,
      });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [showInputAutocompleteDropdown, input]);

  const handleMentionSelect = (contact: AddressBookContact) => {
    const newInput = input.slice(0, lastAtIndex) + `@${contact.nickname} (${contact.address})`;
    setInput(newInput);
    setMentionSelectedIndex(0);
    setDollarSelectedIndex(0);
    chatInputRef.current?.focus();
  };

  const handleDollarTokenSelect = (row: DollarTokenRow) => {
    const newInput = input.slice(0, lastDollarIndex) + row.symbol;
    setInput(newInput);
    setDollarSelectedIndex(0);
    setMentionSelectedIndex(0);
    chatInputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && showAtMentionDropdown) {
      e.preventDefault();
      setInput(input.slice(0, lastAtIndex));
      setMentionSelectedIndex(0);
      chatInputRef.current?.focus();
      return;
    }
    if (e.key === "Escape" && activeInputTrigger === "dollar") {
      e.preventDefault();
      setInput(input.slice(0, lastDollarIndex));
      setDollarSelectedIndex(0);
      chatInputRef.current?.focus();
      return;
    }
    if (showAtMentionDropdown && mentionList.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((i) => Math.min(i + 1, mentionList.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && mentionList[clampedMentionIndex]) {
        e.preventDefault();
        handleMentionSelect(mentionList[clampedMentionIndex]);
        return;
      }
    }
    if (activeInputTrigger === "dollar" && dollarList.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDollarSelectedIndex((i) => Math.min(i + 1, dollarList.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDollarSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && dollarList[clampedDollarIndex]) {
        e.preventDefault();
        handleDollarTokenSelect(dollarList[clampedDollarIndex]);
        return;
      }
    }
  };

  const fetchBalances = async () => {
    if (!address || !chain) return;
    const gen = ++balanceFetchGenRef.current;
    const snapshotChainId = chain.id;
    const snapshotNumericChainId = chain.chainId;
    setBalancesLoading(true);
    try {
      const tokens = getTokensForChain();
      const symbols = tokens.map((t) => t.symbol);

      const isStale = () =>
        gen !== balanceFetchGenRef.current || chainRef.current?.id !== snapshotChainId || chainRef.current?.chainId !== snapshotNumericChainId;

      if (chain.type === "EVM" && evmAddress) {
        const res = await fetch(`/api/balances?address=${encodeURIComponent(evmAddress)}&chainId=${chain.chainId}`);
        if (!res.ok) throw new Error("Balances API failed");
        const data = (await res.json()) as { list: TokenBalance[]; totalValueUsd: number };
        if (isStale()) return;
        const list = Array.isArray(data.list) ? data.list : [];
        const totalValueUsd = typeof data.totalValueUsd === "number" ? data.totalValueUsd : 0;
        setTokenBalances(list);
        setTotalValueUsd(totalValueUsd);
        if (list.length > 0) setSelectedToken(list[0]);
      } else if (chain.type === "PVM" && tokens.length > 0) {
        const dotBalance = await fetchPolkadotBalance(address);
        const prices = await fetchTokenPrices(["DOT"]);
        if (isStale()) return;
        const dotToken = tokens[0];
        const priceUsd = prices.DOT ?? 0;
        const valueUsd = parseFloat(dotBalance) * priceUsd;
        const list: TokenBalance[] = [{ ...dotToken, balance: dotBalance, priceUsd, valueUsd }];
        setTokenBalances(list);
        setTotalValueUsd(valueUsd);
        if (list.length > 0) setSelectedToken(list[0]);
      } else {
        const prices = await fetchTokenPrices(symbols);
        if (isStale()) return;
        const { list, totalValueUsd: totalUsd } = mergeBalancesWithPrices(
          tokens,
          tokens.map((t) => ({ symbol: t.symbol, balance: "0", decimals: t.decimals })),
          prices
        );
        setTokenBalances(list);
        setTotalValueUsd(totalUsd);
        if (list.length > 0) setSelectedToken(list[0]);
      }
    } catch (e) {
      console.error("fetchBalances failed", e);
      if (gen === balanceFetchGenRef.current && chainRef.current?.id === snapshotChainId) {
        setTotalValueUsd(0);
      }
    } finally {
      if (gen === balanceFetchGenRef.current) setBalancesLoading(false);
    }
  };

  // 切换网络时立即同步 Your Balance 的 token 列表、图标、选中项
  useEffect(() => {
    if (!chain) return;
    const tokens = getTokensForChain().map((t) => ({ ...t, balance: "0" }));
    setTokenBalances(tokens);
    setSelectedToken(tokens[0] || null);
    setTotalValueUsd(0);
  }, [chain?.id]);

  useEffect(() => { if (isConnected && address && chain) fetchBalances(); }, [isConnected, address, chain?.id, chain?.type === "EVM" ? evmAddress : null]);

  // 聊天记录严格对应用户地址：切换地址或断开时清空对话，避免 B 地址看到 A 地址的聊天
  useEffect(() => {
    setMessages([{ id: "welcome", role: "assistant", content: "Welcome to Monallo AI Pay!", timestamp: 0 }]);
    setPendingIntent(null);
    setShowConfirmModal(false);
    setBridgeType(null);
  }, [address]);

  // Your balance：ETH / PAS(DOT) / INJ / LAT 及 mao* 价格每 5 秒从 OKX 刷新（await 后校验链，避免旧定时器把 Hub 行项目刷回界面）
  useEffect(() => {
    if (!isConnected || !chain || tokenBalances.length === 0) return;
    const chainIdSnapshot = chain.id;
    const tick = async () => {
      const prices = await fetchOkxPrices();
      if (chainRef.current?.id !== chainIdSnapshot) return;
      setTokenBalances((prev) => {
        if (chainRef.current?.id !== chainIdSnapshot) return prev;
        let total = 0;
        const next = prev.map((t) => {
          const price = getOkxPriceForSymbol(t.symbol, prices);
          const valueUsd = price > 0 ? parseFloat(t.balance) * price : (t.valueUsd ?? 0);
          total += valueUsd;
          return price > 0 ? { ...t, priceUsd: price, valueUsd } : t;
        });
        setTotalValueUsd(total);
        return next;
      });
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => clearInterval(id);
  }, [isConnected, chain?.id, tokenBalances.length]);

  useEffect(() => {
    if (!address?.trim()) return;
    fetch(`/api/transactions?address=${encodeURIComponent(address.trim())}&page=1&limit=1`)
      .then((res) => (res.ok ? res.json() : { total: 0 }))
      .then((data: { total?: number; items?: unknown[] }) => setTxCount(typeof data.total === "number" ? data.total : 0))
      .catch(() => setTxCount(0));
  }, [address]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  // 连接成功后自动关闭 Connect Wallet 弹窗
  useEffect(() => {
    if (isConnected && showWalletModal) {
      setShowWalletModal(false);
      setConnectingWallet(null);
    }
  }, [isConnected, showWalletModal]);

  // 仅在客户端从 localStorage 恢复 bot 名称/头像、用户头像，避免 SSR 水合不一致
  useEffect(() => {
    const name = localStorage.getItem(BOT_NAME_KEY);
    const avatar = localStorage.getItem(BOT_AVATAR_KEY);
    const userAvatar = localStorage.getItem(USER_AVATAR_KEY);
    if (name) setBotName(name);
    if (avatar) setBotAvatarUrl(avatar);
    if (userAvatar) setUserAvatarUrl(userAvatar);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target as Node)) setShowWalletDropdown(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleBotSettingsSave = (name: string, avatar: string) => {
    setBotName(name);
    setBotAvatarUrl(avatar);
    if (typeof window !== "undefined") {
      localStorage.setItem(BOT_NAME_KEY, name);
      localStorage.setItem(BOT_AVATAR_KEY, avatar);
    }
  };

  const handleUserAvatarSave = (avatar: string) => {
    setUserAvatarUrl(avatar);
    if (typeof window !== "undefined") localStorage.setItem(USER_AVATAR_KEY, avatar);
  };

  /** Local fallback when API returns 502 / MiniMax unavailable */
  const parseIntentLocal = (text: string): ParsedIntent => {
    const l = text.toLowerCase();
    const empty: ParsedIntent = { action: "Unknown", sender: "", receiver: "", amount: "", token: "", source_network: "", target_network: "", from_token: "", to_token: "" };
    const amt = text.match(/(\d+\.?\d*)\s*(?:eth|usdt|dot|pas|inj|lat| Dai)?/i)?.[1] ?? "";
    const addr = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? "";
    let token: string;
    if (l.includes("dot")) token = "DOT";
    else if (l.includes("maoeth") || l.includes("mao eth")) token = "maoETH.Sepolia";
    else if (l.includes("maopas") || l.includes("mao pas")) token = "maoPAS.PH";
    else if (l.includes("maoinj") || l.includes("mao inj")) token = "maoINJ.Injective";
    else if (/\blat\b/.test(l) || l.includes("platon")) token = "LAT";
    else if (l.includes("pas")) token = "PAS";
    else if (l.includes("inj")) token = "INJ";
    else if (l.includes("usdt")) token = "USDT";
    else if (l.includes("dai")) token = "DAI";
    else token = "ETH";
    if (l.includes("send") || l.includes("transfer") || l.includes("转")) {
      const network =
        token === "PAS"
          ? "Polkadot Hub"
          : token === "ETH"
            ? "Sepolia"
            : token === "INJ"
              ? "Injective"
              : token === "LAT"
                ? "PlatON Dev"
                : "";
      return { ...empty, action: "Send", amount: amt, token, receiver: addr, source_network: network, target_network: network };
    }
    if (l.includes("swap") || l.includes("换") || l.includes("exchange")) {
      return { ...empty, action: "Unknown" };
    }
    if (l.includes("bridge") || l.includes("跨链")) {
      let src = "";
      let tgt = "";

      if (/\bfrom\s+sepolia\b|从\s*sepolia/i.test(text)) src = "Sepolia";
      else if (/\bfrom\s+(polkadot|hub)\b|从\s*(polkadot|hub)/i.test(text)) src = "Polkadot Hub";
      else if (/\bfrom\s+injective\b|从\s*injective/i.test(text)) src = "Injective";

      if (/\bto\s+injective\b|到\s*injective|至\s*injective/i.test(text)) tgt = "Injective";
      else if (/\bto\s+sepolia\b|到\s*sepolia/i.test(text)) tgt = "Sepolia";
      else if (/\bto\s+(polkadot|hub)\b|到\s*(polkadot|hub)/i.test(text)) tgt = "Polkadot Hub";

      if (!src) {
        if (l.includes("sepolia")) src = "Sepolia";
        else if (l.includes("polkadot") || l.includes("hub")) src = "Polkadot Hub";
        else if (l.includes("injective")) src = "Injective";
      }

      const tokUp = token.toUpperCase();
      if (!src && tgt) {
        if (tokUp === "ETH" && tgt === "Injective") src = "Sepolia";
        if (tokUp === "ETH" && tgt === "Polkadot Hub") src = "Sepolia";
        if (tokUp === "PAS" && tgt === "Injective") src = "Polkadot Hub";
        if (tokUp === "PAS" && tgt === "Sepolia") src = "Polkadot Hub";
        if (tokUp === "INJ" && tgt === "Sepolia") src = "Injective";
        if (tokUp === "INJ" && tgt === "Polkadot Hub") src = "Injective";
      }
      if (src && !tgt) {
        if (tokUp === "ETH" && src === "Sepolia") {
          if (l.includes("injective")) tgt = "Injective";
          else if (l.includes("polkadot") || l.includes("hub")) tgt = "Polkadot Hub";
        } else if (tokUp === "PAS" && src === "Polkadot Hub") {
          if (l.includes("injective")) tgt = "Injective";
          else if (l.includes("sepolia")) tgt = "Sepolia";
        } else if (tokUp === "INJ" && src === "Injective") {
          if (l.includes("sepolia")) tgt = "Sepolia";
          else if (l.includes("polkadot") || l.includes("hub")) tgt = "Polkadot Hub";
        } else if (token === "maoETH.Sepolia" && tgt === "") {
          if (l.includes("sepolia")) tgt = "Sepolia";
        } else if (token === "maoPAS.PH" && tgt === "") {
          if (l.includes("polkadot") || l.includes("hub")) tgt = "Polkadot Hub";
        } else if (token === "maoINJ.Injective" && tgt === "") {
          if (l.includes("injective")) tgt = "Injective";
        }
      }

      if (!src && tgt === "Sepolia" && token === "maoETH.Sepolia") {
        if (l.includes("injective")) src = "Injective";
        else if (l.includes("polkadot") || l.includes("hub")) src = "Polkadot Hub";
      }
      if (!src && tgt === "Polkadot Hub" && token === "maoPAS.PH") {
        if (l.includes("injective")) src = "Injective";
        else if (l.includes("sepolia")) src = "Sepolia";
      }
      if (!src && tgt === "Injective" && token === "maoINJ.Injective") {
        if (l.includes("sepolia")) src = "Sepolia";
        else if (l.includes("polkadot") || l.includes("hub")) src = "Polkadot Hub";
      }

      if (src === "Sepolia" && !tgt && tokUp === "ETH" && !l.includes("injective")) tgt = "Polkadot Hub";
      if (src === "Polkadot Hub" && !tgt && tokUp === "PAS" && !l.includes("injective")) tgt = "Sepolia";

      return { ...empty, action: "Bridge", amount: amt, token, source_network: src, target_network: tgt, receiver: addr };
    }
    if (l.includes("stake") || l.includes("质押")) {
      return { ...empty, action: "Stake", amount: amt, token: token };
    }
    return empty;
  };

  /** API Unknown / 本地 Unknown 时：是否为不开放的 wrapped 二次跨链，统一英文提示 */
  const isWrappedSecondaryBridgeDisallowedReply = (text: string): boolean => {
    const intent = parseIntentLocal(text);
    if (intent.action !== "Bridge") return false;
    const bridgeTokRaw = (intent.token || "").trim();
    if (!normalizeWrappedKindFromToken(bridgeTokRaw)) return false;
    const sk = getCanonicalChainKey(intent.source_network || "");
    const tk = getCanonicalChainKey(intent.target_network || "");
    if (!sk || !tk) return /\bmao/i.test(text);
    if (sk === tk) return false;
    const bridgeTokUpper = bridgeTokRaw.toUpperCase();
    if (isForbiddenWrappedWrappedBridge(sk, tk, bridgeTokRaw)) return true;
    if (isAllowedBridgeUnlock(sk, tk, bridgeTokRaw)) return false;
    if (isAllowedBridgeLockMint(sk, tk, bridgeTokUpper)) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected) return;
    const rawContent = input.trim();
    const contentForApi = replaceMentionWithAddress(rawContent);
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: rawContent, timestamp: Date.now() };
    const parsingId = `parsing-${Date.now()}`;
    const parsingMsg: Message = { id: parsingId, role: "assistant", content: "Using AI to parse your intent...", timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg, parsingMsg]);
    setInput("");
    setIsLoading(true);

    const removeParsingAndAppend = (content: string, intent?: ParsedIntent) => {
      setMessages(prev => prev.filter(m => m.id !== parsingId));
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content, timestamp: Date.now(), intent }]);
    };

    let res: Response | null = null;
    let data: Record<string, unknown> = {};
    try {
      res = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: contentForApi }),
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      res = null;
    }

    try {
      let intent: ParsedIntent;
      if (!res || !res.ok) {
        intent = parseIntentLocal(contentForApi);
        if (intent.action === "Unknown") {
          if (isWrappedSecondaryBridgeDisallowedReply(contentForApi)) {
            removeParsingAndAppend(SECONDARY_WRAPPED_BRIDGE_MSG_EN);
            return;
          }
          const errMsg = (res && typeof data.error === "string") ? data.error : "Network or service error. Please try again. Examples: \"Send 0.01 LAT to 0x...\", \"Send 0.01 INJ to 0x...\", \"Bridge 0.1 ETH to Injective\", \"Bridge 0.01 INJ to Sepolia\".";
          removeParsingAndAppend(errMsg);
          return;
        }
        const normalizedLocal = normalizeSendBridgeIntent(intent, chain?.name || "");
        removeParsingAndAppend("AI parsing is unavailable; used local rules instead. Please confirm in the dialog below.", normalizedLocal);
        setPendingIntent(normalizedLocal);
        if (normalizedLocal.action === "Bridge") setBridgeType("lock-mint");
        setShowConfirmModal(true);
      } else {
        intent = data as unknown as ParsedIntent;
        const usage = (data as { usage?: { total_tokens?: number } }).usage;
        const walletAddr = (evmAddress || address || "").trim();
        if (usage?.total_tokens && walletAddr) {
          fetch("/api/store/consumption", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wallet_address: walletAddr,
              model_name: "MiniMax M2.5",
              tokens_consumed: usage.total_tokens,
            }),
          }).catch(() => {});
        }
        if (intent.action === "Unknown" || !intent.action) {
          if (isWrappedSecondaryBridgeDisallowedReply(contentForApi)) {
            removeParsingAndAppend(SECONDARY_WRAPPED_BRIDGE_MSG_EN);
            return;
          }
          removeParsingAndAppend("No DeFi action recognized (Send / Bridge / Stake). Examples: \"Send 0.01 LAT to 0x...\", \"Bridge 0.1 ETH to Injective\", \"Bridge 0.01 PAS to Injective\", \"Bridge 0.02 INJ to Sepolia\". Swap coming soon.");
          return;
        }
        const summary = `${intent.action}${intent.amount ? ` ${intent.amount} ${intent.token || intent.from_token || ""}` : ""}${intent.receiver ? ` → ${intent.receiver.slice(0, 10)}...` : ""}`;
        const normalized = normalizeSendBridgeIntent(intent, chain?.name || "");
        removeParsingAndAppend(`Parsed by AI: ${summary}. Please confirm in the dialog below.`, normalized);
        setPendingIntent(normalized);
        if (normalized.action === "Bridge") setBridgeType("lock-mint");
        setShowConfirmModal(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmIntent = async () => {
    if (!pendingIntent || !address) return;
    if (pendingIntent.action === "Swap") {
      setShowConfirmModal(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Swap Coming Soon.", timestamp: Date.now() }]);
      setPendingIntent(null);
      return;
    }
    setShowConfirmModal(false);
    setIsConfirming(true);

    const isSend = pendingIntent.action === "Send";
    const isBridge = pendingIntent.action === "Bridge";
    const parsedReceiver = (pendingIntent.receiver || "").trim();
    const amount = (pendingIntent.amount || "").trim();
    const selfAddress = (evmAddress || address || "").trim();
    const receiver = parsedReceiver && ethers.isAddress(parsedReceiver) ? parsedReceiver : (selfAddress && ethers.isAddress(selfAddress) ? selfAddress : "");
    const hasValidReceiver = !!receiver;
    const hasValidAmount = amount && !Number.isNaN(Number(amount)) && Number(amount) > 0;

    if ((isSend || isBridge) && !hasValidReceiver) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Invalid or missing receiver address (need 0x...).", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }
    if ((isSend || isBridge) && !hasValidAmount) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Invalid or missing amount.", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }
    let sendToken = (pendingIntent.token || pendingIntent.from_token || "").toUpperCase();
    if (isSend && !sendToken) {
      const netHint = (pendingIntent.source_network || pendingIntent.target_network || chain?.name || "").trim();
      const k = getCanonicalChainKey(netHint);
      if (k === "sepolia") sendToken = "ETH";
      else if (k === "polkadot-hub") sendToken = "PAS";
      else if (k === "injective-testnet") sendToken = "INJ";
      else if (k === "platon-dev") sendToken = "LAT";
    }
    const sendSupportedChains =
      sendToken === "ETH"
        ? SUPPORTED_CHAINS.filter((c) => c.id === "sepolia")
        : sendToken === "PAS"
          ? SUPPORTED_CHAINS.filter((c) => c.id === "polkadot-hub-testnet")
          : sendToken === "INJ"
            ? SUPPORTED_CHAINS.filter((c) => c.id === "injective-testnet")
            : sendToken === "LAT"
              ? SUPPORTED_CHAINS.filter((c) => c.id === "platon-dev")
              : [];
    if (isSend && sendToken !== "ETH" && sendToken !== "PAS" && sendToken !== "INJ" && sendToken !== "LAT") {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Send is only supported for ETH (Sepolia), PAS (Polkadot Hub), INJ (Injective Testnet), and LAT (PlatON Dev).", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }
    const targetChainForSend = sendSupportedChains[0] ?? null;

    // Bridge (Monallo lock-mint): 三链 + 规则见 lib/bridgeRules.ts
    const bridgeSourceKey = getCanonicalChainKey(pendingIntent.source_network || "");
    const bridgeTargetKey = getCanonicalChainKey(pendingIntent.target_network || "");
    const bridgeSourceChain =
      bridgeSourceKey === "sepolia"
        ? SUPPORTED_CHAINS.find((c) => c.id === "sepolia")
        : bridgeSourceKey === "polkadot-hub"
          ? SUPPORTED_CHAINS.find((c) => c.id === "polkadot-hub-testnet")
          : bridgeSourceKey === "injective-testnet"
            ? SUPPORTED_CHAINS.find((c) => c.id === "injective-testnet")
            : null;
    const bridgeTargetChain =
      bridgeTargetKey === "sepolia"
        ? SUPPORTED_CHAINS.find((c) => c.id === "sepolia")
        : bridgeTargetKey === "polkadot-hub"
          ? SUPPORTED_CHAINS.find((c) => c.id === "polkadot-hub-testnet")
          : bridgeTargetKey === "injective-testnet"
            ? SUPPORTED_CHAINS.find((c) => c.id === "injective-testnet")
            : null;
    const isBridgeLockMint = isBridge && bridgeType === "lock-mint" && bridgeSourceChain && bridgeTargetChain && bridgeSourceChain.chainId !== bridgeTargetChain.chainId;

    if (isBridge && bridgeType === "lock-mint" && (!bridgeSourceChain || !bridgeTargetChain || bridgeSourceChain.chainId === bridgeTargetChain.chainId)) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Monallo Bridge requires two distinct chains among Sepolia, Polkadot Hub, and Injective Testnet.", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }

    const bridgeTokRaw = (pendingIntent.token || pendingIntent.from_token || "").trim();
    const bridgeTokUpper = bridgeTokRaw.toUpperCase();
    if (isBridge && bridgeType === "lock-mint" && normalizeWrappedKindFromToken(bridgeTokRaw)) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ For deposits, use native assets on the source chain (Sepolia ETH, Hub PAS, Injective INJ), not wrapped (mao*) tokens.", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }
    if (isBridge && bridgeType === "lock-mint" && bridgeSourceChain && bridgeTargetChain && !isAllowedBridgeLockMint(bridgeSourceKey, bridgeTargetKey, bridgeTokUpper)) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: `❌ ${BRIDGE_DIRECTION_CLOSED_MSG}`, timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }

    const isBridgeUnlockMonallo =
      isBridge && bridgeType === "lock-mint" && isBridgeUnlockIntent(pendingIntent.token || pendingIntent.from_token || "");
    if (isBridgeUnlockMonallo) {
      if (!bridgeSourceChain || !bridgeTargetChain || bridgeSourceChain.chainId === bridgeTargetChain.chainId) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Specify a valid source and destination for this unlock (must be an allowed two-chain pair).", timestamp: Date.now() }]);
        setPendingIntent(null);
        setIsConfirming(false);
        return;
      }
      if (isForbiddenWrappedWrappedBridge(bridgeSourceKey, bridgeTargetKey, bridgeTokRaw) || !isAllowedBridgeUnlock(bridgeSourceKey, bridgeTargetKey, bridgeTokRaw)) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: `❌ ${BRIDGE_DIRECTION_CLOSED_MSG}`, timestamp: Date.now() }]);
        setPendingIntent(null);
        setIsConfirming(false);
        return;
      }
    }

    setMessages(prev => [...prev, { id: Date.now().toString(), role: "system", content: "Processing...", timestamp: Date.now(), status: "pending" }]);

    const evmForTx = typeof window !== "undefined" ? getEvmInjectedProvider() : null;
    try {
      if (isSend && targetChainForSend && hasValidReceiver && hasValidAmount && chain?.type === "EVM" && evmForTx) {
        if (chain.id !== targetChainForSend.id) {
          await switchChain(targetChainForSend.chainId);
        }
        const tokensForTarget = TOKENS_BY_CHAIN[targetChainForSend.id] ?? [];
        const tokenInfo: TokenBalance | undefined = tokensForTarget.find((t: TokenBalance) => t.symbol.toUpperCase() === sendToken) ?? tokensForTarget[0];
        if (!tokenInfo) {
          throw new Error("No token found for this network");
        }
        const { hash: txHash } = await sendViaWallet(evmForTx, {
          chainId: targetChainForSend.chainId,
          to: receiver,
          amount,
          tokenSymbol: tokenInfo.symbol,
          tokenContract: tokenInfo.contract,
          decimals: tokenInfo.decimals,
        });
        const explorerUrl = targetChainForSend.explorer ? `${targetChainForSend.explorer}/tx/${txHash}` : undefined;
        const receiptSymbol = (pendingIntent.token || pendingIntent.from_token || tokenInfo.symbol || sendToken || "ETH").trim();
        const receiptText = `Sent ${pendingIntent.amount} ${receiptSymbol} to ${formatAddressShort(receiver)} ✓`;
        setMessages(prev => prev.map(m => {
          if (m.status === "pending") return { ...m, content: receiptText, intentConfirmed: true, intent: pendingIntent, txHash, explorerUrl, status: undefined };
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, intentConfirmed: true };
          return m;
        }));
        setTxCount(c => c + 1);
        await fetchBalances();
        const priceToken: string = (pendingIntent.token || pendingIntent.from_token || tokenInfo?.symbol || sendToken || "ETH").trim();
        const sendPrices = await fetchTokenPrices([priceToken]);
        const sendAmountUsd = parseFloat(pendingIntent.amount || "0") * (sendPrices[priceToken] ?? 0);
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, explorerUrl, sendAmountUsd);
      } else if (isBridgeUnlockMonallo && bridgeSourceChain && bridgeTargetChain && evmForTx) {
        if (chain?.id !== bridgeSourceChain.id) {
          await switchChain(bridgeSourceChain.chainId);
        }
        const tokensOnSource = TOKENS_BY_CHAIN[bridgeSourceChain.id] ?? [];
        const wrappedTokenInfo = tokensOnSource.find(
          (t) => t.symbol === "maoPAS.PH" || t.symbol === "maoETH.Sepolia" || t.symbol === "maoINJ.Injective"
        );
        const wrappedAddr = wrappedTokenInfo?.contract ?? getWrappedTokenAddressForUnlock(bridgeSourceChain.chainId, bridgeTargetChain.chainId);
        if (!wrappedAddr || !ethers.isAddress(wrappedAddr)) {
          throw new Error(
            "Wrapped token address is not configured for this direction. Check NEXT_PUBLIC_WRAPPED_* and the destination_source matrix in lib/bridge."
          );
        }
        const { hash: txHash } = await unlockViaBridge({
          ethereum: evmForTx,
          sourceChainId: bridgeSourceChain.chainId,
          wrappedTokenAddress: wrappedAddr,
          recipient: receiver,
          destinationChainId: bridgeTargetChain.chainId,
          amount,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: bridgeSourceChain.chainId, sourceTxHash: txHash }) }).catch(() => {});
        const explorerUrl = bridgeSourceChain.explorer ? `${bridgeSourceChain.explorer}/tx/${txHash}` : undefined;
        const receiptText = `Unlocked ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || ""} → ${bridgeTargetChain.name}. Waiting for relay. ✓`;
        setMessages(prev => prev.map(m => {
          if (m.status === "pending") return { ...m, content: receiptText, intentConfirmed: true, intent: pendingIntent, txHash, explorerUrl, bridgeSourceLabel: "Unlock", bridgeDestLabel: "Release", status: undefined };
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, intentConfirmed: true };
          return m;
        }));
        pollBridgeStatusAndUpdateMessage(txHash, bridgeSourceChain.chainId, bridgeTargetChain.explorer ?? "", "Unlock", "Release");
        setTxCount(c => c + 1);
        await fetchBalances();
        const unlockToken = (pendingIntent.token || pendingIntent.from_token || "ETH").trim();
        const unlockPrices = await fetchTokenPrices([unlockToken]);
        const unlockAmountUsd = parseFloat(pendingIntent.amount || "0") * (unlockPrices[unlockToken] ?? 0);
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, explorerUrl, unlockAmountUsd);
      } else if (isBridgeLockMint && evmForTx) {
        if (chain?.id !== bridgeSourceChain!.id) {
          await switchChain(bridgeSourceChain!.chainId);
        }
        const lockAddress = getBridgeLockAddress(bridgeSourceChain!.chainId);
        if (!lockAddress) {
          throw new Error(
            "Bridge lock is not configured: set NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA, NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB, NEXT_PUBLIC_BRIDGE_LOCK_INJECTIVE (or BRIDGE_LOCK_INJECTIVE)."
          );
        }
        const { hash: txHash } = await lockViaBridge({
          ethereum: evmForTx,
          sourceChainId: bridgeSourceChain!.chainId,
          lockContractAddress: lockAddress,
          recipient: receiver,
          destinationChainId: bridgeTargetChain!.chainId,
          amount,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: bridgeSourceChain!.chainId, sourceTxHash: txHash }) }).catch(() => {});
        const explorerUrl = bridgeSourceChain!.explorer ? `${bridgeSourceChain!.explorer}/tx/${txHash}` : undefined;
        const receiptText = `Locked ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || "ETH"} → ${bridgeTargetChain!.name}. Waiting for relay. ✓`;
        setMessages(prev => prev.map(m => {
          if (m.status === "pending") return { ...m, content: receiptText, intentConfirmed: true, intent: pendingIntent, txHash, explorerUrl, bridgeSourceLabel: "Lock", bridgeDestLabel: "Mint", status: undefined };
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, intentConfirmed: true };
          return m;
        }));
        pollBridgeStatusAndUpdateMessage(txHash, bridgeSourceChain!.chainId, bridgeTargetChain!.explorer ?? "", "Lock", "Mint");
        setTxCount(c => c + 1);
        await fetchBalances();
        const lockToken = (pendingIntent.token || pendingIntent.from_token || "ETH").trim();
        const lockPrices = await fetchTokenPrices([lockToken]);
        const lockAmountUsd = parseFloat(pendingIntent.amount || "0") * (lockPrices[lockToken] ?? 0);
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, explorerUrl, lockAmountUsd);
      } else {
        await new Promise(r => setTimeout(r, 1500));
        const txHash = "0x" + Math.random().toString(16).slice(2, 66);
        const receiptTextMock = `Sent ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || "ETH"} to ${formatAddressShort(receiver)} ✓`;
        setMessages(prev => prev.map(m => {
          if (m.status === "pending") return { ...m, content: receiptTextMock, intentConfirmed: true, intent: pendingIntent, txHash, status: undefined };
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, intentConfirmed: true };
          return m;
        }));
        setTxCount(c => c + 1);
        await fetchBalances();
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, undefined, null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(m => m.status === "pending" ? { ...m, content: "❌ Failed: " + msg, status: "error" as const } : m));
    }
    setPendingIntent(null);
    setIsConfirming(false);
  };

  const pollBridgeStatusAndUpdateMessage = (
    sourceTxHash: string,
    sourceChainId: number,
    destinationExplorerBase: string,
    sourceLabel: string,
    destLabel: string
  ) => {
    let attempts = 0;
    const maxAttempts = 90;
    const reTriggerAtAttempts = [3, 8, 15, 25, 40];
    const id = setInterval(async () => {
      attempts++;
      try {
        if (reTriggerAtAttempts.includes(attempts)) {
          fetch("/api/bridge/trigger-relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceChainId, sourceTxHash }),
          }).catch(() => {});
        }
        const res = await fetch(
          `/api/bridge/status?sourceChainId=${sourceChainId}&sourceTxHash=${encodeURIComponent(sourceTxHash)}`
        );
        const data = (await res.json()) as { status?: string; destinationTxHash?: string };
        if (data.status === "relayed" && data.destinationTxHash) {
          clearInterval(id);
          const destinationExplorerUrl = destinationExplorerBase
            ? `${destinationExplorerBase.replace(/\/$/, "")}/tx/${data.destinationTxHash}`
            : undefined;
          setMessages(prev =>
            prev.map(m =>
              m.txHash === sourceTxHash
                ? { ...m, destinationTxHash: data.destinationTxHash, destinationExplorerUrl, bridgeSourceLabel: sourceLabel, bridgeDestLabel: destLabel }
                : m
            )
          );
        }
      } catch (_) {}
      if (attempts >= maxAttempts) clearInterval(id);
    }, 2000);
  };

  const saveTransaction = (intent: ParsedIntent, txHash: string, explorerUrl: string | undefined, amountUsd?: number | null) => {
    if (!address || !["Send", "Swap", "Bridge", "Stake"].includes(intent.action)) return;
    const isSend = intent.action === "Send";
    const effectiveTargetNetwork = isSend && (!intent.target_network || intent.target_network === intent.source_network) ? (intent.source_network || null) : (intent.target_network || null);
    fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: address,
        action: intent.action,
        tx_hash: txHash,
        explorer_url: explorerUrl ?? null,
        amount: intent.amount || null,
        token: intent.token || null,
        receiver: intent.receiver || null,
        source_network: intent.source_network || null,
        target_network: effectiveTargetNetwork,
        from_token: intent.from_token || null,
        to_token: intent.to_token || null,
        amount_usd: amountUsd != null && Number.isFinite(amountUsd) ? amountUsd : null,
      }),
    }).catch(() => {});
  };

  const handleConfirmModalCancel = () => {
    const snap = pendingIntent;
    setShowConfirmModal(false);
    setBridgeType(null);
    if (snap) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role !== "assistant" || !m.intent || m.intentConfirmed || m.intentCancelled) return m;
          return intentsEqual(m.intent, snap) ? { ...m, intentCancelled: true } : m;
        })
      );
    }
    setPendingIntent(null);
  };

  const handleQuickAction = (action: string) => {
    if (!isConnected) { setShowWalletModal(true); return; }
    const primary =
      chain?.id === "polkadot-hub-testnet"
        ? "PAS"
        : chain?.id === "injective-testnet"
          ? "INJ"
          : chain?.id === "platon-dev"
            ? "LAT"
            : "ETH";
    const p: Record<string, string> = {
      Send: `Send 0.001 ${primary} to 0x`,
      Bridge:
        primary === "ETH"
          ? "Bridge 0.1 ETH to Polkadot Hub"
          : primary === "INJ"
            ? "Bridge 0.01 INJ to Sepolia"
            : primary === "LAT"
              ? "Bridge 0.01 LAT to Sepolia"
              : "Bridge 0.1 PAS to Sepolia",
      Stake: `Stake 1 ${primary}`,
    };
    setInput(p[action] || "");
  };

  return (
    <div className="min-h-screen bg-[#06060a]">
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={async (wallet) => {
          setConnectingWallet(wallet);
          try {
            await connect(wallet);
          } catch (e) {
            console.warn("Wallet connect error", e);
          } finally {
            setConnectingWallet(null);
          }
        }}
        isConnecting={isConnecting}
        error={walletError}
        connectingWallet={connectingWallet}
      />
      <NetworkSelector isOpen={showNetworkSelector} onClose={() => { setShowNetworkSelector(false); setNetworkSwitchError(null); }} currentChain={chain} onSelect={async c => { if (c.chainId !== chain?.chainId) await switchChain(c.chainId); }} switchError={networkSwitchError} onClearSwitchError={() => setNetworkSwitchError(null)} onSwitchError={setNetworkSwitchError} />
      <BotSettingsModal isOpen={showBotSettingsModal} onClose={() => setShowBotSettingsModal(false)} name={botName} avatar={botAvatarUrl} onSave={handleBotSettingsSave} />
      <AddressBookModal isOpen={showAddressBookModal} onClose={() => setShowAddressBookModal(false)} />
      <ConfirmIntentModal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} onCancel={handleConfirmModalCancel} intent={pendingIntent} bridgeType={bridgeType} onBridgeTypeChange={setBridgeType} onConfirm={handleConfirmIntent} isConfirming={isConfirming} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} walletAddress={address} />
      <UserSettingsModal isOpen={showUserSettingsModal} onClose={() => setShowUserSettingsModal(false)} address={address} avatar={userAvatarUrl} onSaveAvatar={handleUserAvatarSave} />
      <header className="sticky top-0 z-50 bg-[#06060a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChevronLeft className="w-5 h-5 text-gray-500" />
            <img src="/logo.png" className="h-10" />
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowNetworkSelector(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              {chain ? (<>{chain.logo && chain.logo.startsWith("http") ? <img src={chain.logo} alt="" className="w-5 h-5 rounded-full" /> : <span className="w-5 h-5 flex items-center justify-center text-sm">{chain.icon}</span>}<span className="text-sm text-white">{chain.name}</span>{isAiPayTestnetChainId(chain.id) && <span className="text-xs text-orange-400 ml-1">Testnet</span>}{chain.type === "PVM" && <span className="text-xs text-[#E6007A] ml-1">PVM</span>}</>) : <><Globe className="w-4 h-4" /><span className="text-sm text-gray-400">Select</span></>}
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#14F195]/10">
              <div className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse" />
              <span className="text-sm text-[#14F195]">Online</span>
            </div>
            {isConnected ? (
              <div className="flex items-center gap-2 relative" ref={walletDropdownRef}>
                <div className="relative">
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => setShowWalletDropdown((v) => !v)}
                  >
                    <span className="text-sm text-white font-mono">{formatAddress(address)}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${showWalletDropdown ? "rotate-180" : ""}`} />
                  </div>
                  <AnimatePresence>
                    {showWalletDropdown && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#0d0d14] border border-white/10 shadow-xl overflow-hidden z-50">
                        <button type="button" onClick={() => { setShowWalletDropdown(false); setShowUserSettingsModal(true); }} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-white/10">
                          <Settings className="w-4 h-4" />
                          User settings
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button onClick={disconnect} className="px-4 py-2 rounded-xl bg-white/5 text-sm text-white">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => setShowWalletModal(true)} disabled={isConnecting} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-sm font-semibold">
                <Wallet className="w-4 h-4" />{isConnecting ? "..." : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d0d14] to-[#0a0a10] border border-white/5 p-8 lg:p-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#9945FF]/10 rounded-full blur-3xl" />
            <div className="grid lg:grid-cols-2 gap-8">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#9945FF]/10 border border-[#9945FF]/20 mb-6">
                  <Sparkles className="w-4 h-4 text-[#9945FF]" />
                  <span className="text-sm text-[#9945FF]">AI-Powered DeFi</span>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4">Cross-Chain <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">Simplified</span></h1>
                <p className="text-gray-400 mb-8">Monallo AI Agent makes on-chain features such as Send, Bridge, and Stake more convenient and efficient. Swap is coming soon.</p>
                <div className="flex gap-4">
                  {!isConnected && <button onClick={() => setShowWalletModal(true)} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED]"><Wallet className="w-5 h-5" />Connect</button>}
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10"><Lock className="w-4 h-4 text-[#14F195]" /><span className="text-sm text-gray-300">Secure</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><DollarSign className="w-5 h-5 text-[#9945FF]" /><span className="text-sm text-gray-400">Total Value</span></div><div className="text-2xl font-bold text-white">${formatWithCommas(totalValueUsd, { minFrac: 2, maxFrac: 2 })}</div></div>
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><TrendingUp className="w-5 h-5 text-[#14F195]" /><span className="text-sm text-gray-400">Transactions</span></div><div className="text-2xl font-bold text-white">{txCount}</div></div>
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><Globe className="w-5 h-5 text-[#B45AFF]" /><span className="text-sm text-gray-400">Network</span></div><div className="text-lg font-bold text-white">{chain ? (isAiPayTestnetChainId(chain.id) ? `${chain.name} Testnet` : chain.name) : "None"}</div></div>
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><Activity className="w-5 h-5 text-[#F68521]" /><span className="text-sm text-gray-400">Status</span></div><div className="text-lg font-bold text-[#14F195]">{isConnected ? "Connected" : "Disconnected"}</div></div>
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-white">Quick Actions</h2></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                whileHover={action.comingSoon ? undefined : { y: -4 }}
                onClick={() => !action.comingSoon && handleQuickAction(action.label)}
                className={`group flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-[#0d0d14] border border-white/5 min-h-[140px] ${action.comingSoon ? "opacity-80 cursor-default" : "hover:border-white/20"}`}
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 shrink-0`}>
                  <action.icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-white block mb-1">{action.label}</span>
                {action.comingSoon ? (
                  <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#9945FF]/15 text-[#B45AFF] border border-[#9945FF]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B45AFF] animate-pulse" /> Coming Soon
                  </span>
                ) : action.live ? (
                  <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#14F195]/15 text-[#14F195] border border-[#14F195]/35">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#14F195] animate-pulse" /> Live
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">{action.description}</span>
                )}
              </motion.button>
            ))}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-[#0d0d14] border border-white/5 border-dashed min-h-[140px] opacity-70"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#14F195] to-[#00D9FF] flex items-center justify-center mb-4 shrink-0">
                <RefreshCw className="w-7 h-7 text-white" />
              </div>
              <span className="font-bold text-white block mb-1">Swap</span>
              <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#9945FF]/15 text-[#B45AFF] border border-[#9945FF]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B45AFF] animate-pulse" /> Coming Soon
              </span>
            </motion.div>
          </div>
        </motion.div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div>
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="p-6 rounded-3xl bg-[#0d0d14] border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm text-gray-400">Your Balance</h3>
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <button type="button" onClick={() => fetchBalances()} disabled={balancesLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50" title="Refresh balances">
                      <RefreshCw className={`w-4 h-4 text-gray-400 ${balancesLoading ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  <Shield className="w-5 h-5 text-[#9945FF]" />
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-6">${formatWithCommas(totalValueUsd, { minFrac: 2, maxFrac: 2 })}</div>
              <div onClick={() => isConnected && setShowTokenSelector(!showTokenSelector)} className={`flex items-center justify-between p-4 rounded-2xl bg-[#14141f] border border-white/5 ${!isConnected ? "opacity-50" : "cursor-pointer hover:border-[#9945FF]/30"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white p-1 shrink-0">{selectedToken && <img src={TokenLogos[selectedToken.icon]} className="w-full h-full object-contain" alt="" />}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{selectedToken?.symbol || "Select"}</div>
                    <div className="text-xs text-gray-500">{formatWithCommas(selectedToken?.balance ?? "0", { maxFrac: 8 })} {selectedToken?.symbol ?? ""}</div>
                    {selectedToken?.priceUsd != null && selectedToken.priceUsd > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">${formatWithCommas(selectedToken.priceUsd, { minFrac: 2, maxFrac: 6 })} · {selectedToken.valueUsd != null ? `$${formatWithCommas(selectedToken.valueUsd, { minFrac: 2, maxFrac: 2 })}` : "—"}</div>
                    )}
                  </div>
                </div>
                {isConnected && <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />}
              </div>
              <AnimatePresence>{showTokenSelector && isConnected && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="mt-3 space-y-2 overflow-hidden">
                  {tokenBalances.map((t) => (
                    <div key={t.symbol} onClick={() => { setSelectedToken(t); setShowTokenSelector(false); }} className="flex items-center justify-between p-3 rounded-xl bg-[#14141f] hover:bg-[#1f1f2e] cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img src={TokenLogos[t.icon]} className="w-10 h-10 rounded-full object-contain" alt="" />
                        <div>
                          <div className="font-medium text-white">{t.symbol}</div>
                          <div className="text-xs text-gray-500">{formatWithCommas(t.balance, { maxFrac: 8 })} {t.symbol}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {t.priceUsd != null && t.priceUsd > 0 && <div className="text-xs text-gray-400">${formatWithCommas(t.priceUsd, { maxFrac: 4 })}</div>}
                        {t.valueUsd != null && <div className="text-sm font-medium text-white">${formatWithCommas(t.valueUsd, { minFrac: 2, maxFrac: 2 })}</div>}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}</AnimatePresence>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
            <div className="rounded-3xl bg-[#0d0d14] border border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#9945FF] to-[#B45AFF] flex items-center justify-center overflow-hidden shrink-0 relative">
                    {botAvatarUrl ? (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center"><Bot className="w-6 h-6 text-white opacity-20" /></div>
                        <img src={botAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-10" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      </>
                    ) : (
                      <Bot className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div><div className="font-semibold text-white">{botName}</div><div className="text-sm text-[#14F195]">Online</div></div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setShowHistoryModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="History"><History className="w-5 h-5" /></button>
                  <button type="button" onClick={() => setShowAddressBookModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="Address Book"><BookUser className="w-5 h-5" /></button>
                  <button type="button" onClick={() => setShowBotSettingsModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="Settings"><Settings className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="h-[350px] overflow-y-auto p-5 space-y-4">
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 relative ${m.role === "user" ? "bg-white/10" : m.role === "system" ? "bg-[#9945FF]" : "bg-[#14F195]"}`}>
                      {m.role === "user" ? (userAvatarUrl ? (<><img src={userAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /><div className="absolute inset-0 flex items-center justify-center z-0"><User className="w-5 h-5 text-gray-500" /></div></>) : <User className="w-5 h-5" />) : m.role === "system" ? <CheckCircle2 className="w-5 h-5" /> : botAvatarUrl ? (<><div className="absolute inset-0 flex items-center justify-center"><Bot className="w-5 h-5 text-white opacity-20" /></div><img src={botAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-10" onError={(e) => { e.currentTarget.style.display = "none"; }} /></>) : <Bot className="w-5 h-5" />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-white/10" : "bg-[#14141f]"}`}>
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      {m.intent && !m.intentConfirmed && !m.intentCancelled && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <button type="button" onClick={() => { setPendingIntent(m.intent!); if (m.intent!.action === "Bridge") setBridgeType("lock-mint"); setShowConfirmModal(true); }} className="text-xs font-medium text-[#B45AFF] hover:text-[#9945FF] hover:underline">
                            Review & confirm
                          </button>
                        </div>
                      )}
                      {m.intent && m.intentCancelled && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <div className="flex items-center gap-2 text-xs text-amber-200/90">
                            <CircleSlash className="w-3.5 h-3.5 shrink-0 text-amber-400/90" aria-hidden />
                            <span>You cancelled this confirmation. The transaction was not submitted.</span>
                          </div>
                        </div>
                      )}
                      {m.txHash && (
                        <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                          {(m.destinationTxHash || m.bridgeSourceLabel) ? (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500">{m.bridgeSourceLabel ?? "Lock"}:</span>
                                {m.explorerUrl ? (
                                  <a href={m.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-[#9945FF] hover:underline truncate max-w-[200px]" title={m.txHash}>
                                    {formatAddressShort(m.txHash)}
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-xs font-mono text-gray-400 truncate max-w-[180px]" title={m.txHash}>{formatAddressShort(m.txHash)}</span>
                                )}
                                <CopyButton text={m.txHash} className="p-1 rounded" />
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500">{m.bridgeDestLabel ?? "Mint"}:</span>
                                {m.destinationTxHash ? (
                                  <>
                                    {m.destinationExplorerUrl ? (
                                      <a href={m.destinationExplorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-[#9945FF] hover:underline truncate max-w-[200px]" title={m.destinationTxHash}>
                                        {formatAddressShort(m.destinationTxHash)}
                                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                      </a>
                                    ) : (
                                      <span className="text-xs font-mono text-gray-400 truncate max-w-[180px]" title={m.destinationTxHash}>{formatAddressShort(m.destinationTxHash)}</span>
                                    )}
                                    <CopyButton text={m.destinationTxHash} className="p-1 rounded" />
                                  </>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    Waiting for relay…
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-500">Tx:</span>
                              {m.explorerUrl ? (
                                <a href={m.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-[#9945FF] hover:underline truncate max-w-[200px]" title={m.txHash}>
                                  {formatAddressShort(m.txHash)}
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-xs font-mono text-gray-400 truncate max-w-[180px]" title={m.txHash}>{formatAddressShort(m.txHash)}</span>
                              )}
                              <CopyButton text={m.txHash} className="p-1 rounded" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSubmit} className="p-4 border-t border-white/5">
                <div className="relative flex flex-col gap-0">
                  <div className="relative flex items-center">
                    <input
                      ref={chatInputRef}
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      placeholder={!isConnected ? "Connect wallet..." : "Describe what you want... @ contact · $ token"}
                      disabled={!isConnected || isLoading}
                      className="w-full px-5 py-4 pr-14 rounded-2xl bg-[#14141f] border border-white/10 focus:border-[#9945FF]/50 disabled:opacity-50"
                    />
                    <button type="submit" disabled={!isConnected || !input.trim() || isLoading} className="absolute right-2 p-2.5 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] disabled:opacity-50">
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  </div>
                  {typeof document !== "undefined" &&
                    showInputAutocompleteDropdown &&
                    mentionDropdownRect &&
                    createPortal(
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.15 }}
                          className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0f] py-1.5 shadow-xl z-[100]"
                          style={{
                            position: "fixed",
                            bottom: mentionDropdownRect.bottom,
                            left: mentionDropdownRect.left,
                            width: mentionDropdownRect.width,
                            boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 24px 48px -12px rgba(0,0,0,0.5), 0 0 40px -10px rgba(153,69,255,0.12)",
                          }}
                        >
                          {activeInputTrigger === "at" &&
                            (mentionList.length === 0 ? (
                              <div className="px-4 py-4 text-center">
                                <p className="text-sm text-gray-400">No contact matches</p>
                                <p className="text-xs text-gray-500 mt-1">Add contacts in Address Book</p>
                              </div>
                            ) : (
                              <div className="space-y-0.5 p-1.5">
                                {mentionList.map((c, i) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleMentionSelect(c)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                      i === clampedMentionIndex
                                        ? "bg-[#9945FF]/15 text-white ring-1 ring-[#9945FF]/30"
                                        : "text-gray-300 hover:bg-white/8 hover:text-white"
                                    }`}
                                  >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#9945FF]/25 to-[#7C3AED]/25 text-sm font-semibold text-[#B45AFF]">
                                      {(c.nickname.slice(0, 1) || "?").toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-white truncate">{c.nickname}</div>
                                      <div className="font-mono text-xs text-gray-500 truncate mt-0.5">{formatAddressFourFour(c.address)}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ))}
                          {activeInputTrigger === "dollar" &&
                            (!dollarPickerSupported ? (
                              <div className="px-4 py-4 text-center">
                                <p className="text-sm text-gray-400">$ token suggestions are only available on AI Pay testnets</p>
                                <p className="text-xs text-gray-500 mt-1">Switch to Sepolia, Polkadot Hub, Injective Testnet, or PlatON Dev</p>
                              </div>
                            ) : dollarList.length === 0 ? (
                              <div className="px-4 py-4 text-center">
                                <p className="text-sm text-gray-400">No matching tokens</p>
                                <p className="text-xs text-gray-500 mt-1">Network: {chain?.name ?? "—"}</p>
                              </div>
                            ) : (
                              <div className="space-y-0.5 p-1.5">
                                {dollarList.map((t, i) => (
                                  <button
                                    key={t.symbol}
                                    type="button"
                                    onClick={() => handleDollarTokenSelect(t)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                      i === clampedDollarIndex
                                        ? "bg-[#9945FF]/15 text-white ring-1 ring-[#9945FF]/30"
                                        : "text-gray-300 hover:bg-white/8 hover:text-white"
                                    }`}
                                  >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-0.5 overflow-hidden">
                                      {TokenLogos[t.icon] ? (
                                        <img src={TokenLogos[t.icon]} className="w-full h-full object-contain" alt="" />
                                      ) : (
                                        <span className="flex h-full w-full items-center justify-center bg-white/10 text-[10px] font-bold text-emerald-300">
                                          {t.symbol.slice(0, 4)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-white truncate">{t.symbol}</div>
                                      <div className="text-xs text-gray-500 truncate mt-0.5">{t.name}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ))}
                        </motion.div>
                      </AnimatePresence>,
                      document.body
                    )}
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
