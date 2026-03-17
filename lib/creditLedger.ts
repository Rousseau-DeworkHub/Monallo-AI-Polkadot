/**
 * CreditLedger contract interaction (mintCredit, settle, balanceOf).
 * MON uses 6 decimals: 1e6 = 1 MON.
 */

import { ethers } from "ethers";

const MON_DECIMALS = 1e6;

const CREDIT_LEDGER_ABI = [
  "function mintCredit(address user, uint256 amountMon) external",
  "function settle(address user, uint256 amountMon, bytes32 dayId, bytes32 settlementId) external",
  "function balanceOf(address user) external view returns (uint256)",
  "function creditOf(address user) external view returns (uint256)",
  "function recharge() external payable",
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

/**
 * Frontend: user sends native token (PAS) to contract and receives MON credit. Switches chain then calls recharge().
 */
export async function rechargeViaContract(
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  contractAddress: string,
  amountWei: bigint,
  chainId: number
): Promise<{ hash: string }> {
  const chainIdHex = "0x" + chainId.toString(16);
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 4902) throw new Error("请先在 MetaMask 中添加该网络");
    throw e;
  }
  const provider = new ethers.BrowserProvider(ethereum as unknown as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  const contract = getCreditLedgerContract(provider, contractAddress, signer);
  const tx = await contract.recharge({ value: amountWei });
  await tx.wait();
  return { hash: tx.hash };
}
