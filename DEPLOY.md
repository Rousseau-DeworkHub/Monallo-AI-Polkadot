# Monallo AI Pay - 部署指南

## 当前状态

- ✅ 智能合约已编写完成
- ⏳ 部署到测试网
- ⏳ 前端集成

---

## 步骤 1: 获取测试网信息

### Amara 测试网 (Polkadot Hub Testnet)

**RPC URL**: `https://polkadot-amara-rpc.seeed.io` 或 `https://rpc-amara.polkadot.io`

**Chain ID**: `1285` (0x505)

**水龙头**: 
- 访问 https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fpolkadot-amara-rpc.seeed.io#/accounts
- 点击 "Accounts" -> "Add Account" 创建账户
- 或者在 Discord #amara-faucet 频道获取测试币

---

## 步骤 2: 部署智能合约

### 方法 A: 使用 Remix IDE (推荐)

1. 打开 https://remix.ethereum.org
2. 创建新文件 `MonalloIntentExecutor.sol`
3. 粘贴 contracts/MonalloIntentExecutor.sol 的内容
4. 编译 (Compile)
5. 部署 (Deploy):
   - Environment: Injected Provider - MetaMask
   - Network: Amara Testnet
6. 复制部署后的合约地址

### 方法 B: 使用 Hardhat

```bash
cd contracts
cp .env.example .env
# 编辑 .env 添加你的 PRIVATE_KEY

npx hardhat run deploy.js --network amara
```

---

## 步骤 3: 配置前端

部署完成后：

1. 打开 `lib/contract.ts`
2. 更新 CONTRACT_ADDRESSES 中的 amara 地址

```javascript
const CONTRACT_ADDRESSES: Record<string, string> = {
  "amara": "你的合约地址",
};
```

---

## 步骤 4: 测试

1. 在 Amara 测试网连接 MetaMask
2. 获取测试 DOT
3. 访问 http://192.168.31.175:3000/ai-pay
4. 连接钱包并测试转账

---

## 智能合约功能

```
executeTransfer(token, amount, recipient, intentId) - 转账
executeSwap(fromToken, toToken, amountIn, minAmountOut, intentId) - 兑换
executeBridge(token, amount, destinationChainId, recipient, intentId) - 跨链
executeStake(amount, validator, intentId) - 质押
```

---

## 测试网水龙头链接

1. ** Polkadot Amara**: https://docs.substrate.io/testnet/
2. ** Discord**: 加入 Polkadot 社区获取

---

如有问题随时问我！
