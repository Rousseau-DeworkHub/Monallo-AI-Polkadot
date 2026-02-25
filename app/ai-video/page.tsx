"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, Video, Sparkles, Clock, Bell, ArrowRight } from "lucide-react";

export default function AIVideoPage() {
  return (
    <div className="min-h-screen bg-[#030305] flex items-center justify-center">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#8B5CF6]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#9945FF]/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 text-center">
        {/* Back button */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-12 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Home
        </Link>

        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.8 }}
          className="relative w-32 h-32 mx-auto mb-8"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6] to-[#9945FF] rounded-3xl blur-xl opacity-50 animate-pulse" />
          <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-[#8B5CF6] to-[#9945FF] flex items-center justify-center">
            <Video className="w-16 h-16 text-white" />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-5xl font-bold mb-6"
        >
          <span className="gradient-text">Monallo</span>{" "}
          <span className="gradient-text-yellow">AI Video</span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl text-gray-400 mb-12 leading-relaxed"
        >
          Create stunning AI-generated videos with simple text prompts.
          <br />
          Powered by <span className="text-[#8B5CF6] font-semibold">Seedance 2.0</span>
        </motion.p>

        {/* Features preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-3 gap-4 mb-12"
        >
          {[
            { title: "Text-to-Video", desc: "Prompt to video" },
            { title: "NFT Minting", desc: "One-click creation" },
            { title: "Social Share", desc: "Direct to platforms" }
          ].map((feature) => (
            <div key={feature.title} className="glass rounded-2xl p-4">
              <h3 className="font-semibold mb-1">{feature.title}</h3>
              <p className="text-xs text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Coming soon badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-[#8B5CF6]/30 mb-8"
        >
          <Clock className="w-4 h-4 text-[#8B5CF6]" />
          <span className="text-sm text-gray-300">Coming Soon</span>
        </motion.div>

        {/* Notify me button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#9945FF] font-semibold hover:shadow-xl hover:shadow-violet-500/25 transition-all">
            <Bell className="w-5 h-5" />
            Notify Me When Ready
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
