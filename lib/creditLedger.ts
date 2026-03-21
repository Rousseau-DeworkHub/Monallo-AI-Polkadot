/**
 * CreditLedger contract interaction (mintCredit, settle, balanceOf).
 * MON uses 6 decimals: 1e6 = 1 MON.
 */

import { ethers } from "ethers";
import {
  getCreditLedgerAddressForChain,
  getStaticNetworkForStoreChain,
  getStoreChainRpc,
  STORE_INJECTIVE_EVM_CHAIN_ID,
  STORE_POLKADOT_HUB_CHAIN_ID,
} from "./storeChainConfig";

const MON_DECIMALS = 1e6;

const CREDIT_LEDGER_ABI = [
  "function mintCredit(address user, uint256 amountMon) external",
  "function settle(address user, uint256 amountMon, bytes32 dayId, bytes32 settlementId) external",
  "function balanceOf(address user) external view returns (uint256)",
  "function creditOf(address user) external view returns (uint256)",
] as const;

export function parseMonToRaw(mon: number): bigint {
  return BigInt(Math.round(mon * MON_DECIMALS));
}

export function rawToMon(raw: bigint): number {
  return Number(raw) / MON_DECIMALS;
}

export function getCreditLedgerContract(
  provider: ethers.Provider,
  contractAddress: string,
  signer?: ethers.Signer
): ethers.Contract {
  return new ethers.Contract(
    contractAddress,
    CREDIT_LEDGER_ABI,
    signer ?? provider
  );
}

export async function getCreditBalance(
  provider: ethers.Provider,
  contractAddress: string,
  walletAddress: string
): Promise<number> {
  const contract = getCreditLedgerContract(provider, contractAddress);
  const raw = await contract.balanceOf(walletAddress);
  return rawToMon(raw);
}

export async function mintCredit(
  signer: ethers.Signer,
  contractAddress: string,
  userAddress: string,
  amountMon: number
): Promise<{ hash: string }> {
  const contract = getCreditLedgerContract(await signer.provider!, contractAddress, signer);
  const amountRaw = parseMonToRaw(amountMon);
  const tx = await contract.mintCredit(userAddress, amountRaw);
  await tx.wait();
  return { hash: tx.hash };
}

export async function settle(
  signer: ethers.Signer,
  contractAddress: string,
  userAddress: string,
  amountMon: number,
  dayId: string,
  settlementId: string
): Promise<{ hash: string }> {
  const contract = getCreditLedgerContract(await signer.provider!, contractAddress, signer);
  const amountRaw = parseMonToRaw(amountMon);
  const dayIdBytes = ethers.id(dayId);
  const settlementIdBytes = ethers.id(settlementId);
  const tx = await contract.settle(userAddress, amountRaw, dayIdBytes, settlementIdBytes);
  await tx.wait();
  return { hash: tx.hash };
}

// Note: recharge()/receive() are disabled in scheme A.

const STORE_LEDGER_ORDER = [STORE_POLKADOT_HUB_CHAIN_ID, STORE_INJECTIVE_EVM_CHAIN_ID] as const;

/** Sum MON balance across all configured Store ledgers (Hub + Injective). */
export async function getCombinedStoreCreditMon(walletAddress: string): Promise<number> {
  let total = 0;
  for (const chainId of STORE_LEDGER_ORDER) {
    const rpc = getStoreChainRpc(chainId);
    const addr = getCreditLedgerAddressForChain(chainId);
    if (!rpc || !addr) continue;
    const net = getStaticNetworkForStoreChain(chainId);
    if (!net) continue;
    try {
      const provider = new ethers.JsonRpcProvider(rpc, net);
      total += await getCreditBalance(provider, addr, walletAddress);
    } catch (_) {}
  }
  return total;
}

/**
 * Prefer Hub, then Injective: first ledger with balance >= amountMon gets settle().
 * Returns mint tx hash and which chain was used.
 */
export async function settleStoreCreditOnBestLedger(
  operatorPk: string,
  userAddress: string,
  amountMon: number,
  dayId: string,
  settlementId: string
): Promise<{ hash: string; chainId: number } | null> {
  for (const chainId of STORE_LEDGER_ORDER) {
    const rpc = getStoreChainRpc(chainId);
    const addr = getCreditLedgerAddressForChain(chainId);
    if (!rpc || !addr) continue;
    const net = getStaticNetworkForStoreChain(chainId);
    if (!net) continue;
    try {
      const provider = new ethers.JsonRpcProvider(rpc, net);
      const bal = await getCreditBalance(provider, addr, userAddress);
      if (bal + 1e-12 < amountMon) continue;
      const signer = new ethers.Wallet(operatorPk, provider);
      const { hash } = await settle(signer, addr, userAddress, amountMon, dayId, settlementId);
      return { hash, chainId };
    } catch (_) {}
  }
  return null;
}

export type PickLedgerForSettleResult = {
  rpc: string;
  contractAddress: string;
  chainId: number;
  openingMon: number;
  provider: ethers.JsonRpcProvider;
};

/** First ledger (Hub then Injective) with on-chain balance >= usageMon. */
export async function pickStoreLedgerForDailySettle(
  walletAddress: string,
  usageMon: number
): Promise<PickLedgerForSettleResult | null> {
  for (const chainId of STORE_LEDGER_ORDER) {
    const rpc = getStoreChainRpc(chainId);
    const addr = getCreditLedgerAddressForChain(chainId);
    if (!rpc || !addr) continue;
    const net = getStaticNetworkForStoreChain(chainId);
    if (!net) continue;
    try {
      const provider = new ethers.JsonRpcProvider(rpc, net);
      const openingMon = await getCreditBalance(provider, addr, walletAddress);
      if (openingMon + 1e-12 >= usageMon) {
        return { rpc, contractAddress: addr, chainId, openingMon, provider };
      }
    } catch (_) {}
  }
  return null;
}
