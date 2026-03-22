#!/usr/bin/env node
/**
 * Deploy CreditLedger (same bytecode on all Store chains) to Polkadot Hub, Injective EVM, or PlatON Dev.
 *
 * Polkadot Hub (default):
 *   OPERATOR_ADDRESS=0x... node scripts/deploy-credit-ledger.mjs
 *
 * Injective EVM (chainId 1439):
 *   OPERATOR_ADDRESS=0x... node scripts/deploy-credit-ledger.mjs injective
 *   # or: STORE_LEDGER_DEPLOY_NETWORK=injective node scripts/deploy-credit-ledger.mjs
 *
 * PlatON Dev (chainId 20250407):
 *   OPERATOR_ADDRESS=0x... node scripts/deploy-credit-ledger.mjs platon-dev
 *   # or: STORE_LEDGER_DEPLOY_NETWORK=platon-dev node scripts/deploy-credit-ledger.mjs
 *
 * Env: DEPLOYER_PRIVATE_KEY (must have gas on target chain: PAS / INJ / LAT respectively)
 *      RPC_Polkadot_Hub / RPC_INJECTIVE / RPC_PlatON (optional where defaults exist)
 *      OPERATOR_ADDRESS (defaults to deployer; should match STORE_OPERATOR_PRIVATE_KEY later)
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import solc from "solc";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const argNet = (process.argv[2] || "").toLowerCase();
const envNet = (process.env.STORE_LEDGER_DEPLOY_NETWORK || "").toLowerCase();
const netKey = argNet || envNet;

const HUB_CHAIN_ID = 420420417;
const INJECTIVE_CHAIN_ID = 1439;
const PLATON_DEV_CHAIN_ID = 20250407;

/** @type {"hub" | "injective" | "platon"} */
let target = "hub";
if (netKey === "injective" || netKey === "1439") target = "injective";
if (
  netKey === "platon" ||
  netKey === "platon-dev" ||
  netKey === "platon_dev" ||
  netKey === String(PLATON_DEV_CHAIN_ID)
) {
  target = "platon";
}

const RPC =
  target === "injective"
    ? process.env.RPC_INJECTIVE?.trim() ||
      process.env.RPC_Injective?.trim() ||
      "https://k8s.testnet.json-rpc.injective.network/"
    : target === "platon"
      ? process.env.RPC_PlatON?.trim() ||
        process.env.RPC_PLATON?.trim() ||
        "https://devnet3openapi.platon.network/rpc"
      : process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";

const pk = process.env.DEPLOYER_PRIVATE_KEY;
const operator = process.env.OPERATOR_ADDRESS;

if (!pk) {
  console.error("Set DEPLOYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const CreditLedgerSource = readFileSync(join(root, "contracts", "CreditLedger.sol"), "utf8");

function compile(name, content) {
  const input = {
    language: "Solidity",
    sources: { [name]: { content } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors?.length) {
    const err = out.errors.find((e) => e.severity === "error");
    if (err) throw new Error(err.formattedMessage ?? err.message);
  }
  const contract = out.contracts[name]["CreditLedger"];
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function main() {
  const { abi, bytecode } = compile("CreditLedger.sol", CreditLedgerSource);
  const network =
    target === "injective"
      ? { chainId: INJECTIVE_CHAIN_ID, name: "injective-testnet" }
      : target === "platon"
        ? { chainId: PLATON_DEV_CHAIN_ID, name: "platon-dev-testnet" }
        : { chainId: HUB_CHAIN_ID, name: "polkadot-hub-testnet" };
  const label =
    target === "injective"
      ? `Injective EVM (${INJECTIVE_CHAIN_ID})`
      : target === "platon"
        ? `PlatON Dev (${PLATON_DEV_CHAIN_ID})`
        : "Polkadot Hub testnet";
  console.log("Target network:", label);
  console.log("RPC:", RPC.replace(/\/\/.*@/, "//***@"));
  const provider = new ethers.JsonRpcProvider(RPC, network);
  const signer = new ethers.Wallet(pk, provider);
  const operatorAddress = operator ?? (await signer.getAddress());
  console.log("Deploying CreditLedger with operator:", operatorAddress);
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(operatorAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("CreditLedger deployed at:", address);
  if (target === "injective") {
    console.log("Set in .env: CREDIT_LEDGER_ADDRESS_INJECTIVE=" + address);
    console.log("Optional: NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS_INJECTIVE=" + address);
  } else if (target === "platon") {
    console.log("Set in .env: CREDIT_LEDGER_ADDRESS_PLATON_DEV=" + address);
    console.log("Optional: NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS_PLATON_DEV=" + address);
  } else {
    console.log("Set in .env: CREDIT_LEDGER_ADDRESS=" + address);
    console.log("Set NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS=" + address + " (Store Hub balance display)");
  }
  console.log("Set STORE_OPERATOR_PRIVATE_KEY to the operator private key (must match OPERATOR_ADDRESS / mint+settle on this chain).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
