/**
 * SQLite 持久化：Monallo AI Pay 交易记录（Send / Swap / Bridge / Stake）
 * 仅服务端 API 使用。
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), ".data", "monallo.db");

function getDb(): Database.Database {
  const fs = require("fs");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      action TEXT NOT NULL,
      tx_hash TEXT,
      explorer_url TEXT,
      amount TEXT,
      token TEXT,
      receiver TEXT,
      source_network TEXT,
      target_network TEXT,
      from_token TEXT,
      to_token TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
  `);
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN amount_usd REAL");
  } catch (_) {}
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
    CREATE INDEX IF NOT EXISTS idx_bridge_status ON bridge_transfers(source_chain_id, source_tx_hash);
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
    CREATE INDEX IF NOT EXISTS idx_bridge_unlock_status ON bridge_unlock(source_chain_id, source_tx_hash);
  `);
  return db;
}

export interface BridgeUnlockRow {
  id: number;
  source_chain_id: number;
  source_tx_hash: string;
  recipient: string;
  amount: string;
  nonce: number;
  destination_chain_id: number;
  status: string;
  destination_tx_hash: string | null;
  created_at: number;
}

export function getBridgeUnlockBySourceTx(
  sourceChainId: number,
  sourceTxHash: string
): BridgeUnlockRow | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM bridge_unlock WHERE source_chain_id = ? AND source_tx_hash = ? ORDER BY nonce DESC LIMIT 1"
  );
  return (stmt.get(sourceChainId, sourceTxHash) as BridgeUnlockRow) ?? null;
}

export interface BridgeTransferRow {
  id: number;
  source_chain_id: number;
  source_tx_hash: string;
  recipient: string;
  amount: string;
  nonce: number;
  destination_chain_id: number;
  status: string;
  destination_tx_hash: string | null;
  created_at: number;
}

export function getBridgeTransferBySourceTx(
  sourceChainId: number,
  sourceTxHash: string
): BridgeTransferRow | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM bridge_transfers WHERE source_chain_id = ? AND source_tx_hash = ? ORDER BY nonce DESC LIMIT 1"
  );
  return (stmt.get(sourceChainId, sourceTxHash) as BridgeTransferRow) ?? null;
}

export function insertBridgeTransfer(row: {
  source_chain_id: number;
  source_tx_hash: string;
  recipient: string;
  amount: string;
  nonce: number;
  destination_chain_id: number;
  status?: string;
  destination_tx_hash?: string | null;
}): BridgeTransferRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO bridge_transfers (source_chain_id, source_tx_hash, recipient, amount, nonce, destination_chain_id, status, destination_tx_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const created_at = Math.floor(Date.now() / 1000);
  stmt.run(
    row.source_chain_id,
    row.source_tx_hash,
    row.recipient,
    row.amount,
    row.nonce,
    row.destination_chain_id,
    row.status ?? "pending",
    row.destination_tx_hash ?? null,
    created_at
  );
  return db.prepare("SELECT * FROM bridge_transfers WHERE id = last_insert_rowid()").get() as BridgeTransferRow;
}

export function setBridgeTransferRelayed(
  sourceChainId: number,
  sourceTxHash: string,
  nonce: number,
  destinationTxHash: string
): void {
  const db = getDb();
  db.prepare(
    "UPDATE bridge_transfers SET status = 'relayed', destination_tx_hash = ? WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?"
  ).run(destinationTxHash, sourceChainId, sourceTxHash, nonce);
}

export function getBridgeTransferByProof(
  sourceChainId: number,
  sourceTxHash: string,
  nonce: number
): BridgeTransferRow | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM bridge_transfers WHERE source_chain_id = ? AND source_tx_hash = ? AND nonce = ?"
  );
  return (stmt.get(sourceChainId, sourceTxHash, nonce) as BridgeTransferRow) ?? null;
}

export interface TransactionRow {
  id: number;
  wallet_address: string;
  action: string;
  tx_hash: string | null;
  explorer_url: string | null;
  amount: string | null;
  token: string | null;
  receiver: string | null;
  source_network: string | null;
  target_network: string | null;
  from_token: string | null;
  to_token: string | null;
  amount_usd: number | null;
  created_at: number;
}

export interface TransactionInsert {
  wallet_address: string;
  action: string;
  tx_hash?: string | null;
  explorer_url?: string | null;
  amount?: string | null;
  token?: string | null;
  receiver?: string | null;
  source_network?: string | null;
  target_network?: string | null;
  from_token?: string | null;
  to_token?: string | null;
  amount_usd?: number | null;
}

export function getStats(): { activeUsers: number; volume: number } {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(DISTINCT wallet_address) as activeUsers, COALESCE(SUM(amount_usd), 0) as volume FROM transactions"
  ).get() as { activeUsers: number; volume: number };
  return {
    activeUsers: Number(row?.activeUsers ?? 0),
    volume: Number(row?.volume ?? 0),
  };
}

export function listTransactions(walletAddress: string): TransactionRow[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM transactions WHERE wallet_address = ? ORDER BY created_at DESC"
  );
  return stmt.all(walletAddress) as TransactionRow[];
}

export function listTransactionsPaginated(
  walletAddress: string,
  page: number,
  limit: number
): { items: TransactionRow[]; total: number } {
  const db = getDb();
  const countStmt = db.prepare(
    "SELECT COUNT(*) as total FROM transactions WHERE wallet_address = ?"
  );
  const { total } = countStmt.get(walletAddress) as { total: number };
  const offset = Math.max(0, (page - 1) * limit);
  const stmt = db.prepare(
    "SELECT * FROM transactions WHERE wallet_address = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
  );
  const items = stmt.all(walletAddress, limit, offset) as TransactionRow[];
  return { items, total };
}

export function insertTransaction(row: TransactionInsert): TransactionRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO transactions (wallet_address, action, tx_hash, explorer_url, amount, token, receiver, source_network, target_network, from_token, to_token, amount_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const created_at = Math.floor(Date.now() / 1000);
  stmt.run(
    row.wallet_address,
    row.action,
    row.tx_hash ?? null,
    row.explorer_url ?? null,
    row.amount ?? null,
    row.token ?? null,
    row.receiver ?? null,
    row.source_network ?? null,
    row.target_network ?? null,
    row.from_token ?? null,
    row.to_token ?? null,
    row.amount_usd ?? null,
    created_at
  );
  const last = db.prepare("SELECT * FROM transactions WHERE id = last_insert_rowid()").get() as TransactionRow;
  return last;
}
