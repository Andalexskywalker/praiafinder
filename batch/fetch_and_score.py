from __future__ import annotations

from pathlib import Path
import os, json, math, random, argparse, datetime as dt, asyncio
import httpx

# Hack para importar scoring sem instalar pacote
import sys
sys.path.append(str(Path(__file__).resolve().parents[2]))
from backend.app.scoring import calculate_score, BeachInfo, Conditions

# ---------- Constantes ----------
DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES_PATH = DATA / "beaches.json"
BEACHES = json.loads(BEACHES_PATH.read_text("utf-8"))

WX = "https://api.open-meteo.com/v1/forecast"
MR = "https://marine-api.open-meteo.com/v1/marine"

# ---------- Utils ----------
def to_utc(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)

def round_cell(lat: float, lon: float, res_deg: float = 0.1):
    return (round(lat / res_deg) * res_deg, round(lon / res_deg) * res_deg)

def classify_water_type_strict(b: dict) -> str:
    """
    Classificação Estrita: Padrão é MAR.
    Só muda para FLUVIAL se houver sinais inequívocos.
    """
    # 1. Se o JSON já diz explicitamente, confiamos.
    explicit = (b.get("water_type") or "").strip().lower()
    if explicit == "fluvial": return "fluvial"
    if explicit == "mar": return "mar"

    # 2. Heurística pelo nome
    name = (b.get("nome") or "").lower()
    tags = " ".join([(t or "").lower() for t in b.get("zone_tags", [])])
    full_text = f"{name} {tags}"
    
    # Sinais inequívocos de Fluvial
    fluvial_signals = ["praia fluvial", "barragem", "albufeira do", "albufeira da", "rio "]
    if any(s in full_text for s in fluvial_signals):
        return "fluvial"
        
    # Se tiver tag 'interior' e não tiver 'litoral'
    if "interior" in full_text and "litoral" not in full_text:
        return "fluvial"

    # Padrão Seguro: Mar
    return "mar"

# ---------- HTTP ----------
async def fetch_json(client: httpx.AsyncClient, url: str, params: dict, ua: str | None, retries: int = 3):
    headers = {"User-Agent": ua} if ua else None
    for attempt in range(retries + 1):
        try:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, httpx.ConnectError):
            if attempt >= retries: raise
            await asyncio.sleep(0.5 * (1.5 ** attempt) + random.uniform(0, 0.2))

# ---------- Pipeline ----------
async def process_cell(
    client: httpx.AsyncClient,
    clat: float, clon: float,
    group: list[dict],
    days: int, now: dt.datetime, horizon: dt.datetime,
    ua: str, skip_marine: bool
) -> list[dict]:
    items: list[dict] = []

    # 1. Meteo (Ar)
    wx = await fetch_json(client, WX, {
        "latitude": clat, "longitude": clon, "timezone": "UTC",
        "hourly": ["temperature_2m", "precipitation", "cloudcover", "windspeed_10m", "winddirection_10m"],
        "forecast_days": days
    }, ua=ua)
    
    if not wx or "hourly" not in wx: return []
    
    wxh = wx["hourly"]
    times = [to_utc(t) for t in wxh["time"]]
    valid_idx = [i for i, t in enumerate(times) if now <= t <= horizon]
    
    if not valid_idx: return []

    # 2. Marine (Água) - Só pedimos se houver pelo menos 1 praia de MAR no grupo
    # Se classificarmos mal uma praia de mar como rio, ela fica sem dados de ondas aqui.
    # Por isso a função classify_water_type_strict favorece 'mar'.
    group_water_types = {b["id"]: classify_water_type_strict(b) for b in group}
    has_sea = any(wt == "mar" for wt in group_water_types.values())
    
    mrh = {}
    if has_sea and not skip_marine:
        try:
            mr = await fetch_json(client, MR, {
                "latitude": clat, "longitude": clon, "timezone": "UTC", "cell_selection": "nearest",
                "hourly": ["wave_height", "wave_direction", "wave_period", "sea_surface_temperature"],
                "forecast_days": days
            }, ua=ua)
            mrh = mr.get("hourly", {})
        except Exception as e:
            # Falha silenciosa no Marine (pode ser terra interior)
            pass

    # 3. Calcular Scores
    for b in group:
        wt = group_water_types[b["id"]]
        
        # DEBUG PRINT (opcional, para veres o que está a acontecer)
        # print(f"Processing {b['nome']} -> {wt}")

        beach_info = BeachInfo(
            orientation_deg=b.get("orientacao_graus"),
            water_type=wt
        )
        
        use_marine = (wt == "mar" and bool(mrh))

        for i in valid_idx:
            ts_iso = times[i].isoformat().replace("+00:00", "Z")
            
            cond = Conditions(
                wind_speed_kmh=wxh["windspeed_10m"][i] or 0.0,
                wind_from_deg=wxh["winddirection_10m"][i] or 0.0,
                air_temp_c=wxh["temperature_2m"][i],
                cloud_pct=wxh["cloudcover"][i],
                precip_mm=wxh["precipitation"][i],
                # Dados Marine (Safe Get)
                wave_height_m=mrh["wave_height"][i] if use_marine and i < len(mrh.get("wave_height",[])) else None,
                wave_period_s=mrh["wave_period"][i] if use_marine and i < len(mrh.get("wave_period",[])) else None,
                water_temp_c=mrh["sea_surface_temperature"][i] if use_marine and i < len(mrh.get("sea_surface_temperature",[])) else None,
            )

            for mode in ["familia", "surf"]:
                if mode == "surf" and wt == "fluvial": continue
                
                nota, breakdown = calculate_score(beach_info, cond, mode=mode)
                
                # Limpeza final de keys
                if wt == "fluvial":
                    breakdown.pop("ondas", None)
                    breakdown.pop("offshore", None)
                
                items.append({
                    "beach_id": b["id"],
                    "ts": ts_iso,
                    "mode": mode,
                    "score": nota * 4.0, # Compatibilidade
                    "nota": nota,
                    "breakdown": breakdown,
                    # Dados raw para debug/frontend
                    "wind_speed": cond.wind_speed_kmh,
                    "wind_deg": cond.wind_from_deg,
                    "wave_height": cond.wave_height_m,
                    "temp": cond.air_temp_c
                })

    return items

# ---------- Main ----------
async def main_async(args):
    zones = [z.strip().lower() for z in args.zones.split(",") if z.strip()]
    
    # Filtro de praias
    beaches = [b for b in BEACHES if not zones or any(z in [t.lower() for t in b.get("zone_tags", [])] for z in zones)]
    
    # Agrupar por células
    cells: dict[tuple[float, float], list[dict]] = {}
    for b in beaches:
        cells.setdefault(round_cell(b["lat"], b["lon"], args.cell_res), []).append(b)
    
    cell_items = list(cells.items())
    if args.limit_cells > 0: cell_items = cell_items[: args.limit_cells]

    print(f"> A atualizar scores para {len(beaches)} praias...")
    
    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(days=args.days)
    
    limits = httpx.Limits(max_keepalive_connections=args.concurrency, max_connections=args.concurrency)
    async with httpx.AsyncClient(limits=limits, timeout=30) as client:
        tasks = []
        sem = asyncio.Semaphore(args.concurrency)
        
        async def worker(clat, clon, group):
            async with sem:
                if args.sleep_ms > 0: await asyncio.sleep(random.uniform(0, args.sleep_ms/1000))
                return await process_cell(client, clat, clon, group, args.days, now, horizon, args.ua, args.skip_marine)

        for (clat, clon), group in cell_items:
            tasks.append(asyncio.create_task(worker(clat, clon, group)))
            
        nested = await asyncio.gather(*tasks)
        results = [item for sublist in nested for item in sublist]

    out_path = Path(args.out or (DATA / "scores.json"))
    out_path.write_text(json.dumps(results, ensure_ascii=False), "utf-8")
    print(f"✓ Feito. {len(results)} registos guardados em {out_path}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=5)
    ap.add_argument("--zones", default="")
    ap.add_argument("--cell-res", type=float, default=0.1)
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--sleep-ms", type=int, default=100)
    ap.add_argument("--limit-cells", type=int, default=0)
    ap.add_argument("--skip-marine", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--ua", default="PraiaFinder/1.0")
    args = ap.parse_args()
    asyncio.run(main_async(args))

if __name__ == "__main__":
    main()