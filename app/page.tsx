"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, Zap, Cpu, Video, Wallet, ArrowRight, Globe, Sparkles, Layers, Menu } from "lucide-react";

const products = [
  { id: "pay", name: "Monallo Pay", description: "AI-Powered Intent Recognition & DeFi", icon: Wallet, href: "/ai-pay", status: "Live", color: "from-[#9945FF] to-[#B45AFF]" },
  { id: "bridge", name: "Monallo Bridge", description: "Cross-Chain Asset Bridge", icon: Layers, href: "/bridge", status: "Coming Soon", color: "from-[#14F195] to-[#00D9FF]", disabled: true },
  { id: "video", name: "Monallo Video", description: "AI-Powered Video Generation", icon: Video, href: "/ai-video", status: "Coming Soon", color: "from-[#B45AFF] to-[#FF4D9E]", disabled: true },
  { id: "ai", name: "Monallo AI", description: "General AI Assistant", icon: Sparkles, href: "/ai", status: "Coming Soon", color: "from-[#F68521] to-[#FFB347]", disabled: true }
];

const features = [
  { icon: Zap, title: "Lightning Fast", description: "Sub-second transaction execution" },
  { icon: Cpu, title: "AI-Powered", description: "Natural language processing" },
  { icon: Layers, title: "Multi-Chain", description: "Cross-chain operations" },
  { icon: Globe, title: "Global Access", description: "Access DeFi anywhere" }
];

const statsLabels = [
  { key: "activeUsers", label: "Active Users" },
  { key: "volume", label: "Volume" },
  { key: "uptime", label: "Uptime" },
  { key: "chains", label: "Chains" }
];

const roadmap = [
  { phase: "Phase 1", title: "Foundation", items: ["AI Pay", "EVM Support", "MetaMask"], status: "completed" },
  { phase: "Phase 2", title: "Expansion", items: ["PVM Support", "Bridge", "Mobile"], status: "completed" },
  { phase: "Phase 3", title: "Growth", items: ["AI Video", "NFT Market", "DAO"], status: "planned" },
  { phase: "Phase 4", title: "Ecosystem", items: ["DeFi Agg", "Launchpad", "DEX"], status: "planned" }
];

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [stats, setStats] = useState<Record<string, string>>({
    activeUsers: "—",
    volume: "—",
    uptime: "100%",
    chains: "2",
  });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { activeUsers?: number; volume?: number } | null) => {
        if (data && typeof data.activeUsers === "number") setStats((s) => ({ ...s, activeUsers: String(data.activeUsers) }));
        if (data && typeof data.volume === "number") setStats((s) => ({ ...s, volume: "$" + data.volume!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/10" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.png" alt="Monallo" className="h-12" />
          </Link>
          
          <nav className="hidden md:flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setDropdownOpen(!dropdownOpen)} className="px-4 py-2 text-gray-300 hover:text-white flex items-center gap-1">
                Products <ChevronDown className={`w-4 h-4 transition ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-[#111] border border-white/10 rounded-2xl p-2 shadow-2xl">
                {products.map(p => (
                  <Link key={p.id} href={p.href} onClick={() => setDropdownOpen(false)} className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 ${p.disabled ? 'opacity-50' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                      <p.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.status}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            </div>
            <Link href="#features" className="px-4 py-2 text-gray-300 hover:text-white">Features</Link>
            <Link href="#networks" className="px-4 py-2 text-gray-300 hover:text-white">Networks</Link>
            <Link href="#roadmap" className="px-4 py-2 text-gray-300 hover:text-white">Roadmap</Link>
            <Link href="/ai-pay" className="ml-4 px-6 py-2.5 rounded-full bg-gradient-to-r from-[#9945FF] to-[#7C3AED] font-semibold hover:shadow-lg hover:shadow-[#9945FF]/30">Launch</Link>
          </nav>

          <button className="md:hidden"><Menu className="w-6 h-6" /></button>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-40 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#9945FF]/10 border border-[#9945FF]/30 mb-8">
            <Sparkles className="w-4 h-4 text-[#9945FF]" />
            <span className="text-sm text-gray-300">Powered by AI</span>
          </motion.div>
          
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl md:text-7xl font-bold mb-6">
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">AI-Powered</span>
            <br />
            <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">Web3 Suite</span>
          </motion.h1>
          
          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Experience the future of decentralized applications with intelligent AI assistants.
          </motion.p>
          
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-4 justify-center">
            <Link href="/ai-pay" className="px-8 py-4 rounded-full bg-gradient-to-r from-[#9945FF] to-[#7C3AED] font-semibold hover:shadow-2xl hover:shadow-[#9945FF]/40 transition-all">
              Launch App
            </Link>
            <Link href="/docs" className="px-8 py-4 rounded-full border border-white/20 hover:border-[#9945FF]/50 font-semibold">
              Learn More
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {statsLabels.map((s, i) => (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="rounded-2xl bg-[#111] border border-white/10 p-6 text-center hover:border-[#9945FF]/30 hover:bg-white/[0.03] transition-all"
              >
                <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">{stats[s.key] ?? "—"}</div>
                <div className="text-sm text-gray-500 mt-2">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Our Products</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {products.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className={`p-6 rounded-2xl bg-[#111] border border-white/5 hover:border-[#9945FF]/30 transition-all ${p.disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-4`}>
                  <p.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'Live' ? 'bg-[#14F195]/20 text-[#14F195]' : 'bg-[#9945FF]/20 text-[#9945FF]'}`}>{p.status}</span>
                </div>
                <p className="text-sm text-gray-500">{p.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose Us</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="text-center p-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#9945FF]/10 flex items-center justify-center">
                  <f.icon className="w-7 h-7 text-[#9945FF]" />
                </div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Networks */}
      <section id="networks" className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">Supported Networks</h2>
          <div className="flex justify-center gap-12">
            {[{ name: "Ethereum", img: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" }, { name: "Polkadot", img: "https://assets.coingecko.com/coins/images/12171/small/polkadot.png" }].map((c, i) => (
              <motion.div key={c.name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="flex flex-col items-center gap-3">
                <img src={c.img} alt={c.name} className="w-16 h-16 rounded-full" />
                <span className="font-medium">{c.name}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="py-24 px-6 bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Roadmap</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {roadmap.map((r, i) => (
              <motion.div key={r.phase} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="p-5 rounded-2xl bg-[#111] border border-white/5">
                <div className={`text-xs px-3 py-1 rounded-full inline-block mb-3 ${r.status === 'completed' ? 'bg-green-500/20 text-green-400' : r.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{r.phase}</div>
                <h3 className="font-bold mb-3">{r.title}</h3>
                <ul className="space-y-2">
                  {r.items.map((item, j) => (
                    <li key={j} className="text-sm text-gray-500 flex items-center gap-2">
                      {r.status === 'completed' ? <span className="text-green-400">✓</span> : r.status === 'in-progress' ? <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" /> : <span className="w-3 h-3 rounded-full border border-gray-500" />}
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <img src="/logo.png" alt="Monallo" className="h-10" />
          <div className="flex gap-8 text-sm text-gray-500">
            <Link href="#" className="hover:text-white">Twitter</Link>
            <Link href="#" className="hover:text-white">Discord</Link>
            <Link href="#" className="hover:text-white">GitHub</Link>
          </div>
          <div className="text-sm text-gray-600">© 2026 Monallo</div>
        </div>
      </footer>
    </div>
  );
}
