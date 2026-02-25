/**
 * Monallo Bridge：源链 lock 调用与配置。
 * 目标链铸造 maoXXX.SourceChain 由中继完成，不在此调用。
 */

import { ethers } from "ethers";

export const SEPOLIA_CHAIN_ID = 11155111;
export const POLKADOT_HUB_CHAIN_ID = 420420417;

/** 支持的桥接链 */
export const BRIDGE_CHAIN_IDS = [SEPOLIA_CHAIN_ID, POLKADOT_HUB_CHAIN_ID] as const;

const LOCK_ABI = [
  "function lock(address recipient, uint256 destinationChainId) external payable",
  "event Locked(address indexed sender, address indexed recipient, uint256 amount, uint256 destinationChainId, uint256 indexed nonce)",
] as const;

/** 中继/服务端用：Wrapped 代币 mint 接口与 Lock 事件解析 */
export const WRAPPED_MINT_ABI = [
  "function mint(address recipient, uint256 amount, uint256 sourceChainId, bytes32 sourceTxHash, uint256 nonce, uint8 v, bytes32 r, bytes32 s) external",
] as const;

/** Wrapped 代币解锁（跨链回去）：销毁并发出 UnlockRequested */
const WRAPPED_UNLOCK_ABI = [
  "function unlock(address recipient, uint256 amount, uint256 destinationChainId) external",
  "event UnlockRequested(address indexed sender, address indexed recipient, uint256 amount, uint256 destinationChainId, uint256 indexed nonce)",
] as const;

export const LOCK_ABI_FULL = LOCK_ABI;

/** 桥 Lock 合约地址（部署后填入 .env：NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA, NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB） */
const BRIDGE_LOCK_ADDRESSES: Record<number, string> = {
  [SEPOLIA_CHAIN_ID]: process.env.NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA ?? "",
  [POLKADOT_HUB_CHAIN_ID]: process.env.NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB ?? "",
};

export function getBridgeLockAddress(chainId: number): string | null {
  const addr = BRIDGE_LOCK_ADDRESSES[chainId]?.trim();
  return addr && ethers.isAddress(addr) ? addr : null;
}

/** 目标链上 wrapped 代币地址：key = "destinationChainId_sourceChainId"（如 420420417_11155111 = Sepolia→Polkadot Hub 时在 Polkadot Hub 上的 maoETH.Sepolia） */
const WRAPPED_TOKEN_ADDRESSES: Record<string, string> = {
  [`${POLKADOT_HUB_CHAIN_ID}_${SEPOLIA_CHAIN_ID}`]: process.env.WRAPPED_ETH_POLKADOT_HUB ?? "",
  [`${SEPOLIA_CHAIN_ID}_${POLKADOT_HUB_CHAIN_ID}`]: process.env.WRAPPED_PAS_SEPOLIA ?? "",
};

/** 中继用：根据目标链与源链 ID 取 wrapped 代币合约地址（lock-mint 时目标链上的 wrapped 地址） */
export function getWrappedTokenAddress(destinationChainId: number, sourceChainId: number): string | null {
  const key = `${destinationChainId}_${sourceChainId}`;
  const addr = WRAPPED_TOKEN_ADDRESSES[key]?.trim();
  return addr && ethers.isAddress(addr) ? addr : null;
}

/** 解锁时：在 sourceChainId 上的 wrapped 代币合约地址（即 getWrappedTokenAddress(sourceChainId, destinationChainId)） */
export function getWrappedTokenAddressForUnlock(sourceChainId: number, destinationChainId: number): string | null {
  return getWrappedTokenAddress(sourceChainId, destinationChainId);
}

export interface LockViaBridgeParams {
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  sourceChainId: number;
  lockContractAddress: string;
  recipient: string;
  destinationChainId: number;
  /** 人类可读金额，如 "0.1"（18 位小数） */
  amount: string;
}

/**
 * 在源链调用桥 Lock 合约的 lock(recipient, destinationChainId)，转入 amount 原生代币。
 * 会先 switch 到 sourceChainId。
 */
export async function lockViaBridge(params: LockViaBridgeParams): Promise<{ hash: string }> {
  const { ethereum, sourceChainId, lockContractAddress, recipient, destinationChainId, amount } = params;
  const provider = new ethers.BrowserProvider(ethereum as unknown as ethers.Eip1193Provider);
  const chainIdHex = "0x" + sourceChainId.toString(16);

  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 4902) {
      throw new Error("请先在 MetaMask 中添加该网络");
    }
    throw e;
  }

  const signer = await provider.getSigner();
  const contract = new ethers.Contract(lockContractAddress, LOCK_ABI, signer);
  const valueWei = ethers.parseEther(amount);
  const tx = await contract.lock(ethers.getAddress(recipient), destinationChainId, { value: valueWei });
  await tx.wait();
  return { hash: tx.hash };
}

export interface UnlockViaBridgeParams {
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  sourceChainId: number;
  wrappedTokenAddress: string;
  recipient: string;
  destinationChainId: number;
  amount: string;
}

/**
 * 跨链回去：在源链调用 wrapped 代币的 unlock(recipient, amount, destinationChainId)，销毁 wrapped，中继将在目标链 release 原生资产。
 */
export async function unlockViaBridge(params: UnlockViaBridgeParams): Promise<{ hash: string }> {
  const { ethereum, sourceChainId, wrappedTokenAddress, recipient, destinationChainId, amount } = params;
  const provider = new ethers.BrowserProvider(ethereum as unknown as ethers.Eip1193Provider);
  const chainIdHex = "0x" + sourceChainId.toString(16);

  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 4902) {
      throw new Error("请先在 MetaMask 中添加该网络");
    }
    throw e;
  }

  const signer = await provider.getSigner();
  const contract = new ethers.Contract(wrappedTokenAddress, WRAPPED_UNLOCK_ABI, signer);
  const amountWei = ethers.parseEther(amount);
  const tx = await contract.unlock(ethers.getAddress(recipient), amountWei, destinationChainId);
  await tx.wait();
  return { hash: tx.hash };
}
