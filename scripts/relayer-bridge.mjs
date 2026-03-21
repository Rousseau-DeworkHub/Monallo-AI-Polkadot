#!/usr/bin/env node
/**
 * Monallo Bridge 中继：监听三链 Locked 事件，在目标链铸造 maoXXX.SourceChain；监听 UnlockRequested 并在目标链 release。
 * 需配置 .env：RPC_SEPOLIA, RPC_POLKADOT_HUB, RPC_INJECTIVE（可选）, BRIDGE_LOCK_*, WRAPPED_*, RELAYER_PRIVATE_KEY
 * 运行：node scripts/relayer-bridge.mjs --trigger=11155111|420420417|1439|all
 * 或：node scripts/relayer-bridge.mjs 0x<lock 或 unlock 交易 hash>
 */

import { ethers } from "ethers";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DB_PATH = path.join(root, ".data", "monallo.db");

// #region agent log
const DEBUG_LOG_PATH = path.join(root, ".cursor", "debug-e7dbbf.log");
function _dbg(payload) {
  const obj = { sessionId: "e7dbbf", location: "relayer-bridge.mjs", timestamp: Date.now(), ...payload };
  const line = JSON.stringify(obj) + "\n";
  try {
    const dir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (_) {}
  fetch("http://127.0.0.1:7284/ingest/5c8eba69-0fdb-4776-ae54-e56332ccd306", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e7dbbf" },
    body: JSON.stringify(obj),
  }).catch(() => {});
}
// #endregion

// 加载 .env
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const SEPOLIA_CHAIN_ID = 11155111;
const POLKADOT_HUB_CHAIN_ID = 420420417;
const INJECTIVE_CHAIN_ID = 1439;

const LOCK_ABI = [
  "event Locked(address indexed sender, address indexed recipient, uint256 amount, uint256 destinationChainId, uint256 indexed nonce)",
];
const MINT_ABI = [
  "function mint(address recipient, uint256 amount, uint256 sourceChainId, bytes32 sourceTxHash, uint256 nonce, uint8 v, bytes32 r, bytes32 s) external",
];
const UNLOCK_ABI = [
  "event UnlockRequested(address indexed sender, address indexed recipient, uint256 amount, uint256 destinationChainId, uint256 indexed nonce)",
];
const RELEASE_ABI = [
  "function release(address recipient, uint256 amount, uint256 sourceChainId, bytes32 sourceTxHash, uint256 nonce, uint8 v, bytes32 r, bytes32 s) external",
];

function envAddr(...keys) {
  for (const k of keys) {
    const v = typeof k === "string" ? k.trim() : "";
    if (v) return v;
  }
  return "";
}

function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS bridge_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_chain_id INTEGER NOT NULL,
      source_tx_hash TEXT NOT NULL,
      recipient TEXT NOT NULL,
      amount TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      destination_chain_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      destination_tx_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_proof ON bridge_transfers(source_chain_id, source_tx_hash, nonce);
    CREATE TABLE IF NOT EXISTS bridge_unlock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_chain_id INTEGER NOT NULL,
      source_tx_hash TEXT NOT NULL,
      recipient TEXT NOT NULL,
      amount TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      destination_chain_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      destination_tx_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_unlock_proof ON bridge_unlock(source_chain_id, source_tx_hash, nonce);
  `);
  return db;
}

function getBridgeTransferByProof(db, sourceChainId, sourceTxHash, nonce) {
  const row = db
    .prepare("SELECT * FROM bridge_transfers WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?")
    .get(sourceChainId, sourceTxHash, nonce);
  return row ?? null;
}

function insertBridgeTransfer(db, row) {
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR IGNORE INTO bridge_transfers (source_chain_id, source_tx_hash, recipient, amount, nonce, destination_chain_id, status, destination_tx_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
  `).run(row.source_chain_id, row.source_tx_hash, row.recipient, row.amount, row.nonce, row.destination_chain_id, created_at);
}

function setBridgeTransferRelayed(db, sourceChainId, sourceTxHash, nonce, destinationTxHash) {
  db.prepare(
    "UPDATE bridge_transfers SET status = 'relayed', destination_tx_hash = ? WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?"
  ).run(destinationTxHash, sourceChainId, sourceTxHash, nonce);
}

function getBridgeUnlockByProof(db, sourceChainId, sourceTxHash, nonce) {
  const row = db
    .prepare("SELECT * FROM bridge_unlock WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?")
    .get(sourceChainId, sourceTxHash, nonce);
  return row ?? null;
}

function insertBridgeUnlock(db, row) {
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR IGNORE INTO bridge_unlock (source_chain_id, source_tx_hash, recipient, amount, nonce, destination_chain_id, status, destination_tx_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
  `).run(row.source_chain_id, row.source_tx_hash, row.recipient, row.amount, row.nonce, row.destination_chain_id, created_at);
}

function setBridgeUnlockRelayed(db, sourceChainId, sourceTxHash, nonce, destinationTxHash) {
  db.prepare(
    "UPDATE bridge_unlock SET status = 'relayed', destination_tx_hash = ? WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?"
  ).run(destinationTxHash, sourceChainId, sourceTxHash, nonce);
}

function getWrappedAddress(destinationChainId, sourceChainId) {
  const key = `${destinationChainId}_${sourceChainId}`;
  const map = {
    [`${POLKADOT_HUB_CHAIN_ID}_${SEPOLIA_CHAIN_ID}`]: envAddr(process.env.WRAPPED_ETH_POLKADOT_HUB, process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB),
    [`${SEPOLIA_CHAIN_ID}_${POLKADOT_HUB_CHAIN_ID}`]: envAddr(process.env.WRAPPED_PAS_SEPOLIA, process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA),
    [`${INJECTIVE_CHAIN_ID}_${SEPOLIA_CHAIN_ID}`]: envAddr(process.env.WRAPPED_ETH_INJECTIVE, process.env.NEXT_PUBLIC_WRAPPED_ETH_INJECTIVE),
    [`${INJECTIVE_CHAIN_ID}_${POLKADOT_HUB_CHAIN_ID}`]: envAddr(process.env.WRAPPED_PAS_INJECTIVE, process.env.NEXT_PUBLIC_WRAPPED_PAS_INJECTIVE),
    [`${SEPOLIA_CHAIN_ID}_${INJECTIVE_CHAIN_ID}`]: envAddr(process.env.WRAPPED_INJ_SEPOLIA, process.env.NEXT_PUBLIC_WRAPPED_INJ_SEPOLIA),
    [`${POLKADOT_HUB_CHAIN_ID}_${INJECTIVE_CHAIN_ID}`]: envAddr(process.env.WRAPPED_INJ_POLKADOT_HUB, process.env.NEXT_PUBLIC_WRAPPED_INJ_POLKADOT_HUB),
  };
  const addr = map[key];
  return addr?.trim() || null;
}

async function getSepoliaProvider() {
  const urls = process.env.RPC_SEPOLIA
    ? [process.env.RPC_SEPOLIA]
    : ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.drpc.org"];
  const net = { chainId: SEPOLIA_CHAIN_ID, name: "sepolia" };
  for (const url of urls) {
    try {
      console.log("  Trying", url, "...");
      const p = new ethers.JsonRpcProvider(url, net);
      const block = await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      console.log("  Sepolia connected, block", block.toString());
      return p;
    } catch (e) {
      console.warn("  Failed:", e?.shortMessage ?? e?.message);
    }
  }
  throw new Error("No Sepolia RPC available. Set RPC_SEPOLIA in .env");
}

async function getInjectiveProvider() {
  const urls = [];
  if (process.env.RPC_INJECTIVE) urls.push(process.env.RPC_INJECTIVE);
  if (process.env.RPC_Injective) urls.push(process.env.RPC_Injective);
  if (urls.length === 0) urls.push("https://k8s.testnet.json-rpc.injective.network/");
  const net = { chainId: INJECTIVE_CHAIN_ID, name: "injective-testnet" };
  for (const url of urls) {
    try {
      console.log("  Trying Injective", url, "...");
      const p = new ethers.JsonRpcProvider(url, net);
      const block = await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      console.log("  Injective EVM connected, block", block.toString());
      return p;
    } catch (e) {
      console.warn("  Failed:", e?.shortMessage ?? e?.message);
    }
  }
  throw new Error("No Injective RPC available. Set RPC_INJECTIVE or RPC_Injective in .env");
}

function makeUnlockContracts(provider, pairs) {
  /** pairs: [destChainId, sourceChainId][] */
  const out = [];
  for (const [d, s] of pairs) {
    const a = getWrappedAddress(d, s);
    if (a) out.push(new ethers.Contract(a, UNLOCK_ABI, provider));
  }
  return out;
}

async function run() {
  const rpcPh =
    process.env.RPC_POLKADOT_HUB ?? process.env.RPC_Polkadot_Hub ?? process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io";
  try {
    _dbg({ message: "Polkadot Hub RPC host", data: { host: new URL(rpcPh).hostname }, hypothesisId: "H1" });
  } catch (_) {}
  const lockSepolia = process.env.BRIDGE_LOCK_SEPOLIA ?? process.env.NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA;
  const lockPh = process.env.BRIDGE_LOCK_POLKADOT_HUB ?? process.env.NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB;
  const lockInj = process.env.BRIDGE_LOCK_INJECTIVE ?? process.env.NEXT_PUBLIC_BRIDGE_LOCK_INJECTIVE;
  const relayerPk = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerPk) {
    console.error("Missing RELAYER_PRIVATE_KEY in .env");
    process.exit(1);
  }
  if (!lockSepolia || !lockPh) {
    console.error("Missing BRIDGE_LOCK_SEPOLIA or BRIDGE_LOCK_POLKADOT_HUB in .env");
    process.exit(1);
  }

  const db = getDb();
  const wallet = new ethers.Wallet(relayerPk);

  console.log("Connecting to Sepolia...");
  const providerSepolia = await getSepoliaProvider();
  console.log("Connecting to Polkadot Hub...");
  const netPh = { chainId: POLKADOT_HUB_CHAIN_ID, name: "polkadot-hub" };
  const providerPh = new ethers.JsonRpcProvider(rpcPh, netPh);
  await Promise.race([
    providerPh.getBlockNumber(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
  ])
    .then((b) => console.log("  Polkadot Hub connected, block", b.toString()))
    .catch((e) => {
      console.warn("  Polkadot Hub RPC warning:", e?.message ?? e);
    });

  let providerInj = null;
  if (lockInj) {
    console.log("Connecting to Injective EVM...");
    try {
      providerInj = await getInjectiveProvider();
    } catch (e) {
      console.warn("Injective RPC failed (Injective relay disabled):", e?.message ?? e);
    }
  } else {
    console.warn("BRIDGE_LOCK_INJECTIVE not set — Injective lock relay disabled.");
  }

  const lockContractSepolia = new ethers.Contract(lockSepolia, LOCK_ABI, providerSepolia);
  const lockContractPh = new ethers.Contract(lockPh, LOCK_ABI, providerPh);
  const lockContractInj = providerInj && lockInj ? new ethers.Contract(lockInj, LOCK_ABI, providerInj) : null;

  function lockAddressFor(destinationChainId) {
    const id = Number(destinationChainId);
    if (id === SEPOLIA_CHAIN_ID) return lockSepolia;
    if (id === POLKADOT_HUB_CHAIN_ID) return lockPh;
    if (id === INJECTIVE_CHAIN_ID) return lockInj || null;
    return null;
  }

  function providerFor(destinationChainId) {
    const id = Number(destinationChainId);
    if (id === SEPOLIA_CHAIN_ID) return providerSepolia;
    if (id === POLKADOT_HUB_CHAIN_ID) return providerPh;
    if (id === INJECTIVE_CHAIN_ID) return providerInj;
    return null;
  }

  const sepoliaUnlockContracts = makeUnlockContracts(providerSepolia, [
    [SEPOLIA_CHAIN_ID, POLKADOT_HUB_CHAIN_ID],
    [SEPOLIA_CHAIN_ID, INJECTIVE_CHAIN_ID],
  ]);
  const hubUnlockContracts = makeUnlockContracts(providerPh, [
    [POLKADOT_HUB_CHAIN_ID, SEPOLIA_CHAIN_ID],
    [POLKADOT_HUB_CHAIN_ID, INJECTIVE_CHAIN_ID],
  ]);
  const injUnlockContracts =
    providerInj && lockContractInj
      ? makeUnlockContracts(providerInj, [
          [INJECTIVE_CHAIN_ID, SEPOLIA_CHAIN_ID],
          [INJECTIVE_CHAIN_ID, POLKADOT_HUB_CHAIN_ID],
        ])
      : [];

  async function processUnlockRequested(sourceChainId, destinationChainId, sourceTxHash, recipient, amount, nonce) {
    const existing = getBridgeUnlockByProof(db, sourceChainId, sourceTxHash, nonce);
    if (existing && existing.status === "relayed") {
      _dbg({ message: "Unlock skip already relayed", data: { sourceTxHash: sourceTxHash.slice(0, 18), nonce: Number(nonce) }, hypothesisId: "H3" });
      return;
    }
    if (!existing) {
      insertBridgeUnlock(db, {
        source_chain_id: sourceChainId,
        source_tx_hash: sourceTxHash,
        recipient,
        amount: amount.toString(),
        nonce: Number(nonce),
        destination_chain_id: destinationChainId,
      });
    }
    const bridgeAddress = lockAddressFor(destinationChainId);
    const destProvider = providerFor(destinationChainId);
    if (!bridgeAddress || !destProvider) {
      console.warn("No bridge Lock or provider for destination chain", destinationChainId);
      return;
    }
    const sourceTxHashBytes32 =
      sourceTxHash.length === 66 && sourceTxHash.startsWith("0x") ? sourceTxHash : ethers.zeroPadValue(sourceTxHash, 32);
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32", "uint256"],
        [recipient, amount, sourceChainId, sourceTxHashBytes32, nonce]
      )
    );
    const sig = await wallet.signMessage(ethers.getBytes(messageHash));
    const sigParsed = ethers.Signature.from(sig);
    const destSigner = new ethers.Wallet(relayerPk, destProvider);
    const bridge = new ethers.Contract(bridgeAddress, RELEASE_ABI, destSigner);
    _dbg({ message: "Unlock attempt release", data: { sourceTxHash: sourceTxHash.slice(0, 18), nonce: Number(nonce) }, hypothesisId: "H3" });
    const tx = await bridge.release(
      recipient,
      amount,
      sourceChainId,
      sourceTxHashBytes32,
      nonce,
      sigParsed.v,
      sigParsed.r,
      sigParsed.s
    );
    await tx.wait();
    setBridgeUnlockRelayed(db, sourceChainId, sourceTxHash, Number(nonce), tx.hash);
    console.log("Unlock relayed:", sourceTxHash, "->", tx.hash);
  }

  async function processLocked(sourceChainId, destinationChainId, sourceTxHash, recipient, amount, nonce) {
    const existing = getBridgeTransferByProof(db, sourceChainId, sourceTxHash, nonce);
    if (existing && existing.status === "relayed") {
      _dbg({ message: "Locked skip already relayed", data: { sourceTxHash: sourceTxHash.slice(0, 18), nonce: Number(nonce) }, hypothesisId: "H3" });
      return;
    }
    if (!existing) {
      insertBridgeTransfer(db, {
        source_chain_id: sourceChainId,
        source_tx_hash: sourceTxHash,
        recipient,
        amount: amount.toString(),
        nonce: Number(nonce),
        destination_chain_id: destinationChainId,
      });
    }
    const wrappedAddress = getWrappedAddress(destinationChainId, sourceChainId);
    if (!wrappedAddress) {
      console.warn("No wrapped token for", destinationChainId, sourceChainId);
      return;
    }
    const destProvider = providerFor(destinationChainId);
    if (!destProvider) {
      console.warn("No provider for destination chain", destinationChainId);
      return;
    }
    const sourceTxHashBytes32 =
      sourceTxHash.length === 66 && sourceTxHash.startsWith("0x") ? sourceTxHash : ethers.zeroPadValue(sourceTxHash, 32);
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32", "uint256"],
        [recipient, amount, sourceChainId, sourceTxHashBytes32, nonce]
      )
    );
    const sig = await wallet.signMessage(ethers.getBytes(messageHash));
    const sigParsed = ethers.Signature.from(sig);
    const destSigner = new ethers.Wallet(relayerPk, destProvider);
    const wrapped = new ethers.Contract(wrappedAddress, MINT_ABI, destSigner);
    _dbg({ message: "Locked attempt mint", data: { sourceTxHash: sourceTxHash.slice(0, 18), nonce: Number(nonce) }, hypothesisId: "H3" });
    const tx = await wrapped.mint(
      recipient,
      amount,
      sourceChainId,
      sourceTxHashBytes32,
      nonce,
      sigParsed.v,
      sigParsed.r,
      sigParsed.s
    );
    await tx.wait();
    setBridgeTransferRelayed(db, sourceChainId, sourceTxHash, Number(nonce), tx.hash);
    console.log("Relayed:", sourceTxHash, "->", tx.hash);
  }

  let lastBlockSepolia = await providerSepolia.getBlockNumber();
  let lastBlockPh = await providerPh.getBlockNumber();
  let lastBlockInj = providerInj ? await providerInj.getBlockNumber() : 0;
  let pollingSepolia = false;
  let pollingPh = false;
  let pollingInj = false;

  async function pollUnlockOnChain(chainLabel, unlockContracts, sourceChainId, fromBlock, toBlock) {
    for (const wc of unlockContracts) {
      const unlockLogs = await wc.queryFilter(wc.filters.UnlockRequested(), fromBlock, toBlock);
      for (const log of unlockLogs) {
        const { sender, recipient, amount, destinationChainId, nonce } = log.args;
        const sourceTxHash = log.transactionHash;
        try {
          await processUnlockRequested(sourceChainId, Number(destinationChainId), sourceTxHash, recipient, amount, nonce);
        } catch (e) {
          console.error(`Unlock relay ${chainLabel}->?`, sourceTxHash, e.message ?? e);
        }
      }
    }
  }

  async function pollSepolia() {
    if (pollingSepolia) return;
    pollingSepolia = true;
    try {
      const toBlock = await providerSepolia.getBlockNumber();
      const fromBlock = lastBlockSepolia + 1;
      _dbg({ message: "pollSepolia range", data: { fromBlock, toBlock, skipInvalid: fromBlock > toBlock }, hypothesisId: "H2" });
      if (fromBlock > toBlock) {
        if (toBlock < lastBlockSepolia) lastBlockSepolia = toBlock;
        return;
      }
      const logs = await lockContractSepolia.queryFilter(lockContractSepolia.filters.Locked(), fromBlock, toBlock);
      for (const log of logs) {
        const { sender, recipient, amount, destinationChainId, nonce } = log.args;
        const sourceTxHash = log.transactionHash;
        try {
          await processLocked(SEPOLIA_CHAIN_ID, Number(destinationChainId), sourceTxHash, recipient, amount, nonce);
        } catch (e) {
          console.error("Relay Sepolia->?", sourceTxHash, e.message ?? e);
        }
      }
      await pollUnlockOnChain("Sepolia", sepoliaUnlockContracts, SEPOLIA_CHAIN_ID, fromBlock, toBlock);
      lastBlockSepolia = toBlock;
    } finally {
      pollingSepolia = false;
    }
  }

  async function pollPh() {
    if (pollingPh) return;
    pollingPh = true;
    try {
      const toBlock = await providerPh.getBlockNumber();
      const fromBlock = lastBlockPh + 1;
      _dbg({ message: "pollPh range", data: { fromBlock, toBlock, skipInvalid: fromBlock > toBlock }, hypothesisId: "H2" });
      if (fromBlock > toBlock) {
        if (toBlock < lastBlockPh) lastBlockPh = toBlock;
        return;
      }
      const logs = await lockContractPh.queryFilter(lockContractPh.filters.Locked(), fromBlock, toBlock);
      for (const log of logs) {
        const { sender, recipient, amount, destinationChainId, nonce } = log.args;
        const sourceTxHash = log.transactionHash;
        try {
          await processLocked(POLKADOT_HUB_CHAIN_ID, Number(destinationChainId), sourceTxHash, recipient, amount, nonce);
        } catch (e) {
          console.error("Relay Polkadot Hub->?", sourceTxHash, e.message ?? e);
        }
      }
      await pollUnlockOnChain("Polkadot Hub", hubUnlockContracts, POLKADOT_HUB_CHAIN_ID, fromBlock, toBlock);
      lastBlockPh = toBlock;
    } finally {
      pollingPh = false;
    }
  }

  async function pollInj() {
    if (!lockContractInj || !providerInj) return;
    if (pollingInj) return;
    pollingInj = true;
    try {
      const toBlock = await providerInj.getBlockNumber();
      const fromBlock = lastBlockInj + 1;
      _dbg({ message: "pollInj range", data: { fromBlock, toBlock, skipInvalid: fromBlock > toBlock }, hypothesisId: "H2" });
      if (fromBlock > toBlock) {
        if (toBlock < lastBlockInj) lastBlockInj = toBlock;
        return;
      }
      const logs = await lockContractInj.queryFilter(lockContractInj.filters.Locked(), fromBlock, toBlock);
      for (const log of logs) {
        const { sender, recipient, amount, destinationChainId, nonce } = log.args;
        const sourceTxHash = log.transactionHash;
        try {
          await processLocked(INJECTIVE_CHAIN_ID, Number(destinationChainId), sourceTxHash, recipient, amount, nonce);
        } catch (e) {
          console.error("Relay Injective->?", sourceTxHash, e.message ?? e);
        }
      }
      await pollUnlockOnChain("Injective", injUnlockContracts, INJECTIVE_CHAIN_ID, fromBlock, toBlock);
      lastBlockInj = toBlock;
    } finally {
      pollingInj = false;
    }
  }

  const triggerArg = process.argv.find((a) => a.startsWith("--trigger="));
  const triggerChainId = triggerArg ? triggerArg.slice("--trigger=".length) : null;
  const manualTxHash = process.argv.find((a) => a.startsWith("0x"));

  async function tryManualLocked(receipt, sourceChainId) {
    if (!receipt?.logs?.length) return false;
    const iface = new ethers.Interface(LOCK_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "Locked") {
          const { recipient, amount, destinationChainId, nonce } = parsed.args;
          await processLocked(sourceChainId, Number(destinationChainId), manualTxHash, recipient, amount, nonce);
          console.log("Done.");
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  async function tryManualUnlock(receipt, sourceChainId) {
    if (!receipt?.logs?.length) return false;
    const iface = new ethers.Interface(UNLOCK_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "UnlockRequested") {
          const { recipient, amount, destinationChainId, nonce } = parsed.args;
          await processUnlockRequested(sourceChainId, Number(destinationChainId), manualTxHash, recipient, amount, nonce);
          console.log("Done.");
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  if (manualTxHash) {
    console.log("Manual relay for tx:", manualTxHash);
    const receiptSepolia = await providerSepolia.getTransactionReceipt(manualTxHash);
    if (receiptSepolia) {
      if (await tryManualLocked(receiptSepolia, SEPOLIA_CHAIN_ID)) process.exit(0);
      if (await tryManualUnlock(receiptSepolia, SEPOLIA_CHAIN_ID)) process.exit(0);
    }
    const receiptPh = await providerPh.getTransactionReceipt(manualTxHash);
    if (receiptPh) {
      if (await tryManualLocked(receiptPh, POLKADOT_HUB_CHAIN_ID)) process.exit(0);
      if (await tryManualUnlock(receiptPh, POLKADOT_HUB_CHAIN_ID)) process.exit(0);
    }
    if (providerInj) {
      const receiptInj = await providerInj.getTransactionReceipt(manualTxHash);
      if (receiptInj) {
        if (await tryManualLocked(receiptInj, INJECTIVE_CHAIN_ID)) process.exit(0);
        if (await tryManualUnlock(receiptInj, INJECTIVE_CHAIN_ID)) process.exit(0);
      }
    }
    console.error(
      "No Locked or UnlockRequested event found for this tx, or tx not on Sepolia / Polkadot Hub / Injective."
    );
    process.exit(1);
  }

  if (triggerChainId) {
    console.log("Relayer run once (trigger:", triggerChainId, ")...");
    if (triggerChainId === String(INJECTIVE_CHAIN_ID) && !lockContractInj) {
      console.error("Injective trigger requested but BRIDGE_LOCK_INJECTIVE or RPC is missing.");
      process.exit(1);
    }
    const lookback = 20;
    lastBlockSepolia = Math.max(0, (await providerSepolia.getBlockNumber()) - lookback);
    lastBlockPh = Math.max(0, (await providerPh.getBlockNumber()) - lookback);
    if (providerInj && lockContractInj) {
      lastBlockInj = Math.max(0, (await providerInj.getBlockNumber()) - lookback);
    }
    if (triggerChainId === "all" || triggerChainId === String(SEPOLIA_CHAIN_ID)) await pollSepolia().catch(console.error);
    if (triggerChainId === "all" || triggerChainId === String(POLKADOT_HUB_CHAIN_ID)) await pollPh().catch(console.error);
    if (triggerChainId === "all" || triggerChainId === String(INJECTIVE_CHAIN_ID)) await pollInj().catch(console.error);
    console.log("Done.");
    process.exit(0);
  }

  console.log("Usage: node scripts/relayer-bridge.mjs --trigger=11155111|420420417|1439|all");
  console.log("   or: node scripts/relayer-bridge.mjs <txHash>   (relay a single Lock or Unlock tx by hash)");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
