"use client";

// app/page.tsx
// app/page.tsx
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

/** ================================= Types ================================= */
type Tab = "near" | "zone";
type OrderBy = "nota" | "dist";
type WaterType = "mar" | "fluvial";
type WaterFilter = "all" | "mar" | "fluvial";

type TopItem = {
  beach_id: string;
  nome: string;
  nota?: number; // 0..10
  score?: number; // 0..40 (compat)
  distancia_km?: number | null;
  used_timestamp?: string;
  breakdown?: Record<string, number>;
  water_type?: WaterType; // "mar" | "fluvial"
};

type Beach = {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  zone_tags?: string[];
};

const ZONAS = [
  "norte",
  "centro",
  "lisboa",
  "alentejo",
  "algarve",
  "acores",
  "madeira",
] as const;
type Zona = (typeof ZONAS)[number];

/** ============================== Time helpers ============================== */
const SLOTS = [
  { id: "06-09", label: "06–09", hour: 7 },
  { id: "09-12", label: "09–12", hour: 10 },
  { id: "12-15", label: "12–15", hour: 13 },
  { id: "15-18", label: "15–18", hour: 16 },
  { id: "18-21", label: "18–21", hour: 19 },
] as const;
type SlotId = (typeof SLOTS)[number]["id"];

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function toIsoUtcFromLocal(y: number, m0: number, d: number, h: number) {
  const local = new Date(y, m0, d, h, 0, 0, 0);
  return new Date(local.getTime() - local.getTimezoneOffset() * 60000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}
function next7DaysLabels(){
  const base = new Date();
  const out: {label:string;y:number;m0:number;d:number}[] = [];
  for(let i=0;i<7;i++){
    const d = new Date(base);
    d.setHours(0,0,0,0);
    d.setDate(base.getDate()+i);
    const label = i===0 ? "Hoje" : i===1 ? "Amanhã" : d.toLocaleDateString("pt-PT",{ weekday:"short" });
    out.push({ label, y:d.getFullYear(), m0:d.getMonth(), d:d.getDate() });
  }
  return out;
}
function fmt(ts?: string) {
  return ts
    ? new Date(ts).toLocaleString("pt-PT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";
}

/** =========================== Nota & UI helpers =========================== */
function getNota(i: TopItem) {
  if (typeof i.nota === "number") return Math.max(0, Math.min(10, i.nota));
  const s = typeof i.score === "number" ? i.score : 0;
  return Math.max(0, Math.min(10, Math.round((s / 4) * 10) / 10));
}
function notaClasses(n: number) {
  if (n < 4.5)
    return { chip: "bg-red-100 text-red-800", bar: "bg-red-500", ring: "ring-red-200" };
  if (n < 6.5)
    return { chip: "bg-amber-100 text-amber-800", bar: "bg-amber-500", ring: "ring-amber-200" };
  if (n < 8.5)
    return {
      chip: "bg-emerald-100 text-emerald-800",
      bar: "bg-emerald-500",
      ring: "ring-emerald-200",
    };
  return { chip: "bg-green-200 text-green-900", bar: "bg-green-600", ring: "ring-green-200" };
}
function NotaBar({ nota }: { nota: number }) {
  const pct = Math.round((nota / 10) * 100);
  const { bar } = notaClasses(nota);
  return (
    <div className="h-2 w-full rounded bg-slate-200/80">
      <div className={`h-2 rounded ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** ================================ Breakdown =============================== */
function normalizeKey(k: string) {
  const s = k.toLowerCase();
  if (/offshore|cross|onshore/.test(s)) return { id: "offshore", label: "Offshore", emoji: "🧭" };
  if (/vento|wind/.test(s)) return { id: "vento", label: "Vento", emoji: "🌬️" };
  if (/onda|wave|swell|mar/.test(s)) return { id: "ondas", label: "Ondas", emoji: "🌊" };
  if (/meteo|wx|tempo|cloud|nuv|precip/.test(s)) return { id: "meteo", label: "Meteo", emoji: "📈" };
  if (/corrente|agita|current/.test(s)) return { id: "corrente", label: "Corrente", emoji: "💧" };
  if (/agua|água|sst|sea.*temp/.test(s)) return { id: "agua", label: "Temp. água", emoji: "🌡️" };
  return { id: s.replace(/\W+/g, "_"), label: k.replace(/_/g, " "), emoji: "•" };
}
/** Compacta + força regra fluvial/mar e remove duplicados */
function useCompactBreakdown(raw: Record<string, number> | undefined, water: WaterType) {
  return useMemo(() => {
    if (!raw) return [] as { id: string; label: string; emoji: string; val: number }[];
    const best = new Map<string, { id: string; label: string; emoji: string; val: number }>();
    for (const [k, v0] of Object.entries(raw)) {
      const v = Number(v0);
      if (!isFinite(v)) continue;
      const info = normalizeKey(k);
      const prev = best.get(info.id);
      if (!prev || Math.abs(v) > Math.abs(prev.val)) best.set(info.id, { ...info, val: Math.max(-10, Math.min(10, v)) });
    }
    let arr = Array.from(best.values());
    // regra: MAR → sem "corrente"; FLUVIAL → sem "ondas"
    arr = arr.filter((x) => (water === "fluvial" ? (x.id !== "ondas" && x.id !== "offshore") : x.id !== "corrente"));
    arr.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    return arr.slice(0, 4);
  }, [raw, water]);
}
function Breakdown({ data, water }: { data?: Record<string, number>; water: WaterType }) {
  const compact = useCompactBreakdown(data, water);
  if (!compact.length) return null;
  return (
    <div className="mt-4 grid gap-3">
      {compact.map(({ id, label, emoji, val }) => {
        const isNeg = val < 0;
        const pct = Math.round(Math.abs(val) * 10);
        return (
          <div key={id}>
            <div className="text-xs text-slate-600 mb-1 flex items-center gap-1">
              <span>{emoji}</span>
              <span>
                {label} <span className="opacity-60">({val.toFixed(1)}/10{isNeg ? " penal." : ""})</span>
              </span>
            </div>
            <div className="h-2 w-full rounded bg-slate-200/80 overflow-hidden">
              <div className={`h-2 ${isNeg ? "bg-red-500" : "bg-slate-900"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** ============================== Fetch helpers ============================= */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

async function doFetch(url: string, ctrl: AbortController) {
  const res = await fetch(url, { signal: ctrl.signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const data: TopItem[] = Array.isArray(json) ? json : json.data ?? [];
  const availableUntil = res.headers.get("x-available-until") ?? json.availableUntil ?? null;
  return { data, availableUntil };
}
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
}

/** ================================ Página ================================= */
export default function Page() {
  // Estado
    const [tab, setTab] = useState<Tab>("zone");
  const [zone, setZone] = useState<Zona>("lisboa");
  const [radius, setRadius] = useState(50);
  const [order, setOrder] = useState<OrderBy>("nota");
  const [waterFilter, setWaterFilter] = useState<WaterFilter>("all");

  const days = next7DaysLabels();
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<SlotId>("09-12");

  const [items, setItems] = useState<TopItem[]>([]);
  const [availableUntil, setAvailableUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Beach | null>(null);
  const [check, setCheck] = useState<TopItem | null>(null);
  const [checking, setChecking] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  function currentWhenISO() {
    const target = days[dayIdx];
    const s = SLOTS.find((x) => x.id === slot)!;
    return toIsoUtcFromLocal(target.y, target.m0, target.d, s.hour);
  }

  // praias para pesquisa
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/beaches`);
        setBeaches(await r.json());
      } catch {}
    })();
  }, []);

  async function fetchNearMe() {
    if (!navigator.geolocation) {
      setError("Geolocalização indisponível. Usa a aba 'Zonas'.");
      return;
    }
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const pos = await getPosition();
      const when = currentWhenISO();
      const params = new URLSearchParams({
        lat: String(pos.coords.latitude),
        lon: String(pos.coords.longitude),
        radius_km: String(radius),
        mode: "familia",
        when,
        limit: "16",
      });
      const { data, availableUntil } = await doFetch(`${API_BASE}/top?${params.toString()}`, ctrl);
      setItems(data);
      setAvailableUntil(availableUntil);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Falha a carregar recomendações perto de ti.");
    } finally {
      setLoading(false);
    }
  }
  async function fetchByZone(z: Zona) {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const when = currentWhenISO();
      let params = new URLSearchParams({ zone: z, mode: "familia", when, limit: "16" });
      // tenta adicionar localização para mostrar distância também em "Zonas"
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await getPosition();
          params = new URLSearchParams({
            zone: z,
            mode: "familia",
            when,
            limit: "16",
            lat: String(pos.coords.latitude),
            lon: String(pos.coords.longitude),
            radius_km: "10000",
          });
        } catch {}
      }
      const { data, availableUntil } = await doFetch(`${API_BASE}/top?${params.toString()}`, ctrl);
      setItems(data);
      setAvailableUntil(availableUntil);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Falha a carregar recomendações por zona.");
    } finally {
      setLoading(false);
    }
  }
  async function checkOne(b: Beach) {
    setChecking(true);
    setCheck(null);
    try {
      const when = currentWhenISO();
      const params = new URLSearchParams({ lat: String(b.lat), lon: String(b.lon), radius_km: "2", limit: "1", mode: "familia", when });
      const { data } = await doFetch(`${API_BASE}/top?${params.toString()}`, new AbortController());
      setCheck(data[0] ?? null);
    } catch {
      setCheck(null);
    } finally {
      setChecking(false);
    }
  }

  // arranque
  useEffect(() => {
    fetchByZone(zone);
    // eslint-disable-next-line
  }, []);
  // reload quando mudam controlos
  useEffect(() => {
    if (tab === "near") fetchNearMe();
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line
  }, [dayIdx, slot, radius, tab]);
  useEffect(() => {
    if (tab === "zone") fetchByZone(zone);
    // eslint-disable-next-line
  }, [zone]);
  // cleanup
  useEffect(() => () => abortRef.current?.abort(), []);

  const hasDistance = useMemo(() => items.some((i) => i.distancia_km != null), [items]);
  useEffect(() => {
    if (tab === "near" && hasDistance) setOrder("dist");
    else setOrder("nota");
  }, [tab, hasDistance]);

  // Filtro por tipo de praia
  const filteredItems = useMemo(() => {
    if (waterFilter === "all") return items;
    return items.filter((i) => (i.water_type ?? "mar") === waterFilter);
  }, [items, waterFilter]);

  const sortedItems = useMemo(() => {
    const arr = filteredItems.slice();
    return order === "dist"
      ? arr.sort((a, b) => (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity))
      : arr.sort((a, b) => getNota(b) - getNota(a));
  }, [filteredItems, order]);

  const whenLabel = `${days[dayIdx].label} ${SLOTS.find((s) => s.id === slot)?.label ?? ""}`;

  const WATER_FILTERS: ReadonlyArray<{ value: WaterFilter; label: string; title: string }> = [
    { value: "all", label: "Todas", title: "Mostrar todas as praias" },
    { value: "mar", label: "Mar", title: "Mostra só praias costeiras" },
    { value: "fluvial", label: "Fluvial", title: "Mostra só praias fluviais" },
  ];

  /* ================================ UI ================================= */
  const Legend = () =>
    !legendOpen ? null : (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setLegendOpen(false)} />
        <div className="absolute inset-x-0 top-12 mx-auto w-[min(720px,94vw)]">
          <div className="rounded-3xl ring-1 ring-black/10 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold tracking-tight">Legenda</h3>
              <button onClick={() => setLegendOpen(false)} className="px-3 py-1 rounded-lg border hover:bg-slate-50">Fechar</button>
            </div>
            <ul className="text-sm space-y-2">
              <li>• <b>Nota</b> 0–10 com cores: vermelho &lt;4.5, amarelo 4.5–6.5, verde-claro 6.5–8.5, verde-escuro 8.5–10.</li>
              <li>• <b>Praia fluvial</b> mostra <b>Corrente</b> (sem Ondas). <b>Mar</b> mostra <b>Ondas</b>.</li>
              <li>• Em <b>Zonas</b>, se autorizar a tua localização, mostramos também a <b>distância</b>.</li>
            </ul>
          </div>
        </div>
      </div>
    );

  /** ============================= Layout ============================= */
  return (
    <div className="min-h-screen w-full bg-slate-100">
      {/* ======= Cabeçalho ======= */}
      <header className="sticky top-0 z-40 w-full bg-slate-900 text-white shadow-lg">
  <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-4">
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex items-center gap-2 mr-2">
        <Image src="/icon-512.png" alt="Praia Finder" width={28} height={28} priority className="rounded-md"/>
        <span className="text-sm font-semibold tracking-tight">Praia Finder</span>
      </div>

      {/* Perto/Zonas */}
      <div className="inline-flex rounded-lg bg-white/10 p-1 ring-1 ring-white/15">
        <button onClick={() => setTab("near")} className={`px-2.5 py-1 rounded-md text-xs ${tab === "near" ? "bg-white text-slate-900" : "text-white/90 hover:bg-white/10"}`}>Perto</button>
        <button onClick={() => setTab("zone")} className={`px-2.5 py-1 rounded-md text-xs ${tab === "zone" ? "bg-white text-slate-900" : "text-white/90 hover:bg-white/10"}`}>Zonas</button>
      </div>

      {/* Selects compactos */}<select value={waterFilter} onChange={(e)=>setWaterFilter(e.target.value as WaterFilter)} className="rounded-md bg-white text-slate-900 text-xs px-2.5 py-1 ring-1 ring-white/20">
        <option value="all">Todas</option>
        <option value="mar">Mar</option>
        <option value="fluvial">Fluvial</option>
      </select>
      <select value={dayIdx} onChange={(e)=>setDayIdx(Number(e.target.value))} className="rounded-md bg-white text-slate-900 text-xs px-2.5 py-1 ring-1 ring-white/20">
        {days.map((d,i)=> <option key={i} value={i}>{d.label}</option>)}
      </select>
      <select value={slot} onChange={(e)=>setSlot(e.target.value as SlotId)} className="rounded-md bg-white text-slate-900 text-xs px-2.5 py-1 ring-1 ring-white/20">
        {SLOTS.map(s=> <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      {/* Pesquisa e ações */}
      <div className="ml-auto flex items-center gap-2">
        <input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter"){ const s=q.trim().toLowerCase(); const b=beaches.find(x=>x.nome.toLowerCase()===s)||beaches.find(x=>x.nome.toLowerCase().includes(s)); if(b){ setPicked(b); checkOne(b);} } }} placeholder="Pesquisar praia" className="w-[160px] sm:w-[220px] rounded-md bg-white text-slate-900 text-xs px-3 py-1.5 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        <button onClick={() => (tab === "near" ? fetchNearMe() : fetchByZone(zone))} className="rounded-md bg-teal-500 hover:bg-teal-400 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-teal-400/30" disabled={loading}>{loading?"A atualizar…":"Atualizar"}</button>
        <button onClick={()=>setLegendOpen(true)} className="rounded-md px-2.5 py-1.5 text-xs ring-1 ring-white/30 hover:bg-white/10">?</button>
      </div>
    </div>
  </div>
</header>

      {/* ======= Conteúdo ======= */}
      <main className="w-full px-0 pb-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
          {/* ===== Sidebar (Painel de Controlo) ===== */}
          <aside>
            <div className="rounded-r-3xl rounded-l-none bg-white/95 ring-1 ring-black/10 shadow-sm p-2 space-y-2.5 text-[13px]">
              {/* Janela */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Janela</h3>
                <div className="flex flex-wrap gap-2">
                  {days.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setDayIdx(i)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                        dayIdx === i ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {SLOTS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSlot(s.id)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                        slot === s.id ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600">Previsão até 6 dias; fiabilidade diminui nos dias distantes.</p>
              </section>

              {/* Localização */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Localização</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTab("near")}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      tab === "near" ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    Perto de mim
                  </button>
                  <button
                    onClick={() => setTab("zone")}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      tab === "zone" ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    Zonas
                  </button>
                </div>
                {tab === "near" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>Raio</span>
                      <strong>{radius} km</strong>
                    </div>
                    <input type="range" min={10} max={120} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} className="w-full accent-teal-600" />
                    <button onClick={fetchNearMe} className="w-full px-2.5 py-2 rounded-lg border bg-white hover:bg-slate-50" disabled={loading}>
                      {loading ? "A carregar…" : "Atualizar"}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {ZONAS.map((z) => (
                      <button
                        key={z}
                        onClick={() => setZone(z)}
                        className={`px-3 py-1 rounded-xl border capitalize text-sm font-medium ${
                          zone === z ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        {z}
                      </button>
                    ))}
                    <button onClick={() => fetchByZone(zone)} className="col-span-2 px-2.5 py-2 rounded-lg border bg-white hover:bg-slate-50" disabled={loading}>
                      {loading ? "A carregar…" : "Atualizar"}
                    </button>
                  </div>
                )}
              </section>

              {/* Tipo de praia (Filtro) */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Tipo de praia</h3>
                <div className="flex flex-wrap gap-2">
                  {WATER_FILTERS.map(({ value, label, title }) => (
                    <button
                      key={value}
                      onClick={() => setWaterFilter(value)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                        waterFilter === value ? "bg-teal-600 text-white border-teal-700" : "bg-white hover:bg-slate-50"
                      }`}
                      title={title}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Pesquisa */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Pesquisar praia</h3>
                <div className="flex gap-2">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const s = q.trim().toLowerCase();
                        const b = beaches.find((x) => x.nome.toLowerCase() === s) || beaches.find((x) => x.nome.toLowerCase().includes(s));
                        if (b) {
                          setPicked(b);
                          checkOne(b);
                        }
                      }
                    }}
                    placeholder="Escreve o nome…"
                    className="w-full rounded-xl border border-slate-300 bg-white/90 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {q && (
                    <button onClick={() => setQ("")} className="px-2.5 py-2 rounded-lg border bg-white hover:bg-slate-50">
                      Limpar
                    </button>
                  )}
                </div>
                {q && (
                  <ul className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    {beaches
                      .filter((b) => b.nome.toLowerCase().includes(q.trim().toLowerCase()))
                      .slice(0, 8)
                      .map((b) => (
                        <li key={b.id}>
                          <button
                            onClick={() => {
                              setPicked(b);
                              setQ(b.nome);
                              checkOne(b);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50"
                          >
                            {b.nome}
                            {b.zone_tags?.length ? <span className="text-xs text-slate-500"> · {b.zone_tags[0]}</span> : null}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>

          {/* ===== Lista principal ===== */}
          <section className="space-y-6">
            {/* Contexto */}
            <div className="rounded-3xl bg-white/90 ring-1 ring-black/5 shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-teal-50 px-3 py-1 ring-1 ring-teal-200 text-teal-800">
                    <span>🕓</span>
                    <strong>{whenLabel}</strong>
                  </span>
                  {availableUntil && (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1 ring-1 ring-amber-200 text-amber-800">
                      <span>📅</span>
                      <span>horizonte: {fmt(availableUntil)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`px-2.5 py-1 rounded-lg border text-xs ${order === "nota" ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}
                    onClick={() => setOrder("nota")}
                  >
                    Nota
                  </button>
                  <button
                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                      order === "dist" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                    } ${!hasDistance ? "opacity-60 cursor-not-allowed" : ""}`}
                    disabled={!hasDistance}
                    onClick={() => setOrder("dist")}
                    title={hasDistance ? "Ordenar por distância" : "Requer localização"}
                  >
                    Distância
                  </button>
                  <button onClick={() => setLegendOpen(true)} className="px-3 py-1 rounded-xl border bg-white">
                    ?
                  </button>
                </div>
              </div>
              {error && (
                <div role="alert" aria-live="polite" className="mt-3 rounded-xl bg-rose-50 text-rose-800 ring-1 ring-rose-200 px-3 py-2 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Resultado da pesquisa */}
            {picked && (
              <div className="rounded-3xl bg-white/90 ring-1 ring-black/5 shadow-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900">{picked.nome}</h2>
                    <p className="text-xs text-slate-500 mt-1">Previsão: {check?.used_timestamp ? fmt(check.used_timestamp) : checking ? "a verificar…" : "—"}</p>
                  </div>
                  {check && (() => {
                    const n = getNota(check);
                    const { chip } = notaClasses(n);
                    return <span className={`text-xs px-2 py-0.5 rounded ${chip}`}>Nota {n.toFixed(1)}/10</span>;
                  })()}
                </div>
                <div className="mt-3">{check ? <NotaBar nota={getNota(check)} /> : <div className="h-2 rounded bg-slate-200/80" />}</div>
                {check && <Breakdown data={check.breakdown} water={check.water_type ?? "mar"} />}
              </div>
            )}

            {/* Lista */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Recomendações {tab === "zone" ? <span className="lowercase">— {zone}</span> : null}
              </h2>

              {loading ? (
                <div className="columns-1 md:columns-2 xl:columns-3 gap-x-5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="mb-4 break-inside-avoid h-24 rounded-3xl bg-white/70 ring-1 ring-black/5 animate-pulse" />
                  ))}
                </div>
              ) : sortedItems.length === 0 ? (
                <div className="rounded-3xl bg-white/90 ring-1 ring-black/5 shadow-sm p-6 text-center">
                  <div className="mx-auto mb-2 w-10 opacity-70">
                    <Image src="/icon-512.png" alt="" width={40} height={40} />
                  </div>
                  <p className="text-sm text-slate-600">Sem dados para esta janela.</p>
                </div>
              ) : (
                <ul className="columns-1 md:columns-2 xl:columns-3 gap-x-5">
                  {sortedItems.map((i) => {
                    const n = getNota(i);
                    const { chip, ring } = notaClasses(n);
                    const open = openId === i.beach_id;
                    const water: WaterType = i.water_type ?? "mar";
                    return (
                      <li key={i.beach_id} className={`mb-4 inline-block w-full rounded-3xl bg-white/95 ring-1 ${ring} shadow-sm p-4 transition hover:shadow-md`} style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', pageBreakInside: 'avoid' } as any}>
                        <button className="w-full text-left" onClick={() => setOpenId(open ? null : i.beach_id)} aria-expanded={open}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-base font-semibold tracking-tight flex items-center gap-2 flex-wrap text-slate-900">
                                <span>{i.nome}</span>
                                {typeof i.distancia_km === "number" && (
                                  <span className="text-xs text-slate-500">• {i.distancia_km} km</span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  water === "fluvial" ? "bg-sky-100 text-sky-800" : "bg-teal-100 text-teal-800"
                                }`}>
                                  {water === "fluvial" ? "Praia fluvial" : "Praia de mar"}
                                </span>
                              </div>
                              {i.used_timestamp && (
                                <p className="text-xs text-slate-500 mt-1">Previsão: {fmt(i.used_timestamp)}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded ${chip}`}>Nota {n.toFixed(1)}/10</span>
                              <span className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <NotaBar nota={n} />
                          </div>
                        </button>
                        {open && <Breakdown data={i.breakdown} water={water} />}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="text-xs text-slate-500">Dados: previsão via Open‑Meteo (tempo + mar quando aplicável).</p>
            </div>
          </section>
        </div>
      </main>

      <Legend />
    </div>
  );
}