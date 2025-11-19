import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "PraiaFinder",
  description: "Encontra a melhor praia em Portugal com base no vento, ondulação e meteo.",
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
  themeColor: "#f1f5f9", // slate-100 para bater certo com o background
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Evita zoom acidental em inputs no iOS
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="min-h-screen w-full bg-slate-100 text-slate-900 antialiased selection:bg-teal-200 selection:text-teal-900">
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}