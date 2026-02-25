import { ethers } from "ethers";

// Contract ABI (simplified for main functions)
const CONTRACT_ABI = [
  "function executeTransfer(address token, uint256 amount, address recipient, bytes32 intentId) external payable",
  "function executeSwap(address fromToken, address toToken, uint256 amountIn, uint256 minAmountOut, bytes32 intentId) external payable",
  "function executeBridge(address token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 intentId) external payable",
  "function executeStake(uint256 amount, address validator, bytes32 intentId) external payable",
  "function generateIntentId(address user, string memory action, uint256 nonce) public pure returns (bytes32)",
  "function getNonce(address user) external view returns (uint256)",
  "function name() public view returns (string)",
  "event IntentExecuted(address indexed user, string action, address token, uint256 amount, address recipient, bytes32 intentId)",
];

// Contract addresses by network
const CONTRACT_ADDRESSES: Record<string, string> = {
  // Sepolia Testnet - 部署后填入
  "sepolia": "0x0000000000000000000000000000000000000000",
  // Amara Testnet (Polkadot) - 部署后填入
  "amara": "0x0000000000000000000000000000000000000000",
  // Mainnet - 部署后填入
  "polkadot": "0x0000000000000000000000000000000000000000",
};

// Token addresses on different networks
const TOKENS: Record<string, Record<string, string>> = {
  "sepolia": {
    "ETH": "0x0000000000000000000000000000000000000000", // Native
    "USDT": "0xaA8E23Fb1079EA57eB8c45EAD9d702A36E4e1e5D", // Sepolia USDT
    "USDC": "0x94a9D9AC8a22534E69526e0b2170089d23a8B87A", // Sepolia USDC
    "DAI": "0x7395546d6d5d7B7145c28B4a8B5d8c1d8B9e5c8", // Sepolia DAI
  },
  "amara": {
    "DOT": "0x0000000000000000000000000000000000000000", // Native
    "USDT": "0x79f3bb6a64bfc3a76c49e5b9d0ff5b1a1d5b8b7",
    "USDC": "0x818ec3a7e2fa46c8b3a2b7b0e8e5b7c1f5d8e3a",
    "ETH": "0x3c1bca9a5f4a7d9a7d3c5a5c7e8f9a0b1c2d3e4",
  },
  "polkadot": {
    "DOT": "0x0000000000000000000000000000000000000000",
  }
};

export interface Web3Config {
  network: string;
  rpcUrl: string;
  contractAddress: string;
}

export const DEFAULT_CONFIG: Web3Config = {
  network: "sepolia",
  rpcUrl: "https://rpc.sepolia.org",
  contractAddress: CONTRACT_ADDRESSES["sepolia"],
};

export class MonalloContract {
  private provider: ethers.BrowserProvider | ethers.JsonRpcProvider | null = null;
  private signer: ethers.Signer | null = null;
  private contract: ethers.Contract | null = null;
  private config: Web3Config;

  constructor(config: Web3Config = DEFAULT_CONFIG) {
    this.config = config;
  }

  async connect() {
    const win = typeof window !== "undefined" ? (window as Window & { ethereum?: ethers.Eip1193Provider }) : null;
    if (win?.ethereum) {
      this.provider = new ethers.BrowserProvider(win.ethereum);
      this.signer = await this.provider.getSigner();
    } else {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    }

    if (this.config.contractAddress !== "0x0000000000000000000000000000000000000000") {
      this.contract = new ethers.Contract(
        this.config.contractAddress,
        CONTRACT_ABI,
        this.signer || this.provider
      );
    }

    return { provider: this.provider, signer: this.signer, contract: this.contract };
  }

  async executeTransfer(token: string, amount: string, recipient: string): Promise<string> {
    if (!this.contract || !this.signer) {
      throw new Error("Contract not connected");
    }

    const user = await this.signer.getAddress();
    const nonce = await this.contract.getNonce(user);
    const intentId = await this.contract.generateIntentId(user, "transfer", nonce);

    const tx = await this.contract.executeTransfer(
      token === "DOT" ? ethers.ZeroAddress : token,
      ethers.parseEther(amount),
      recipient,
      intentId
    );

    return tx.hash;
  }

  async executeSwap(fromToken: string, toToken: string, amount: string): Promise<string> {
    if (!this.contract || !this.signer) {
      throw new Error("Contract not connected");
    }

    const user = await this.signer.getAddress();
    const nonce = await this.contract.getNonce(user);
    const intentId = await this.contract.generateIntentId(user, "swap", nonce);

    const tx = await this.contract.executeSwap(
      fromToken,
      toToken,
      ethers.parseEther(amount),
      0, // minAmountOut - would calculate from DEX
      intentId
    );

    return tx.hash;
  }

  async executeBridge(token: string, amount: string, destinationChain: number, recipient: string): Promise<string> {
    if (!this.contract || !this.signer) {
      throw new Error("Contract not connected");
    }

    const user = await this.signer.getAddress();
    const nonce = await this.contract.getNonce(user);
    const intentId = await this.contract.generateIntentId(user, "bridge", nonce);

    const tx = await this.contract.executeBridge(
      token === "DOT" ? ethers.ZeroAddress : token,
      ethers.parseEther(amount),
      destinationChain,
      recipient,
      intentId
    );

    return tx.hash;
  }

  async executeStake(amount: string, validator: string): Promise<string> {
    if (!this.contract || !this.signer) {
      throw new Error("Contract not connected");
    }

    const user = await this.signer.getAddress();
    const nonce = await this.contract.getNonce(user);
    const intentId = await this.contract.generateIntentId(user, "stake", nonce);

    const tx = await this.contract.executeStake(
      ethers.parseEther(amount),
      validator,
      intentId
    );

    return tx.hash;
  }

  getTokenAddress(symbol: string): string {
    const network = this.config.network;
    return TOKENS[network]?.[symbol] || ethers.ZeroAddress;
  }

  isConfigured(): boolean {
    return this.config.contractAddress !== "0x0000000000000000000000000000000000000000";
  }
}

// Singleton instance
export const monalloContract = new MonalloContract();

// Helper to format address
export function formatAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper to format ether
export function formatEther(wei: bigint): string {
  return ethers.formatEther(wei);
}
