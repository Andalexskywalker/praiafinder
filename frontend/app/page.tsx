"use client";
import { useEffect, useState } from "react";

type TopItem = { beach_id: string; nome: string; score: number; distancia_km?: number | null };

const ZONAS = ["norte","centro","lisboa","alentejo","algarve","acores","madeira"] as const;
type Zona = typeof ZONAS[number];
type Tab = "near" | "zone";

const SLOTS = [
  { id: "06-09", label: "06–09", hour: 7 },
  { id: "09-12", label: "09–12", hour: 10 },
  { id: "12-15", label: "12–15", hour: 13 },
  { id: "15-18", label: "15–18", hour: 16 },
  { id: "18-21", label: "18–21", hour: 19 },
] as const;
type SlotId = typeof SLOTS[number]["id"];

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function toIsoUtcFromLocal(y: number, m0: number, d: number, h: number) {
  const local = new Date(y, m0, d, h, 0, 0, 0);
  // converter para UTC mantendo a hora/local escolhida
  return new Date(local.getTime() - local.getTimezoneOffset() * 60000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}
function next7DaysLabels(): { label: string; y: number; m0: number; d: number }[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const days = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const out: { label: string; y: number; m0: number; d: number }[] = [];
  for (let i=0;i<=6;i++){
    const dd = addDays(base, i);
    let label = days[dd.getDay()];
    if (i===0) label = "Hoje";
    if (i===1) label = "Amanhã";
    out.push({ label, y: dd.getFullYear(), m0: dd.getMonth(), d: dd.getDate() });
  }
  return out;
}

export default function Page() {
  const [mode, setMode] = useState<"familia"|"surf"|"snorkel">("familia");
  const [tab, setTab] = useState<Tab>("near");
  const [zone, setZone] = useState<Zona>("lisboa");
  const [radius, setRadius] = useState(40);

  const days = next7DaysLabels();
  const [dayIdx, setDayIdx] = useState(0);         // 0..6
  const [slot, setSlot] = useState<SlotId>("09-12");

  const [items, setItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function currentWhenISO() {
    const target = days[dayIdx];
    const slotDef = SLOTS.find(s => s.id === slot)!;
    return toIsoUtcFromLocal(target.y, target.m0, target.d, slotDef.hour);
  }

  async function fetchNearMe() {
    if (!navigator.geolocation) {
      setError("Geolocalização indisponível. Usa a aba 'Zonas'.");
      return;
    }
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const when = currentWhenISO();
        const res = await fetch(`/api/top?lat=${latitude}&lon=${longitude}&radius_km=${radius}&mode=${mode}&when=${when}`);
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
    setLoading(true); setError(null);
    try {
      const when = currentWhenISO();
      const res = await fetch(`/api/top?zone=${z}&mode=${mode}&when=${when}`);
      setItems(await res.json());
    } catch {
      setError("Falha a carregar recomendações por zona.");
    } finally {
      setLoading(false);
    }
  }

  // Arranque: tenta geolocalização; se não houver, muda para "Zonas"
  useEffect(() => {
    if (navigator.geolocation) fetchNearMe(); else { setTab("zone"); fetchByZone(zone); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarrega quando mudam parâmetros relevantes
  useEffect(() => {
    if (tab === "near") fetchNearMe();
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dayIdx, slot, radius, tab]);

  useEffect(() => {
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PraiaFinder</h1>

      {/* Modo */}
      <div className="flex gap-2 mb-3">
        {["familia","surf","snorkel"].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m as any)}
            className={`px-3 py-1 rounded border ${mode===m?"bg-black text-white":"bg-white"}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab("near")} className={`px-3 py-1 rounded border ${tab==="near"?"bg-black text-white":"bg-white"}`}>Perto de mim</button>
        <button onClick={() => setTab("zone")} className={`px-3 py-1 rounded border ${tab==="zone"?"bg-black text-white":"bg-white"}`}>Zonas</button>
      </div>

      {/* Seletores Dia + Janela */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-2 mb-2">
          {days.map((d, i) => (
            <button key={i} onClick={()=>setDayIdx(i)} className={`px-3 py-1 rounded border ${dayIdx===i?"bg-black text-white":"bg-white"}`}>{d.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map(s => (
            <button key={s.id} onClick={()=>setSlot(s.id)} className={`px-3 py-1 rounded border ${slot===s.id?"bg-black text-white":"bg-white"}`}>{s.label}</button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">Previsão até 6 dias; fiabilidade diminui nos dias mais distantes.</p>
      </div>

      {/* Controles por aba */}
      {tab === "near" ? (
        <div className="flex items-center gap-3 mb-4">
          <label>Raio:</label>
          <input type="range" min={10} max={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))}/>
          <span>{radius} km</span>
          <button onClick={fetchNearMe} className="px-3 py-1 rounded border">Atualizar</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4">
          {ZONAS.map(z => (
            <button key={z} onClick={() => setZone(z)} className={`px-3 py-1 rounded border capitalize ${zone===z?"bg-black text-white":"bg-white"}`}>{z}</button>
          ))}
          <button onClick={()=>fetchByZone(zone)} className="px-3 py-1 rounded border">Atualizar</button>
        </div>
      )}

      {/* Lista */}
      <section>
        <h2 className="font-semibold mb-2">TOP recomendações {tab==="zone" ? `— ${zone}` : ""}</h2>
        {loading && <p className="text-sm text-gray-500 mb-2">A carregar…</p>}
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.beach_id} className="p-3 rounded-lg border bg-white flex justify-between">
              <span>{i.nome}</span>
              <span className="font-mono">{i.score}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 mt-3">(Dados: batch Open-Meteo quando disponível; caso contrário, fallback demo.)</p>
      </section>
    </main>
  );
}
