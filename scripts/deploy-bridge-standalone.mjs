#!/usr/bin/env node
/**
 * Monallo Bridge 一键部署（三链 + 全部 Wrapped）
 *
 * 默认：在 Sepolia、Polkadot Hub、Injective EVM(1439) 各部署 MonalloBridge，
 * 并部署 6 个 MaoWrappedToken（与 lib/bridge.ts 矩阵一致）。
 *
 * 需要：
 * - .env 中 DEPLOYER_PRIVATE_KEY（0x…，通常与中继 RELAYER_PRIVATE_KEY 为同一地址）
 * - 三条链上均有足够原生 gas（Sepolia ETH、Hub PAS、Injective INJ）
 *
 * 运行：
 *   npm run deploy:bridge
 *   或 node scripts/deploy-bridge-standalone.mjs
 *
 * 若你已在 Sepolia/Hub 部署过 Lock + maoPAS + maoETH，仅需补 Injective 与两条 maoINJ：
 *   node scripts/deploy-bridge-standalone.mjs --extension-only
 *   （需在 .env 中已有 BRIDGE_LOCK_SEPOLIA、BRIDGE_LOCK_POLKADOT_HUB、
 *     WRAPPED_PAS_SEPOLIA、WRAPPED_ETH_POLKADOT_HUB，且部署时 relayer 与现网一致）
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import solc from "solc";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const contractsDir = join(root, "contracts");

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const SEPOLIA_RPC_LIST = process.env.SEPOLIA_RPC_URL
  ? [process.env.SEPOLIA_RPC_URL]
  : [
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.drpc.org",
      "https://rpc2.sepolia.org",
    ];
const POLKADOT_HUB_RPC = process.env.POLKADOT_HUB_RPC_URL || "https://eth-rpc-testnet.polkadot.io";
const INJECTIVE_RPC_LIST = [process.env.RPC_INJECTIVE, process.env.RPC_Injective, "https://k8s.testnet.json-rpc.injective.network/"].filter(
  Boolean
);

const SEPOLIA_CHAIN_ID = 11155111;
const POLKADOT_HUB_CHAIN_ID = 420420417;
const INJECTIVE_CHAIN_ID = 1439;

const extensionOnly = process.argv.includes("--extension-only");

async function getSepoliaProvider() {
  for (const url of SEPOLIA_RPC_LIST) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: SEPOLIA_CHAIN_ID, name: "sepolia" });
      await p.getBlockNumber();
      return p;
    } catch (e) {
      console.warn("Sepolia RPC failed:", url, e?.shortMessage ?? e?.message ?? e);
    }
  }
  throw new Error("所有 Sepolia RPC 均不可用，可设置 .env 中 SEPOLIA_RPC_URL");
}

async function getInjectiveProvider() {
  for (const url of INJECTIVE_RPC_LIST) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: INJECTIVE_CHAIN_ID, name: "injective-testnet" });
      await p.getBlockNumber();
      return p;
    } catch (e) {
      console.warn("Injective RPC failed:", url, e?.shortMessage ?? e?.message ?? e);
    }
  }
  throw new Error("Injective RPC 不可用，请设置 .env 中 RPC_INJECTIVE 或 RPC_Injective");
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

async function deploy(wallet, abi, bytecode, constructorArgs = []) {
  const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return await contract.getAddress();
}

function envAddr(...keys) {
  for (const k of keys) {
    const v = typeof k === "string" ? k.trim() : "";
    if (v) return v;
  }
  return "";
}

function printEnvBlock(vars) {
  const lines = Object.entries(vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`);
  console.log("\n========== 复制到 .env（或合并现有项）==========\n");
  console.log(lines.join("\n"));
  console.log("\n# 中继：RELAYER_PRIVATE_KEY 须与 DEPLOYER 为同一账户（MaoWrappedToken.relayer 已设为该地址）");
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

  const providerSepolia = await getSepoliaProvider();
  const providerPh = new ethers.JsonRpcProvider(POLKADOT_HUB_RPC, {
    chainId: POLKADOT_HUB_CHAIN_ID,
    name: "polkadot-hub",
  });
  const providerInj = await getInjectiveProvider();

  const walletSepolia = new ethers.Wallet(pk, providerSepolia);
  const walletPh = new ethers.Wallet(pk, providerPh);
  const walletInj = new ethers.Wallet(pk, providerInj);
  const relayer = walletSepolia.address;
  console.log("\nDeployer / MaoWrappedToken relayer 地址:", relayer);

  const out = {
    sepolia: {},
    polkadotHub: {},
    injective: {},
    relayer,
    mode: extensionOnly ? "extension-only" : "full",
  };

  let bridgeSepolia;
  let wrappedPasSepolia;
  let bridgePh;
  let wrappedEthPh;

  if (extensionOnly) {
    bridgeSepolia = envAddr(process.env.BRIDGE_LOCK_SEPOLIA, process.env.NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA);
    wrappedPasSepolia = envAddr(process.env.WRAPPED_PAS_SEPOLIA, process.env.NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA);
    bridgePh = envAddr(process.env.BRIDGE_LOCK_POLKADOT_HUB, process.env.NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB);
    wrappedEthPh = envAddr(process.env.WRAPPED_ETH_POLKADOT_HUB, process.env.NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB);
    const missing = [];
    if (!bridgeSepolia) missing.push("BRIDGE_LOCK_SEPOLIA 或 NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA");
    if (!wrappedPasSepolia) missing.push("WRAPPED_PAS_SEPOLIA 或 NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA");
    if (!bridgePh) missing.push("BRIDGE_LOCK_POLKADOT_HUB 或 NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB");
    if (!wrappedEthPh) missing.push("WRAPPED_ETH_POLKADOT_HUB 或 NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB");
    if (missing.length) {
      console.error("--extension-only 需要已有 Sepolia/Hub 地址，缺少：", missing.join(", "));
      process.exit(1);
    }
    console.log("\n--- extension-only：复用 Sepolia / Hub 已有合约 ---");
    out.sepolia.bridgeLock = bridgeSepolia;
    out.sepolia.wrappedPAS = wrappedPasSepolia;
    out.polkadotHub.bridgeLock = bridgePh;
    out.polkadotHub.wrappedETH = wrappedEthPh;
  }

  // Sepolia
  console.log("\n--- Sepolia ---");
  const balSepolia = await providerSepolia.getBalance(relayer);
  console.log("Balance:", ethers.formatEther(balSepolia), "ETH");
  if (balSepolia === 0n) {
    console.error("Sepolia 余额为 0，请先领水龙头");
    process.exit(1);
  }
  if (!extensionOnly) {
    bridgeSepolia = await deploy(walletSepolia, bridgeArtifact.abi, bridgeArtifact.bytecode, [relayer]);
    console.log("MonalloBridge:", bridgeSepolia);
    wrappedPasSepolia = await deploy(walletSepolia, wrappedArtifact.abi, wrappedArtifact.bytecode, [
      "maoPAS.Polkadot-Hub",
      "maoPAS.PH",
      relayer,
    ]);
    console.log("MaoWrappedToken (maoPAS.PH):", wrappedPasSepolia);
    out.sepolia.bridgeLock = bridgeSepolia;
    out.sepolia.wrappedPAS = wrappedPasSepolia;
  }
  const wrappedInjSepolia = await deploy(walletSepolia, wrappedArtifact.abi, wrappedArtifact.bytecode, [
    "maoINJ.Injective",
    "maoINJ.Injective",
    relayer,
  ]);
  console.log("MaoWrappedToken (maoINJ.Injective):", wrappedInjSepolia);
  out.sepolia.wrappedINJ = wrappedInjSepolia;

  // Polkadot Hub
  console.log("\n--- Polkadot Hub ---");
  const balPh = await providerPh.getBalance(relayer);
  console.log("Balance:", ethers.formatEther(balPh), "PAS");
  if (balPh === 0n) {
    console.error("Polkadot Hub 余额为 0，请先领测试 PAS");
    process.exit(1);
  }
  if (!extensionOnly) {
    bridgePh = await deploy(walletPh, bridgeArtifact.abi, bridgeArtifact.bytecode, [relayer]);
    console.log("MonalloBridge:", bridgePh);
    wrappedEthPh = await deploy(walletPh, wrappedArtifact.abi, wrappedArtifact.bytecode, ["maoETH.Sepolia", "maoETH.Sepolia", relayer]);
    console.log("MaoWrappedToken (maoETH.Sepolia):", wrappedEthPh);
    out.polkadotHub.bridgeLock = bridgePh;
    out.polkadotHub.wrappedETH = wrappedEthPh;
  }
  const wrappedInjHub = await deploy(walletPh, wrappedArtifact.abi, wrappedArtifact.bytecode, [
    "maoINJ.Injective",
    "maoINJ.Injective",
    relayer,
  ]);
  console.log("MaoWrappedToken (maoINJ.Injective):", wrappedInjHub);
  out.polkadotHub.wrappedINJ = wrappedInjHub;

  // Injective EVM
  console.log("\n--- Injective EVM (chainId " + INJECTIVE_CHAIN_ID + ") ---");
  const balInj = await providerInj.getBalance(relayer);
  console.log("Balance:", ethers.formatEther(balInj), "INJ");
  if (balInj === 0n) {
    console.error("Injective 余额为 0，请先领取测试 INJ");
    process.exit(1);
  }
  const bridgeInj = await deploy(walletInj, bridgeArtifact.abi, bridgeArtifact.bytecode, [relayer]);
  console.log("MonalloBridge:", bridgeInj);
  const wrappedEthInj = await deploy(walletInj, wrappedArtifact.abi, wrappedArtifact.bytecode, ["maoETH.Sepolia", "maoETH.Sepolia", relayer]);
  console.log("MaoWrappedToken (maoETH.Sepolia):", wrappedEthInj);
  const wrappedPasInj = await deploy(walletInj, wrappedArtifact.abi, wrappedArtifact.bytecode, [
    "maoPAS.Polkadot-Hub",
    "maoPAS.PH",
    relayer,
  ]);
  console.log("MaoWrappedToken (maoPAS.PH):", wrappedPasInj);
  out.injective.bridgeLock = bridgeInj;
  out.injective.wrappedETH = wrappedEthInj;
  out.injective.wrappedPAS = wrappedPasInj;

  const envVars = {
    NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA: bridgeSepolia,
    BRIDGE_LOCK_SEPOLIA: bridgeSepolia,
    NEXT_PUBLIC_WRAPPED_PAS_SEPOLIA: wrappedPasSepolia,
    WRAPPED_PAS_SEPOLIA: wrappedPasSepolia,
    NEXT_PUBLIC_WRAPPED_INJ_SEPOLIA: wrappedInjSepolia,
    WRAPPED_INJ_SEPOLIA: wrappedInjSepolia,

    NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB: bridgePh,
    BRIDGE_LOCK_POLKADOT_HUB: bridgePh,
    NEXT_PUBLIC_WRAPPED_ETH_POLKADOT_HUB: wrappedEthPh,
    WRAPPED_ETH_POLKADOT_HUB: wrappedEthPh,
    NEXT_PUBLIC_WRAPPED_INJ_POLKADOT_HUB: wrappedInjHub,
    WRAPPED_INJ_POLKADOT_HUB: wrappedInjHub,

    NEXT_PUBLIC_BRIDGE_LOCK_INJECTIVE: bridgeInj,
    BRIDGE_LOCK_INJECTIVE: bridgeInj,
    NEXT_PUBLIC_WRAPPED_ETH_INJECTIVE: wrappedEthInj,
    WRAPPED_ETH_INJECTIVE: wrappedEthInj,
    NEXT_PUBLIC_WRAPPED_PAS_INJECTIVE: wrappedPasInj,
    WRAPPED_PAS_INJECTIVE: wrappedPasInj,
  };

  printEnvBlock(envVars);

  const outPath = join(root, "bridge-deployed.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n完整 JSON 已写入", outPath);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
