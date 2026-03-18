#!/usr/bin/env node
/**
 * Set CreditLedger recharge rate so that on-chain minted MON matches USD points.
 *
 * Background:
 * - CreditLedger mints: amountMonRaw = msg.valueWei * rateNum / rateDenom
 * - MON uses 6 decimals (1e6 = 1 MON)
 *
 * To make "1 USD = 1 MON" when paying with native PAS:
 * - If 1 PAS = P USD, then 1 PAS should mint P MON
 * - Choose: rateDenom = 1e18 (wei per PAS), rateNum = round(P * 1e6)
 *
 * Usage:
 *   PAS_PRICE_USD=1.624 node scripts/set-credit-ledger-rate.mjs
 *
 * Required env (read from .env if present):
 *   - DEPLOYER_PRIVATE_KEY  (CreditLedger owner)
 *   - CREDIT_LEDGER_ADDRESS
 * Optional:
 *   - RPC_Polkadot_Hub (default Polkadot Hub RPC)
 *   - PAS_PRICE_USD   (or RATE_PAS_USD)
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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

const RPC = process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";
const pk = process.env.DEPLOYER_PRIVATE_KEY;
const ledger = process.env.CREDIT_LEDGER_ADDRESS ?? process.env.NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS;
const priceStr = process.env.PAS_PRICE_USD ?? process.env.RATE_PAS_USD;

if (!pk) {
  console.error("Missing DEPLOYER_PRIVATE_KEY");
  process.exit(1);
}
if (!ledger) {
  console.error("Missing CREDIT_LEDGER_ADDRESS (or NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS)");
  process.exit(1);
}
if (!priceStr) {
  console.error("Missing PAS_PRICE_USD (or RATE_PAS_USD). Example: PAS_PRICE_USD=1.624 node scripts/set-credit-ledger-rate.mjs");
  process.exit(1);
}

const price = Number(priceStr);
if (!Number.isFinite(price) || price <= 0) {
  console.error("Invalid PAS price USD:", priceStr);
  process.exit(1);
}

const rateDenom = 10n ** 18n; // wei per PAS
const rateNum = BigInt(Math.round(price * 1e6)); // MON raw per PAS

const ABI = [
  "function owner() view returns (address)",
  "function rateNum() view returns (uint256)",
  "function rateDenom() view returns (uint256)",
  "function setRate(uint256 rateNum_, uint256 rateDenom_)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const c = new ethers.Contract(ledger, ABI, signer);

  const [owner, curNum, curDen] = await Promise.all([c.owner(), c.rateNum(), c.rateDenom()]);
  const me = await signer.getAddress();

  console.log("CreditLedger:", ledger);
  console.log("RPC:        ", RPC);
  console.log("Owner:      ", owner);
  console.log("Signer:     ", me);
  console.log("Current rateNum/rateDenom:", curNum.toString(), "/", curDen.toString());
  console.log("Setting PAS price USD:", price);
  console.log("New rateNum/rateDenom:", rateNum.toString(), "/", rateDenom.toString());
  console.log();

  if (owner.toLowerCase() !== me.toLowerCase()) {
    console.error("Signer is not owner. Only owner can setRate().");
    process.exit(1);
  }

  const tx = await c.setRate(rateNum, rateDenom);
  console.log("Tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Mined in block:", receipt.blockNumber);

  const [newNum, newDen] = await Promise.all([c.rateNum(), c.rateDenom()]);
  console.log("Updated rateNum/rateDenom:", newNum.toString(), "/", newDen.toString());
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

