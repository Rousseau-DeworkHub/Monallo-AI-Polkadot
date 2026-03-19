"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Layers, Wallet, Loader2, CheckCircle2, ArrowRight, X, Globe, Copy, ArrowDown, ArrowUpDown } from "lucide-react";
import { useWallet, formatAddress, SUPPORTED_CHAINS, ChainInfo, WalletType, isMetaMaskAvailable } from "@/hooks/useWallet";
import { lockViaBridge, unlockViaBridge, getBridgeLockAddress, getWrappedTokenAddressForUnlock } from "@/lib/bridge";
import { fetchTokenPrices } from "@/lib/balances";
import { ethers } from "ethers";

const BRIDGE_CHAINS = SUPPORTED_CHAINS.filter((c) => c.id === "sepolia" || c.id === "polkadot-hub-testnet");

interface TokenOption {
  symbol: string;
  name: string;
  decimals: number;
  contract?: string;
  iconKey: string;
  isWrapped: boolean;
}

const TOKENS_BY_CHAIN: Record<string, TokenOption[]> = {
  sepolia: [
    { symbol: "ETH", name: "Sepolia ETH", decimals: 18, iconKey: "ETH", isWrapped: false },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA === "string" && process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA.trim()
      ? [{ symbol: "maoPAS.PH", name: "maoPAS (Bridge back)", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA.trim(), iconKey: "PAS", isWrapped: true }]
      : []),
  ],
  "polkadot-hub-testnet": [
    { symbol: "PAS", name: "Polkadot Hub PAS", decimals: 18, iconKey: "PAS", isWrapped: false },
    ...(typeof process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB === "string" && process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim()
      ? [{ symbol: "maoETH.Sepolia", name: "maoETH (Bridge back)", decimals: 18, contract: process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB.trim(), iconKey: "ETH", isWrapped: true }]
      : []),
  ],
};

const TokenLogos: Record<string, string> = {
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  PAS: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png",
};

function formatAddressShort(addr: string): string {
  if (!addr || !addr.startsWith("0x") || addr.length < 14) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button type="button" onClick={copy} className={`p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors ${className}`} title="Copy">
      {copied ? <CheckCircle2 className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
    </button>
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
              {BRIDGE_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => handleSelect(chain)}
                  disabled={switching}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left ${currentChain?.id === chain.id ? "bg-[#9945FF]/20 border-2 border-[#9945FF]" : "bg-white/5 border border-white/10 hover:border-white/20"}`}
                >
                  {chain.logo?.startsWith("http") ? (
                    <img src={chain.logo} alt={chain.name} className="w-10 h-10 rounded-full object-contain" />
                  ) : (
                    <span className="w-10 h-10 flex items-center justify-center text-2xl">{chain.icon}</span>
                  )}
                  <div className="flex-1">
                    <div className="font-bold text-white">{chain.name}</div>
                    <div className="text-xs text-gray-500">Testnet</div>
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

/** Premium chain selector for From/To: card-style trigger + dropdown */
function ChainSelectCard({
  label,
  chainId,
  chains,
  onSelect,
  disabledChainId,
}: {
  label: string;
  chainId: string;
  chains: typeof BRIDGE_CHAINS;
  onSelect: (id: string) => void;
  disabledChainId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = chains.find((c) => c.id === chainId);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const options = chains.filter((c) => c.id !== disabledChainId);
  return (
    <div ref={ref} className="relative">
      <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-[#0a0a0f] border border-white/[0.08] hover:border-white/20 focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/30 outline-none transition-all text-left"
      >
        {selected ? (
          <>
            <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/10">
              {selected.logo?.startsWith("http") ? (
                <img src={selected.logo} alt={selected.name} className="w-7 h-7 rounded-full object-contain" />
              ) : (
                <span className="text-xl">{selected.icon}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{selected.name}</div>
              <div className="text-[11px] font-medium uppercase tracking-wider mt-0.5" style={{ color: "#FB923C" }}>Testnet</div>
            </div>
            <ArrowDown className={`w-5 h-5 text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        ) : (
          <span className="text-gray-500 font-medium">Select network</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-2 z-10 rounded-2xl bg-[#0d0d14] border border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
          >
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.06] transition-colors text-left border-b border-white/5 last:border-0"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                  {c.logo?.startsWith("http") ? (
                    <img src={c.logo} alt={c.name} className="w-6 h-6 rounded-full object-contain" />
                  ) : (
                    <span className="text-lg">{c.icon}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white">{c.name}</div>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: "#FB923C" }}>Testnet</div>
                </div>
                {c.id === chainId && <CheckCircle2 className="w-5 h-5 text-[#14F195] shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BridgePage() {
  const { address, evmAddress, chain, isConnected, isConnecting, error: walletError, connect, switchChain, disconnect } = useWallet();
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [networkSwitchError, setNetworkSwitchError] = useState<string | null>(null);

  const [sourceChainId, setSourceChainId] = useState<string>("sepolia");
  const [targetChainId, setTargetChainId] = useState<string>("polkadot-hub-testnet");
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<{ type: "lock" | "unlock"; sourceTxHash: string; explorerUrl?: string; sourceChainId: number; destChainId: number; destExplorer?: string } | null>(null);
  const [destTxHash, setDestTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceChain = BRIDGE_CHAINS.find((c) => c.id === sourceChainId) ?? BRIDGE_CHAINS[0];
  const targetChain = BRIDGE_CHAINS.find((c) => c.id === targetChainId) ?? BRIDGE_CHAINS[1];
  const sourceTokens = TOKENS_BY_CHAIN[sourceChainId] ?? [];
  const isUnlock = selectedToken?.isWrapped ?? false;

  useEffect(() => {
    if (sourceChainId === targetChainId) {
      setTargetChainId(sourceChainId === "sepolia" ? "polkadot-hub-testnet" : "sepolia");
    }
  }, [sourceChainId, targetChainId]);

  useEffect(() => {
    if (sourceTokens.length > 0 && (!selectedToken || !sourceTokens.find((t) => t.symbol === selectedToken.symbol))) {
      setSelectedToken(sourceTokens[0]);
    } else if (sourceTokens.length === 0) {
      setSelectedToken(null);
    }
  }, [sourceChainId, sourceTokens]);

  // Close Connect Wallet modal when connection succeeds
  useEffect(() => {
    if (isConnected && showWalletModal) {
      setShowWalletModal(false);
      setConnectingWallet(null);
    }
  }, [isConnected, showWalletModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTxResult(null);
    setDestTxHash(null);
    const receiver = (recipient.trim() || evmAddress || address || "").trim();
    if (!ethers.isAddress(receiver)) {
      setError("Please enter a valid 0x recipient address.");
      return;
    }
    const amt = amount.trim();
    if (!amt || Number.isNaN(Number(amt)) || Number(amt) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!isConnected || typeof window === "undefined" || !window.ethereum) {
      setError("Please connect your wallet.");
      return;
    }
    if (!sourceChain || !targetChain || sourceChain.chainId === targetChain.chainId) {
      setError("Please select different source and target chains.");
      return;
    }
    if (!selectedToken) {
      setError("Please select an asset.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isUnlock) {
        const wrappedAddr = selectedToken.contract ?? getWrappedTokenAddressForUnlock(sourceChain.chainId, targetChain.chainId);
        if (!wrappedAddr || !ethers.isAddress(wrappedAddr)) {
          throw new Error("Wrapped token contract not configured for this direction.");
        }
        const { hash } = await unlockViaBridge({
          ethereum: window.ethereum,
          sourceChainId: sourceChain.chainId,
          wrappedTokenAddress: wrappedAddr,
          recipient: ethers.getAddress(receiver),
          destinationChainId: targetChain.chainId,
          amount: amt,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: sourceChain.chainId, sourceTxHash: hash }) }).catch(() => {});
        setTxResult({
          type: "unlock",
          sourceTxHash: hash,
          explorerUrl: sourceChain.explorer ? `${sourceChain.explorer}/tx/${hash}` : undefined,
          sourceChainId: sourceChain.chainId,
          destChainId: targetChain.chainId,
          destExplorer: targetChain.explorer,
        });
        pollDestinationTx(hash, sourceChain.chainId, targetChain.explorer ?? "");
        saveBridgeTx("Bridge", hash, sourceChain.explorer ? `${sourceChain.explorer}/tx/${hash}` : undefined, amt, selectedToken.symbol, receiver, sourceChain.name, targetChain.name);
      } else {
        const lockAddress = getBridgeLockAddress(sourceChain.chainId);
        if (!lockAddress) {
          throw new Error("Bridge contract not configured. Please set NEXT_PUBLIC_BRIDGE_LOCK_* env.");
        }
        const { hash } = await lockViaBridge({
          ethereum: window.ethereum,
          sourceChainId: sourceChain.chainId,
          lockContractAddress: lockAddress,
          recipient: ethers.getAddress(receiver),
          destinationChainId: targetChain.chainId,
          amount: amt,
        });
        fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId: sourceChain.chainId, sourceTxHash: hash }) }).catch(() => {});
        setTxResult({
          type: "lock",
          sourceTxHash: hash,
          explorerUrl: sourceChain.explorer ? `${sourceChain.explorer}/tx/${hash}` : undefined,
          sourceChainId: sourceChain.chainId,
          destChainId: targetChain.chainId,
          destExplorer: targetChain.explorer,
        });
        pollDestinationTx(hash, sourceChain.chainId, targetChain.explorer ?? "");
        const prices = await fetchTokenPrices([selectedToken.symbol === "ETH" ? "ETH" : "DOT"]);
        const priceUsd = selectedToken.symbol === "ETH" ? prices.ETH ?? 0 : prices.DOT ?? 0;
        const amountUsd = parseFloat(amt) * priceUsd;
        saveBridgeTx("Bridge", hash, sourceChain.explorer ? `${sourceChain.explorer}/tx/${hash}` : undefined, amt, selectedToken.symbol, receiver, sourceChain.name, targetChain.name, amountUsd);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  function pollDestinationTx(sourceTxHash: string, sourceChainId: number, destinationExplorerBase: string) {
    let attempts = 0;
    const maxAttempts = 90;
    const reTriggerAt = [3, 8, 15, 25, 40];
    const id = setInterval(async () => {
      attempts++;
      try {
        if (reTriggerAt.includes(attempts)) {
          fetch("/api/bridge/trigger-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceChainId, sourceTxHash }) }).catch(() => {});
        }
        const res = await fetch(`/api/bridge/status?sourceChainId=${sourceChainId}&sourceTxHash=${encodeURIComponent(sourceTxHash)}`);
        const data = (await res.json()) as { status?: string; destinationTxHash?: string };
        if (data.status === "relayed" && data.destinationTxHash) {
          clearInterval(id);
          setDestTxHash(data.destinationTxHash);
        }
      } catch (_) {}
      if (attempts >= maxAttempts) clearInterval(id);
    }, 2000);
  }

  function saveBridgeTx(
    action: string,
    txHash: string,
    explorerUrl: string | undefined,
    amount: string,
    token: string,
    receiver: string,
    sourceNetwork: string,
    targetNetwork: string,
    amountUsd?: number
  ) {
    if (!address) return;
    fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: address,
        action,
        tx_hash: txHash,
        explorer_url: explorerUrl ?? null,
        amount,
        token,
        receiver,
        source_network: sourceNetwork,
        target_network: targetNetwork,
        from_token: token,
        to_token: null,
        amount_usd: amountUsd ?? null,
      }),
    }).catch(() => {});
  }

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

      <header className="sticky top-0 z-40 bg-[#06060a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between">
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
                  <span className="text-xs text-orange-400">Testnet</span>
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
              <button onClick={() => setShowWalletModal(true)} disabled={isConnecting} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-sm font-semibold text-white">
                <Wallet className="w-4 h-4" />
                {isConnecting ? "..." : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#14F195]/10 border border-[#14F195]/20 mb-6">
            <Layers className="w-4 h-4 text-[#14F195]" />
            <span className="text-sm text-[#14F195]">Cross-Chain Bridge</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Monallo <span className="bg-gradient-to-r from-[#14F195] to-[#00D9FF] bg-clip-text text-transparent">Bridge</span>
          </h1>
          <p className="text-gray-400">Lock or unlock assets between Sepolia and Polkadot Hub. Choose direction and asset below.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#0d0d14] to-[#08080c] shadow-2xl shadow-black/30 overflow-hidden"
        >
          {/* Section header */}
          <div className="px-6 md:px-8 pt-6 md:pt-8 pb-1 border-b border-white/[0.06]">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Cross-Chain Transfer</span>
            <h2 className="text-lg font-semibold text-white mt-1">Route</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
            {/* From / To: card selectors + swap */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <ChainSelectCard
                label="From"
                chainId={sourceChainId}
                chains={BRIDGE_CHAINS}
                onSelect={setSourceChainId}
                disabledChainId={targetChainId}
              />
              <button
                type="button"
                onClick={() => {
                  setSourceChainId(targetChainId);
                  setTargetChainId(sourceChainId);
                }}
                className="p-2.5 rounded-xl bg-white/[0.06] border border-white/10 hover:bg-white/10 hover:border-[#14F195]/30 transition-all text-gray-400 hover:text-[#14F195] translate-y-[13px]"
                title="Swap direction"
              >
                <ArrowUpDown className="w-5 h-5" />
              </button>
              <ChainSelectCard
                label="To"
                chainId={targetChainId}
                chains={BRIDGE_CHAINS}
                onSelect={setTargetChainId}
                disabledChainId={sourceChainId}
              />
            </div>

            {/* Asset */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">Asset</span>
              <div className="flex flex-wrap gap-3">
                {sourceTokens.map((t) => (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => setSelectedToken(t)}
                    className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all ${
                      selectedToken?.symbol === t.symbol
                        ? "bg-[#14F195]/10 border-[#14F195]/40 text-white shadow-[0_0_20px_-5px_rgba(20,241,149,0.2)]"
                        : "bg-[#0a0a0f] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <img src={TokenLogos[t.iconKey]} alt="" className="w-8 h-8 rounded-full object-contain ring-1 ring-white/10" />
                    <span className="font-semibold">{t.symbol}</span>
                    {t.isWrapped && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400/90 border border-amber-500/20">
                        Unlock
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Amount</span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-5 py-4 rounded-2xl bg-[#0a0a0f] border border-white/[0.08] focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/20 outline-none text-white text-lg font-medium placeholder-gray-600 transition-all"
              />
              {selectedToken && (
                <p className="mt-1.5 text-xs text-gray-500">
                  {isUnlock ? "Amount of wrapped asset to unlock on destination chain." : "Native asset amount to lock and bridge."}
                </p>
              )}
            </div>

            {/* Recipient */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Recipient address</span>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={evmAddress || address || "0x..."}
                className="w-full px-5 py-4 rounded-2xl bg-[#0a0a0f] border border-white/[0.08] focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/20 outline-none text-white font-mono text-sm placeholder-gray-600 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-5 py-3.5 text-sm text-red-400 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isConnected || isSubmitting}
              className="w-full flex items-center justify-center gap-4 px-8 py-5 rounded-2xl bg-gradient-to-r from-[#14F195] to-[#00D9FF] text-white text-lg font-bold shadow-xl shadow-[#14F195]/30 hover:shadow-[#14F195]/40 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
            >
              {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Layers className="w-6 h-6" />}
              {isSubmitting ? "Processing…" : isUnlock ? "Unlock & Bridge" : "Lock & Bridge"}
            </button>
          </form>

          {txResult && (
            <div className="mt-8 pt-8 border-t border-white/10 rounded-2xl bg-white/[0.02] p-6 space-y-4">
              <div className="flex items-center gap-2 text-[#14F195]">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">{isUnlock ? "Unlock" : "Lock"} submitted</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Source tx</span>
                  <div className="flex items-center gap-2">
                    {txResult.explorerUrl ? (
                      <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[#9945FF] hover:underline truncate max-w-[200px]">
                        {formatAddressShort(txResult.sourceTxHash)}
                      </a>
                    ) : (
                      <span className="font-mono text-gray-400 truncate max-w-[200px]">{formatAddressShort(txResult.sourceTxHash)}</span>
                    )}
                    <CopyButton text={txResult.sourceTxHash} />
                  </div>
                </div>
                {destTxHash ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Destination tx</span>
                    <div className="flex items-center gap-2">
                      {txResult.destExplorer ? (
                        <a href={`${txResult.destExplorer.replace(/\/$/, "")}/tx/${destTxHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[#9945FF] hover:underline truncate max-w-[200px]">
                          {formatAddressShort(destTxHash)}
                        </a>
                      ) : (
                        <span className="font-mono text-gray-400 truncate max-w-[200px]">{formatAddressShort(destTxHash)}</span>
                      )}
                      <CopyButton text={destTxHash} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Waiting for relay…</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
