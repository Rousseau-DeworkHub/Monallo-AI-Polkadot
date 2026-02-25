# Monallo Bridge 部署与运行

## 部署合约

在项目根目录执行（需先在 `.env` 中设置 `DEPLOYER_PRIVATE_KEY`，并在 Sepolia / Polkadot Hub 上领取测试币）：

```bash
npm run deploy:bridge
```

脚本会编译并部署到两条链，输出合约地址及建议的 `.env` 配置。

## 合约

- **MonalloBridge.sol**：源链锁定合约，每链部署一份（Sepolia、Polkadot Hub）。用户调用 `lock(recipient, destinationChainId)` 并转入原生代币。
- **MaoWrappedToken.sol**：目标链上的 wrapped 资产（ERC-20，可铸造）。
  - Sepolia 上部署 **maoPAS.Polkadot-Hub**（Polkadot Hub 的 PAS 跨到 Sepolia）。
  - Polkadot Hub 上部署 **maoETH.Sepolia**（Sepolia 的 ETH 跨到 Polkadot Hub）。
  - 构造函数：`(name, symbol, relayer)`，其中 `relayer` 为中继 EOA，仅其签名可触发 `mint`。

部署后写入环境变量（前端用 `NEXT_PUBLIC_*`，中继用无前缀或同名）：

- `NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA` / `BRIDGE_LOCK_SEPOLIA`
- `NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB` / `BRIDGE_LOCK_POLKADOT_HUB`
- `WRAPPED_PAS_SEPOLIA`（Sepolia 上 maoPAS.Polkadot-Hub 地址；API 拉余额用）
- `NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA`（同上，前端 Your Balance 显示 maoPAS.Polkadot-Hub 用）
- `WRAPPED_ETH_POLKADOT_HUB`（Polkadot Hub 上 maoETH.Sepolia 地址）
- `RELAYER_PRIVATE_KEY`（中继钱包私钥，需与 MaoWrappedToken 构造时的 relayer 一致）

## 中继（必须运行才会在目标链 mint）

**锁仓后目标链不会自动到账，必须运行中继才会铸造 maoXXX.SourceChain。**

```bash
# 在项目根目录（.env 已配置好 BRIDGE_LOCK_*、WRAPPED_*、RELAYER_PRIVATE_KEY）：
npm run relayer:bridge
```

中继会轮询两链的 `Locked` 事件（约 15 秒一次），对每条未处理的 lock 在目标链调用对应 wrapped 合约的 `mint(..., signature)`，并写入 `.data/monallo.db` 的 `bridge_transfers` 表。

**补发某笔 lock（手动 relay 一次）：**
```bash
node scripts/relayer-bridge.mjs 0x<你的lock交易hash>
```

## 状态 API

`GET /api/bridge/status?sourceChainId=11155111&sourceTxHash=0x...` 返回 `{ status: "pending" | "relayed", destinationTxHash?: string }`，供前端轮询展示「已跨链」与目标链交易链接。
