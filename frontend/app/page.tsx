"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** ======================= Types ======================= */
type Mode = "familia" | "surf" | "snorkel";
type Tab = "near" | "zone";
type OrderBy = "nota" | "dist";
type WaterType = "mar" | "fluvial";

type TopItem = {
  beach_id: string;
  nome: string;
  nota?: number;          // 0..10  (preferido)
  score?: number;         // 0..40  (compat)
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

const ZONAS = ["norte","centro","lisboa","alentejo","algarve","acores","madeira"] as const;
type Zona = (typeof ZONAS)[number];

/** ======================= Time helpers ======================= */
const SLOTS = [
  { id: "06-09", label: "06–09", hour: 7 },
  { id: "09-12", label: "09–12", hour: 10 },
  { id: "12-15", label: "12–15", hour: 13 },
  { id: "15-18", label: "15–18", hour: 16 },
  { id: "18-21", label: "18–21", hour: 19 },
] as const;
type SlotId = (typeof SLOTS)[number]["id"];

function addDays(d: Date, days: number){const x=new Date(d); x.setDate(x.getDate()+days); return x;}
function toIsoUtcFromLocal(y:number,m0:number,d:number,h:number){
  const local=new Date(y,m0,d,h,0,0,0);
  return new Date(local.getTime()-local.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/,"Z");
}
function next7DaysLabels(){
  const base=new Date(); base.setHours(0,0,0,0);
  const days=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  return Array.from({length:7},(_,i)=>{const dd=addDays(base,i); let label=days[dd.getDay()]; if(i===0) label="Hoje"; if(i===1) label="Amanhã"; return {label,y:dd.getFullYear(),m0:dd.getMonth(),d:dd.getDate()};});
}
function fmt(ts?:string){ return ts? new Date(ts).toLocaleString("pt-PT",{dateStyle:"short",timeStyle:"short"}):""; }

/** ======================= Nota & UI helpers ======================= */
function getNota(i:TopItem){
  if(typeof i.nota==="number") return Math.max(0,Math.min(10,i.nota));
  const s = typeof i.score==="number"? i.score : 0;
  return Math.max(0,Math.min(10, Math.round((s/4)*10)/10));
}
function notaClasses(n:number){
  if(n<4.5)  return {chip:"bg-red-100 text-red-800",       bar:"bg-red-500"};
  if(n<6.5)  return {chip:"bg-amber-100 text-amber-800",   bar:"bg-amber-500"};
  if(n<8.5)  return {chip:"bg-emerald-100 text-emerald-800", bar:"bg-emerald-500"};
  return       {chip:"bg-green-200 text-green-900",        bar:"bg-green-600"};
}
function NotaBar({nota}:{nota:number}){
  const pct=Math.round((nota/10)*100);
  const {bar}=notaClasses(nota);
  return <div className="h-2 w-full rounded bg-slate-200/80"><div className={`h-2 rounded ${bar}`} style={{width:`${pct}%`}}/></div>;
}

/** ======================= Breakdown ======================= */
function normalizeKey(k:string){
  const s=k.toLowerCase();
  if(/offshore|cross|onshore/.test(s)) return {id:"offshore",label:"Offshore",emoji:"🧭"};
  if(/vento|wind/.test(s))             return {id:"vento",   label:"Vento",   emoji:"🌬️"};
  if(/onda|wave|swell|mar/.test(s))    return {id:"ondas",   label:"Ondas",   emoji:"🌊"};
  if(/meteo|wx|tempo|cloud|nuv|precip/.test(s)) return {id:"meteo",label:"Meteo",emoji:"📈"};
  if(/corrente|agita|current/.test(s)) return {id:"corrente",label:"Corrente",emoji:"💧"};
  if(/agua|água|sst|sea.*temp/.test(s)) return {id:"agua",label:"Temp. água",emoji:"🌡️"};
  return {id:s.replace(/\W+/g,"_"),label:k.replace(/_/g," "),emoji:"•"};
}
/** compacta + impõe regras fluvial/mar e remove duplicados */
function useCompactBreakdown(raw:Record<string,number>|undefined, water:WaterType){
  return useMemo(()=>{
    if(!raw) return [] as {id:string;label:string;emoji:string;val:number}[];
    const best = new Map<string,{id:string;label:string;emoji:string;val:number}>();
    for(const [k,v0] of Object.entries(raw)){
      const v=Number(v0); if(!isFinite(v)) continue;
      const info=normalizeKey(k);
      const prev=best.get(info.id);
      if(!prev || Math.abs(v)>Math.abs(prev.val)) best.set(info.id,{...info,val:Math.max(-10,Math.min(10,v))});
    }
    let arr = Array.from(best.values());
    arr = arr.filter(x => water==="fluvial" ? x.id!=="ondas" : x.id!=="corrente");
    arr.sort((a,b)=>Math.abs(b.val)-Math.abs(a.val));
    return arr.slice(0,4);
  },[raw,water]);
}
function Breakdown({data,water}:{data?:Record<string,number>;water:WaterType}){
  const compact=useCompactBreakdown(data,water);
  if(!compact.length) return null;
  return (
    <div className="mt-4 grid gap-3">
      {compact.map(({id,label,emoji,val})=>{
        const isNeg=val<0; const pct=Math.round(Math.abs(val)*10);
        return (
          <div key={id}>
            <div className="text-xs text-slate-600 mb-1 flex items-center gap-1">
              <span>{emoji}</span><span>{label} <span className="opacity-60">({val.toFixed(1)}/10{isNeg?" penal.":""})</span></span>
            </div>
            <div className="h-2 w-full rounded bg-slate-200/80 overflow-hidden">
              <div className={`h-2 ${isNeg?"bg-red-500":"bg-slate-900"}`} style={{width:`${pct}%`}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** ======================= Fetch helpers ======================= */
async function doFetch(url:string, ctrl:AbortController){
  const res=await fetch(url,{signal:ctrl.signal});
  if(!res.ok) throw new Error(String(res.status));
  const data=await res.json() as TopItem[];
  const availableUntil=res.headers.get("x-available-until");
  return {data,availableUntil};
}
function getPosition():Promise<GeolocationPosition>{
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject));
}

/** ======================= Page ======================= */
export default function Page(){
  const [mode,setMode]=useState<Mode>("familia");
  const [tab,setTab]=useState<Tab>("zone");
  const [zone,setZone]=useState<Zona>("lisboa");
  const [radius,setRadius]=useState(50);
  const [order,setOrder]=useState<OrderBy>("nota");

  const days=next7DaysLabels();
  const [dayIdx,setDayIdx]=useState(0);
  const [slot,setSlot]=useState<SlotId>("09-12");

  const [items,setItems]=useState<TopItem[]>([]);
  const [availableUntil,setAvailableUntil]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);

  const [beaches,setBeaches]=useState<Beach[]>([]);
  const [q,setQ]=useState("");
  const [picked,setPicked]=useState<Beach|null>(null);
  const [check,setCheck]=useState<TopItem|null>(null);
  const [checking,setChecking]=useState(false);

  const [openId,setOpenId]=useState<string|null>(null);
  const [legendOpen,setLegendOpen]=useState(false);

  const abortRef=useRef<AbortController|null>(null);

  function currentWhenISO(){
    const target=days[dayIdx]; const s=SLOTS.find(x=>x.id===slot)!;
    return toIsoUtcFromLocal(target.y,target.m0,target.d,s.hour);
  }

  useEffect(()=>{ (async()=>{try{const r=await fetch("/api/beaches"); setBeaches(await r.json());}catch{}})(); },[]);

  async function fetchNearMe(){
    if(!navigator.geolocation){ setError("Geolocalização indisponível. Usa a aba 'Zonas'."); return; }
    setLoading(true); setError(null);
    abortRef.current?.abort(); const ctrl=new AbortController(); abortRef.current=ctrl;
    try{
      const pos=await getPosition(); const when=currentWhenISO();
      const params=new URLSearchParams({lat:String(pos.coords.latitude),lon:String(pos.coords.longitude),radius_km:String(radius),mode,when,limit:"16"});
      const {data,availableUntil}=await doFetch(`/api/top?${params.toString()}`,ctrl);
      setItems(data); setAvailableUntil(availableUntil);
    }catch(e:any){ if(e?.name!=="AbortError") setError("Falha a carregar recomendações perto de ti."); }
    finally{ setLoading(false); }
  }
  async function fetchByZone(z:Zona){
    setLoading(true); setError(null);
    abortRef.current?.abort(); const ctrl=new AbortController(); abortRef.current=ctrl;
    try{
      const when=currentWhenISO();
      let params=new URLSearchParams({zone:z,mode,when,limit:"16"});
      if(typeof navigator!=="undefined" && navigator.geolocation){
        try{
          const pos=await getPosition();
          params = new URLSearchParams({zone:z,mode,when,limit:"16",lat:String(pos.coords.latitude),lon:String(pos.coords.longitude),radius_km:"10000"});
        }catch{}
      }
      const {data,availableUntil}=await doFetch(`/api/top?${params.toString()}`,ctrl);
      setItems(data); setAvailableUntil(availableUntil);
    }catch(e:any){ if(e?.name!=="AbortError") setError("Falha a carregar recomendações por zona."); }
    finally{ setLoading(false); }
  }
  async function checkOne(b:Beach){
    setChecking(true); setCheck(null);
    try{
      const when=currentWhenISO();
      const params=new URLSearchParams({lat:String(b.lat),lon:String(b.lon),radius_km:"2",limit:"1",mode,when});
      const res=await fetch(`/api/top?${params.toString()}`); const arr=await res.json() as TopItem[];
      setCheck(arr[0]??null);
    }catch{ setCheck(null); } finally{ setChecking(false); }
  }

  useEffect(()=>{ fetchByZone(zone); /* eslint-disable-next-line */ },[]);
  useEffect(()=>{ if(tab==="near") fetchNearMe(); if(tab==="zone") fetchByZone(zone); /* eslint-disable-next-line */ },[mode,dayIdx,slot,radius,tab]);
  useEffect(()=>{ if(tab==="zone") fetchByZone(zone); /* eslint-disable-next-line */ },[zone]);
  useEffect(()=>()=>abortRef.current?.abort(),[]);

  const hasDistance=useMemo(()=>items.some(i=>i.distancia_km!=null),[items]);
  useEffect(()=>{ if(tab==="near" && hasDistance) setOrder("dist"); else setOrder("nota"); },[tab,hasDistance]);

  const sortedItems=useMemo(()=>{
    const arr=items.slice();
    if(order==="dist"){
      return arr.sort((a,b)=>{
        const da=a.distancia_km??Number.POSITIVE_INFINITY;
        const db=b.distancia_km??Number.POSITIVE_INFINITY;
        return da-db;
      });
    }
    return arr.sort((a,b)=>getNota(b)-getNota(a));
  },[items,order]);

  const whenLabel = `${next7DaysLabels()[dayIdx].label} ${SLOTS.find(s=>s.id===slot)?.label ?? ""}`;

  /* ======= UI ======= */
  const Legend = () => !legendOpen ? null : (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={()=>setLegendOpen(false)} />
      <div className="absolute inset-x-0 top-12 mx-auto w-[min(720px,94vw)]">
        <div className="rounded-2xl border bg-white/95 backdrop-blur p-5 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold tracking-tight">Legenda</h3>
            <button onClick={()=>setLegendOpen(false)} className="px-3 py-1 rounded border">Fechar</button>
          </div>
          <ul className="text-sm space-y-2">
            <li>• <b>Nota</b> 0–10 com cores: vermelho &lt;4.5, amarelo 4.5–6.5, verde-claro 6.5–8.5, verde-escuro 8.5–10.</li>
            <li>• <b>Praia fluvial</b> mostra <b>Corrente</b> (sem Ondas). <b>Mar</b> mostra <b>Ondas</b>.</li>
            <li>• Distância também em “Zonas” se autorizar localização.</li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Grid full-width: sem max-w; ocupa o ecrã todo */}
      <div className="w-full px-4 lg:px-6 2xl:px-10 py-6 grid gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        {/* ===== Sidebar ===== */}
        <aside>
          <div className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm space-y-6">
            {/* Modo */}
            <section>
              <h3 className="text-sm font-semibold tracking-tight mb-2">Modo</h3>
              <div className="flex flex-wrap gap-2">
                {(["familia","surf","snorkel"] as const).map(m=>(
                  <button key={m} onClick={()=>setMode(m)} className={`px-3 py-1 rounded border ${mode===m?"bg-black text-white":"bg-white"}`}>{m}</button>
                ))}
              </div>
            </section>

            {/* Janela */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-tight">Janela</h3>
              <div className="flex flex-wrap gap-2">
                {next7DaysLabels().map((d,i)=>(
                  <button key={i} onClick={()=>setDayIdx(i)} className={`px-3 py-1 rounded border ${dayIdx===i?"bg-black text-white":"bg-white"}`}>{d.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {SLOTS.map(s=>(
                  <button key={s.id} onClick={()=>setSlot(s.id)} className={`px-3 py-1 rounded border ${slot===s.id?"bg-black text-white":"bg-white"}`}>{s.label}</button>
                ))}
              </div>
              <p className="text-xs text-slate-500">Previsão até 6 dias; fiabilidade diminui nos dias distantes.</p>
            </section>

            {/* Localização */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-tight">Localização</h3>
              <div className="flex gap-2">
                <button onClick={()=>setTab("near")} className={`px-3 py-1 rounded border ${tab==="near"?"bg-black text-white":"bg-white"}`}>Perto de mim</button>
                <button onClick={()=>setTab("zone")} className={`px-3 py-1 rounded border ${tab==="zone"?"bg-black text-white":"bg-white"}`}>Zonas</button>
              </div>
              {tab==="near" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-700"><span>Raio</span><strong>{radius} km</strong></div>
                  <input type="range" min={10} max={120} value={radius} onChange={e=>setRadius(parseInt(e.target.value))} className="w-full accent-black"/>
                  <button onClick={fetchNearMe} className="w-full px-3 py-2 rounded border">Atualizar</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {ZONAS.map(z=>(
                    <button key={z} onClick={()=>setZone(z)} className={`px-3 py-1 rounded border capitalize ${zone===z?"bg-black text-white":"bg-white"}`}>{z}</button>
                  ))}
                  <button onClick={()=>fetchByZone(zone)} className="col-span-2 px-3 py-2 rounded border">Atualizar</button>
                </div>
              )}
            </section>

            {/* Pesquisa */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold tracking-tight">Pesquisar praia</h3>
              <input
                value={q}
                onChange={(e)=>setQ(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==="Enter"){ const s=q.trim().toLowerCase(); const b=beaches.find(x=>x.nome.toLowerCase()===s)||beaches.find(x=>x.nome.toLowerCase().includes(s)); if(b){ setPicked(b); checkOne(b);} } }}
                placeholder="Escreve o nome…"
                className="w-full rounded-lg border border-slate-300 bg-white/80 px-3 py-2"
              />
              {q && (
                <ul className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  {beaches.filter(b=>b.nome.toLowerCase().includes(q.trim().toLowerCase())).slice(0,8).map(b=>(
                    <li key={b.id}>
                      <button onClick={()=>{setPicked(b); setQ(b.nome); checkOne(b);}} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                        {b.nome}{b.zone_tags?.length? <span className="text-xs text-slate-500"> · {b.zone_tags[0]}</span>:null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>

        {/* ===== Conteúdo ===== */}
        <section className="space-y-6">
          {/* Contexto */}
          <div className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-700">
                Janela: <strong>{whenLabel}</strong>
                {availableUntil && <> · horizonte: {fmt(availableUntil)}</>}
                {error && <span className="ml-2 text-red-600">{error}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button className={`px-3 py-1 rounded border ${order==="nota"?"bg-black text-white":"bg-white"}`} onClick={()=>setOrder("nota")}>Nota</button>
                <button className={`px-3 py-1 rounded border ${order==="dist"?"bg-black text-white":"bg-white"}`} disabled={!hasDistance} onClick={()=>setOrder("dist")} title={hasDistance?"Ordenar por distância":"Requer localização"}>Distância</button>
                <button onClick={()=>setLegendOpen(true)} className="px-3 py-1 rounded border">?</button>
              </div>
            </div>
          </div>

          {/* Resultado da pesquisa */}
          {picked && (
            <div className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">{picked.nome}</h2>
                  <p className="text-xs text-slate-500 mt-1">Previsão: {check?.used_timestamp ? fmt(check.used_timestamp) : checking ? "a verificar…" : "—"}</p>
                </div>
                {check && (()=>{const n=getNota(check); const {chip}=notaClasses(n); return <span className={`text-xs px-2 py-0.5 rounded ${chip}`}>Nota {n.toFixed(1)}/10</span>;})()}
              </div>
              <div className="mt-3">{check ? <NotaBar nota={getNota(check)}/> : <div className="h-2 rounded bg-slate-200/80" />}</div>
              {check && <Breakdown data={check.breakdown} water={check.water_type ?? "mar"}/>}
            </div>
          )}

          {/* Lista principal */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Recomendações {tab==="zone" ? <span className="lowercase">— {zone}</span> : null}</h2>

            {loading ? (
              <div className="space-y-3">
                <div className="h-24 rounded-2xl border bg-white/60 animate-pulse"/>
                <div className="h-24 rounded-2xl border bg-white/60 animate-pulse"/>
                <div className="h-24 rounded-2xl border bg-white/60 animate-pulse"/>
              </div>
            ) : sortedItems.length===0 ? (
              <p className="text-sm text-slate-500">Sem dados para esta janela.</p>
            ) : (
              <ul className="grid gap-3 2xl:grid-cols-2"> {/* em 2XL mostramos 2 cards por linha para usar ainda mais largura */}
                {sortedItems.map(i=>{
                  const n=getNota(i); const {chip}=notaClasses(n);
                  const open=openId===i.beach_id; const water:WaterType=i.water_type ?? "mar";
                  return (
                    <li key={i.beach_id} className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm">
                      <button className="w-full text-left" onClick={()=>setOpenId(open?null:i.beach_id)} aria-expanded={open}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-base font-semibold tracking-tight flex items-center gap-2 flex-wrap">
                              <span>{i.nome}</span>
                              {typeof i.distancia_km==="number" && (<span className="text-xs text-slate-500">• {i.distancia_km} km</span>)}
                              {water==="fluvial" && <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800">Praia fluvial</span>}
                            </div>
                            {i.used_timestamp && <p className="text-xs text-slate-500 mt-1">Previsão: {fmt(i.used_timestamp)}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {water==="fluvial" && mode==="surf" && <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">Surf não recomendado</span>}
                            <span className={`text-xs px-2 py-0.5 rounded ${chip}`}>Nota {n.toFixed(1)}/10</span>
                            <span className={`text-slate-500 transition-transform ${open?"rotate-180":""}`}>▾</span>
                          </div>
                        </div>
                        <div className="mt-3"><NotaBar nota={n}/></div>
                      </button>
                      {open && <Breakdown data={i.breakdown} water={water}/>}
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-xs text-slate-500">Dados: previsão via Open-Meteo (tempo + mar quando aplicável).</p>
          </div>
        </section>
      </div>

      <Legend/>
    </div>
  );
}
