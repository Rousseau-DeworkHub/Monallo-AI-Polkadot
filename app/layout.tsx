import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "Monallo | AI-Powered Web3 Product Suite",
  description: "Monallo is an AI-powered decentralized application suite built on Polkadot.",
  keywords: ["Monallo", "AI", "Web3", "Polkadot", "DeFi", "Blockchain", "AI Video"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
