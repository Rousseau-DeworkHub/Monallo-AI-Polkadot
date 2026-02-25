"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, CheckCircle2, ArrowRight, X, Wallet, ChevronLeft, Sparkles, Globe, Activity, RefreshCw, Shield, Layers, Settings, ChevronRight, DollarSign, Lock, Copy, TrendingUp, Upload, ExternalLink, History, ChevronDown, ArrowLeftRight } from "lucide-react";
import { useWallet, formatAddress, SUPPORTED_CHAINS, ChainInfo, WalletType, isMetaMaskAvailable } from "@/hooks/useWallet";
import { fetchTokenPrices, fetchPolkadotBalance, mergeBalancesWithPrices, fetchOkxPrices, getOkxPriceForSymbol } from "@/lib/balances";
import { sendViaWallet } from "@/lib/sendTransaction";
import { lockViaBridge, unlockViaBridge, getBridgeLockAddress, getWrappedTokenAddressForUnlock } from "@/lib/bridge";
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
};

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
  ],
  polkadot: [
    { symbol: "DOT", name: "Polkadot", balance: "0", decimals: 10, icon: "DOT" },
  ],
  "polkadot-hub-testnet": [
    { symbol: "PAS", name: "Polkadot Hub", balance: "0", decimals: 18, icon: "PAS" },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim()
      ? [{ symbol: "maoETH.Sepolia", name: "maoETH.Sepolia", balance: "0", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim(), icon: "SEPOLIA_ETH" }]
      : []),
  ],
};

const quickActions = [
  { label: "Send", icon: Send, color: "from-[#9945FF] to-[#B45AFF]", description: "Transfer" },
  { label: "Swap", icon: RefreshCw, color: "from-[#14F195] to-[#00D9FF]", description: "Exchange" },
  { label: "Bridge", icon: Layers, color: "from-[#B45AFF] to-[#FF4D9E]", description: "Cross-chain" },
  { label: "Stake", icon: TrendingUp, color: "from-[#F68521] to-[#FFB347]", description: "Rewards" },
];

const BOT_NAME_KEY = "monallo_bot_name";
const BOT_AVATAR_KEY = "monallo_bot_avatar";
const USER_AVATAR_KEY = "monallo_user_avatar";

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

/** Canonical key for chain comparison (Send vs Bridge: same key → Send, different → Bridge) */
function getCanonicalChainKey(name: string): string {
  if (!name || !name.trim()) return "";
  const n = name.trim().toLowerCase();
  if (n.includes("sepolia")) return "sepolia";
  if (n.includes("polkadot") || n.includes("hub") || n.includes("pas")) return "polkadot-hub";
  return n;
}

/** Send 规则：Polkadot Hub 仅支持 PAS；Sepolia 仅支持 ETH。根据 token 推断网络 */
function inferSendNetworkFromToken(token: string): string {
  const t = (token || "").trim().toUpperCase();
  if (t === "PAS") return "Polkadot Hub";
  if (t === "ETH") return "Sepolia";
  return "";
}

/** 从「跨链回去」的 wrapped token 推断源链与目标链：maoETH.Sepolia 在 Polkadot Hub 上 → 目标 Sepolia；maoPAS 在 Sepolia 上 → 目标 Polkadot Hub */
function inferBridgeNetworksFromWrappedToken(token: string): { source: string; target: string } | null {
  const t = (token || "").trim().toLowerCase();
  if (t.includes("maoeth") && (t.includes("sepolia") || t === "maoeth")) return { source: "Polkadot Hub", target: "Sepolia" };
  if (t.includes("maopas") || t.includes("maopas.ph")) return { source: "Sepolia", target: "Polkadot Hub" };
  return null;
}

/** 是否为「跨链回去」意图：token 为 wrapped（maoPAS.PH / maoETH.Sepolia）时表示要销毁 wrapped 在目标链解锁原生资产，而非 lock 原生资产 */
function isBridgeUnlockIntent(token: string): boolean {
  return inferBridgeNetworksFromWrappedToken(token || "") !== null;
}

/** Bridge Lock 时目标链上显示的 wrapped token 名称：源链资产在目标链的 maoXXX 符号 */
function getWrappedTokenSymbolForTargetChain(sourceNetwork: string, targetNetwork: string): string {
  const src = (sourceNetwork || "").trim().toLowerCase();
  const tgt = (targetNetwork || "").trim().toLowerCase();
  if (src.includes("sepolia") && (tgt.includes("polkadot") || tgt.includes("hub") || tgt.includes("pas"))) return "maoETH.Sepolia";
  if ((src.includes("polkadot") || src.includes("hub") || src.includes("pas")) && tgt.includes("sepolia")) return "maoPAS.PH";
  return "";
}

/** 链的原生资产符号（用于 Unlock 时目标链显示） */
function getNativeTokenSymbolForChain(networkName: string): string {
  const n = (networkName || "").trim().toLowerCase();
  if (n.includes("sepolia")) return "ETH";
  if (n.includes("polkadot") || n.includes("hub") || n.includes("pas")) return "PAS";
  return "";
}

/** Normalize intent: default source to current chain or from token (PAS→Polkadot Hub, ETH→Sepolia); set action to Bridge only when source ≠ target. For Bridge with wrapped token (maoETH.Sepolia→Sepolia), infer source/target so unlock direction is correct. */
function normalizeSendBridgeIntent(
  intent: ParsedIntent,
  currentChainName: string
): ParsedIntent {
  if (intent.action !== "Send" && intent.action !== "Bridge") return intent;
  const rawToken = intent.token || intent.from_token || "";
  const tokenHint = inferSendNetworkFromToken(rawToken);
  let source = (intent.source_network || "").trim() || tokenHint || currentChainName;
  let target = (intent.target_network || "").trim() || (intent.action === "Send" ? tokenHint || source : "");

  if (intent.action === "Bridge") {
    const wrapped = inferBridgeNetworksFromWrappedToken(rawToken);
    if (wrapped) {
      source = (intent.source_network || "").trim() || wrapped.source;
      target = (intent.target_network || "").trim() || wrapped.target;
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
  const displayChains = SUPPORTED_CHAINS.filter(c => c.id === "sepolia" || c.id === "polkadot-hub-testnet");
  const [switchingChain, setSwitchingChain] = useState<string | null>(null);
  const handleSelect = async (chain: ChainInfo) => {
    if (chain.id === currentChain?.id) { onClose(); return; }
    onClearSwitchError?.();
    setSwitchingChain(chain.id);
    try {
      await onSelect(chain);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "切换网络失败，请在 MetaMask 中确认切换";
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
                      {chain.id === "sepolia" && <span className="text-xs text-orange-400">Testnet</span>}
                      {chain.id === "polkadot-hub-testnet" && <span className="text-xs text-orange-400">Testnet</span>}
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
  const isTestnet = chain ? (chain.id === "sepolia" || chain.id === "polkadot-hub-testnet") : false;
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
  const actionKey = ["Send", "Swap", "Bridge", "Stake"].includes(intent.action) ? intent.action : "Send";
  const actionStyle = ACTION_STYLES[actionKey] ?? ACTION_STYLES.Send;
  const ActionIcon = actionStyle.icon;
  const getChainByNetwork = (name: string): ChainInfo | undefined =>
    SUPPORTED_CHAINS.find((c) => c.name === name || c.name.toLowerCase().includes(name.toLowerCase().trim()) || c.id === name.toLowerCase().trim().replace(/\s+/g, "-"));
  const sourceChain = intent.source_network ? getChainByNetwork(intent.source_network) : undefined;
  const targetChain = intent.target_network ? getChainByNetwork(intent.target_network) : undefined;

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
  const singleChain = showSingleNetwork ? getChainByNetwork(singleNetworkName) : undefined;
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
                        <div className="text-xs text-gray-500">Proprietary cross-chain bridge</div>
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
                  <p className="text-xs text-gray-500">Send, Swap, Bridge, Stake</p>
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
              <h2 className="text-2xl font-bold text-white">用户设置</h2>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              {address && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">钱包地址</label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 font-mono text-sm text-white truncate" title={address}>{formatAddressShort(address)}</span>
                    <CopyButton text={address} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-2">用户头像</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="图片链接"
                    className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-[#111] border border-white/10 focus:border-[#9945FF]/50 outline-none text-white placeholder-gray-500"
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 rounded-2xl bg-[#111] border border-white/10 hover:border-[#9945FF]/40 text-gray-400 hover:text-white shrink-0" title="上传图片">
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
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-2xl bg-[#111] border border-white/10 hover:border-white/20 text-white text-sm font-medium">取消</button>
              <button type="button" onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-sm font-medium">保存</button>
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
            {!hasMetaMask && <p className="mt-3 text-sm text-amber-400">请先安装 MetaMask 浏览器扩展。</p>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AIPayPage() {
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: "Welcome to Monallo AI Pay! Send, swap, bridge tokens using natural language.", timestamp: 0 }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  /** Bridge 时选择的桥接方式 */
  const [bridgeType, setBridgeType] = useState<"lock-mint" | "polkadot-bridge" | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { address, evmAddress, chain, isConnected, isConnecting, error: walletError, connect, switchChain, disconnect } = useWallet();
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [networkSwitchError, setNetworkSwitchError] = useState<string | null>(null);
  const [showBotSettingsModal, setShowBotSettingsModal] = useState(false);
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

  const getTokensForChain = () => { if (!chain) return []; return TOKENS_BY_CHAIN[chain.id] || []; };

  const fetchBalances = async () => {
    if (!address || !chain) return;
    setBalancesLoading(true);
    try {
      const tokens = getTokensForChain();
      const symbols = tokens.map((t) => t.symbol);

      if (chain.type === "EVM" && evmAddress) {
        const res = await fetch(`/api/balances?address=${encodeURIComponent(evmAddress)}&chainId=${chain.chainId}`);
        if (!res.ok) throw new Error("Balances API failed");
        const data = (await res.json()) as { list: TokenBalance[]; totalValueUsd: number };
        const list = Array.isArray(data.list) ? data.list : [];
        const totalValueUsd = typeof data.totalValueUsd === "number" ? data.totalValueUsd : 0;
        setTokenBalances(list);
        setTotalValueUsd(totalValueUsd);
        if (list.length > 0) setSelectedToken(list[0]);
      } else if (chain.type === "PVM" && tokens.length > 0) {
        const dotBalance = await fetchPolkadotBalance(address);
        const prices = await fetchTokenPrices(["DOT"]);
        const dotToken = tokens[0];
        const priceUsd = prices.DOT ?? 0;
        const valueUsd = parseFloat(dotBalance) * priceUsd;
        const list: TokenBalance[] = [{ ...dotToken, balance: dotBalance, priceUsd, valueUsd }];
        setTokenBalances(list);
        setTotalValueUsd(valueUsd);
        if (list.length > 0) setSelectedToken(list[0]);
      } else {
        const prices = await fetchTokenPrices(symbols);
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
      setTotalValueUsd(0);
    } finally {
      setBalancesLoading(false);
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
    setMessages([{ id: "welcome", role: "assistant", content: "Welcome to Monallo AI Pay! Send, swap, bridge tokens using natural language.", timestamp: 0 }]);
    setPendingIntent(null);
    setShowConfirmModal(false);
    setBridgeType(null);
  }, [address]);

  // Your balance：ETH / PAS(DOT) 及 mao* 价格每 5 秒从 OKX 刷新
  useEffect(() => {
    if (!isConnected || !chain || tokenBalances.length === 0) return;
    const tick = async () => {
      const prices = await fetchOkxPrices();
      setTokenBalances((prev) => {
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
    const amt = text.match(/(\d+\.?\d*)\s*(?:eth|usdt|dot|pas| Dai)?/i)?.[1] ?? "";
    const addr = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? "";
    const token = l.includes("dot") ? "DOT" : l.includes("pas") ? "PAS" : l.includes("usdt") ? "USDT" : l.includes("dai") ? "DAI" : "ETH";
    if (l.includes("send") || l.includes("transfer") || l.includes("转")) {
      const network = token === "PAS" ? "Polkadot Hub" : token === "ETH" ? "Sepolia" : "";
      return { ...empty, action: "Send", amount: amt, token, receiver: addr, source_network: network, target_network: network };
    }
    if (l.includes("swap") || l.includes("换") || l.includes("exchange")) {
      const from = l.includes("usdt") ? "USDT" : l.includes("dot") ? "DOT" : "ETH";
      const to = l.includes("for eth") || l.includes("换成 eth") ? "ETH" : l.includes("for usdt") ? "USDT" : l.includes("for dot") ? "DOT" : "ETH";
      return { ...empty, action: "Swap", amount: amt, from_token: from, to_token: to, token: from };
    }
    if (l.includes("bridge") || l.includes("跨链")) {
      const src = l.includes("sepolia") ? "Sepolia" : l.includes("polkadot") || l.includes("hub") ? "Polkadot Hub" : "";
      const tgt = l.includes("to polkadot") || l.includes("到 polkadot") ? "Polkadot Hub" : l.includes("to sepolia") ? "Sepolia" : "";
      return { ...empty, action: "Bridge", amount: amt, token, source_network: src, target_network: tgt, receiver: addr };
    }
    if (l.includes("stake") || l.includes("质押")) {
      return { ...empty, action: "Stake", amount: amt, token: token };
    }
    return empty;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim(), timestamp: Date.now() };
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
        body: JSON.stringify({ message: userMsg.content }),
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      res = null;
    }

    try {
      let intent: ParsedIntent;
      if (!res || !res.ok) {
        intent = parseIntentLocal(userMsg.content);
        if (intent.action === "Unknown") {
          const errMsg = (res && typeof data.error === "string") ? data.error : "网络或服务异常，请检查后重试。可尝试：「Send 0.01 ETH to 0x...」或「Swap 10 USDT for ETH」。";
          removeParsingAndAppend(errMsg);
          return;
        }
        const normalizedLocal = normalizeSendBridgeIntent(intent, chain?.name || "");
        removeParsingAndAppend("AI 解析暂不可用，已用本地规则解析。请在下方弹窗中确认。", normalizedLocal);
        setPendingIntent(normalizedLocal);
        if (normalizedLocal.action === "Bridge") setBridgeType("lock-mint");
        setShowConfirmModal(true);
      } else {
        intent = data as unknown as ParsedIntent;
        if (intent.action === "Unknown" || !intent.action) {
          removeParsingAndAppend("未识别到 DeFi 操作（Send / Swap / Bridge / Stake）。请尝试例如：「Send 0.01 ETH to 0x...」或「Swap 10 USDT for ETH」。");
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
    const sendToken = (pendingIntent.token || pendingIntent.from_token || "").toUpperCase();
    const sendSupportedChains = sendToken === "ETH" ? SUPPORTED_CHAINS.filter(c => c.id === "sepolia") : sendToken === "PAS" ? SUPPORTED_CHAINS.filter(c => c.id === "polkadot-hub-testnet") : [];
    if (isSend && (sendToken !== "ETH" && sendToken !== "PAS")) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Send is only supported for ETH (Sepolia) and PAS (Polkadot Hub).", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }
    const targetChainForSend = sendSupportedChains[0] ?? null;

    // Bridge (Monallo lock-mint): 解析源链与目标链，仅支持 Sepolia <-> Polkadot Hub
    const bridgeSourceKey = getCanonicalChainKey(pendingIntent.source_network || "");
    const bridgeTargetKey = getCanonicalChainKey(pendingIntent.target_network || "");
    const bridgeSourceChain = bridgeSourceKey === "sepolia" ? SUPPORTED_CHAINS.find(c => c.id === "sepolia") : bridgeSourceKey === "polkadot-hub" ? SUPPORTED_CHAINS.find(c => c.id === "polkadot-hub-testnet") : null;
    const bridgeTargetChain = bridgeTargetKey === "sepolia" ? SUPPORTED_CHAINS.find(c => c.id === "sepolia") : bridgeTargetKey === "polkadot-hub" ? SUPPORTED_CHAINS.find(c => c.id === "polkadot-hub-testnet") : null;
    const isBridgeLockMint = isBridge && bridgeType === "lock-mint" && bridgeSourceChain && bridgeTargetChain && bridgeSourceChain.chainId !== bridgeTargetChain.chainId;

    if (isBridge && bridgeType === "lock-mint" && (!bridgeSourceChain || !bridgeTargetChain || bridgeSourceChain.chainId === bridgeTargetChain.chainId)) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "❌ Monallo Bridge 仅支持 Sepolia 与 Polkadot Hub 之间的跨链。", timestamp: Date.now() }]);
      setPendingIntent(null);
      setIsConfirming(false);
      return;
    }

    const isBridgeUnlock = isBridge && isBridgeUnlockIntent(pendingIntent.token || pendingIntent.from_token || "");

    setMessages(prev => [...prev, { id: Date.now().toString(), role: "system", content: "Processing...", timestamp: Date.now(), status: "pending" }]);

    try {
      if (isSend && targetChainForSend && hasValidReceiver && hasValidAmount && chain?.type === "EVM" && typeof window !== "undefined" && window.ethereum) {
        if (chain.id !== targetChainForSend.id) {
          await switchChain(targetChainForSend.chainId);
        }
        const tokensForTarget = TOKENS_BY_CHAIN[targetChainForSend.id] ?? [];
        const tokenInfo: TokenBalance | undefined = tokensForTarget.find((t: TokenBalance) => t.symbol.toUpperCase() === sendToken) ?? tokensForTarget[0];
        if (!tokenInfo) {
          throw new Error("No token found for this network");
        }
        const { hash: txHash } = await sendViaWallet(window.ethereum!, {
          chainId: targetChainForSend.chainId,
          to: receiver,
          amount,
          tokenSymbol: tokenInfo.symbol,
          tokenContract: tokenInfo.contract,
          decimals: tokenInfo.decimals,
        });
        const explorerUrl = targetChainForSend.explorer ? `${targetChainForSend.explorer}/tx/${txHash}` : undefined;
        const receiptText = `Sent ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || "ETH"} to ${formatAddressShort(receiver)} ✓`;
        setMessages(prev => prev.filter(m => m.status !== "pending").map(m => {
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, content: receiptText, intentConfirmed: true, txHash, explorerUrl };
          return m;
        }));
        setTxCount(c => c + 1);
        await fetchBalances();
        const priceToken: string = (pendingIntent.token || pendingIntent.from_token || tokenInfo?.symbol || "ETH").trim();
        const sendPrices = await fetchTokenPrices([priceToken]);
        const sendAmountUsd = parseFloat(pendingIntent.amount || "0") * (sendPrices[priceToken] ?? 0);
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, explorerUrl, sendAmountUsd);
      } else if (isBridgeUnlock && bridgeSourceChain && bridgeTargetChain && typeof window !== "undefined" && window.ethereum) {
        const tokensOnSource = TOKENS_BY_CHAIN[bridgeSourceChain.id] ?? [];
        const wrappedTokenInfo = tokensOnSource.find(t => t.symbol === "maoPAS.PH" || t.symbol === "maoETH.Sepolia");
        const wrappedAddr = wrappedTokenInfo?.contract ?? getWrappedTokenAddressForUnlock(bridgeSourceChain.chainId, bridgeTargetChain.chainId);
        if (!wrappedAddr || !ethers.isAddress(wrappedAddr)) {
          throw new Error("未配置该方向的 wrapped 合约地址（NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA / NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB）");
        }
        const { hash: txHash } = await unlockViaBridge({
          ethereum: window.ethereum!,
          sourceChainId: bridgeSourceChain.chainId,
          wrappedTokenAddress: wrappedAddr,
          recipient: receiver,
          destinationChainId: bridgeTargetChain.chainId,
          amount,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: bridgeSourceChain.chainId }) }).catch(() => {});
        const explorerUrl = bridgeSourceChain.explorer ? `${bridgeSourceChain.explorer}/tx/${txHash}` : undefined;
        const receiptText = `Unlocked ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || ""} → ${bridgeTargetChain.name}. Waiting for relay. ✓`;
        setMessages(prev => prev.filter(m => m.status !== "pending").map(m => {
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, content: receiptText, intentConfirmed: true, txHash, explorerUrl, bridgeSourceLabel: "Unlock", bridgeDestLabel: "Release" };
          return m;
        }));
        pollBridgeStatusAndUpdateMessage(txHash, bridgeSourceChain.chainId, bridgeTargetChain.explorer ?? "", "Unlock", "Release");
        setTxCount(c => c + 1);
        await fetchBalances();
        const unlockToken = (pendingIntent.token || pendingIntent.from_token || "ETH").trim();
        const unlockPrices = await fetchTokenPrices([unlockToken]);
        const unlockAmountUsd = parseFloat(pendingIntent.amount || "0") * (unlockPrices[unlockToken] ?? 0);
        saveTransaction({ ...pendingIntent, receiver: receiver || pendingIntent.receiver }, txHash, explorerUrl, unlockAmountUsd);
      } else if (isBridgeLockMint && typeof window !== "undefined" && window.ethereum) {
        const lockAddress = getBridgeLockAddress(bridgeSourceChain!.chainId);
        if (!lockAddress) {
          throw new Error("桥合约未配置，请设置 NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA / NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB");
        }
        const { hash: txHash } = await lockViaBridge({
          ethereum: window.ethereum!,
          sourceChainId: bridgeSourceChain!.chainId,
          lockContractAddress: lockAddress,
          recipient: receiver,
          destinationChainId: bridgeTargetChain!.chainId,
          amount,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: bridgeSourceChain!.chainId }) }).catch(() => {});
        const explorerUrl = bridgeSourceChain!.explorer ? `${bridgeSourceChain!.explorer}/tx/${txHash}` : undefined;
        const receiptText = `Locked ${pendingIntent.amount} ${pendingIntent.token || pendingIntent.from_token || "ETH"} → ${bridgeTargetChain!.name}. Waiting for relay. ✓`;
        setMessages(prev => prev.filter(m => m.status !== "pending").map(m => {
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, content: receiptText, intentConfirmed: true, txHash, explorerUrl, bridgeSourceLabel: "Lock", bridgeDestLabel: "Mint" };
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
        setMessages(prev => prev.filter(m => m.status !== "pending").map(m => {
          if (m.intent && pendingIntent && m.intent.action === pendingIntent.action && m.intent.amount === pendingIntent.amount && (m.intent.receiver === pendingIntent.receiver || !pendingIntent.receiver?.trim())) return { ...m, content: receiptTextMock, intentConfirmed: true, txHash };
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
            body: JSON.stringify({ sourceChainId }),
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

  const handleQuickAction = (action: string) => {
    if (!isConnected) { setShowWalletModal(true); return; }
    const primary = chain?.id === "polkadot-hub-testnet" ? "PAS" : "ETH";
    const p: Record<string, string> = {
      Send: `Send 0.001 ${primary} to 0x`,
      Swap: `Swap 10 USDT for ${primary}`,
      Bridge: primary === "ETH" ? "Bridge 0.1 ETH to Polkadot" : "Bridge 0.1 PAS to Sepolia",
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
      <ConfirmIntentModal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} onCancel={() => { setShowConfirmModal(false); setPendingIntent(null); setBridgeType(null); }} intent={pendingIntent} bridgeType={bridgeType} onBridgeTypeChange={setBridgeType} onConfirm={handleConfirmIntent} isConfirming={isConfirming} />
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
              {chain ? (<>{chain.logo && chain.logo.startsWith("http") ? <img src={chain.logo} alt="" className="w-5 h-5 rounded-full" /> : <span className="w-5 h-5 flex items-center justify-center text-sm">{chain.icon}</span>}<span className="text-sm text-white">{chain.name}</span>{(chain.id === "sepolia" || chain.id === "polkadot-hub-testnet") && <span className="text-xs text-orange-400 ml-1">Testnet</span>}{chain.type === "PVM" && <span className="text-xs text-[#E6007A] ml-1">PVM</span>}</>) : <><Globe className="w-4 h-4" /><span className="text-sm text-gray-400">Select</span></>}
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
                          用户设置
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
                <p className="text-gray-400 mb-8">Send, swap, bridge tokens using natural language.</p>
                <div className="flex gap-4">
                  {!isConnected && <button onClick={() => setShowWalletModal(true)} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED]"><Wallet className="w-5 h-5" />Connect</button>}
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10"><Lock className="w-4 h-4 text-[#14F195]" /><span className="text-sm text-gray-300">Secure</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><DollarSign className="w-5 h-5 text-[#9945FF]" /><span className="text-sm text-gray-400">Total Value</span></div><div className="text-2xl font-bold text-white">${formatWithCommas(totalValueUsd, { minFrac: 2, maxFrac: 2 })}</div></div>
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><TrendingUp className="w-5 h-5 text-[#14F195]" /><span className="text-sm text-gray-400">Transactions</span></div><div className="text-2xl font-bold text-white">{txCount}</div></div>
                <div className="p-5 rounded-2xl bg-white/5"><div className="flex items-center gap-3 mb-3"><Globe className="w-5 h-5 text-[#B45AFF]" /><span className="text-sm text-gray-400">Network</span></div><div className="text-lg font-bold text-white">{chain ? (chain.id === "sepolia" || chain.id === "polkadot-hub-testnet" ? `${chain.name} Testnet` : chain.name) : "None"}</div></div>
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
                whileHover={{ y: -4 }}
                onClick={() => handleQuickAction(action.label)}
                className="group flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-[#0d0d14] border border-white/5 hover:border-white/20 min-h-[140px]"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 shrink-0`}>
                  <action.icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-white block mb-1">{action.label}</span>
                <span className="text-sm text-gray-500">{action.description}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div>
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="p-6 rounded-3xl bg-[#0d0d14] border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm text-gray-400">Your Balance</h3>
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <button type="button" onClick={() => fetchBalances()} disabled={balancesLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50" title="刷新余额">
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
                  <button type="button" onClick={() => setShowBotSettingsModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="设置"><Settings className="w-5 h-5" /></button>
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
                      {m.intent && !m.intentConfirmed && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <button type="button" onClick={() => { setPendingIntent(m.intent!); if (m.intent!.action === "Bridge") setBridgeType("lock-mint"); setShowConfirmModal(true); }} className="text-xs font-medium text-[#B45AFF] hover:text-[#9945FF] hover:underline">
                            Review & confirm
                          </button>
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
                <div className="relative flex items-center">
                  <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={!isConnected ? "Connect wallet..." : "Describe what you want..."} disabled={!isConnected || isLoading} className="w-full px-5 py-4 pr-14 rounded-2xl bg-[#14141f] border border-white/10 focus:border-[#9945FF]/50 disabled:opacity-50" />
                  <button type="submit" disabled={!isConnected || !input.trim() || isLoading} className="absolute right-2 p-2.5 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] disabled:opacity-50">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
