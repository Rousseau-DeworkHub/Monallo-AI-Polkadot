/** @type {import('next').NextConfig} */
const nextConfig = {
  // 将 .env 中的 RPC_Injective 暴露给客户端（useWallet 添加 MetaMask 网络等）
  env: {
    RPC_Injective: process.env.RPC_Injective ?? "",
  },
};

export default nextConfig;
