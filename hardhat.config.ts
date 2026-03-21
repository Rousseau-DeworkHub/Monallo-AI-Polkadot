import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    polkadotHub: {
      type: "http",
      chainType: "l1",
      url: process.env.POLKADOT_HUB_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    injectiveTestnet: {
      type: "http",
      chainType: "l1",
      url: process.env.RPC_INJECTIVE ?? "https://k8s.testnet.json-rpc.injective.network/",
      chainId: 1439,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
