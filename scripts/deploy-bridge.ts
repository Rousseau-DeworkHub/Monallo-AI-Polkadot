/**
 * 部署 Monallo Bridge 合约：MonalloBridge（Lock）+ MaoWrappedToken（maoXXX.SourceChain）
 * 运行：npx hardhat run scripts/deploy-bridge.ts --network sepolia
 *      npx hardhat run scripts/deploy-bridge.ts --network polkadotHub
 * 需在 .env 中设置 DEPLOYER_PRIVATE_KEY（部署者即 relayer）
 */
import { network } from "hardhat";

async function main() {
  const { ethers, networkName } = await network.connect();
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const relayer = deployer.address;

  console.log(`\nDeploying to ${networkName}...`);
  console.log("Deployer/Relayer:", relayer);

  // 1. MonalloBridge（relayer 用于 release 签名校验）
  const bridge = await ethers.deployContract("MonalloBridge", [relayer]);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("MonalloBridge:", bridgeAddress);

  // 2. MaoWrappedToken：按链选择名称
  const isSepolia = networkName === "sepolia";
  const name = isSepolia ? "maoPAS.Polkadot-Hub" : "maoETH.Sepolia";
  const symbol = isSepolia ? "maoPAS.PH" : "maoETH.Sepolia";
  const wrapped = await ethers.deployContract("MaoWrappedToken", [name, symbol, relayer]);
  await wrapped.waitForDeployment();
  const wrappedAddress = await wrapped.getAddress();
  console.log("MaoWrappedToken:", wrappedAddress, `(${name})`);

  console.log("\n--- .env ---");
  if (isSepolia) {
    console.log(`NEXT_PUBLIC_BRIDGE_LOCK_SEPOLIA=${bridgeAddress}`);
    console.log(`BRIDGE_LOCK_SEPOLIA=${bridgeAddress}`);
    console.log(`WRAPPED_PAS_SEPOLIA=${wrappedAddress}`);
  } else {
    console.log(`NEXT_PUBLIC_BRIDGE_LOCK_POLKADOT_HUB=${bridgeAddress}`);
    console.log(`BRIDGE_LOCK_POLKADOT_HUB=${bridgeAddress}`);
    console.log(`WRAPPED_ETH_POLKADOT_HUB=${wrappedAddress}`);
  }
  console.log("\nRelayer (for mint):", relayer, "-> set RELAYER_PRIVATE_KEY to deployer key for relayer script");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
