#!/usr/bin/env node
/**
 * 独立部署 Monallo Bridge（不依赖 Hardhat 运行时）
 * 需要：DEPLOYER_PRIVATE_KEY 在 .env 或环境变量；Sepolia 与 Polkadot Hub 上有测试币
 * 运行：node scripts/deploy-bridge-standalone.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import solc from "solc";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const contractsDir = join(root, "contracts");

// 加载 .env（可选）
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

// Sepolia 备用 RPC（522/超时时自动切换）
const SEPOLIA_RPC_LIST = process.env.SEPOLIA_RPC_URL
  ? [process.env.SEPOLIA_RPC_URL]
  : [
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.drpc.org",
      "https://rpc2.sepolia.org",
    ];
const POLKADOT_HUB_RPC = process.env.POLKADOT_HUB_RPC_URL || "https://eth-rpc-testnet.polkadot.io";
const SEPOLIA_CHAIN_ID = 11155111;
const POLKADOT_HUB_CHAIN_ID = 420420417;

async function getSepoliaProvider() {
  for (const url of SEPOLIA_RPC_LIST) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      return p;
    } catch (e) {
      console.warn("Sepolia RPC failed:", url, e?.shortMessage ?? e?.message ?? e);
      continue;
    }
  }
  throw new Error("所有 Sepolia RPC 均不可用，可设置 .env 中 SEPOLIA_RPC_URL");
}

function compile(name, content) {
  const input = {
    language: "Solidity",
    sources: { [name]: { content } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors?.length) {
    const err = out.errors.find((e) => e.severity === "error");
    if (err) throw new Error(err.formattedMessage);
  }
  const fileContracts = out.contracts[name];
  const contractName = Object.keys(fileContracts)[0];
  const contract = fileContracts[contractName];
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function deploy(wallet, name, abi, bytecode, constructorArgs = []) {
  const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return await contract.getAddress();
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) {
    console.error("请在 .env 中设置 DEPLOYER_PRIVATE_KEY（0x 开头的私钥）");
    process.exit(1);
  }

  const bridgeSol = readFileSync(join(contractsDir, "MonalloBridge.sol"), "utf8");
  const wrappedSol = readFileSync(join(contractsDir, "MaoWrappedToken.sol"), "utf8");

  console.log("Compiling MonalloBridge...");
  const bridgeArtifact = compile("MonalloBridge.sol", bridgeSol);
  console.log("Compiling MaoWrappedToken...");
  const wrappedArtifact = compile("MaoWrappedToken.sol", wrappedSol);

  console.log("Connecting to Sepolia (trying fallback RPCs if needed)...");
  const providerSepolia = await getSepoliaProvider();
  const providerPh = new ethers.JsonRpcProvider(POLKADOT_HUB_RPC, {
    chainId: POLKADOT_HUB_CHAIN_ID,
    name: "polkadot-hub",
  });
  const walletSepolia = new ethers.Wallet(pk, providerSepolia);
  const walletPh = new ethers.Wallet(pk, providerPh);
  const relayer = walletSepolia.address;
  console.log("\nDeployer/Relayer:", relayer);

  const out = { sepolia: {}, polkadotHub: {} };

  // Sepolia
  console.log("\n--- Sepolia ---");
  const balSepolia = await providerSepolia.getBalance(relayer);
  console.log("Balance:", ethers.formatEther(balSepolia), "ETH");
  if (balSepolia === 0n) {
    console.error("Sepolia 余额为 0，请先领水龙头");
    process.exit(1);
  }
  const bridgeSepolia = await deploy(walletSepolia, "MonalloBridge", bridgeArtifact.abi, bridgeArtifact.bytecode, [relayer]);
  console.log("MonalloBridge:", bridgeSepolia);
  const wrappedPasSepolia = await deploy(
    walletSepolia,
    "MaoWrappedToken",
    wrappedArtifact.abi,
    wrappedArtifact.bytecode,
    ["maoPAS.Polkadot-Hub", "maoPAS.PH", relayer]
  );
  console.log("MaoWrappedToken (maoPAS.Polkadot-Hub):", wrappedPasSepolia);
  out.sepolia.bridgeLock = bridgeSepolia;
  out.sepolia.wrappedPAS = wrappedPasSepolia;

  // Polkadot Hub
  console.log("\n--- Polkadot Hub ---");
  const balPh = await providerPh.getBalance(relayer);
  console.log("Balance:", ethers.formatEther(balPh), "PAS");
  if (balPh === 0n) {
    console.error("Polkadot Hub 余额为 0，请先领测试 PAS");
    process.exit(1);
  }
  const bridgePh = await deploy(walletPh, "MonalloBridge", bridgeArtifact.abi, bridgeArtifact.bytecode, [relayer]);
  console.log("MonalloBridge:", bridgePh);
  const wrappedEthPh = await deploy(
    walletPh,
    "MaoWrappedToken",
    wrappedArtifact.abi,
    wrappedArtifact.bytecode,
    ["maoETH.Sepolia", "maoETH.Sepolia", relayer]
  );
  console.log("MaoWrappedToken (maoETH.Sepolia):", wrappedEthPh);
  out.polkadotHub.bridgeLock = bridgePh;
  out.polkadotHub.wrappedETH = wrappedEthPh;

  console.log("\n========== .env 配置 ==========");
  console.log(`
# Bridge 合约（复制到 .env）
NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA=${bridgeSepolia}
BRIDGE_LOCK_SEPOLIA=${bridgeSepolia}
WRAPPED_PAS_SEPOLIA=${wrappedPasSepolia}

NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB=${bridgePh}
BRIDGE_LOCK_POLKADOT_HUB=${bridgePh}
WRAPPED_ETH_POLKADOT_HUB=${wrappedEthPh}

# 中继使用同一私钥
RELAYER_PRIVATE_KEY=${pk.startsWith("0x") ? pk : "0x" + pk}
`);

  const outPath = join(root, "bridge-deployed.json");
  writeFileSync(outPath, JSON.stringify({ ...out, relayer }, null, 2));
  console.log("地址已写入", outPath);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
