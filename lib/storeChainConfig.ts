/**
 * Monallo Store: supported payment chains (Polkadot Hub testnet, Injective EVM testnet, PlatON Dev).
 * Each chain needs RPC + CREDIT_LEDGER_ADDRESS (Hub / Injective / PlatON Dev env names below).
 */

export const STORE_POLKADOT_HUB_CHAIN_ID = 420420417;
export const STORE_INJECTIVE_EVM_CHAIN_ID = 1439;
/** PlatON Dev EVM testnet — https://devnet3scan.platon.network/ */
export const STORE_PLATON_DEV_CHAIN_ID = 20250407;

export const STORE_PAYMENT_CHAIN_IDS = [
  STORE_POLKADOT_HUB_CHAIN_ID,
  STORE_INJECTIVE_EVM_CHAIN_ID,
  STORE_PLATON_DEV_CHAIN_ID,
] as const;

/**
 * Use with ethers.JsonRpcProvider(rpc, network) so ethers skips auto network detection
 * (avoids "failed to detect network... retry in 1s" spam when eth_chainId is slow or flaky).
 */
export function getStaticNetworkForStoreChain(chainId: number): { chainId: number; name: string } | null {
  if (chainId === STORE_POLKADOT_HUB_CHAIN_ID) {
    return { chainId: STORE_POLKADOT_HUB_CHAIN_ID, name: "polkadot-hub-testnet" };
  }
  if (chainId === STORE_INJECTIVE_EVM_CHAIN_ID) {
    return { chainId: STORE_INJECTIVE_EVM_CHAIN_ID, name: "injective-testnet" };
  }
  if (chainId === STORE_PLATON_DEV_CHAIN_ID) {
    return { chainId: STORE_PLATON_DEV_CHAIN_ID, name: "platon-dev-testnet" };
  }
  return null;
}

export function getStoreChainRpc(chainId: number): string | null {
  if (chainId === STORE_POLKADOT_HUB_CHAIN_ID) {
    return process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";
  }
  if (chainId === STORE_INJECTIVE_EVM_CHAIN_ID) {
    if (process.env.RPC_INJECTIVE?.trim()) return process.env.RPC_INJECTIVE.trim();
    if (process.env.RPC_Injective?.trim()) return process.env.RPC_Injective.trim();
    return "https://k8s.testnet.json-rpc.injective.network/";
  }
  if (chainId === STORE_PLATON_DEV_CHAIN_ID) {
    return process.env.RPC_PlatON?.trim() || process.env.RPC_PLATON?.trim() || "https://devnet3openapi.platon.network/rpc";
  }
  return null;
}

/** On-chain CreditLedger for mint/settle/balance on this chain. */
export function getCreditLedgerAddressForChain(chainId: number): string | null {
  if (chainId === STORE_POLKADOT_HUB_CHAIN_ID) {
    const a = (process.env.CREDIT_LEDGER_ADDRESS ?? process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS)?.trim();
    return a || null;
  }
  if (chainId === STORE_INJECTIVE_EVM_CHAIN_ID) {
    const a = (process.env.CREDIT_LEDGER_ADDRESS_INJECTIVE ?? process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS_INJECTIVE)?.trim();
    return a || null;
  }
  if (chainId === STORE_PLATON_DEV_CHAIN_ID) {
    const a = (process.env.CREDIT_LEDGER_ADDRESS_PLATON_DEV ?? process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS_PLATON_DEV)?.trim();
    return a || null;
  }
  return null;
}

export function isStorePaymentChainConfigured(chainId: number): boolean {
  return !!(getStoreChainRpc(chainId) && getCreditLedgerAddressForChain(chainId));
}
