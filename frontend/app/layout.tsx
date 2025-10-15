// frontend/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "PraiaFinder",
  description: "Encontra a melhor praia em Portugal, já com previsão por janela.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="min-h-screen w-full bg-app text-slate-900 antialiased">
        {/* Header full-width (sem max-w / mx-auto) */}
        <header className="sticky top-0 z-50 backdrop-blur bg-white/70 border-b border-white/60 shadow-sm">
          <div className="w-full h-14 px-4 lg:px-6 2xl:px-10 flex items-center gap-3">
            <Image
              src="/icon-192.png"
              alt="PraiaFinder"
              width={24}
              height={24}
              className="rounded-md shadow-sm"
              priority
            />
            <h1 className="font-semibold tracking-tight">PraiaFinder</h1>
            <span className="ml-auto text-[11px] text-slate-500">MVP</span>
          </div>
        </header>

        {/* Main full-width (sem max-w / mx-auto) */}
        <main className="w-full px-4 lg:px-6 2xl:px-10 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
