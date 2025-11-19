"use client";

// app/page.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, MapPin, Filter, ChevronDown, 
  Calendar, Clock, Info, Waves, Wind, 
  CloudRain, Thermometer, Droplets, Navigation,
  ArrowUpDown, X, Users, Compass
} from "lucide-react";

/** ================================= Types ================================= */
type Tab = "near" | "zone";
type OrderBy = "nota" | "dist";
type WaterType = "mar" | "fluvial";
type WaterFilter = "all" | "mar" | "fluvial";
type Mode = "familia" | "surf"; // <--- NOVO TIPO

type TopItem = {
  beach_id: string;
  nome: string;
  nota?: number;
  score?: number;
  distancia_km?: number | null;
  used_timestamp?: string;
  breakdown?: Record<string, number>;
  water_type?: WaterType;
};

type Beach = {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  zone_tags?: string[];
};

const ZONAS = ["norte", "centro", "lisboa", "alentejo", "algarve", "acores", "madeira"] as const;
type Zona = (typeof ZONAS)[number];

const SLOTS = [
  { id: "06-09", label: "06–09", hour: 7 },
  { id: "09-12", label: "09–12", hour: 10 },
  { id: "12-15", label: "12–15", hour: 13 },
  { id: "15-18", label: "15–18", hour: 16 },
  { id: "18-21", label: "18–21", hour: 19 },
] as const;
type SlotId = (typeof SLOTS)[number]["id"];

/** ============================== Helpers ============================== */
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
    const label = i===0 ? "Hoje" : i===1 ? "Amanhã" : d.toLocaleDateString("pt-PT",{ weekday:"short", day:"numeric" });
    out.push({ label, y:d.getFullYear(), m0:d.getMonth(), d:d.getDate() });
  }
  return out;
}

function fmt(ts?: string) {
  return ts ? new Date(ts).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "";
}

/** =========================== UI Helpers =========================== */
function getNota(i: TopItem) {
  if (typeof i.nota === "number") return Math.max(0, Math.min(10, i.nota));
  const s = typeof i.score === "number" ? i.score : 0;
  return Math.max(0, Math.min(10, Math.round((s / 4) * 10) / 10));
}

function notaColors(n: number) {
  if (n < 4.5) return { bg: "bg-rose-500", text: "text-rose-600", bgSoft: "bg-rose-100", border: "border-rose-200" };
  if (n < 6.5) return { bg: "bg-amber-500", text: "text-amber-600", bgSoft: "bg-amber-100", border: "border-amber-200" };
  if (n < 8.5) return { bg: "bg-emerald-500", text: "text-emerald-600", bgSoft: "bg-emerald-100", border: "border-emerald-200" };
  return { bg: "bg-teal-600", text: "text-teal-700", bgSoft: "bg-teal-100", border: "border-teal-200" };
}

function NotaBadge({ nota }: { nota: number }) {
  const { bg, text, bgSoft } = notaColors(nota);
  return (
    <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl ${bgSoft} ${text} font-bold text-sm shadow-sm`}>
      <span>{nota.toFixed(1)}</span>
    </div>
  );
}

function ProgressBar({ val, colorClass }: { val: number; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, val * 10)); 
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <motion.div 
        initial={{ width: 0 }} 
        animate={{ width: `${pct}%` }} 
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`h-full rounded-full ${colorClass || "bg-slate-400"}`} 
      />
    </div>
  );
}

function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-slate-50/50">
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-teal-400/10 blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-sky-400/10 blur-[100px]" />
    </div>
  );
}

/** =========================== Breakdown Logic =========================== */
function normalizeKey(k: string) {
  const s = k.toLowerCase();
  // Adicionei ícone Compass para Offshore
  if (/offshore/.test(s)) return { id: "offshore", label: "Offshore", icon: Compass };
  if (/vento|wind/.test(s)) return { id: "vento", label: "Vento", icon: Wind };
  if (/onda|wave|swell|mar/.test(s)) return { id: "ondas", label: "Ondas", icon: Waves };
  if (/meteo|wx|tempo|cloud|nuv|precip/.test(s)) return { id: "meteo", label: "Meteo", icon: CloudRain };
  if (/corrente|agita|current/.test(s)) return { id: "corrente", label: "Corrente", icon: Droplets };
  if (/agua|água|sst|sea.*temp/.test(s)) return { id: "agua", label: "Temp. Água", icon: Thermometer };
  return { id: s.replace(/\W+/g, "_"), label: k, icon: Info };
}

function useCompactBreakdown(raw: Record<string, number> | undefined, water: WaterType) {
  return useMemo(() => {
    if (!raw) return [];
    const best = new Map<string, any>();
    for (const [k, v0] of Object.entries(raw)) {
      const v = Number(v0);
      if (!isFinite(v)) continue;
      const info = normalizeKey(k);
      const prev = best.get(info.id);
      if (!prev || Math.abs(v) > Math.abs(prev.val)) best.set(info.id, { ...info, val: Math.max(-10, Math.min(10, v)) });
    }
    let arr = Array.from(best.values());
    // Se for fluvial remove ondas/offshore. Se for Mar, remove corrente.
    arr = arr.filter((x) => (water === "fluvial" ? (x.id !== "ondas" && x.id !== "offshore") : x.id !== "corrente"));
    arr.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    return arr.slice(0, 4);
  }, [raw, water]);
}

function Breakdown({ data, water }: { data?: Record<string, number>; water: WaterType }) {
  const compact = useCompactBreakdown(data, water);
  if (!compact.length) return null;
  
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }} 
      animate={{ opacity: 1, height: "auto" }} 
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100"
    >
      {compact.map(({ id, label, icon: Icon, val }) => {
        const isNeg = val < 0;
        // Se for Offshore (valor positivo), damos cor azul/roxa diferente
        let colorClass = isNeg ? "bg-rose-400" : "bg-teal-500";
        if (id === "offshore" && !isNeg) colorClass = "bg-indigo-500";
        if (id === "ondas" && !isNeg) colorClass = "bg-blue-500";

        return (
          <div key={id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Icon size={12} className="text-slate-400"/>
                <span>{label}</span>
              </div>
              <span className={`font-medium ${isNeg ? "text-rose-600" : "text-slate-700"}`}>
                {val > 0 ? "+" : ""}{val.toFixed(1)}
              </span>
            </div>
            <ProgressBar val={Math.abs(val)} colorClass={colorClass} />
          </div>
        );
      })}
    </motion.div>
  );
}

/** ============================== Fetch Logic ============================= */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

async function doFetch(url: string, ctrl: AbortController) {
  const res = await fetch(url, { signal: ctrl.signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  return { 
    data: Array.isArray(json) ? json : json.data ?? [], 
    availableUntil: res.headers.get("x-available-until") ?? json.availableUntil ?? null 
  };
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
}

/** ================================ Main Page ================================= */
export default function Page() {
  // State
  const [tab, setTab] = useState<Tab>("zone");
  const [zone, setZone] = useState<Zona>("lisboa");
  const [radius, setRadius] = useState(50);
  const [order, setOrder] = useState<OrderBy>("nota");
  const [waterFilter, setWaterFilter] = useState<WaterFilter>("all");
  const [mode, setMode] = useState<Mode>("familia"); // <--- NOVO STATE

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false); 

  const abortRef = useRef<AbortController | null>(null);

  // Logic
  function currentWhenISO() {
    const target = days[dayIdx];
    const s = SLOTS.find((x) => x.id === slot)!;
    return toIsoUtcFromLocal(target.y, target.m0, target.d, s.hour);
  }

  useEffect(() => {
    (async () => { try { const r = await fetch(`${API_BASE}/beaches`); setBeaches(await r.json()); } catch {} })();
  }, []);

  async function fetchItems(isNear: boolean) {
    setLoading(true); setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;

    try {
      const when = currentWhenISO();
      // Adicionei 'mode' aqui
      let params = new URLSearchParams({ mode, when, limit: "16" });

      if (isNear) {
        if (!navigator.geolocation) throw new Error("No Geo");
        const pos = await getPosition();
        params.append("lat", String(pos.coords.latitude));
        params.append("lon", String(pos.coords.longitude));
        params.append("radius_km", String(radius));
      } else {
        params.append("zone", zone);
        try {
            const pos = await getPosition();
            params.append("lat", String(pos.coords.latitude));
            params.append("lon", String(pos.coords.longitude));
            params.append("radius_km", "10000");
        } catch {}
      }

      const { data, availableUntil: u } = await doFetch(`${API_BASE}/top?${params.toString()}`, ctrl);
      setItems(data); setAvailableUntil(u);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(isNear ? "Localização indisponível ou erro." : "Erro a carregar zona.");
    } finally {
      setLoading(false);
    }
  }

  async function checkOne(b: Beach) {
    setChecking(true); setCheck(null);
    try {
      // Adicionei 'mode' aqui também
      const params = new URLSearchParams({ lat: String(b.lat), lon: String(b.lon), radius_km: "2", limit: "1", mode, when: currentWhenISO() });
      const { data } = await doFetch(`${API_BASE}/top?${params.toString()}`, new AbortController());
      setCheck(data[0] ?? null);
    } catch { setCheck(null); } finally { setChecking(false); }
  }

  // Adicionei 'mode' nas dependências
  useEffect(() => { fetchItems(tab === "near"); }, [tab, zone, radius, dayIdx, slot, mode]);

  const sortedItems = useMemo(() => {
    let arr = waterFilter === "all" ? items : items.filter((i) => (i.water_type ?? "mar") === waterFilter);
    return order === "dist" 
      ? arr.sort((a, b) => (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity))
      : arr.sort((a, b) => getNota(b) - getNota(a));
  }, [items, waterFilter, order]);

  const hasDistance = items.some((i) => i.distancia_km != null);

  // Componente Select Customizado
  const Select = ({ value, onChange, options, icon: Icon }: any) => (
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-teal-600 transition-colors">
        {Icon && <Icon size={16} />}
      </div>
      <select 
        value={value} 
        onChange={onChange}
        className="w-full appearance-none bg-white border border-slate-200 text-slate-700 text-sm rounded-xl py-2.5 pl-10 pr-8 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none shadow-sm transition-all hover:border-teal-300 cursor-pointer"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <ChevronDown size={14} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full text-slate-900 font-sans">
      <BackgroundBlobs />

      {/* ======= Navbar / Header ======= */}
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
        <div className="mx-auto w-full max-w-7xl px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
               <div className="bg-gradient-to-tr from-teal-500 to-sky-600 w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-teal-500/20">
                  PF
               </div>
               <h1 className="text-lg font-bold tracking-tight text-slate-900 hidden sm:block">PraiaFinder</h1>
            </div>

            {/* Search Bar (Center) */}
            <div className="flex-1 max-w-md relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                 value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => {
                    if(e.key === "Enter"){
                        const s = q.trim().toLowerCase();
                        const b = beaches.find(x=>x.nome.toLowerCase().includes(s));
                        if(b){ setPicked(b); setQ(b.nome); checkOne(b); }
                    }
                 }}
                 placeholder="Procurar praia..." 
                 className="w-full bg-slate-100/50 border border-slate-200 rounded-full py-2 pl-10 pr-4 text-sm focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
               />
               {q && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
                    {beaches.filter(b => b.nome.toLowerCase().includes(q.toLowerCase())).slice(0,5).map(b => (
                       <button key={b.id} onClick={() => { setPicked(b); setQ(b.nome); checkOne(b); }} className="w-full text-left px-4 py-2 hover:bg-teal-50 text-sm flex items-center justify-between group">
                          <span>{b.nome}</span>
                          <span className="text-xs text-slate-400 group-hover:text-teal-600">Ver</span>
                       </button>
                    ))}
                  </div>
               )}
            </div>

            {/* Actions (Desktop) */}
            <div className="hidden md:flex items-center gap-2">
              <button onClick={() => setLegendOpen(true)} className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"><Info size={20}/></button>
              <button 
                onClick={() => fetchItems(tab === "near")} 
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 shadow-lg shadow-slate-900/20"
              >
                {loading ? "A atualizar..." : "Atualizar Lista"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ======= Conteúdo Principal ======= */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
        <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
          
          {/* === Sidebar de Filtros === */}
          <aside className={`bg-white/60 backdrop-blur-xl rounded-3xl border border-white/40 shadow-sm p-6 space-y-6 sticky top-24 transition-all ${mobileFiltersOpen ? 'block' : 'hidden lg:block'}`}>
             
             {/* Mobile Toggle Label */}
             <div className="lg:hidden flex justify-between items-center mb-4">
                <h3 className="font-bold">Filtros</h3>
                <button onClick={() => setMobileFiltersOpen(false)}><X size={20}/></button>
             </div>

             {/* NOVO: Seletor de Modo (Família vs Surf) */}
             <section className="space-y-3">
               <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">O que procuras?</label>
               <div className="grid grid-cols-2 gap-3">
                 <button 
                   onClick={() => setMode("familia")}
                   className={`flex flex-col items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                     mode === "familia" 
                     ? "bg-teal-50 border-teal-500 text-teal-700 ring-1 ring-teal-500/20" 
                     : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                   }`}
                 >
                   <Users size={24} />
                   <span className="text-xs font-bold">Família</span>
                 </button>

                 <button 
                   onClick={() => setMode("surf")}
                   className={`flex flex-col items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                     mode === "surf" 
                     ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500/20" 
                     : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                   }`}
                 >
                   <Waves size={24} />
                   <span className="text-xs font-bold">Surf</span>
                 </button>
               </div>
               <p className="text-[10px] text-slate-400 px-1 leading-tight text-center">
                 {mode === "familia" 
                   ? "Privilegia calor, pouco vento e segurança." 
                   : "Procura ondulação, período e vento offshore."}
               </p>
             </section>

             <hr className="border-slate-200/50" />

             {/* Onde */}
             <section className="space-y-3">
               <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Onde</label>
               <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/80 rounded-xl">
                  <button onClick={() => setTab("near")} className={`py-2 rounded-lg text-sm font-medium transition-all ${tab === "near" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Perto de mim</button>
                  <button onClick={() => setTab("zone")} className={`py-2 rounded-lg text-sm font-medium transition-all ${tab === "zone" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Zonas</button>
               </div>

               {tab === "zone" ? (
                  <Select 
                    value={zone} 
                    onChange={(e:any) => setZone(e.target.value)} 
                    options={ZONAS.map(z => ({ value: z, label: z.charAt(0).toUpperCase() + z.slice(1) }))}
                    icon={MapPin}
                  />
               ) : (
                  <div className="space-y-2">
                     <div className="flex justify-between text-xs text-slate-600">
                        <span>Raio de procura</span>
                        <span className="font-bold">{radius} km</span>
                     </div>
                     <input 
                       type="range" min="10" max="100" step="10" 
                       value={radius} onChange={(e) => setRadius(Number(e.target.value))}
                       className="w-full accent-teal-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                     />
                  </div>
               )}
             </section>

             {/* Quando */}
             <section className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quando</label>
                <Select 
                  value={dayIdx} 
                  onChange={(e:any) => setDayIdx(Number(e.target.value))} 
                  options={days.map((d, i) => ({ value: i, label: d.label }))}
                  icon={Calendar}
                />
                <Select 
                  value={slot} 
                  onChange={(e:any) => setSlot(e.target.value)} 
                  options={SLOTS.map(s => ({ value: s.id, label: s.label }))}
                  icon={Clock}
                />
             </section>

             {/* Tipo */}
             <section className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo de água</label>
                <div className="flex gap-2">
                   {[
                     { id: "all", label: "Todas" }, { id: "mar", label: "Mar" }, { id: "fluvial", label: "Rio" }
                   ].map((opt) => (
                      <button 
                        key={opt.id} 
                        onClick={() => setWaterFilter(opt.id as any)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                           waterFilter === opt.id 
                           ? "bg-teal-50 border-teal-200 text-teal-700" 
                           : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                   ))}
                </div>
             </section>

             {/* Ordenação */}
             <section className="pt-4 border-t border-slate-100">
               <button 
                  disabled={!hasDistance}
                  onClick={() => setOrder(order === "nota" ? "dist" : "nota")}
                  className="flex items-center justify-between w-full text-sm font-medium text-slate-600 hover:text-teal-600 disabled:opacity-50"
               >
                  <span className="flex items-center gap-2"><ArrowUpDown size={16}/> Ordenar por: {order === "nota" ? "Nota" : "Distância"}</span>
               </button>
             </section>
          </aside>

          {/* === Botão Mobile para abrir filtros === */}
          <div className="lg:hidden mb-4">
            <button 
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 py-3 rounded-xl font-medium text-slate-700 shadow-sm"
            >
               <Filter size={18} /> {mobileFiltersOpen ? "Fechar Filtros" : "Filtrar & Localização"}
            </button>
          </div>

          {/* === Lista de Resultados === */}
          <section>
             {/* Info Contexto */}
             <div className="mb-6 flex items-center justify-between">
                <div>
                   <h2 className="text-2xl font-bold text-slate-900">
                      {tab === "near" ? "Praias perto de ti" : `Praias: ${zone.charAt(0).toUpperCase() + zone.slice(1)}`}
                   </h2>
                   <p className="text-slate-500 text-sm mt-1">
                      A mostrar para <span className="font-semibold text-teal-600">{days[dayIdx].label}, {SLOTS.find(s=>s.id===slot)?.label}</span>
                   </p>
                </div>
             </div>

             {/* Erro */}
             {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm mb-6 flex items-center gap-2">
                   <Info size={16} /> {error}
                </div>
             )}

             {/* Card Pesquisado (Single) */}
             {picked && (
                <div className="mb-8">
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Resultado da pesquisa</h3>
                   <div className="bg-white/80 backdrop-blur-md border border-teal-200 shadow-lg shadow-teal-900/5 rounded-3xl p-5 md:p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-sky-500" />
                      <div className="flex justify-between items-start">
                         <div>
                            <h2 className="text-xl font-bold text-slate-900">{picked.nome}</h2>
                            <div className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                               {checking ? <span className="animate-pulse">A carregar meteo...</span> : (check ? "Dados atualizados" : "Sem dados")}
                            </div>
                         </div>
                         {check && <NotaBadge nota={getNota(check)} />}
                      </div>
                      {check && <Breakdown data={check.breakdown} water={check.water_type ?? "mar"} />}
                   </div>
                </div>
             )}

             {/* 1. Loading State */}
             {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-32 rounded-3xl bg-white/50 animate-pulse" />
                   ))}
                </div>
             )}

             {/* 2. Empty State (Sem resultados) */}
             {!loading && sortedItems.length === 0 && (
                <div className="text-center py-20 bg-white/40 rounded-3xl border border-dashed border-slate-300">
                   <Waves className="mx-auto text-slate-300 mb-3" size={48} />
                   <p className="text-slate-500">Não encontrámos praias com estes filtros.</p>
                </div>
             )}

             {/* 3. Lista de Resultados */}
             {!loading && sortedItems.length > 0 && (
                <div className="columns-1 md:columns-2 gap-4 space-y-4">
                   <AnimatePresence>
                      {sortedItems.map((item) => {
                         const n = getNota(item);
                         const water = item.water_type ?? "mar";
                         const isOpen = openId === item.beach_id;
                         
                         return (
                            <motion.div
                               layout
                               initial={{ opacity: 0, y: 20 }}
                               animate={{ opacity: 1, y: 0 }}
                               exit={{ opacity: 0, scale: 0.95 }}
                               key={item.beach_id}
                               className="break-inside-avoid bg-white/80 hover:bg-white backdrop-blur-md border border-white/60 hover:border-teal-200 shadow-sm hover:shadow-md rounded-3xl p-5 transition-all cursor-pointer group"
                               onClick={() => setOpenId(isOpen ? null : item.beach_id)}
                            >
                               <div className="flex justify-between items-start gap-4">
                                  <div>
                                     <h3 className="font-bold text-slate-800 group-hover:text-teal-700 transition-colors">{item.nome}</h3>
                                     <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1.5">
                                        {item.distancia_km != null && (
                                           <span className="flex items-center gap-1"><Navigation size={10} /> {item.distancia_km} km</span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-md font-medium ${water === "fluvial" ? "bg-sky-100 text-sky-700" : "bg-teal-50 text-teal-700"}`}>
                                           {water === "fluvial" ? "Rio" : "Mar"}
                                        </span>
                                     </div>
                                  </div>
                                  <NotaBadge nota={n} />
                               </div>
                               
                               {/* Mini bar when closed */}
                               {!isOpen && (
                                  <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                     <div className={`h-full rounded-full ${notaColors(n).bg}`} style={{ width: `${n*10}%` }} />
                                  </div>
                               )}

                               {isOpen && <Breakdown data={item.breakdown} water={water} />}
                               
                               <div className="mt-3 flex justify-center">
                                  <ChevronDown size={16} className={`text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                               </div>
                            </motion.div>
                         );
                      })}
                   </AnimatePresence>
                </div>
             )}
          </section>
        </div>
      </main>

      {/* Modal Legenda */}
      {legendOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setLegendOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-6 max-w-sm w-full relative z-10 shadow-2xl">
               <h3 className="text-lg font-bold mb-4">Como funciona a nota?</h3>
               <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-3"><div className="w-4 h-4 rounded bg-teal-500"/> <span><b>8.5 - 10:</b> Excelente. Vai já!</span></div>
                  <div className="flex items-center gap-3"><div className="w-4 h-4 rounded bg-emerald-500"/> <span><b>6.5 - 8.5:</b> Muito boa.</span></div>
                  <div className="flex items-center gap-3"><div className="w-4 h-4 rounded bg-amber-500"/> <span><b>4.5 - 6.5:</b> Aceitável / Ventosa.</span></div>
                  <div className="flex items-center gap-3"><div className="w-4 h-4 rounded bg-rose-500"/> <span><b>&lt; 4.5:</b> Não recomendada.</span></div>
               </div>
               <p className="mt-4 text-xs text-slate-400 border-t pt-3">
                  Consideramos vento, ondulação, temperatura e afluência. Praias fluviais penalizam mais a corrente; praias de mar penalizam ondas descontroladas.
               </p>
               <button onClick={() => setLegendOpen(false)} className="mt-6 w-full py-3 bg-slate-100 font-bold text-slate-700 rounded-xl hover:bg-slate-200">Entendido</button>
            </motion.div>
         </div>
      )}
    </div>
  );
}