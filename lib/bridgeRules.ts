/**
 * 三链 Bridge 开放边 / 禁止边（与计划文档一致）。canonical 链键与 getCanonicalChainKey 对齐。
 */

export type WrappedKind = "maoPAS.PH" | "maoETH.Sepolia" | "maoINJ.Injective";

export const BRIDGE_DIRECTION_CLOSED_MSG = "This bridge direction is not available.";

export function normalizeWrappedKindFromToken(token: string): WrappedKind | null {
  const t = (token || "").trim().toLowerCase();
  if (t.includes("maoinj")) return "maoINJ.Injective";
  if (t.includes("maopas")) return "maoPAS.PH";
  if (t.includes("maoeth")) return "maoETH.Sepolia";
  return null;
}

export function isBridgeUnlockIntent(token: string): boolean {
  return normalizeWrappedKindFromToken(token || "") !== null;
}

export function isAllowedBridgeLockMint(srcKey: string, tgtKey: string, tokenUpper: string): boolean {
  if (srcKey === tgtKey) return false;
  const edges: Array<[string, string, string]> = [
    ["sepolia", "polkadot-hub", "ETH"],
    ["sepolia", "injective-testnet", "ETH"],
    ["polkadot-hub", "sepolia", "PAS"],
    ["polkadot-hub", "injective-testnet", "PAS"],
    ["injective-testnet", "sepolia", "INJ"],
    ["injective-testnet", "polkadot-hub", "INJ"],
  ];
  return edges.some(([s, t, tok]) => s === srcKey && t === tgtKey && tok === tokenUpper);
}

export function isAllowedBridgeUnlock(srcKey: string, tgtKey: string, token: string): boolean {
  const kind = normalizeWrappedKindFromToken(token);
  if (!kind) return false;
  const edges: Array<[string, string, WrappedKind]> = [
    ["polkadot-hub", "sepolia", "maoETH.Sepolia"],
    ["injective-testnet", "sepolia", "maoETH.Sepolia"],
    ["sepolia", "polkadot-hub", "maoPAS.PH"],
    ["injective-testnet", "polkadot-hub", "maoPAS.PH"],
    ["sepolia", "injective-testnet", "maoINJ.Injective"],
    ["polkadot-hub", "injective-testnet", "maoINJ.Injective"],
  ];
  return edges.some(([s, t, k]) => s === srcKey && t === tgtKey && k === kind);
}

export function isForbiddenWrappedWrappedBridge(srcKey: string, tgtKey: string, token: string): boolean {
  const kind = normalizeWrappedKindFromToken(token);
  if (!kind) return false;
  const bad: Array<[string, string, WrappedKind]> = [
    ["sepolia", "injective-testnet", "maoPAS.PH"],
    ["sepolia", "polkadot-hub", "maoINJ.Injective"],
    ["polkadot-hub", "sepolia", "maoINJ.Injective"],
    ["polkadot-hub", "injective-testnet", "maoETH.Sepolia"],
    ["injective-testnet", "sepolia", "maoPAS.PH"],
    ["injective-testnet", "polkadot-hub", "maoETH.Sepolia"],
  ];
  return bad.some(([s, t, k]) => s === srcKey && t === tgtKey && k === kind);
}

export function evmChainIdToBridgeKey(chainId: number): string {
  if (chainId === 11155111) return "sepolia";
  if (chainId === 420420417) return "polkadot-hub";
  if (chainId === 1439) return "injective-testnet";
  return "";
}
