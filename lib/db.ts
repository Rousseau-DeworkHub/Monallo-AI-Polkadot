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
    CREATE TABLE IF NOT EXISTS store_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'package',
      model_id TEXT,
      model_name TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      amount TEXT NOT NULL,
      token TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      tx_hash TEXT,
      chain_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_store_purchases_wallet ON store_purchases(wallet_address);
    CREATE TABLE IF NOT EXISTS store_consumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      model_name TEXT NOT NULL,
      tokens_consumed INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_store_consumption_wallet ON store_consumption(wallet_address);
    CREATE TABLE IF NOT EXISTS store_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES store_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_api_keys_user ON store_api_keys(user_id);
    CREATE TABLE IF NOT EXISTS store_api_key_nonces (
      wallet_address TEXT NOT NULL PRIMARY KEY,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      cost_mon INTEGER NOT NULL DEFAULT 0,
      charged_tokens INTEGER NOT NULL DEFAULT 0,
      charged_mon INTEGER NOT NULL DEFAULT 0,
      -- How much of charged_mon has already been settled on-chain.
      -- Used to prevent double-settling in the daily settlement job.
      settled_mon INTEGER NOT NULL DEFAULT 0,
      -- On-chain settle tx hash for the settled_mon portion.
      settle_tx_hash TEXT,
      charge_method TEXT NOT NULL DEFAULT 'mon',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES store_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_usage_user_created ON store_usage_events(user_id, created_at);
    CREATE TABLE IF NOT EXISTS store_token_balances (
      user_id INTEGER NOT NULL,
      model_id TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, model_id),
      FOREIGN KEY (user_id) REFERENCES store_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_token_balances_user ON store_token_balances(user_id);
    CREATE TABLE IF NOT EXISTS store_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      wallet_address TEXT NOT NULL,
      settlement_date TEXT NOT NULL,
      opening_balance INTEGER NOT NULL,
      usage_mon INTEGER NOT NULL,
      closing_balance INTEGER NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      unique_id TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES store_users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_settlements_date ON store_settlements(settlement_date);
    CREATE TABLE IF NOT EXISTS store_credit_mints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL,
      mint_tx_hash TEXT,
      chain_id INTEGER NOT NULL,
      wallet_address TEXT NOT NULL,
      amount_mon INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(tx_hash, chain_id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_credit_mints_tx ON store_credit_mints(tx_hash, chain_id);
  `);
  // Migrations for existing DBs (SQLite only supports ADD COLUMN)
  try { db.exec("ALTER TABLE store_purchases ADD COLUMN kind TEXT NOT NULL DEFAULT 'package'"); } catch (_) {}
  try { db.exec("ALTER TABLE store_purchases ADD COLUMN model_id TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_api_keys ADD COLUMN encrypted_key TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_api_keys ADD COLUMN key_prefix TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_api_keys ADD COLUMN key_last4 TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_usage_events ADD COLUMN charged_tokens INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE store_usage_events ADD COLUMN charged_mon INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE store_usage_events ADD COLUMN settled_mon INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.exec("ALTER TABLE store_usage_events ADD COLUMN settle_tx_hash TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_credit_mints ADD COLUMN mint_tx_hash TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE store_usage_events ADD COLUMN charge_method TEXT NOT NULL DEFAULT 'mon'"); } catch (_) {}
  return db;
}

export interface StorePurchaseRow {
  id: number;
  wallet_address: string;
  kind: string;
  model_id: string | null;
  model_name: string;
  token_count: number;
  amount: string;
  token: string;
  amount_usd: number;
  tx_hash: string | null;
  // Recharge: mintCredit() on-chain tx hash (optional; may be null for legacy rows).
  mint_tx_hash?: string | null;
  chain_id: number;
  created_at: number;
}

export function insertStorePurchase(row: {
  wallet_address: string;
  kind?: "package" | "recharge";
  model_id?: string | null;
  model_name: string;
  token_count: number;
  amount: string;
  token: string;
  amount_usd: number;
  tx_hash?: string | null;
  chain_id: number;
}): StorePurchaseRow {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO store_purchases (wallet_address, kind, model_id, model_name, token_count, amount, token, amount_usd, tx_hash, chain_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.wallet_address,
    row.kind ?? "package",
    row.model_id ?? null,
    row.model_name,
    row.token_count,
    row.amount,
    row.token,
    row.amount_usd,
    row.tx_hash ?? null,
    row.chain_id,
    created_at
  );
  return db.prepare("SELECT * FROM store_purchases WHERE id = last_insert_rowid()").get() as StorePurchaseRow;
}

export function listStorePurchases(walletAddress: string, limit = 100): StorePurchaseRow[] {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT p.*, c.mint_tx_hash AS mint_tx_hash
     FROM store_purchases p
     LEFT JOIN store_credit_mints c
       ON c.tx_hash = p.tx_hash AND c.chain_id = p.chain_id
     WHERE p.wallet_address = ?
     ORDER BY p.created_at DESC
     LIMIT ?`
  );
  return stmt.all(walletAddress, limit) as StorePurchaseRow[];
}

export function updateStorePurchaseModelId(purchaseId: number, modelId: string): void {
  const db = getDb();
  db.prepare("UPDATE store_purchases SET model_id = ? WHERE id = ?").run(modelId, purchaseId);
}

export function setStoreModelTokens(userId: number, modelId: string, tokens: number): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const t = Math.max(0, Math.floor(tokens));
  if (!modelId) return;
  db.prepare(
    `INSERT INTO store_token_balances (user_id, model_id, tokens, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, model_id) DO UPDATE SET tokens = excluded.tokens, updated_at = excluded.updated_at`
  ).run(userId, modelId, t, now);
}

export interface StoreConsumptionRow {
  id: number;
  wallet_address: string;
  model_name: string;
  tokens_consumed: number;
  created_at: number;
}

export function insertStoreConsumption(row: {
  wallet_address: string;
  model_name: string;
  tokens_consumed: number;
}): StoreConsumptionRow {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO store_consumption (wallet_address, model_name, tokens_consumed, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(row.wallet_address, row.model_name, row.tokens_consumed, created_at);
  return db.prepare("SELECT * FROM store_consumption WHERE id = last_insert_rowid()").get() as StoreConsumptionRow;
}

export function listStoreConsumption(walletAddress: string, limit = 100): StoreConsumptionRow[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM store_consumption WHERE wallet_address = ? ORDER BY created_at DESC LIMIT ?"
  );
  return stmt.all(walletAddress, limit) as StoreConsumptionRow[];
}

// --- Store credit ledger (on-chain + daily settlement) ---

export interface StoreUserRow {
  id: number;
  wallet_address: string;
  created_at: number;
}

export function getOrCreateStoreUser(walletAddress: string): StoreUserRow {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  let row = db.prepare("SELECT * FROM store_users WHERE wallet_address = ?").get(normalized) as StoreUserRow | undefined;
  if (!row) {
    const created_at = Math.floor(Date.now() / 1000);
    db.prepare("INSERT INTO store_users (wallet_address, created_at) VALUES (?, ?)").run(normalized, created_at);
    row = db.prepare("SELECT * FROM store_users WHERE id = last_insert_rowid()").get() as StoreUserRow;
  }
  return row;
}

export function getStoreUserByWallet(walletAddress: string): StoreUserRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM store_users WHERE wallet_address = ?").get(walletAddress.trim().toLowerCase()) as StoreUserRow | undefined;
  return row ?? null;
}

export function insertStoreApiKey(userId: number, keyHash: string): void {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO store_api_keys (user_id, key_hash, created_at) VALUES (?, ?, ?)").run(userId, keyHash, created_at);
}

export function insertStoreApiKeyEncrypted(row: {
  user_id: number;
  key_hash: string;
  encrypted_key: string;
  key_prefix: string;
  key_last4: string;
}): void {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO store_api_keys (user_id, key_hash, encrypted_key, key_prefix, key_last4, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(row.user_id, row.key_hash, row.encrypted_key, row.key_prefix, row.key_last4, created_at);
}

export function getLatestStoreApiKeyMetaByWallet(walletAddress: string): { key_prefix: string; key_last4: string; has_encrypted: boolean } | null {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  const row = db.prepare(
    `SELECT k.key_prefix, k.key_last4, (k.encrypted_key IS NOT NULL) AS has_encrypted
     FROM store_api_keys k
     INNER JOIN store_users u ON u.id = k.user_id
     WHERE u.wallet_address = ?
     ORDER BY k.created_at DESC, k.id DESC
     LIMIT 1`
  ).get(normalized) as { key_prefix: string | null; key_last4: string | null; has_encrypted: 0 | 1 } | undefined;
  if (!row || !row.key_prefix || !row.key_last4) return null;
  return { key_prefix: row.key_prefix, key_last4: row.key_last4, has_encrypted: !!row.has_encrypted };
}

export function getLatestStoreApiKeyEncryptedByWallet(walletAddress: string): { encrypted_key: string } | null {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  const row = db.prepare(
    `SELECT k.encrypted_key
     FROM store_api_keys k
     INNER JOIN store_users u ON u.id = k.user_id
     WHERE u.wallet_address = ? AND k.encrypted_key IS NOT NULL
     ORDER BY k.created_at DESC, k.id DESC
     LIMIT 1`
  ).get(normalized) as { encrypted_key: string } | undefined;
  return row ?? null;
}

export function upsertStoreApiKeyNonce(walletAddress: string, nonce: string, expiresAt: number): void {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  db.prepare(
    `INSERT INTO store_api_key_nonces (wallet_address, nonce, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(wallet_address) DO UPDATE SET nonce = excluded.nonce, expires_at = excluded.expires_at`
  ).run(normalized, nonce, expiresAt);
}

export function consumeStoreApiKeyNonce(walletAddress: string, nonce: string): boolean {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare("SELECT nonce, expires_at FROM store_api_key_nonces WHERE wallet_address = ?").get(normalized) as { nonce: string; expires_at: number } | undefined;
  if (!row) return false;
  if (row.expires_at < now) return false;
  if (row.nonce !== nonce) return false;
  db.prepare("DELETE FROM store_api_key_nonces WHERE wallet_address = ?").run(normalized);
  return true;
}

export function getStoreUserByKeyHash(keyHash: string): StoreUserRow | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT u.* FROM store_users u INNER JOIN store_api_keys k ON u.id = k.user_id WHERE k.key_hash = ?"
  ).get(keyHash) as StoreUserRow | undefined;
  return row ?? null;
}

export function insertStoreUsageEvent(row: {
  user_id: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_mon: number;
  charged_tokens?: number;
  charged_mon?: number;
  charge_method?: "token" | "mon" | "mixed";
}): number {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO store_usage_events (user_id, model, prompt_tokens, completion_tokens, cost_mon, charged_tokens, charged_mon, settled_mon, settle_tx_hash, charge_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    row.user_id,
    row.model,
    row.prompt_tokens,
    row.completion_tokens,
    row.cost_mon,
    row.charged_tokens ?? 0,
    row.charged_mon ?? row.cost_mon,
    0, // settled_mon
    null, // settle_tx_hash
    row.charge_method ?? "mon",
    created_at
  );
  const idRow = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
  return idRow.id;
}

export function setStoreUsageEventSettledMon(usageEventId: number, settledMonRaw: number, settleTxHash?: string | null): void {
  const db = getDb();
  const id = Math.max(0, Math.floor(usageEventId));
  const amt = Math.max(0, Math.floor(settledMonRaw));
  if (!id) return;
  if (settleTxHash) {
    db.prepare("UPDATE store_usage_events SET settled_mon = ?, settle_tx_hash = ? WHERE id = ?").run(amt, settleTxHash, id);
    return;
  }
  db.prepare("UPDATE store_usage_events SET settled_mon = ? WHERE id = ?").run(amt, id);
}

export function addStoreModelTokens(userId: number, modelId: string, deltaTokens: number): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, Math.floor(deltaTokens));
  if (!modelId || d <= 0) return;
  db.prepare(
    `INSERT INTO store_token_balances (user_id, model_id, tokens, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, model_id) DO UPDATE SET tokens = tokens + excluded.tokens, updated_at = excluded.updated_at`
  ).run(userId, modelId, d, now);
}

export function getStoreModelTokens(userId: number, modelId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT tokens FROM store_token_balances WHERE user_id = ? AND model_id = ?"
  ).get(userId, modelId) as { tokens: number } | undefined;
  return Math.max(0, Number(row?.tokens ?? 0));
}

/** All model token balances for a user (source of truth for My Balance). */
export function getStoreAllTokenBalancesByUserId(userId: number): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT model_id, tokens FROM store_token_balances WHERE user_id = ?"
  ).all(userId) as { model_id: string; tokens: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.model_id != null && r.model_id !== "") {
      const t = Math.max(0, Number(r.tokens ?? 0));
      if (t > 0) out[r.model_id] = t;
    }
  }
  return out;
}

/** Whether the user already has any token balance rows in DB.
 * Note: check row existence rather than tokens>0, because tokens can be 0 after consumption.
 */
export function hasStoreTokenBalancesByUserId(userId: number): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(1) as cnt FROM store_token_balances WHERE user_id = ?"
  ).get(userId) as { cnt: number };
  return Number(row?.cnt ?? 0) > 0;
}

export function spendStoreModelTokens(userId: number, modelId: string, spendTokens: number): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const s = Math.max(0, Math.floor(spendTokens));
  if (!modelId || s <= 0) return 0;
  const cur = getStoreModelTokens(userId, modelId);
  const spent = Math.min(cur, s);
  const next = cur - spent;
  db.prepare(
    `INSERT INTO store_token_balances (user_id, model_id, tokens, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, model_id) DO UPDATE SET tokens = excluded.tokens, updated_at = excluded.updated_at`
  ).run(userId, modelId, next, now);
  return spent;
}

/** Sum cost_mon for a user in [startTs, endTs) (Unix seconds). */
export function getStoreUsageSumByUserAndRange(userId: number, startTs: number, endTs: number): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COALESCE(SUM(charged_mon - settled_mon), 0) as total FROM store_usage_events WHERE user_id = ? AND created_at >= ? AND created_at < ?"
  ).get(userId, startTs, endTs) as { total: number };
  return Number(row?.total ?? 0);
}

/** List users with usage in [startTs, endTs) and their total cost_mon (for settlement). */
export function getStoreUsersWithUsageInRange(
  startTs: number,
  endTs: number
): { user_id: number; wallet_address: string; usage_mon: number }[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT u.id AS user_id, u.wallet_address, COALESCE(SUM(e.charged_mon - e.settled_mon), 0) AS usage_mon
     FROM store_users u
     INNER JOIN store_usage_events e ON u.id = e.user_id
     WHERE e.created_at >= ? AND e.created_at < ?
     GROUP BY u.id, u.wallet_address
     HAVING usage_mon > 0`
  ).all(startTs, endTs) as { user_id: number; wallet_address: string; usage_mon: number }[];
  return rows;
}

/** List usage events (Monallo proxy calls) for a wallet, for History consumption display. */
export function listStoreUsageEventsByWallet(
  walletAddress: string,
  limit = 100
): {
  id: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_mon: number;
  charged_tokens: number;
  charged_mon: number;
  charge_method: string;
  settle_tx_hash: string | null;
  created_at: number;
}[] {
  const db = getDb();
  const normalized = walletAddress.trim().toLowerCase();
  const rows = db.prepare(
    `SELECT e.id, e.model, e.prompt_tokens, e.completion_tokens, e.cost_mon, e.charged_tokens, e.charged_mon, e.charge_method, e.settle_tx_hash, e.created_at
     FROM store_usage_events e
     INNER JOIN store_users u ON u.id = e.user_id
     WHERE u.wallet_address = ?
     ORDER BY e.created_at DESC
     LIMIT ?`
  ).all(normalized, limit) as {
    id: number;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    cost_mon: number;
    charged_tokens: number;
    charged_mon: number;
    charge_method: string;
    settle_tx_hash: string | null;
    created_at: number;
  }[];
  return rows;
}

export interface StoreSettlementRow {
  id: number;
  user_id: number;
  wallet_address: string;
  settlement_date: string;
  opening_balance: number;
  usage_mon: number;
  closing_balance: number;
  tx_hash: string | null;
  status: string;
  unique_id: string;
  created_at: number;
}

export function insertStoreSettlement(row: {
  user_id: number;
  wallet_address: string;
  settlement_date: string;
  opening_balance: number;
  usage_mon: number;
  closing_balance: number;
  tx_hash?: string | null;
  status: string;
  unique_id: string;
}): StoreSettlementRow {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO store_settlements (user_id, wallet_address, settlement_date, opening_balance, usage_mon, closing_balance, tx_hash, status, unique_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.user_id,
    row.wallet_address,
    row.settlement_date,
    row.opening_balance,
    row.usage_mon,
    row.closing_balance,
    row.tx_hash ?? null,
    row.status,
    row.unique_id,
    created_at
  );
  return db.prepare("SELECT * FROM store_settlements WHERE id = last_insert_rowid()").get() as StoreSettlementRow;
}

export function getStoreSettlementByUniqueId(uniqueId: string): StoreSettlementRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM store_settlements WHERE unique_id = ?").get(uniqueId) as StoreSettlementRow | undefined;
  return row ?? null;
}

export function isStoreCreditMinted(txHash: string, chainId: number): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM store_credit_mints WHERE tx_hash = ? AND chain_id = ?").get(txHash, chainId);
  return !!row;
}

export function insertStoreCreditMint(row: {
  tx_hash: string;
  mint_tx_hash: string;
  chain_id: number;
  wallet_address: string;
  amount_mon: number;
}): void {
  const db = getDb();
  const created_at = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO store_credit_mints (tx_hash, mint_tx_hash, chain_id, wallet_address, amount_mon, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(row.tx_hash, row.mint_tx_hash, row.chain_id, row.wallet_address, row.amount_mon, created_at);
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
