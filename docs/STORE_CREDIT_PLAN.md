# Monallo Store 链上额度 + 日终清账 实现计划

## 目标
- 用户充值（Recharge / Packages）→ 链上合约记录额度（MON），不可 P2P 转移
- 合约支持部署者/运营方提款（收款到 EOA 后由运营方自行提现）
- 用户每日用量在链下 DB 累计，每天 0 点（UTC）后端 + 合约自动清账
- 额度不足时预警，单次请求仍可“送一次”后提醒充值

---

## 1. 数据库（lib/db.ts）

### 1.1 新表

| 表名 | 用途 |
|------|------|
| `store_users` | 用户：wallet_address (unique), created_at |
| `store_api_keys` | API Key 注册：user_id, key_hash (unique), created_at |
| `store_usage_events` | 用量事件（append-only）：user_id, model, prompt_tokens, completion_tokens, cost_mon (6 decimals), created_at |
| `store_settlements` | 日终结算记录：user_id, settlement_date (YYYY-MM-DD), opening_balance, usage_mon, closing_balance, tx_hash, status, unique_id (防重) |
| `store_credit_mints` | 已确认的链上入账：tx_hash + chain_id 唯一，避免重复 mint |

### 1.2 说明
- `cost_mon`：按 USD 计价，1 USD = 1 MON，用整数或 6 位小数存储
- `store_settlements.unique_id`：例如 `{wallet}_{date}` 或 UUID，保证幂等

---

## 2. 智能合约（contracts/CreditLedger.sol）

### 2.1 职责
- 只做**额度账本**，不持有资产（用户付款到运营 EOA，运营方自行提现）
- 运营方（operator）可：`mintCredit(user, amount)`、`settle(user, amount, dayId, settlementId)`
- 部署者（owner）可更换 operator

### 2.2 接口
- `mapping(address => uint256) public creditOf`  // 6 decimals 建议
- `function mintCredit(address user, uint256 amountMon)` onlyOperator
- `function settle(address user, uint256 amountMon, bytes32 dayId, bytes32 settlementId)` onlyOperator，防重：`usedSettlement[settlementId]`
- `function setOperator(address)` onlyOwner
- Events: `Minted`, `Settled`

### 2.3 部署
- 仅部署到 Polkadot Hub testnet（Store 前端已禁用 Sepolia）
- 运行：`OPERATOR_ADDRESS=0x... node scripts/deploy-credit-ledger.mjs`（不设则 operator = deployer）
- 需配置 `RPC_Polkadot_Hub`（可选，与 Bridge 等共用；否则用 `POLKADOT_HUB_RPC_URL` 或默认 testnet RPC）
- 环境变量：
  - `CREDIT_LEDGER_ADDRESS`：合约地址
  - `STORE_OPERATOR_PRIVATE_KEY`：operator 私钥（后端 mint/settle 用）
  - `HAODE_BASE_URL`、`HAODE_API_KEY`：Monallo 转发上游
  - `STORE_SETTLEMENT_CRON_SECRET`（可选）：日终 POST /api/store/settlement-run 的 Bearer 密钥

---

## 3. 后端 API

### 3.1 已有 / 需新增

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/store/register-key` | POST | body: wallet_address, api_key；存 key_hash，建 user 与 api_keys 行 |
| `/api/store/confirm-payment` | POST | body: tx_hash, wallet_address, amount_mon, chain_id；校验 tx 未重复 mint，调合约 mintCredit |
| `/api/store/balance` | GET | query: wallet；读合约 creditOf(wallet)，返回 MON 余额 |
| `/api/monallo/v1/chat/completions` | POST | 校验 Authorization Bearer \<key\>，查 user，转发 Haode，记 usage_events，流式回包 |
| `/api/store/settlement-run` | POST | 内部/cron：汇总昨日 usage，逐用户调 settle，写 store_settlements |

### 3.2 配置
- Haode: `HAODE_API_KEY`, `HAODE_BASE_URL`
- 合约: `CREDIT_LEDGER_ADDRESS`, `STORE_OPERATOR_PRIVATE_KEY`
- 结算时区: 0 点 UTC

---

## 4. 日终清账流程（0 点 UTC）

1. 取结算日 `date = yesterday(UTC)`
2. 按 user 聚合 `store_usage_events` 的 `cost_mon`（created_at 在 date 当天）
3. 对每个有用量的 user：若 `usage_mon > 0`，生成 `settlementId`，调合约 `settle(user, usage_mon, dayId, settlementId)`，写 `store_settlements`
4. 失败重试、幂等靠 `settlementId` 与合约 `usedSettlement`

---

## 5. 前端（Store 页）

- **生成 API Key**：调用 `POST /api/store/register-key` 注册 key（传 key + wallet），本地仍可存明文 key 用于展示/复制
- **充值/购买成功**：在 tx 确认后调 `POST /api/store/confirm-payment`，后端 mint 链上额度
- **余额展示**：从 `GET /api/store/balance?wallet=0x...` 或直接读合约 `creditOf` 展示 MON，不再仅依赖 localStorage

---

## 6. 实施顺序

1. DB：新增 5 张表及增删查方法  
2. 合约：CreditLedger.sol + 部署脚本  
3. 后端：register-key, confirm-payment, balance  
4. 后端：Monallo proxy /chat/completions + usage 落库  
5. 后端：settlement-run（可被 cron 调用的 API 或脚本）  
6. 前端：注册 key、确认支付、读链上/接口余额  

---

## 7. 风险与注意

- Operator 私钥仅后端持有，需严格保护
- 结算失败需有重试与告警
- 额度不足时的“送一次”可限制为每日一次或单次成本上限，避免被薅
