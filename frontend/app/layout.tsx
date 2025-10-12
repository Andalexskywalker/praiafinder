export const metadata = { title: "PraiaFinder", description: "Encontra a melhor praia perto de ti" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt"><body className="min-h-screen bg-gray-50 text-gray-900">{children}</body></html>
  );
}
