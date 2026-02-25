/**
 * 通过 MetaMask 等 EVM 钱包发起真实转账（Send）。
 * 支持原生币（ETH/PAS）与 ERC20。
 */

import { ethers } from "ethers";

const ERC20_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

export interface SendParams {
  /** 当前链的 RPC，用于 switch 失败时提示 */
  chainId: number;
  /** 接收地址 0x... */
  to: string;
  /** 数量（人类可读，如 "0.01"） */
  amount: string;
  /** 代币符号，如 ETH, PAS, USDT */
  tokenSymbol: string;
  /** 原生币则无；ERC20 则为合约地址 */
  tokenContract?: string;
  /** ERC20 精度，如 18 或 6 */
  decimals: number;
}

/**
 * 使用当前连接的 provider（window.ethereum）先切换到目标链，再发起转账。
 * 返回交易 hash；用户会在 MetaMask 中看到弹窗并确认。
 */
export async function sendViaWallet(
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  params: SendParams
): Promise<{ hash: string }> {
  const provider = new ethers.BrowserProvider(ethereum as unknown as ethers.Eip1193Provider);
  const chainIdHex = "0x" + params.chainId.toString(16);

  // 确保在目标链上
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
  const to = ethers.getAddress(params.to);

  if (!params.tokenContract || params.tokenContract === "0x0000000000000000000000000000000000000000") {
    // 原生币
    const valueWei = ethers.parseEther(params.amount);
    const tx = await signer.sendTransaction({ to, value: valueWei });
    return { hash: tx.hash };
  }

  // ERC20
  const contract = new ethers.Contract(params.tokenContract, ERC20_TRANSFER_ABI, signer);
  const amountWei = ethers.parseUnits(params.amount, params.decimals);
  const tx = await contract.transfer(to, amountWei);
  return { hash: tx.hash };
}
