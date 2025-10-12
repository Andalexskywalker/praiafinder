"use client";
import React from "react";
import { useEffect, useState } from "react";

type TopItem = { beach_id: string; nome: string; score: number; distancia_km?: number | null };

export default function Page() {
  const [mode, setMode] = useState("familia");
  const [nearby, setNearby] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(40);

  const loadNearMe = () => {
    if (!navigator.geolocation) {
      setError("Geolocalização não disponível. Usa o botão de zona em baixo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`/api/top?lat=${latitude}&lon=${longitude}&radius_km=${radius}&mode=${mode}`);
        setNearby(await res.json());
        setError(null);
      } catch {
        setError("Falha a carregar recomendações.");
      }
    }, () => setError("Permite a localização para veres praias perto de ti."));
  };

  const loadZone = async (zone: string) => {
    try {
      const res = await fetch(`/api/top?zone=${zone}&mode=${mode}`);
      setNearby(await res.json());
      setError(null);
    } catch {
      setError("Falha a carregar recomendações por zona.");
    }
  };

  useEffect(() => { loadNearMe(); }, [mode, radius]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PraiaFinder</h1>

      <div className="flex gap-2 mb-3">
        {["familia", "surf", "snorkel"].map(m => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded border ${mode===m?"bg-black text-white":"bg-white"}`}>{m}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <label>Raio:</label>
        <input type="range" min={10} max={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))}/>
        <span>{radius} km</span>
        <button onClick={loadNearMe} className="px-3 py-1 rounded border">Usar localização</button>
        <button onClick={()=>loadZone("lisboa")} className="px-3 py-1 rounded border">Usar zona: Lisboa</button>
      </div>

      <section>
        <h2 className="font-semibold mb-2">TOP recomendações</h2>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <ul className="space-y-2">
          {nearby.map((i) => (
            <li key={i.beach_id} className="p-3 rounded-lg border bg-white flex justify-between">
              <span>{i.nome}</span>
              <span className="font-mono">{i.score}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 mt-3">(Demo: scores base; ligaremos providers no batch)</p>
      </section>
    </main>
  );
}
