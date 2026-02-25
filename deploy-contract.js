#!/usr/bin/env node

/**
 * Monallo Contract Deployer
 * 使用方法: node deploy-contract.js <你的私钥>
 */

const { ethers } = require('ethers');

// 合约字节码 (简化版 - 用于演示)
const CONTRACT_BYTECODE = "0x608060405234801561001057600080fd5b5061012a8061001f6000396000f3fe60806040526004361061004157600080fd5b3661013e3700604435230606452602481908352606081908181848285039052825180820361007d5280518192919061008490849382918391839182915b61006d565b505050565b61008d61008d61008d6100ae565b61008d565b565b60005460729060e6562c0861901d101062000001565b6080906021905262000056929391906200009d565b60405180910390f35b600080fd5b620000b6600182620000b66001839fd5b600080fd5b60806000620000ce6000396000f35b600080fdfe";

// 简化ABI
const CONTRACT_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)", 
  "function executeTransfer(address token, uint256 amount, address recipient, bytes32 intentId) payable",
  "function executeSwap(address fromToken, address toToken, uint256 amountIn, uint256 minAmountOut, bytes32 intentId) payable",
  "function executeBridge(address token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 intentId) payable",
  "function executeStake(uint256 amount, address validator, bytes32 intentId) payable",
  "function generateIntentId(address user, string memory action, uint256 nonce) pure returns (bytes32)",
  "function getNonce(address user) view returns (uint256)",
  "function owner() view returns (address)",
  "event IntentExecuted(address indexed user, string action, address token, uint256 amount, address recipient, bytes32 intentId)",
];

// Amara 测试网配置
const AMARA_CONFIG = {
  name: "Polkadot Amara",
  chainId: 1285,
  rpcUrl: "https://polkadot-amara-rpc.seeed.io",
};

async function main() {
  const privateKey = process.argv[2];
  
  if (!privateKey) {
    console.log("\n❌ 请提供私钥!");
    console.log("\n使用方法: node deploy-contract.js <你的私钥>");
    console.log("\n示例: node deploy-contract.js 0x1234567890abcdef...");
    console.log("\n注意: 这是测试网私钥，应该是 Amara 测试网的地址私钥");
    process.exit(1);
  }

  console.log("\n🛠️  Monallo 合约部署器");
  console.log("=".repeat(40));
  console.log(`网络: ${AMARA_CONFIG.name}`);
  console.log(`RPC: ${AMARA_CONFIG.rpcUrl}`);
  
  // 连接网络
  const provider = new ethers.JsonRpcProvider(AMARA_CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`\n📤 部署地址: ${wallet.address}`);
  
  // 检查余额
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 余额: ${ethers.formatEther(balance)} DOT`);
  
  if (balance === 0n) {
    console.log("\n❌ 余额为0! 请先领取测试币.");
    console.log("\n领取测试币:");
    console.log("1. 打开 https://polkadot.js.org/apps/");
    console.log("2. 连接钱包");
    console.log("3. 切换到 Amara 测试网");
    console.log("4. 从水龙头领取测试币");
    process.exit(1);
  }
  
  console.log("\n📦 部署智能合约...");
  
  // 部署简化版合约 (这里只是演示，实际需要完整字节码)
  // 注意: 由于字节码太长，这里用简化版
  try {
    // Factory for simple contract
    const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet);
    
    // 部署
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log("\n✅ 部署成功!");
    console.log("=".repeat(40));
    console.log(`📝 合约地址: ${address}`);
    console.log(`🔗 浏览器: https://polkadot.js.org/apps/#/explorer/query/${address}`);
    console.log("\n📋 下一步:");
    console.log(`1. 打开 lib/web3.ts`);
    console.log(`2. 将 CONTRACT_ADDRESSES.amara 改为: ${address}`);
    console.log(`3. 重启前端服务`);
    
    // 保存配置
    const fs = require('fs');
    const config = {
      network: "amara",
      contractAddress: address,
      deployer: wallet.address,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync('./monallo-config.json', JSON.stringify(config, null, 2));
    console.log("\n💾 配置已保存到 monallo-config.json");
    
  } catch (error) {
    console.log("\n❌ 部署失败:", error.message);
    console.log("\n可能的解决方案:");
    console.log("1. 检查私钥是否正确");
    console.log("2. 检查网络连接");
    console.log("3. 确保有足够的测试币");
  }
}

main();
