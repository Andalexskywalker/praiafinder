from pathlib import Path
import json, time, math, random, argparse, datetime as dt, httpx

from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA / "beaches.json").read_text("utf-8"))

WX = "https://api.open-meteo.com/v1/forecast"
MR = "https://marine-api.open-meteo.com/v1/marine"

# ---------- utils ----------
def to_utc(s: str) -> dt.datetime: return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)
def round_cell(lat: float, lon: float, res_deg: float = 0.1): return (round(lat/res_deg)*res_deg, round(lon/res_deg)*res_deg)
def fetch_json(client, url, params, retries=3, sleep_base=0.6, ua=None):
    headers = {"User-Agent": ua} if ua else None
    for a in range(retries+1):
        try:
            r = client.get(url, params=params, headers=headers); r.raise_for_status(); return r.json()
        except (httpx.HTTPError, httpx.ConnectError):
            if a >= retries: raise
            time.sleep(sleep_base*(1.8**a)+random.uniform(0,0.25))
def haversine_km(lat1, lon1, lat2, lon2):
    R=6371.0; dlat=math.radians(lat2-lat1); dlon=math.radians(lon2-lon1)
    a=math.sin(dlat/2)**2+math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R*2*math.atan2(math.sqrt(a), math.sqrt(1-a))
def ang_diff(a: float, b: float)->float: return abs((a - b + 180) % 360 - 180)

def is_interior_beach(b: dict) -> bool:
    hint=(b.get("water_body") or b.get("tipo_agua") or "").lower()
    if hint and hint!="mar": return True
    name=(b.get("nome") or "").lower()
    tags=[t.lower() for t in b.get("zone_tags",[])]
    kw=["rio","ribeira","albufeira","barragem","lago","interior","fluvial"]
    return any(k in name for k in kw) or any(k in tags for k in kw)

# ---------- componentes ----------
def wave_component(beach: Beach, hs: float|None, tp: float|None, wave_from: float|None, mode: str, is_interior: bool):
    if is_interior or hs is None: return None  # sem ondas para fluvial
    shelter=max(0.0, min(1.0, getattr(beach,"shelter",0.0)))
    eff_hs=hs*(1-0.6*shelter)
    ang_fac=0.85
    if wave_from is not None:
        wave_to=(wave_from+180)%360; diff=ang_diff(wave_to, beach.orientation_deg)
        ang_fac = 1.00 if diff<=20 else 0.90 if diff<=45 else 0.75 if diff<=70 else 0.55 if diff<=90 else 0.40
    if mode=="surf":
        if eff_hs<0.4: hs_score=0+(eff_hs/0.4)*2
        elif eff_hs<0.8: hs_score=2+(eff_hs-0.4)/0.4*3
        elif eff_hs<=2.5: hs_score=5+(eff_hs-0.8)/1.7*5
        elif eff_hs<=3.5: hs_score=10-(eff_hs-2.5)/1.0*3
        else: hs_score=max(0,7-(eff_hs-3.5)*3)
        tp_fac=1.0
        if tp is not None:
            tp_fac = 0.4 if tp<7 else 0.7 if tp<9 else 1.0 if tp<12 else 1.1 if tp<15 else 1.2
        return round(max(0.0, min(10.0, hs_score*tp_fac*ang_fac)),1)
    # família/snorkel: menos ondas melhor
    if eff_hs<=0.25: val=10.0
    elif eff_hs<=0.5: val=8.0
    elif eff_hs<=0.8: val=6.0
    elif eff_hs<=1.2: val=3.0
    elif eff_hs<=1.6: val=1.0
    else: val=0.0
    if mode=="snorkel": val=max(0.0, val-2.0)
    if wave_from is not None:
        wave_to=(wave_from+180)%360; diff=ang_diff(wave_to, beach.orientation_deg)
        if diff>=70: val=min(10.0, val+1.0)
    return round(val,1)

def corrente_component(wind_ms: float, mode: str)->float:
    """Proxy de corrente/agitacao superficial para fluviais (só familia/snorkel)."""
    if mode=="surf": return None  # não usado
    w=max(0.0, float(wind_ms))
    # menos vento → melhor; curva suave
    if w<=2: v=9.5
    elif w<=4: v=8.0
    elif w<=6: v=6.0
    elif w<=9: v=3.5
    else: v=1.5
    return round(v,1)

# pesos base
WEIGHTS_BASE = {
    "familia": {"offshore":0.25,"vento":0.35,"meteo":0.30,"ondas":0.10},
    "surf":    {"offshore":0.35,"vento":0.25,"meteo":0.10,"ondas":0.30},
    "snorkel": {"offshore":0.25,"vento":0.25,"meteo":0.35,"ondas":0.15},
}
# para fluvial, substitui ondas por corrente (familia/snorkel)
WEIGHTS_FLUVIAL = {
    "familia": {"offshore":0.25,"vento":0.35,"meteo":0.30,"corrente":0.10},
    "snorkel": {"offshore":0.25,"vento":0.25,"meteo":0.40,"corrente":0.10},
    "surf":    {"offshore":0.50,"vento":0.40,"meteo":0.10},  # sem ondas, surf torna-se baixa nota naturalmente
}

def combine_0_40(mode: str, br: dict, water_type: str) -> float:
    weights = (WEIGHTS_FLUVIAL if water_type=="fluvial" else WEIGHTS_BASE).get(mode, WEIGHTS_BASE["familia"]).copy()
    vals={}
    for k in list(weights.keys()):
        v=br.get(k)
        if v is None:
            weights.pop(k); continue
        vals[k]=max(0.0, min(10.0, float(v)))
    if not vals: return 0.0
    wsum=sum(weights.values()) or 1.0
    g=1.0
    for k,v in vals.items():
        x=max(1e-3, v/10.0)
        g*= x ** (weights[k]/wsum)
    return round(40.0*g,1)

# ---------- main ----------
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--zones",default="")
    ap.add_argument("--days",type=int,default=3)
    ap.add_argument("--cell-res",type=float,default=0.1)
    ap.add_argument("--sleep-ms",type=int,default=300)
    ap.add_argument("--limit-cells",type=int,default=0)
    ap.add_argument("--skip-marine",action="store_true")
    ap.add_argument("--ua",default="PraiaFinder/0.2 (+https://example.local)")
    args=ap.parse_args()

    zones=[z.strip().lower() for z in args.zones.split(",") if z.strip()]
    days=max(1, min(args.days, 6)); sleep_s=args.sleep_ms/1000.0

    beaches=[b for b in BEACHES if not zones or any(z in [t.lower() for t in b.get("zone_tags",[])] for z in zones)]
    cells={}
    for b in beaches:
        cells.setdefault(round_cell(b["lat"], b["lon"], args.cell_res), []).append(b)
    cell_items=list(cells.items()); 
    if args.limit_cells>0: cell_items=cell_items[:args.limit_cells]

    print(f"> Praias: {len(beaches)} | Células: {len(cell_items)} | Dias: {days} | skip_marine={args.skip_marine}")
    items=[]; now=dt.datetime.now(dt.timezone.utc); horizon=now+dt.timedelta(days=days)

    limits=httpx.Limits(max_keepalive_connections=8, max_connections=8)
    with httpx.Client(timeout=30, limits=limits, http2=False) as client:
        for idx, ((clat,clon), group) in enumerate(cell_items, start=1):
            wx=fetch_json(client, WX, {"latitude":clat,"longitude":clon,"timezone":"UTC",
                                       "hourly":["windspeed_10m","winddirection_10m","cloudcover","precipitation"],
                                       "forecast_days":days}, ua=args.ua)
            time.sleep(sleep_s)
            mrh={}; sea_ok=False
            if not args.skip_marine:
                try:
                    mr=fetch_json(client, MR, {"latitude":clat,"longitude":clon,"timezone":"UTC","cell_selection":"sea",
                                               "hourly":["wave_height","wave_period","wave_direction","sea_surface_temperature"],
                                               "forecast_days":days}, ua=args.ua)
                    # ignora pixel marinho muito distante (interior)
                    try:
                        sea_lat=float(mr.get("latitude")); sea_lon=float(mr.get("longitude"))
                        if haversine_km(clat,clon,sea_lat,sea_lon) <= 25:
                            mrh=mr.get("hourly",{}); sea_ok=True
                    except Exception: pass
                except Exception as e:
                    print(f"[warn] Marine falhou {clat:.2f},{clon:.2f}: {e}")
                time.sleep(sleep_s)

            wxh=wx["hourly"]; times=[to_utc(t) for t in wxh["time"]]

            for b in group:
                base = Beach(orientation_deg=b.get("orientacao_graus",270), shelter=b.get("abrigo",0))
                interior=is_interior_beach(b)
                water_type="fluvial" if interior or not sea_ok else "mar"

                for i,t in enumerate(times):
                    if not (now <= t <= horizon): continue
                    hs=(mrh.get("wave_height") or [None]*len(times))[i] if mrh else None
                    tp=(mrh.get("wave_period") or [None]*len(times))[i] if mrh else None
                    wdir=(mrh.get("wave_direction") or [None]*len(times))[i] if mrh else None

                    cond=Conditions(
                        wind_speed_ms=(wxh["windspeed_10m"][i] or 0)/3.6,
                        wind_from_deg=wxh["winddirection_10m"][i] or 0,
                        wave_hs_m=hs, wave_tp_s=tp,
                        cloud_pct=wxh["cloudcover"][i] or 0,
                        precip_mm=wxh["precipitation"][i] or 0,
                        water_temp_c=(mrh.get("sea_surface_temperature") or [None]*len(times))[i] if mrh else None,
                    )

                    for mode, fn in [("familia",score_family),("surf",score_surf),("snorkel",score_snorkel)]:
                        _, br = fn(base, cond)         # usa os teus parciais
                        br = br or {}

                        ondas = wave_component(base, hs, tp, wdir, mode, water_type=="fluvial")
                        if ondas is not None: br["ondas"]=ondas
                        if water_type=="fluvial":
                            corr = corrente_component(cond.wind_speed_ms, mode)
                            if corr is not None: br["corrente"]=corr

                        score_40 = combine_0_40(mode, br, water_type)  # 0..40
                        nota_10  = round(score_40/4.0, 1)              # 0..10

                        items.append({
                            "beach_id": b["id"],
                            "ts": t.isoformat().replace("+00:00","Z"),
                            "mode": mode,
                            "score": score_40,
                            "nota": nota_10,
                            "water_type": water_type,
                            "breakdown": br
                        })

            if idx % 10 == 0 or idx == len(cell_items):
                print(f"   célula {idx}/{len(cell_items)} concluída")

    out = DATA / "scores_demo.json"
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")
    print(f"✓ Escrevi {len(items)} → {out}")
    print("Dica: chama /reload na API para recarregar.")

if __name__=="__main__":
    main()