import { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Sparkles, Wallet, Layers, Video, Cpu, Globe, Shield, Activity, GitBranch } from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";

export const metadata: Metadata = {
  title: "Documentation | Monallo",
  description: "Complete product documentation, architecture design, and roadmap for Monallo AI-Powered Web3 Suite.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
            <img src="/logo.png" alt="Monallo" className="h-10" />
          </Link>
          <Link href="/" className="px-4 py-2 text-gray-300 hover:text-white">Back to Home</Link>
        </div>
      </header>

      <main className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">Monallo</span> Documentation
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              A comprehensive technical overview of our AI-powered Web3 product suite.
            </p>
          </div>

          <div className="mb-16 p-6 rounded-2xl bg-[#111] border border-white/5">
            <h2 className="text-lg font-bold mb-4">Table of Contents</h2>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#overview" className="hover:text-[#9945FF]">1. Overview</a></li>
              <li><a href="#products" className="hover:text-[#9945FF]">2. Products</a></li>
              <li><a href="#bridge-spec" className="hover:text-[#9945FF]">3. Monallo Bridge Technical Specification</a></li>
              <li><a href="#architecture" className="hover:text-[#9945FF]">4. Architecture Design</a></li>
              <li><a href="#technology" className="hover:text-[#9945FF]">5. Technology Stack</a></li>
              <li><a href="#roadmap" className="hover:text-[#9945FF]">6. Roadmap</a></li>
            </ul>
          </div>

          <section id="overview" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-[#9945FF]" />
              1. Overview
            </h2>
            <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
              <p className="text-gray-300 leading-relaxed mb-4">
                Monallo is an AI-powered decentralized application suite built on Polkadot, designed to simplify Web3 interactions through natural language interfaces. Our mission is to bridge the gap between traditional web users and decentralized finance by leveraging advanced AI intent recognition.
              </p>
              <p className="text-gray-300 leading-relaxed">
                The system is built with principles from distributed systems research, particularly regarding consensus mechanisms and fault tolerance. We have architected a system that prioritizes reliability, scalability, and user experience.
              </p>
            </div>
          </section>

          <section id="products" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#9945FF]" />
              2. Products
            </h2>
            
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#9945FF] to-[#B45AFF] flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Monallo Pay</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#14F195]/20 text-[#14F195]">Live</span>
                  </div>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  An AI-powered intent recognition and DeFi interface that allows users to execute complex financial operations through natural language.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5 opacity-70">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14F195] to-[#00D9FF] flex items-center justify-center">
                    <Layers className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Monallo Bridge</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#9945FF]/20 text-[#9945FF]">Coming Soon</span>
                  </div>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  A cross-chain asset bridge enabling seamless token transfers between different blockchain networks.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5 opacity-70">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#B45AFF] to-[#FF4D9E] flex items-center justify-center">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Monallo Video</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#9945FF]/20 text-[#9945FF]">Coming Soon</span>
                  </div>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  AI-powered video generation platform for creating Web3-related content.
                </p>
              </div>
            </div>
          </section>

          <section id="bridge-spec" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <GitBranch className="w-8 h-8 text-[#9945FF]" />
              3. Monallo Bridge Technical Specification
            </h2>
            <p className="text-gray-400 mb-6 max-w-2xl">
              This section is for community developers, users, and investors. It describes the architecture, contracts, relayer, and frontend flow of the Monallo native bridge for auditing, integration, and understanding.
            </p>

            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.1 Overview and Scope</h3>
                <p className="text-gray-300 leading-relaxed mb-3">
                  Monallo Bridge is Monallo&apos;s native cross-chain bridge using a <strong className="text-white">lock-mint</strong> model: users lock native assets (ETH or PAS) on the source chain; after relayer verification, the bridge contract on the destination chain either releases native tokens to the recipient or mints wrapped assets (e.g. <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">maoXXX.SourceChain</code>). It is separate from MonalloIntentExecutor&apos;s intent recording and uses a dedicated <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">MonalloBridge.sol</code> contract for lock / release (or mint) and events.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  <strong className="text-white">Supported chains and tokens</strong>: Sepolia (ETH) and Polkadot Hub (PAS), both EVM. The &quot;Polkadot Bridge&quot; option (e.g. Snowbridge / BridgeHub) is a placeholder and not part of this specification.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.2 Architecture Overview</h3>
                <p className="text-gray-300 leading-relaxed mb-4">
                  End-to-end flow: the user confirms &quot;Monallo Bridge&quot; in the frontend; the frontend calls <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">lock(recipient, destinationChainId)</code> on the source chain with native value; the bridge contract locks funds and emits <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">Locked</code>; the relayer listens, verifies, signs, and calls <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">release(...)</code> or <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">mint(...)</code> on the destination chain; the frontend may poll a status API to show the destination tx and full receipt.
                </p>
                <div className="my-4">
                  <MermaidDiagram />
                </div>
                <div className="text-gray-400 text-sm mt-3 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-strong:text-white prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:bg-white/10 prose-code:text-[#14F195] prose-code:before:content-none prose-code:after:content-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {`**Source chain**: user calls \`lock(recipient, destinationChainId)\` and sends native tokens (ETH or PAS); the contract locks and emits \`Locked\`. **Destination chain**: the relayer, after verifying the source lock, calls **mint** on the destination chain to mint wrapped assets **maoXXX.SourceChain** to \`recipient\` (or, in a release variant, releases native tokens from the bridge contract).`}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.3 Smart Contracts</h3>
                <ul className="space-y-2 text-gray-300 mb-4">
                  <li><strong className="text-white">Deployment</strong>: one <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">MonalloBridge.sol</code> per chain (Sepolia, Polkadot Hub), same interface.</li>
                  <li><strong className="text-white">lock</strong>: <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">lock(address recipient, uint256 destinationChainId)</code>, payable; increments nonce and emits <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">Locked(sender, recipient, amount, destinationChainId, nonce)</code>.</li>
                  <li><strong className="text-white">release / mint</strong>: only the trusted relayer triggers it; the contract verifies a signature over <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">(recipient, amount, sourceChainId, sourceTxHash, nonce)</code> via EIP-712 / ecrecover; then either deducts balance and <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">transfer(recipient, amount)</code> (release) or mints wrapped tokens to recipient (mint).</li>
                  <li><strong className="text-white">Replay protection</strong>: the destination contract records processed releases/mints with <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">usedNonce</code> or <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">(sourceChainId, sourceTxHash, nonce)</code> so the same lock is not released or minted twice.</li>
                </ul>
                <p className="text-gray-400 text-sm">
                  For a release design, the bridge contract must hold sufficient native tokens on the destination chain; on testnets this can be 1:1 or a fixed ratio (e.g. 1 ETH = 100 PAS for testing). Contract addresses and ABI are maintained in <code className="px-1.5 py-0.5 rounded bg-white/10">lib/bridge.ts</code> or web3 config.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.4 Relayer Service</h3>
                <p className="text-gray-300 leading-relaxed mb-3">
                  The relayer: listens for <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">Locked</code> events on both chains; after sufficient source-chain confirmations, reads sender, recipient, amount, destinationChainId, nonce, and sourceTxHash; signs this payload with the configured relayer key and calls the destination bridge contract&apos;s <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">release(..., signature)</code> or <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">mint(..., signature)</code>. Each <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">(sourceChainId, sourceTxHash, nonce)</code> is processed only once (optional <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">bridge_transfers</code> DB table for idempotency and status).
                </p>
                <p className="text-gray-300 leading-relaxed mb-2">
                  <strong className="text-white">Optional API</strong>: <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">GET /api/bridge/status?sourceChainId=...&sourceTxHash=...</code> returns <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">{`{ status: "pending" | "relayed", destinationTxHash?: string }`}</code> for the frontend to poll and show &quot;Locked, waiting for cross-chain&quot; and &quot;Received on destination chain&quot;.
                </p>
                <p className="text-gray-400 text-sm">
                  Stack aligned with Next.js (Node.js + ethers.js). Environment variables include both chains&apos; RPC URLs, bridge contract addresses, and relayer private key; production keys should be stored securely (e.g. KMS).
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.5 Frontend and User Flow</h3>
                <p className="text-gray-300 leading-relaxed mb-3">
                  In AI Pay&apos;s <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">handleConfirmIntent</code>, when <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">pendingIntent.action === "Bridge"</code> and the bridge type is Monallo Bridge (lock-mint): validate receiver, amount, and that source/target are limited to Sepolia and Polkadot Hub and differ; if the current chain is not the source, switch chain first; call the source-chain bridge <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">lock(recipient, destinationChainId)</code> with <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">value = parseEther(amount)</code>; on success show &quot;Locked, waiting for cross-chain…&quot; and the source explorer link; optionally poll the status API and when relayed show the destination tx and full bridge receipt (source tx + destination tx + amount + networks + recipient).
                </p>
                <p className="text-gray-400 text-sm">
                  Bridge contract addresses are configured via <code className="px-1.5 py-0.5 rounded bg-white/10">BRIDGE_CONTRACT_BY_CHAIN_ID</code> or environment variables.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.6 Risks and Considerations</h3>
                <ul className="space-y-2 text-gray-300">
                  <li><strong className="text-white">Liquidity</strong>: for a release design, the destination bridge contract must hold enough native tokens; testnets may require periodic or on-demand top-ups.</li>
                  <li><strong className="text-white">Relayer as single point</strong>: the current design uses a trusted relayer; for trust minimization, future versions may use source-chain state proofs (e.g. block header + receipt proof); this phase uses signature + event verification.</li>
                  <li><strong className="text-white">Polkadot Bridge</strong>: the &quot;Polkadot Bridge&quot; option in the UI remains a placeholder and can show &quot;Coming soon&quot; or be hidden.</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="text-xl font-bold mb-3">3.7 Implementation and Extensions (Developer Reference)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-300">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="py-2 pr-4 font-semibold text-white">Area</th>
                        <th className="py-2 pr-4 font-semibold text-white">File / Location</th>
                        <th className="py-2 font-semibold text-white">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-400">
                      <tr className="border-b border-white/5"><td className="py-2 pr-4">Contracts</td><td className="py-2 pr-4 font-mono text-[#14F195]">contracts/MonalloBridge.sol</td><td>lock / release (or mint), events, signature verification, nonce replay protection</td></tr>
                      <tr className="border-b border-white/5"><td className="py-2 pr-4">Config / lib</td><td className="py-2 pr-4 font-mono text-[#14F195]">lib/bridge.ts, env</td><td>Bridge addresses, ABI, lock/release helpers</td></tr>
                      <tr className="border-b border-white/5"><td className="py-2 pr-4">Frontend</td><td className="py-2 pr-4 font-mono text-[#14F195]">app/ai-pay/page.tsx</td><td>handleConfirmIntent Bridge + lock-mint: chain switch, lock, receipt and status</td></tr>
                      <tr className="border-b border-white/5"><td className="py-2 pr-4">Backend</td><td className="py-2 pr-4 font-mono text-[#14F195]">app/api/bridge/status/route.ts</td><td>Optional: relay status query</td></tr>
                      <tr className="border-b border-white/5"><td className="py-2 pr-4">Relayer</td><td className="py-2 pr-4 font-mono text-[#14F195]">relayer script/service</td><td>Listen Locked, sign, call release/mint</td></tr>
                      <tr><td className="py-2 pr-4">Data</td><td className="py-2 pr-4 font-mono text-[#14F195]">lib/db</td><td>Optional: bridge_transfers table</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section id="architecture" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Cpu className="w-8 h-8 text-[#9945FF]" />
              4. Architecture Design
            </h2>
            
            <div className="p-6 rounded-2xl bg-[#111] border border-white/5 mb-6">
              <h3 className="text-xl font-bold mb-4">4.1 System Overview</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Monallo employs a multi-layered architecture inspired by modern distributed systems design patterns.
              </p>
              <div className="p-4 rounded-xl bg-black border border-white/10 overflow-x-auto">
                <pre className="text-sm text-gray-400">
{`Client Layer → API Gateway → Intent Processing → Blockchain Adapter → Blockchain Networks`}
                </pre>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
              <h3 className="text-xl font-bold mb-4">4.2 Security Considerations</h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Multi-signature validation</strong> for large transactions</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Optimistic verification</strong> with fraud proofs for cross-chain operations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Formal methods</strong> applied to critical smart contract interactions</span>
                </li>
              </ul>
            </div>
          </section>

          <section id="technology" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Globe className="w-8 h-8 text-[#9945FF]" />
              5. Technology Stack
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold mb-3 text-[#9945FF]">Frontend</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li>• Next.js 14 (React Framework)</li>
                  <li>• TypeScript</li>
                  <li>• Tailwind CSS</li>
                  <li>• Framer Motion</li>
                  <li>• Viem</li>
                </ul>
              </div>
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold mb-3 text-[#9945FF]">Backend</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li>• Node.js Runtime</li>
                  <li>• Next.js API Routes</li>
                  <li>• Redis</li>
                  <li>• PostgreSQL</li>
                  <li>• OpenAI API</li>
                </ul>
              </div>
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold mb-3 text-[#9945FF]">Blockchain</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li>• Ethereum (EVM)</li>
                  <li>• Polkadot (Substrate)</li>
                  <li>• Polygon POS</li>
                  <li>• BSC</li>
                </ul>
              </div>
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold mb-3 text-[#9945FF]">Infrastructure</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li>• Vercel</li>
                  <li>• Docker</li>
                  <li>• GitHub Actions</li>
                  <li>• Cloudflare</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="roadmap" className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <Activity className="w-8 h-8 text-[#9945FF]" />
              6. Roadmap
            </h2>
            
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#111] border border-green-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">Phase 1 — Completed</span>
                  <h3 className="text-xl font-bold">Foundation</h3>
                </div>
                <ul className="space-y-2 text-gray-300">
                  <li>✓ Monallo Pay MVP</li>
                  <li>✓ Ethereum integration</li>
                  <li>✓ MetaMask support</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-blue-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm">Phase 2 — In Progress</span>
                  <h3 className="text-xl font-bold">Expansion</h3>
                </div>
                <ul className="space-y-2 text-gray-300">
                  <li>◐ Polkadot support</li>
                  <li>◐ Monallo Bridge</li>
                  <li>◐ Mobile app</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full bg-gray-500/20 text-gray-400 text-sm">Phase 3 — Planned</span>
                  <h3 className="text-xl font-bold">Growth</h3>
                </div>
                <ul className="space-y-2 text-gray-400">
                  <li>○ Monallo Video</li>
                  <li>○ NFT Marketplace</li>
                  <li>○ DAO Governance</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-[#111] border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full bg-gray-500/20 text-gray-400 text-sm">Phase 4 — Vision</span>
                  <h3 className="text-xl font-bold">Ecosystem</h3>
                </div>
                <ul className="space-y-2 text-gray-400">
                  <li>○ DeFi Aggregator</li>
                  <li>○ Launchpad</li>
                  <li>○ DEX</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="text-center p-8 rounded-2xl bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10 border border-white/5">
            <p className="text-gray-400">
              This documentation is continuously updated. Last revised: February 2026.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <img src="/logo.png" alt="Monallo" className="h-8" />
          <div className="text-sm text-gray-600">© 2026 Monallo. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
