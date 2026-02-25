"use client";

import { useEffect, useRef, useState } from "react";

const BRIDGE_SEQUENCE = `sequenceDiagram
  participant User
  participant Frontend
  participant SourceChain as Source Chain (Sepolia or Polkadot Hub)
  participant Relayer as Relayer Backend
  participant DestChain as Destination Chain

  User->>Frontend: Confirm Bridge (Monallo Bridge)
  Frontend->>SourceChain: lock(recipient, destChainId) + value
  SourceChain-->>SourceChain: Locked event
  Frontend->>Relayer: Optional: notify / poll status
  Relayer->>SourceChain: Listen Locked events
  Relayer->>Relayer: Verify + sign release
  Relayer->>DestChain: mint(recipient, amount, proof, signature) for maoXXX.SourceChain
  DestChain-->>User: Wrapped token (maoXXX.SourceChain) to recipient
  Relayer->>Frontend: Optional: destination tx hash
  Frontend->>User: Show receipt + destination link`;

export function MermaidDiagram({ code = BRIDGE_SEQUENCE }: { code?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = "mermaid-bridge-" + Math.random().toString(36).slice(2, 9);

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#9945FF",
            primaryTextColor: "#fff",
            primaryBorderColor: "#14F195",
            lineColor: "#94a3b8",
            secondaryColor: "#1e1e1e",
            tertiaryColor: "#111",
          },
        });
        const { svg: out } = await mermaid.render(id, code.trim());
        if (!cancelled) setSvg(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render diagram");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-black border border-red-500/30 text-red-400 text-sm">
        Diagram could not be rendered: {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div ref={containerRef} className="p-4 rounded-xl bg-black border border-white/10 flex items-center justify-center min-h-[280px]">
        <span className="text-gray-500">Loading diagram…</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-4 rounded-xl bg-black border border-white/10 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
