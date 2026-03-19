import { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Wallet,
  Layers,
  Cpu,
  Globe,
  Shield,
  Activity,
  GitBranch,
  Store,
  BookOpen,
  FileCode,
  FolderOpen,
} from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";
import { DocsBaseUrl, DocsApiCodeBlocks } from "./DocsApiCode";

export const metadata: Metadata = {
  title: "Documentation | Monallo",
  description:
    "Monallo connects crypto and AI: Pay with PAS/ETH for LLM API, one balance and one API key. Docs, Quick Start, and technical reference.",
};

const SIDEBAR_LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#products", label: "Products" },
  { href: "#store", label: "Monallo Store" },
  { href: "#quick-start", label: "Quick Start" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#appendix", label: "Appendix" },
  { href: "#appendix-architecture", label: "  Architecture" },
  { href: "#appendix-bridge", label: "  Bridge Spec" },
  { href: "#appendix-code", label: "  Code Reference" },
  { href: "#appendix-glossary", label: "  Glossary" },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Left sidebar: fixed TOC */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 fixed left-0 top-0 bottom-0 border-r border-white/10 bg-black/50 overflow-y-auto z-40">
        <div className="p-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3 text-gray-300 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
            <img src="/logo.png" alt="Monallo" className="h-8" />
          </Link>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-gray-400 hover:text-[#9945FF]"
          >
            Back to Home
          </Link>
        </div>
        <nav className="p-4 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
            Contents
          </p>
          {SIDEBAR_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                link.label.startsWith("  ")
                  ? "pl-6 text-gray-400 hover:text-white hover:bg-white/5"
                  : "text-gray-300 hover:text-[#9945FF] hover:bg-white/5"
              }`}
            >
              {link.label.trim()}
            </a>
          ))}
        </nav>
      </aside>

      {/* Top bar for mobile: back + logo */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
            <img src="/logo.png" alt="Monallo" className="h-8" />
          </Link>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 min-h-screen pt-20 lg:pt-12 pb-24 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-3">
              <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
                Monallo
              </span>{" "}
              Documentation
            </h1>
            <p className="text-gray-400">
              Product overview, Quick Start for Monallo Store, and technical reference.
            </p>
          </div>

          {/* 1. Overview */}
          <section id="overview" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-[#9945FF]" />
              Overview
            </h2>
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <p className="text-gray-300 leading-relaxed mb-4">
                  Monallo is an AI-powered Web3 suite built on Polkadot, connecting the crypto world
                  with AI services. As the AI API market grows, crypto holders and developers need
                  a way to pay for LLM usage without leaving the crypto stack. Monallo lets you pay
                  with cryptocurrency (e.g. PAS, wrapped ETH) and access multiple AI models
                  through a single, unified API.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  The platform includes Monallo Pay (intent-based DeFi), Monallo Bridge (cross-chain
                  lock-mint), and Monallo Store (LLM token credits and OpenAI-compatible API).
                  Reliability, scalability, and a clear developer experience are core priorities.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold text-white mb-3">Problem</h3>
                <ul className="text-gray-400 text-sm space-y-2 mb-4">
                  <li>• Crypto holders cannot easily use their assets to pay for AI API services.</li>
                  <li>• Developers need to manage multiple AI provider accounts and payment methods.</li>
                  <li>• Cross-border and crypto-native payment infrastructure for AI is lacking.</li>
                </ul>
                <h3 className="font-bold text-white mb-3">Solution</h3>
                <ul className="text-gray-400 text-sm space-y-2">
                  <li>• <strong className="text-white">Crypto-native payment</strong> — Deposit PAS/ETH, get credits; pay for AI with one balance.</li>
                  <li>• <strong className="text-white">Unified API</strong> — One endpoint and one API key for multiple LLM models (GPT, MiniMax, Gemini, etc.).</li>
                  <li>• <strong className="text-white">On-chain credits</strong> — Credit Ledger on Polkadot Hub; usage and balances are transparent and verifiable.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Products */}
          <section id="products" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <Wallet className="w-6 h-6 text-[#9945FF]" />
              Products
            </h2>
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9945FF] to-[#B45AFF] flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">Monallo Pay</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#14F195]/20 text-[#14F195]">
                      Live
                    </span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  AI-powered intent recognition and DeFi: execute operations via natural language.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#14F195] to-[#00D9FF] flex items-center justify-center">
                    <Layers className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">Monallo Bridge</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#14F195]/20 text-[#14F195]">
                      Live
                    </span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  Cross-chain bridge (Sepolia ↔ Polkadot Hub) with lock-mint and wrapped assets.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F68521] to-[#FFB347] flex items-center justify-center">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">Monallo Store</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#14F195]/20 text-[#14F195]">
                      Live
                    </span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  LLM Token Store: buy token packs or recharge MON with PAS/maoETH, get an API key,
                  and call OpenAI-compatible chat completions.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Monallo Store */}
          <section id="store" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <Store className="w-6 h-6 text-[#F68521]" />
              Monallo Store
            </h2>
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <p className="text-gray-300 leading-relaxed mb-4">
                  Monallo Store is an AI API aggregation layer with crypto payment. You deposit
                  cryptocurrency (PAS or wrapped ETH on Polkadot Hub Testnet), receive on-chain
                  credits (token packs or MON balance), and call a single OpenAI-compatible API to
                  use multiple LLM models.
                </p>
                <h3 className="font-bold text-white mb-2 mt-4">Core value</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>• <strong className="text-white">One balance, many models</strong> — Pay once in crypto; use GPT, MiniMax, Gemini, etc. via one API key.</li>
                  <li>• <strong className="text-white">Token packs & MON</strong> — Buy fixed token packs per model (with volume discount) or recharge MON (1 USD = 1 MON) for flexible spend.</li>
                  <li>• <strong className="text-white">Chain-settled credits</strong> — Credits are minted and tracked on-chain (Credit Ledger); usage is transparent.</li>
                </ul>
              </div>
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h3 className="font-bold text-white mb-2">Flow</h3>
                <pre className="text-sm text-gray-400 font-mono bg-[#0d0d0d] border border-white/10 rounded-xl p-4 overflow-x-auto">
                  <code>{`Wallet (PAS/maoETH) → Store payment → Credit Ledger (mint) → API Key → POST /chat/completions`}</code>
                </pre>
                <ul className="space-y-2 text-gray-400 text-sm mt-4">
                  <li>
                    <strong className="text-white">Network:</strong> Polkadot Hub Testnet (EVM, MetaMask)
                  </li>
                  <li>
                    <strong className="text-white">Payment:</strong> PAS, maoETH (if configured)
                  </li>
                  <li>
                    <strong className="text-white">Models:</strong> GPT-5.2, MiniMax M2.5, Gemini 3.1 Pro, and more
                  </li>
                  <li>
                    <strong className="text-white">API base:</strong> <DocsBaseUrl /> — header{" "}
                    <code className="px-1.5 py-0.5 rounded bg-white/10">Authorization: Bearer &lt;API Key&gt;</code>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Quick Start */}
          <section id="quick-start" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <BookOpen className="w-6 h-6 text-[#9945FF]" />
              Quick Start — Monallo Store
            </h2>
            <div className="p-6 rounded-2xl bg-[#111] border border-white/5 space-y-6">
              <ol className="space-y-4 text-gray-300 list-decimal list-inside">
                <li>
                  <strong className="text-white">Open Store:</strong> Go to{" "}
                  <Link href="/store" className="text-[#9945FF] hover:underline">
                    /store
                  </Link>
                  .
                </li>
                <li>
                  <strong className="text-white">Connect wallet:</strong> Click “Connect Wallet” and
                  connect MetaMask; switch to <strong className="text-white">Polkadot Hub
                  Testnet</strong> when prompted.
                </li>
                <li>
                  <strong className="text-white">Get credits:</strong> Buy a token pack (choose
                  model and size, e.g. 1M–100M) or Recharge MON. Confirm the transaction in your
                  wallet.
                </li>
                <li>
                  <strong className="text-white">API Key:</strong> Click “API Key” in the header,
                  generate or copy your key and the <strong className="text-white">Base URL</strong>{" "}
                  (it matches this site’s domain).
                </li>
                <li>
                  <strong className="text-white">Call the API:</strong> Use{" "}
                  <code className="px-1.5 py-0.5 rounded bg-white/10">POST /chat/completions</code>{" "}
                  with <code className="px-1.5 py-0.5 rounded bg-white/10">Authorization: Bearer YOUR_API_KEY</code>.
                  Examples:
                </li>
              </ol>
              <DocsApiCodeBlocks />
            </div>
          </section>

          {/* 5. Roadmap */}
          <section id="roadmap" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 text-[#9945FF]" />
              Roadmap
            </h2>
            <div className="flex flex-wrap gap-5 md:gap-6">
                {/* Card: Phase 1 */}
                <div className="flex-1 min-w-[260px] max-w-full">
                  <div className="relative p-6 rounded-2xl border border-white/10 bg-[#111] hover:border-white/20 transition-colors">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold border border-[#14F195]/30 bg-[#14F195]/15 text-[#14F195]">
                        Phase 1 · Completed
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-4">Foundation</h3>
                    <div className="space-y-2 text-sm text-gray-300">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>AI Agent Payment</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>EVM support</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>MetaMask</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card: Phase 2 */}
                <div className="flex-1 min-w-[260px] max-w-full">
                  <div className="relative p-6 rounded-2xl border border-white/10 bg-[#111] hover:border-white/20 transition-colors">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold border border-[#14F195]/30 bg-[#14F195]/15 text-[#14F195]">
                        Phase 2 · Completed
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-4">Expansion</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-300">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>PVM support</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>Monallo Bridge</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>Mobile</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card: Phase 3 */}
                <div className="flex-1 min-w-[260px] max-w-full">
                  <div className="relative p-6 rounded-2xl border border-white/10 bg-[#111] hover:border-white/20 transition-colors">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold border border-white/15 bg-white/5 text-gray-300">
                        Phase 3 · Planned
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-4">Growth</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-300">
                      <div className="flex items-start gap-3 text-green-400">
                        <span className="mt-1 w-2 h-2 rounded-full bg-[#14F195]" />
                        <span>LLM Token Store</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-white/40" />
                        <span>Agent Market</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-white/40" />
                        <span>DAO</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card: Phase 4 */}
                <div className="flex-1 min-w-[260px] max-w-full">
                  <div className="relative p-6 rounded-2xl border border-white/10 bg-[#111] hover:border-white/20 transition-colors">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold border border-white/15 bg-white/5 text-gray-300">
                        Phase 4 · Vision
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-4">Ecosystem</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-300">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-white/40" />
                        <span>DeFi Aggregator</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-white/40" />
                        <span>Launchpad</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-white/40" />
                        <span>DEX</span>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </section>

          {/* Appendix */}
          <section id="appendix" className="scroll-mt-24 mb-16">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <FolderOpen className="w-6 h-6 text-[#9945FF]" />
              Appendix
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Architecture diagrams, Bridge specification, and code references for developers.
            </p>

            {/* A. Architecture */}
            <div id="appendix-architecture" className="scroll-mt-24 mb-12">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-3">
                <Cpu className="w-5 h-5 text-[#9945FF]" />
                Architecture
              </h3>
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5 mb-4">
                <p className="text-gray-300 text-sm mb-4">
                  Monallo follows a layered design: user-facing clients talk to an API gateway and
                  backend services; Store credits and Bridge flows are settled on-chain. Security
                  uses signature verification (bridge), API-key-to-wallet binding (Store), and
                  replay protection.
                </p>
                <h4 className="font-bold text-white mb-2 text-sm">System layers (overview)</h4>
                <div className="my-6 flex flex-col gap-0">
                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0d0d0d]">
                    <div className="text-xs font-semibold text-[#9945FF] uppercase tracking-wider mb-3">User layer</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Web App</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">MetaMask</span>
                    </div>
                  </div>
                  <div className="flex justify-center py-2">
                    <div className="w-px h-4 bg-white/20" />
                  </div>
                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0d0d0d]">
                    <div className="text-xs font-semibold text-[#9945FF] uppercase tracking-wider mb-3">API / service</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Next.js API Routes</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Store</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Bridge status</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Monallo chat completions</span>
                    </div>
                  </div>
                  <div className="flex justify-center py-2">
                    <div className="w-px h-4 bg-white/20" />
                  </div>
                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0d0d0d]">
                    <div className="text-xs font-semibold text-[#9945FF] uppercase tracking-wider mb-3">Contract / chain</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Credit Ledger</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">MonalloBridge</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Sepolia</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Polkadot Hub Testnet</span>
                    </div>
                  </div>
                  <div className="flex justify-center py-2">
                    <div className="w-px h-4 bg-white/20" />
                  </div>
                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0d0d0d]">
                    <div className="text-xs font-semibold text-[#9945FF] uppercase tracking-wider mb-3">External</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Monallo API</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">RPC</span>
                      <span className="inline-flex px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-gray-300">Price oracles</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-xs mt-3">
                  Store: wallet pays → backend confirms tx → Credit Ledger mints; API key ties usage to that wallet. Bridge: user locks on source chain → relayer signs → destination mints/releases.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5">
                <h4 className="font-bold text-white mb-3">Security</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    Signature verification for bridge release/mint
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    API key binding to wallet for Store usage
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    Replay protection via nonce / source tx in bridge
                  </li>
                </ul>
              </div>
            </div>

            {/* B. Bridge Spec */}
            <div id="appendix-bridge" className="scroll-mt-24 mb-12">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-3">
                <GitBranch className="w-5 h-5 text-[#9945FF]" />
                Monallo Bridge — Technical Specification
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Lock-mint bridge: user locks native assets on source chain; relayer verifies and
                calls mint (or release) on destination. Supported: Sepolia (ETH) and Polkadot Hub
                (PAS), both EVM.
              </p>
              <div className="mb-4">
                <MermaidDiagram />
              </div>
              <div className="p-6 rounded-2xl bg-[#111] border border-white/5 space-y-4">
                <div>
                  <h4 className="font-bold text-white mb-2">Flow</h4>
                  <p className="text-gray-400 text-sm">
                    Frontend calls <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">lock(recipient, destinationChainId)</code> with
                    value; contract emits <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">Locked</code>. Relayer listens, signs, and
                    calls <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">mint(...)</code> or <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">release(...)</code> on
                    destination. Optional: <code className="px-1.5 py-0.5 rounded bg-white/10">GET /api/bridge/status?sourceChainId=...&sourceTxHash=...</code> for
                    status.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Contracts</h4>
                  <p className="text-gray-400 text-sm">
                    One <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">MonalloBridge.sol</code> per chain. Lock is payable and
                    emits Locked(sender, recipient, amount, destinationChainId, nonce). Release/mint
                    is relayer-only with EIP-712 signature; replay protection via (sourceChainId,
                    sourceTxHash, nonce).
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Risks</h4>
                  <p className="text-gray-400 text-sm">
                    Relayer is trusted in this phase; destination must hold sufficient liquidity for
                    release. Future versions may use state proofs.
                  </p>
                </div>
              </div>
            </div>

            {/* C. Code Reference */}
            <div id="appendix-code" className="scroll-mt-24">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-3">
                <FileCode className="w-5 h-5 text-[#9945FF]" />
                Code Reference
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-2 pr-4 font-semibold text-white">Area</th>
                      <th className="py-2 pr-4 font-semibold text-white">Path</th>
                      <th className="py-2 font-semibold text-white">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Bridge contract</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">contracts/MonalloBridge.sol</td>
                      <td>lock, release/mint, events, replay protection</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Bridge config</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">lib/bridge.ts, env</td>
                      <td>Addresses, ABI, helpers</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Store API</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">app/api/monallo/v1/chat/completions/</td>
                      <td>OpenAI-compatible chat completions</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Store backend</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">app/api/store/</td>
                      <td>balance, register-key, confirm-payment, purchases</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Bridge status</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">app/api/bridge/status/</td>
                      <td>Relay status for frontend</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-4">Relayer</td>
                      <td className="py-2 pr-4 font-mono text-[#14F195] text-xs">scripts/relayer-bridge.mjs</td>
                      <td>Listen Locked, sign, call release/mint</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-6 p-5 rounded-2xl bg-[#111] border border-white/5">
                <h4 className="font-bold text-white mb-3">Technology Stack</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-400">
                  <div>
                    <p className="text-[#9945FF] font-medium mb-1">Frontend</p>
                    <p>Next.js 14, TypeScript, Tailwind, Framer Motion, ethers/viem</p>
                  </div>
                  <div>
                    <p className="text-[#9945FF] font-medium mb-1">Backend</p>
                    <p>Next.js API Routes, Node.js, SQLite (better-sqlite3), Monallo API upstream</p>
                  </div>
                  <div>
                    <p className="text-[#9945FF] font-medium mb-1">Blockchain</p>
                    <p>Ethereum (Sepolia), Polkadot Hub Testnet (EVM), MetaMask</p>
                  </div>
                  <div>
                    <p className="text-[#9945FF] font-medium mb-1">Infra</p>
                    <p>AWS, Alibaba Cloud, AI compute servers</p>
                  </div>
                </div>
              </div>
            </div>

            {/* D. Glossary */}
            <div id="appendix-glossary" className="scroll-mt-24 mt-12">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-[#9945FF]" />
                Glossary
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-2 pr-4 font-semibold text-white">Term</th>
                      <th className="py-2 font-semibold text-white">Definition</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Monallo</td><td className="py-2">AI-powered Web3 suite: Pay, Bridge, Store.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Monallo Store</td><td className="py-2">LLM token credits and OpenAI-compatible API; pay with PAS/ETH, one API key for multiple models.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Credit Ledger</td><td className="py-2">On-chain contract that mints and tracks user credits (MON, token packs) after Store payment.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">MON</td><td className="py-2">Store recharge balance unit; 1 USD = 1 MON for flexible API spend.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Token pack</td><td className="py-2">Prepaid token quota per model (e.g. 1M–100M tokens) with volume discount.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">PAS / maoETH</td><td className="py-2">Payment tokens on Polkadot Hub Testnet (native PAS; wrapped ETH when configured).</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Lock-mint</td><td className="py-2">Bridge pattern: lock assets on source chain; mint wrapped assets (e.g. maoXXX) on destination.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">Relayer</td><td className="py-2">Backend that watches bridge Locked events and calls release/mint on destination chain.</td></tr>
                    <tr className="border-b border-white/5"><td className="py-2 pr-4 font-medium text-white">API key</td><td className="py-2">Secret bound to wallet; used in Authorization header to call Store chat completions.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="text-center py-8 text-gray-500 text-sm border-t border-white/5">
            Documentation updated March 2026.
          </div>
        </div>
      </main>

      <footer className="lg:ml-64 py-6 px-4 border-t border-white/5 text-center text-gray-500 text-sm">
        © 2026 Monallo. All rights reserved.
      </footer>
    </div>
  );
}
