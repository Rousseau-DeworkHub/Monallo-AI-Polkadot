# 🚀 Monallo 合约一键部署指南

## 方案 1: Remix IDE (最简单)

### Step 1: 打开 Remix
访问: https://remix.ethereum.org

### Step 2: 创建合约文件
1. 点击左侧 "File Explorer"
2. 点击 "+" 新建文件
3. 命名为 `MonalloIntentExecutor.sol`
4. 复制下方代码粘贴进去:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MonalloIntentExecutor {
    string public constant name = "MonalloIntentExecutor";
    string public constant version = "1.0.0";
    address public immutable owner;
    
    event IntentExecuted(
        address indexed user,
        string action,
        address token,
        uint256 amount,
        bytes32 intentId
    );
    
    mapping(bytes32 => bool) public executedIntents;
    
    constructor() {
        owner = msg.sender;
    }
    
    function executeTransfer(
        address token,
        uint256 amount,
        address recipient,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must > 0");
        
        executedIntents[intentId] = true;
        
        if (token == address(0)) {
            require(msg.value >= amount, "Insufficient value");
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Transfer failed");
        }
        
        emit IntentExecuted(msg.sender, "transfer", token, amount, intentId);
    }
    
    function executeSwap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "swap", fromToken, amountIn, intentId);
    }
    
    function executeBridge(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "bridge", token, amount, intentId);
    }
    
    function executeStake(
        uint256 amount,
        address validator,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "stake", address(0), amount, intentId);
    }
    
    function generateIntentId(
        address user,
        string calldata action,
        uint256 nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, action, nonce, block.timestamp));
    }
    
    mapping(address => uint256) public nonces;
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }
    
    receive() external payable {}
}
```

### Step 3: 编译
1. 点击左侧 "Solidity Compiler" (第二个图标)
2. 点击 "Compile MonalloIntentExecutor.sol"
3. 等待编译成功 ✓

### Step 4: 部署
1. 点击左侧 "Deploy & Run Transactions" (第三个图标)
2. Environment 选择 "Injected Provider - MetaMask"
3. 点击 "Deploy" 按钮
4. MetaMask 会弹出，确认
5. **复制部署后的合约地址** (在下方 Deployed Contracts 处)

---

## 方案 2: 领取测试币

### Amara 测试网信息
- **网络名称**: Polkadot Amara
- **RPC**: https://polkadot-amara-rpc.seeed.io
- **Chain ID**: 1285 (0x505)
- **符号**: DOT

### 领取测试币
1. 打开 MetaMask
2. 点击 "添加网络"
3. 填写上述信息
4. 打开 https://polkadot.js.org/apps
5. 连接 MetaMask
6. 切换到 Amara 网络
7. 在 Discord #amara-faucet 频道发送: `!drip 你的地址`

---

## 部署后

把合约地址发给我，我帮你配置到前端！
