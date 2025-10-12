"use client";
import { useEffect, useState } from "react";

type TopItem = { beach_id: string; nome: string; score: number; distancia_km?: number | null };

export default function Page() {
  const [mode, setMode] = useState("familia");
  const [nearby, setNearby] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não disponível. Usa o filtro por zona (em breve).");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`/api/top?lat=${latitude}&lon=${longitude}&radius_km=40&mode=${mode}`);
        const data = await res.json();
        setNearby(data);
      } catch (e) {
        setError("Falha a carregar recomendações.");
      }
    }, () => setError("Permite a localização para veres praias perto de ti."));
  }, [mode]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PraiaFinder</h1>
      <div className="flex gap-2 mb-4">
        {["familia", "surf", "snorkel"].map(m => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded border ${mode===m?"bg-black text-white":"bg-white"}`}>{m}</button>
        ))}
      </div>
      <section>
        <h2 className="font-semibold mb-2">TOP perto de ti</h2>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <ul className="space-y-2">
          {nearby.map((i) => (
            <li key={i.beach_id} className="p-3 rounded-lg border bg-white flex justify-between">
              <span>{i.nome}</span>
              <span className="font-mono">{i.score}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 mt-3">(Demo: scores base; ligar batch+providers)</p>
      </section>
    </main>
  );
}
