"use client";
import React from "react";
import { useEffect, useState } from "react";

type TopItem = { beach_id: string; nome: string; score: number; distancia_km?: number | null };
const ZONAS = ["norte","centro","lisboa","alentejo","algarve","acores","madeira"] as const;
type Zona = typeof ZONAS[number];
type Tab = "near" | "zone";

export default function Page() {
  const [mode, setMode] = useState<"familia"|"surf"|"snorkel">("familia");
  const [tab, setTab] = useState<Tab>("near");
  const [zone, setZone] = useState<Zona>("lisboa");
  const [radius, setRadius] = useState(40);
  const [items, setItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
<<<<<<< HEAD
  const [loading, setLoading] = useState(false);

  async function fetchNearMe() {
    if (!navigator.geolocation) {
      setError("Geolocalização indisponível. Usa a aba 'Zonas'.");
=======
  const [radius, setRadius] = useState(40);

  const loadNearMe = () => {
    if (!navigator.geolocation) {
      setError("Geolocalização não disponível. Usa o botão de zona em baixo.");
>>>>>>> 9b005598a2011eafd13d171532e9ee54e35d27bf
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`/api/top?lat=${latitude}&lon=${longitude}&radius_km=${radius}&mode=${mode}`);
<<<<<<< HEAD
        setItems(await res.json());
      } catch {
        setError("Falha a carregar recomendações perto de ti.");
      } finally {
        setLoading(false);
      }
    }, () => {
      setLoading(false);
      setError("Permite a localização para veres praias perto de ti.");
    });
  }

  async function fetchByZone(z: Zona) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/top?zone=${z}&mode=${mode}`);
      setItems(await res.json());
    } catch {
      setError("Falha a carregar recomendações por zona.");
    } finally {
      setLoading(false);
    }
  }

  // Inicialização: se não houver geolocalização, cai para "Zonas"
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const zoneQS = qs.get("zone") as Zona | null;
    const modeQS = qs.get("mode") as "familia"|"surf"|"snorkel" | null;
    if (modeQS) setMode(modeQS);
    if (zoneQS && ZONAS.includes(zoneQS)) { setTab("zone"); setZone(zoneQS); fetchByZone(zoneQS); return; }

    if (navigator.geolocation) {
      fetchNearMe();
    } else {
      setTab("zone");
      fetchByZone("lisboa");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarrega quando se muda o modo na aba ativa
  useEffect(() => {
    if (tab === "near") fetchNearMe();
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
=======
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
>>>>>>> 9b005598a2011eafd13d171532e9ee54e35d27bf

  // Quando muda de zona
  useEffect(() => {
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PraiaFinder</h1>-

<<<<<<< HEAD
      {/* Modo */}
=======
>>>>>>> 9b005598a2011eafd13d171532e9ee54e35d27bf
      <div className="flex gap-2 mb-3">
        {["familia", "surf", "snorkel"].map(m => (
          <button key={m} onClick={() => setMode(m as any)}
            className={`px-3 py-1 rounded border ${mode===m?"bg-black text-white":"bg-white"}`}>{m}</button>
        ))}
      </div>

<<<<<<< HEAD
      {/* Abas */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("near")}
          className={`px-3 py-1 rounded border ${tab==="near"?"bg-black text-white":"bg-white"}`}>Perto de mim</button>
        <button onClick={() => setTab("zone")}
          className={`px-3 py-1 rounded border ${tab==="zone"?"bg-black text-white":"bg-white"}`}>Zonas</button>
      </div>

      {/* Controles por aba */}
      {tab === "near" ? (
        <div className="flex items-center gap-3 mb-4">
          <label>Raio:</label>
          <input type="range" min={10} max={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))}/>
          <span>{radius} km</span>
          <button onClick={fetchNearMe} className="px-3 py-1 rounded border">Atualizar perto de mim</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          {ZONAS.map(z => (
            <button key={z} onClick={() => setZone(z)}
              className={`px-3 py-1 rounded border capitalize ${zone===z?"bg-black text-white":"bg-white"}`}>{z}</button>
          ))}
        </div>
      )}

      {/* Lista */}
      <section>
        <h2 className="font-semibold mb-2">TOP recomendações {tab==="zone" ? `— ${zone}` : ""}</h2>
        {loading && <p className="text-sm text-gray-500 mb-2">A carregar…</p>}
=======
      <div className="flex items-center gap-2 mb-4">
        <label>Raio:</label>
        <input type="range" min={10} max={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))}/>
        <span>{radius} km</span>
        <button onClick={loadNearMe} className="px-3 py-1 rounded border">Usar localização</button>
        <button onClick={()=>loadZone("lisboa")} className="px-3 py-1 rounded border">Usar zona: Lisboa</button>
      </div>

      <section>
        <h2 className="font-semibold mb-2">TOP recomendações</h2>
>>>>>>> 9b005598a2011eafd13d171532e9ee54e35d27bf
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.beach_id} className="p-3 rounded-lg border bg-white flex justify-between">
              <span>{i.nome}</span>
              <span className="font-mono">{i.score}</span>
            </li>
          ))}
        </ul>
<<<<<<< HEAD
        <p className="text-sm text-gray-500 mt-3">(Demo: scores base; providers reais no próximo passo)</p>
=======
        <p className="text-sm text-gray-500 mt-3">(Demo: scores base; ligaremos providers no batch)</p>
>>>>>>> 9b005598a2011eafd13d171532e9ee54e35d27bf
