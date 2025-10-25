// frontend/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";

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
  themeColor: "#0c4a6e", // mais escuro para combinar com o cabeçalho da página
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="min-h-screen w-full bg-slate-100 text-slate-900 antialiased">
        {/* sem header global; cada página trata do seu próprio cabeçalho */}
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}
