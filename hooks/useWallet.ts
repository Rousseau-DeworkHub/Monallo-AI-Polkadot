"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// SubWallet 通过 window.injectedWeb3['subwallet-js'] 暴露，见 https://docs.subwallet.app/main/integration/integration-instructions
export type WalletType = "metamask" | "subwallet-evm" | "subwallet-pvm";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      isRabby?: boolean;
      isTrust?: boolean;
      isCoinbaseWallet?: boolean;
    };
    injectedWeb3?: Record<
      string,
      {
        enable: (origin: string) => Promise<{
          accounts: {
            get: () => Promise<Array<{ address: string; name?: string }>>;
            subscribe: (cb: (accounts: Array<{ address: string; name?: string }>) => void) => () => void;
          };
          signer?: unknown;
          metadata?: unknown;
        }>;
      }
    >;
  }
}

const SUBWALLET_JS = "subwallet-js";

export interface ChainInfo {
  id: string;
  name: string;
  icon: string;
  logo?: string;
  color: string;
  type: "EVM" | "PVM";
  rpcUrl: string;
  chainId: number;
  symbol: string;
  explorer: string;
}

export const SUPPORTED_CHAINS: ChainInfo[] = [
  {
    id: "sepolia",
    name: "Sepolia",
    icon: "🔷",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
    color: "#627EEA",
    type: "EVM",
    rpcUrl: typeof process !== "undefined" && process.env?.NEXT_PUBLIC_RPC_SEPOLIA?.trim() ? process.env.NEXT_PUBLIC_RPC_SEPOLIA.trim() : "https://rpc.sepolia.org",
    chainId: 11155111,
    symbol: "ETH",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    icon: "⬡",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
    color: "#627EEA",
    type: "EVM",
    rpcUrl: "https://eth.llamarpc.com",
    chainId: 1,
    symbol: "ETH",
    explorer: "https://etherscan.io",
  },
  {
    id: "polkadot",
    name: "Polkadot",
    icon: "●",
    logo: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png?x-oss-process=image/format,webp/ignore-error,1",
    color: "#E6007A",
    type: "PVM",
    rpcUrl: "https://rpc.polkadot.io",
    chainId: 0,
    symbol: "DOT",
    explorer: "https://polkadot.subscan.io",
  },
  // Polkadot Hub (EVM, MetaMask) — https://blockscout-testnet.polkadot.io/
  {
    id: "polkadot-hub-testnet",
    name: "Polkadot Hub",
    icon: "🔶",
    logo: "https://www.okx.com/cdn/oksupport/asset/currency/icon/dot.png?x-oss-process=image/format,webp/ignore-error,1",
    color: "#E6007A",
    type: "EVM",
    rpcUrl: typeof process !== "undefined" && process.env?.NEXT_PUBLIC_RPC_POLKADOT_HUB?.trim() ? process.env.NEXT_PUBLIC_RPC_POLKADOT_HUB.trim() : "https://eth-rpc-testnet.polkadot.io",
    chainId: 420420417,
    symbol: "PAS",
    explorer: "https://blockscout-testnet.polkadot.io",
  },
];

export interface WalletState {
  address: string | null;
  chainId: number | null;
  chain: ChainInfo | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  walletType: WalletType | null;
  /** SubWallet 时 EVM 地址 (0x...) */
  evmAddress: string | null;
  /** SubWallet 时 Substrate/SS58 地址 */
  substrateAddress: string | null;
}

/** EIP-6963 获取指定名称的 EVM provider */
function getEIP6963Provider(nameMatch: string): Promise<{ request: (arg: { method: string; params?: unknown[] }) => Promise<unknown> } | null> {
  return new Promise((resolve) => {
    const handler = (e: CustomEvent<{ info: { name: string }; provider: { request: (arg: { method: string; params?: unknown[] }) => Promise<unknown> } }>) => {
      const { info, provider } = e.detail || {};
      if (info?.name && info.name.toLowerCase().includes(nameMatch.toLowerCase())) {
        window.removeEventListener("eip6963:announceProvider", handler as EventListener);
        resolve(provider);
      }
    };
    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handler as EventListener);
      resolve(null);
    }, 1000);
  });
}

export function isSubWalletAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.injectedWeb3 && window.injectedWeb3[SUBWALLET_JS]);
}

export function isMetaMaskAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum;
}

type EvmProvider = { request: (arg: { method: string; params?: unknown[] }) => Promise<unknown> };

export function useWallet() {
  const evmProviderRef = useRef<EvmProvider | null>(null);
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    chain: null,
    isConnected: false,
    isConnecting: false,
    error: null,
    walletType: null,
    evmAddress: null,
    substrateAddress: null,
  });

  const getChainInfo = useCallback((chainId: number | string): ChainInfo | null => {
    let id: number;
    if (typeof chainId === "number" && !Number.isNaN(chainId)) id = chainId;
    else if (typeof chainId === "string") {
      const s = chainId.trim();
      id = /^0x[a-fA-F0-9]+$/.test(s) ? parseInt(s, 16) : parseInt(s, 10);
    } else id = Number(chainId);
    if (Number.isNaN(id)) return null;
    return SUPPORTED_CHAINS.find((c) => c.chainId === id) || null;
  }, []);

  /** 根据当前 chain 与 walletType 得到展示用的 address；SubWallet PVM 在 EVM 链上无 EVM 地址时展示为空 */
  const displayAddress =
    state.chain?.type === "PVM"
      ? (state.substrateAddress || state.address)
      : state.walletType === "subwallet-pvm"
        ? state.evmAddress ?? null
        : (state.evmAddress || state.address);

  const connectMetaMask = useCallback(async (targetChainId?: number) => {
    if (!window.ethereum) {
      setState((prev) => ({ ...prev, error: "请安装 MetaMask 扩展", isConnecting: false }));
      return;
    }
    evmProviderRef.current = window.ethereum as EvmProvider;
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts.length === 0) {
        setState((prev) => ({ ...prev, isConnecting: false }));
        return;
      }
      const chainIdRaw = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      const chainIdNum = typeof chainIdRaw === "string" && /^0x/.test(chainIdRaw) ? parseInt(chainIdRaw, 16) : Number(chainIdRaw);
      const chain = getChainInfo(Number.isNaN(chainIdNum) ? chainIdRaw : chainIdNum);
      const effectiveChainId = Number.isNaN(chainIdNum) ? (chain?.chainId ?? 0) : chainIdNum;
      setState({
        address: accounts[0],
        chainId: effectiveChainId,
        chain: chain || null,
        isConnected: true,
        isConnecting: false,
        error: null,
        walletType: "metamask",
        evmAddress: accounts[0],
        substrateAddress: null,
      });
      if (targetChainId != null && targetChainId !== effectiveChainId) await switchChain(targetChainId);
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      const message =
        err?.code === 4001
          ? "已取消连接"
          : err?.message && typeof err.message === "string"
            ? err.message
            : error instanceof Error
              ? error.message
              : "连接失败，请解锁 MetaMask 后重试";
      setState((prev) => ({ ...prev, isConnecting: false, error: message }));
    }
  }, [getChainInfo]);

  const connectSubWalletEVM = useCallback(async (targetChainId?: number) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const provider = await getEIP6963Provider("SubWallet");
      const evmProvider = (provider || window.ethereum) as EvmProvider | undefined;
      if (!evmProvider?.request) {
        setState((prev) => ({ ...prev, isConnecting: false, error: "未检测到 SubWallet 或请安装 SubWallet 扩展" }));
        return;
      }
      evmProviderRef.current = evmProvider;
      const accounts = (await evmProvider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts.length === 0) {
        setState((prev) => ({ ...prev, isConnecting: false }));
        return;
      }
      const chainIdRaw = (await evmProviderRef.current.request({ method: "eth_chainId" })) as string;
      const chainIdNum = typeof chainIdRaw === "string" && /^0x/.test(chainIdRaw) ? parseInt(chainIdRaw, 16) : Number(chainIdRaw);
      const chain = getChainInfo(Number.isNaN(chainIdNum) ? chainIdRaw : chainIdNum);
      const effectiveChainId = Number.isNaN(chainIdNum) ? (chain?.chainId ?? 0) : chainIdNum;
      setState({
        address: accounts[0],
        chainId: effectiveChainId,
        chain: chain || null,
        isConnected: true,
        isConnecting: false,
        error: null,
        walletType: "subwallet-evm",
        evmAddress: accounts[0],
        substrateAddress: null,
      });
      if (targetChainId != null && targetChainId !== effectiveChainId) await switchChain(targetChainId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "SubWallet (EVM) 连接失败";
      setState((prev) => ({ ...prev, isConnecting: false, error: message }));
    }
  }, [getChainInfo]);

  const connectSubWalletPVM = useCallback(async () => {
    if (!window.injectedWeb3?.[SUBWALLET_JS]) {
      setState((prev) => ({ ...prev, isConnecting: false, error: "请安装 SubWallet 扩展" }));
      return;
    }
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const SubWalletExtension = window.injectedWeb3[SUBWALLET_JS];
      const extension = await SubWalletExtension.enable(window.location.origin);
      const accounts = await extension.accounts.get();
      if (!accounts.length) {
        setState((prev) => ({ ...prev, isConnecting: false, error: "SubWallet 中暂无账户" }));
        return;
      }
      const polkadotChain = SUPPORTED_CHAINS.find((c) => c.id === "polkadot")!;
      setState({
        address: accounts[0].address,
        chainId: polkadotChain.chainId,
        chain: polkadotChain,
        isConnected: true,
        isConnecting: false,
        error: null,
        walletType: "subwallet-pvm",
        evmAddress: null,
        substrateAddress: accounts[0].address,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "SubWallet (Polkadot) 连接失败";
      setState((prev) => ({ ...prev, isConnecting: false, error: message }));
    }
  }, []);

  const connect = useCallback(
    async (wallet: WalletType, targetChainId?: number) => {
      try {
        if (wallet === "metamask") return await connectMetaMask(targetChainId);
        if (wallet === "subwallet-evm") return await connectSubWalletEVM(targetChainId);
        if (wallet === "subwallet-pvm") return await connectSubWalletPVM();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "连接失败";
        setState((prev) => ({ ...prev, isConnecting: false, error: msg }));
      }
    },
    [connectMetaMask, connectSubWalletEVM, connectSubWalletPVM]
  );

  /** 切换链：EVM 时同步请求 MetaMask/钱包 切换网络（wallet_switchEthereumChain），再更新本地 state */
  const switchChain = useCallback(async (targetChainId: number) => {
    const chain = SUPPORTED_CHAINS.find((c) => c.chainId === targetChainId);
    if (!chain) return;

    if (chain.type === "PVM") {
      setState((prev) => ({ ...prev, chainId: targetChainId, chain, address: prev.substrateAddress || prev.address }));
      return;
    }

    const wt = state.walletType;
    if (wt === "subwallet-pvm") {
      setState((prev) => ({ ...prev, chainId: targetChainId, chain, address: prev.evmAddress || prev.address }));
      return;
    }

    const evmProvider = evmProviderRef.current || (typeof window !== "undefined" ? window.ethereum as EvmProvider | undefined : undefined);
    if ((wt === "metamask" || wt === "subwallet-evm") && evmProvider) {
      const chainIdHex = "0x" + targetChainId.toString(16);
      try {
        await evmProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
        setState((prev) => ({ ...prev, chainId: targetChainId, chain }));
      } catch (switchError: unknown) {
        const err = switchError as { code?: number };
        if (err.code === 4902) {
          try {
            await evmProvider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: chainIdHex,
                  chainName: chain.name,
                  nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
                  rpcUrls: [chain.rpcUrl],
                  blockExplorerUrls: [chain.explorer],
                },
              ],
            });
            setState((prev) => ({ ...prev, chainId: targetChainId, chain }));
          } catch (addError) {
            console.error("Error adding chain:", addError);
            throw addError;
          }
        } else {
          throw switchError;
        }
      }
    }
  }, [state.walletType]);

  const disconnect = useCallback(() => {
    evmProviderRef.current = null;
    setState({
      address: null,
      chainId: null,
      chain: null,
      isConnected: false,
      isConnecting: false,
      error: null,
      walletType: null,
      evmAddress: null,
      substrateAddress: null,
    });
  }, []);

  useEffect(() => {
    const provider = evmProviderRef.current || window.ethereum;
    if (!provider || !("on" in provider)) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) disconnect();
      else setState((prev) => ({ ...prev, address: accs[0], evmAddress: prev.walletType === "subwallet-evm" ? accs[0] : prev.evmAddress }));
    };
    const handleChainChanged = (chainId: unknown) => {
      const chainIdNum = typeof chainId === "string"
        ? (/^0x/.test(chainId) ? parseInt(chainId, 16) : parseInt(chainId, 10))
        : Number(chainId);
      const chainLookupKey: string | number =
        Number.isNaN(chainIdNum)
          ? (typeof chainId === "string" || typeof chainId === "number" ? chainId : String(chainId))
          : chainIdNum;
      const chain = getChainInfo(chainLookupKey);
      const effectiveChainId = Number.isNaN(chainIdNum) ? (chain?.chainId ?? 0) : chainIdNum;
      setState((prev) => ({ ...prev, chainId: effectiveChainId, chain }));
    };
    (provider as { on: (e: string, h: (...args: unknown[]) => void) => void }).on("accountsChanged", handleAccountsChanged);
    (provider as { on: (e: string, h: (...args: unknown[]) => void) => void }).on("chainChanged", handleChainChanged);
    return () => {
      (provider as { removeListener?: (e: string, h: (...args: unknown[]) => void) => void })?.removeListener?.("accountsChanged", handleAccountsChanged);
      (provider as { removeListener?: (e: string, h: (...args: unknown[]) => void) => void })?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [disconnect, getChainInfo]);

  return {
    ...state,
    address: displayAddress ?? state.address,
    /** EVM 链余额查询请用此地址，保证为 0x 格式 */
    evmAddress: state.evmAddress ?? (state.address?.startsWith("0x") ? state.address : null),
    connect,
    connectMetaMask,
    connectSubWalletEVM,
    connectSubWalletPVM,
    switchChain,
    disconnect,
    chains: SUPPORTED_CHAINS,
  };
}

export function formatAddress(address: string | null): string {
  if (!address) return "";
  if (address.startsWith("0x")) return `${address.slice(0, 6)}...${address.slice(-4)}`;
  return address.length > 13 ? `${address.slice(0, 6)}...${address.slice(-6)}` : address;
}

export function isWalletInstalled(): boolean {
  return !!window.ethereum || isSubWalletAvailable();
}
