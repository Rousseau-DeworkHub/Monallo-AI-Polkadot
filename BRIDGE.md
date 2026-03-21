# Monallo Bridge 部署与运行

## 部署合约（一键三链）

脚本 [`scripts/deploy-bridge-standalone.mjs`](scripts/deploy-bridge-standalone.mjs) 会编译并部署：

| 链 | 部署内容 |
|----|-----------|
| **Sepolia** | `MonalloBridge` + `maoPAS.PH` + `maoINJ.Injective` |
| **Polkadot Hub** | `MonalloBridge` + `maoETH.Sepolia` + `maoINJ.Injective` |
| **Injective EVM (1439)** | `MonalloBridge` + `maoETH.Sepolia` + `maoPAS.PH` |

### 前置条件

1. 项目根目录 `.env` 中设置 **`DEPLOYER_PRIVATE_KEY`**（`0x` 开头），且与 **`RELAYER_PRIVATE_KEY`** 使用**同一账户**（`MaoWrappedToken` 的 `relayer` 即该地址）。
2. 该地址在三条测试网上均有原生 gas：**Sepolia ETH**、**Hub PAS**、**Injective INJ**。
3. **RPC**（可选）：`SEPOLIA_RPC_URL`、`POLKADOT_HUB_RPC_URL`；Injective 使用 `RPC_INJECTIVE` 或 `RPC_Injective`，缺省为 `https://k8s.testnet.json-rpc.injective.network/`。

### 一键全量部署（新环境）

```bash
cd /path/to/Monallo-AI-Polkadot
npm run deploy:bridge
```

终端会打印**完整** `NEXT_PUBLIC_*` / `WRAPPED_*` / `BRIDGE_LOCK_*` 键值，并写入 `bridge-deployed.json`。将打印内容合并进 `.env` 后重启应用与中继。

### 仅补全第三链 + 两条 maoINJ（已有旧版双链部署）

若你曾用旧脚本只部署过 Sepolia/Hub 的 Lock + maoPAS + maoETH，**不要**再跑全量（会生成新 Lock）。改为：

```bash
npm run deploy:bridge:extend
```

等价于 `node scripts/deploy-bridge-standalone.mjs --extension-only`。要求 `.env` 里**已有**：

`BRIDGE_LOCK_SEPOLIA`（或 `NEXT_PUBLIC_*`）、`WRAPPED_PAS_SEPOLIA`、`BRIDGE_LOCK_POLKADOT_HUB`、`WRAPPED_ETH_POLKADOT_HUB`。

脚本会**复用**上述地址，仅新部署：Sepolia/Hub 上的 `maoINJ.Injective`，以及 Injective 上的 Lock + 两个 wrapped。

**注意**：`--extension-only` 下新部署的 `maoINJ` 的 relayer 为当前 `DEPLOYER_PRIVATE_KEY` 地址，须与**原有** wrapped 合约的 relayer 一致，否则中继无法为新旧代币统一签名。

## 合约

- **MonalloBridge.sol**：源链锁定合约，**每条支持的 EVM 链一份**。用户调用 `lock(recipient, destinationChainId)` 并转入**该链原生币**（Sepolia ETH、Hub PAS、Injective INJ）。
- **MaoWrappedToken.sol**：目标链上的 wrapped（ERC-20），由中继按签名 `mint`；用户 `unlock` 时在源链销毁并由中继在目标链 `release` 原生。

### Wrapped 矩阵（`目标链Id_源链Id`）

| 环境变量（示例） | 含义 |
|------------------|------|
| `WRAPPED_ETH_POLKADOT_HUB` / `NEXT_PUBLIC_*` | Hub 上 maoETH.Sepolia |
| `WRAPPED_PAS_SEPOLIA` / `NEXT_PUBLIC_*` | Sepolia 上 maoPAS.PH |
| `WRAPPED_ETH_INJECTIVE` / `NEXT_PUBLIC_*` | Injective 上 maoETH.Sepolia |
| `WRAPPED_PAS_INJECTIVE` / `NEXT_PUBLIC_*` | Injective 上 maoPAS.PH |
| `WRAPPED_INJ_SEPOLIA` / `NEXT_PUBLIC_*` | Sepolia 上 maoINJ.Injective |
| `WRAPPED_INJ_POLKADOT_HUB` / `NEXT_PUBLIC_*` | Hub 上 maoINJ.Injective |

### Lock 地址

- `NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA` / `BRIDGE_LOCK_SEPOLIA`
- `NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB` / `BRIDGE_LOCK_POLKADOT_HUB`
- `NEXT_PUBLIC_BRIDGE_LOCK_INJECTIVE` / `BRIDGE_LOCK_INJECTIVE`（**1439**）

## 中继（必须运行才会在目标链 mint / release）

**锁仓或 unlock 后对手链不会自动到账，必须运行中继。**

```bash
# 在项目根目录（.env：BRIDGE_LOCK_*、WRAPPED_*、RELAYER_PRIVATE_KEY、RPC_*）
npm run relayer:bridge -- --trigger=all
```

单次轮询某一链：

```bash
node scripts/relayer-bridge.mjs --trigger=11155111    # Sepolia
node scripts/relayer-bridge.mjs --trigger=420420417   # Polkadot Hub
node scripts/relayer-bridge.mjs --trigger=1439         # Injective EVM
node scripts/relayer-bridge.mjs --trigger=all           # 三链各扫一次
```

**补发某笔含 `Locked` 事件的交易：**

```bash
node scripts/relayer-bridge.mjs 0x<交易 hash>
```

中继会查询三链（若已配置 Injective RPC 与 Lock）上的 `Locked` / 各 wrapped 上 `UnlockRequested`，写入 `.data/monallo.db`。

建议在三条链上均为 `RELAYER_PRIVATE_KEY` 对应地址准备原生 gas。

### RPC

- `RPC_SEPOLIA`（可选，有默认后备）
- `RPC_POLKADOT_HUB` / `RPC_Polkadot_Hub` 等（见脚本）
- `RPC_INJECTIVE` 或 `RPC_Injective`（Injective EVM JSON-RPC）

## 状态 API

`GET /api/bridge/status?sourceChainId=11155111&sourceTxHash=0x...` 返回 `{ status: "pending" | "relayed", destinationTxHash?: string }`，供前端轮询。

`POST /api/bridge/trigger-relay` 会按 `sourceChainId` 触发对应 `--trigger` 或传入 `sourceTxHash` 做单笔 relay。

## 开放边与禁止边（产品规则）

开放：**原生 lock → 目标链 mint wrapped**；反向 **unlock wrapped → 对手链 release 原生**。禁止 **wrapped 与 wrapped 之间的直跨**（具体 6 条见仓库内计划文档）；前端与中继仅对开放边建链。
