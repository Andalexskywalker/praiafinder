from __future__ import annotations

from pathlib import Path
import os, json, math, random, argparse, datetime as dt, asyncio
import httpx

from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

# ---------- Constantes ----------
DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA / "beaches.json").read_text("utf-8"))

WX = "https://api.open-meteo.com/v1/forecast"
MR = "https://marine-api.open-meteo.com/v1/marine"

# ---------- Utils ----------
def to_utc(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)

def round_cell(lat: float, lon: float, res_deg: float = 0.1):
    # 0.1° ~ 8–11 km
    return (round(lat / res_deg) * res_deg, round(lon / res_deg) * res_deg)

def ang_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def is_interior_beach(b: dict) -> bool:
    hint = (b.get("water_body") or b.get("tipo_agua") or "").lower()
    if hint and hint != "mar":
        return True
    name = (b.get("nome") or "").lower()
    tags = [t.lower() for t in b.get("zone_tags", [])]
    kw = ["rio", "ribeira", "albufeira", "barragem", "lago", "interior", "fluvial"]
    return any(k in name for k in kw) or any(k in tags for k in kw)

# ---------- Componentes ----------
def wave_component(beach: Beach, hs: float | None, tp: float | None, wave_from: float | None, mode: str, is_interior: bool):
    if is_interior or hs is None:
        return None  # sem ondas para fluvial
    shelter = max(0.0, min(1.0, getattr(beach, "shelter", 0.0)))
    eff_hs = hs * (1 - 0.6 * shelter)

    ang_fac = 0.85
    if wave_from is not None:
        wave_to = (wave_from + 180) % 360
        diff = ang_diff(wave_to, beach.orientation_deg)
        ang_fac = 1.00 if diff <= 20 else 0.90 if diff <= 45 else 0.75 if diff <= 70 else 0.55 if diff <= 90 else 0.40

    if mode == "surf":
        if eff_hs < 0.4:
            hs_score = 0 + (eff_hs / 0.4) * 2
        elif eff_hs < 0.8:
            hs_score = 2 + (eff_hs - 0.4) / 0.4 * 3
        elif eff_hs <= 2.5:
            hs_score = 5 + (eff_hs - 0.8) / 1.7 * 5
        elif eff_hs <= 3.5:
            hs_score = 10 - (eff_hs - 2.5) / 1.0 * 3
        else:
            hs_score = max(0, 7 - (eff_hs - 3.5) * 3)
        tp_fac = 1.0
        if tp is not None:
            tp_fac = 0.4 if tp < 7 else 0.7 if tp < 9 else 1.0 if tp < 12 else 1.1 if tp < 15 else 1.2
        return round(max(0.0, min(10.0, hs_score * tp_fac * ang_fac)), 1)

    # família/snorkel: menos ondas melhor
    if eff_hs <= 0.25: val = 10.0
    elif eff_hs <= 0.5: val = 8.0
    elif eff_hs <= 0.8: val = 6.0
    elif eff_hs <= 1.2: val = 3.0
    elif eff_hs <= 1.6: val = 1.0
    else: val = 0.0
    if mode == "snorkel":
        val = max(0.0, val - 2.0)
    if wave_from is not None:
        wave_to = (wave_from + 180) % 360
        diff = ang_diff(wave_to, beach.orientation_deg)
        if diff >= 70:
            val = min(10.0, val + 1.0)
    return round(val, 1)

def corrente_component(wind_ms: float, mode: str):
    if mode == "surf":
        return None
    w = max(0.0, float(wind_ms))
    if w <= 2: v = 9.5
    elif w <= 4: v = 8.0
    elif w <= 6: v = 6.0
    elif w <= 9: v = 3.5
    else: v = 1.5
    return round(v, 1)

# Pesos
WEIGHTS_BASE = {
    "familia": {"offshore": 0.25, "vento": 0.35, "meteo": 0.30, "ondas": 0.10},
    "surf":    {"offshore": 0.35, "vento": 0.25, "meteo": 0.10, "ondas": 0.30},
    "snorkel": {"offshore": 0.25, "vento": 0.25, "meteo": 0.35, "ondas": 0.15},
}
WEIGHTS_FLUVIAL = {
    "familia": {"offshore": 0.25, "vento": 0.35, "meteo": 0.30, "corrente": 0.10},
    "snorkel": {"offshore": 0.25, "vento": 0.25, "meteo": 0.40, "corrente": 0.10},
    "surf":    {"offshore": 0.50, "vento": 0.40, "meteo": 0.10},  # sem ondas
}

def combine_0_40(mode: str, br: dict, water_type: str) -> float:
    weights = (WEIGHTS_FLUVIAL if water_type == "fluvial" else WEIGHTS_BASE).get(mode, WEIGHTS_BASE["familia"]).copy()
    vals = {}
    for k in list(weights.keys()):
        v = br.get(k)
        if v is None:
            weights.pop(k)
            continue
        vals[k] = max(0.0, min(10.0, float(v)))
    if not vals:
        return 0.0
    wsum = sum(weights.values()) or 1.0
    # média geométrica ponderada
    g = 1.0
    for k, v in vals.items():
        x = max(1e-3, v / 10.0)
        g *= x ** (weights[k] / wsum)
    return round(40.0 * g, 1)

# ---------- HTTP ----------
async def fetch_json(client: httpx.AsyncClient, url: str, params: dict, ua: str | None, retries: int = 3, sleep_base: float = 0.6):
    headers = {"User-Agent": ua} if ua else None
    for attempt in range(retries + 1):
        try:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, httpx.ConnectError):
            if attempt >= retries:
                raise
            await asyncio.sleep(sleep_base * (1.8 ** attempt) + random.uniform(0, 0.25))

# ---------- Pipeline por célula ----------
async def process_cell(
    client: httpx.AsyncClient,
    clat: float, clon: float,
    group: list[dict],
    days: int, now: dt.datetime, horizon: dt.datetime,
    ua: str, skip_marine: bool
) -> list[dict]:
    items: list[dict] = []

    wx = await fetch_json(client, WX, {
        "latitude": clat, "longitude": clon, "timezone": "UTC",
        "hourly": ["windspeed_10m", "winddirection_10m", "cloudcover", "precipitation"],
        "forecast_days": days
    }, ua=ua)
    wxh = wx["hourly"]
    times = [to_utc(t) for t in wxh["time"]]

    valid_idx = [i for i, t in enumerate(times) if now <= t <= horizon]
    if not valid_idx:
        return items

    mrh = {}
    sea_ok = False
    if not skip_marine:
        try:
            mr = await fetch_json(client, MR, {
                "latitude": clat, "longitude": clon, "timezone": "UTC", "cell_selection": "sea",
                "hourly": ["wave_height", "wave_period", "wave_direction", "sea_surface_temperature"],
                "forecast_days": days
            }, ua=ua)
            try:
                sea_lat = float(mr.get("latitude")); sea_lon = float(mr.get("longitude"))
                sea_ok = (haversine_km(clat, clon, sea_lat, sea_lon) <= 25)
            except Exception:
                sea_ok = False
            if sea_ok:
                mrh = mr.get("hourly", {})
        except Exception as e:
            print(f"[warn] Marine falhou {clat:.2f},{clon:.2f}: {e}")

    conds: dict[int, Conditions] = {}
    for i in valid_idx:
        conds[i] = Conditions(
            wind_speed_ms=(wxh["windspeed_10m"][i] or 0) / 3.6,
            wind_from_deg=wxh["winddirection_10m"][i] or 0,
            wave_hs_m=(mrh.get("wave_height") or [None] * len(times))[i] if mrh else None,
            wave_tp_s=(mrh.get("wave_period") or [None] * len(times))[i] if mrh else None,
            cloud_pct=wxh["cloudcover"][i] or 0,
            precip_mm=wxh["precipitation"][i] or 0,
            water_temp_c=(mrh.get("sea_surface_temperature") or [None] * len(times))[i] if mrh else None,
        )

    for b in group:
        beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0))
        interior = is_interior_beach(b)
        water_type = "fluvial" if interior or not sea_ok else "mar"

        for i in valid_idx:
            t = times[i]
            cond = conds[i]
            hs = cond.wave_hs_m
            tp = cond.wave_tp_s
            wdir = (mrh.get("wave_direction") or [None] * len(times))[i] if mrh else None

            for mode, fn in (("familia", score_family), ("surf", score_surf), ("snorkel", score_snorkel)):
                _, br = fn(beach, cond)
                br = br or {}

                ondas = wave_component(beach, hs, tp, wdir, mode, water_type == "fluvial")
                if ondas is not None:
                    br["ondas"] = ondas
                if water_type == "fluvial":
                    corr = corrente_component(cond.wind_speed_ms, mode)
                    if corr is not None:
                        br["corrente"] = corr

                score_40 = combine_0_40(mode, br, water_type)
                nota_10 = round(score_40 / 4.0, 1)

                items.append({
                    "beach_id": b["id"],
                    "ts": t.isoformat().replace("+00:00", "Z"),
                    "mode": mode,
                    "score": score_40,   # 0..40 (compat)
                    "nota": nota_10,     # 0..10 (UI)
                    "water_type": water_type,
                    "breakdown": br
                })

    return items

# ---------- Main ----------
async def main_async(args):
    zones = [z.strip().lower() for z in args.zones.split(",") if z.strip()]
    days = max(1, min(args.days, 6))

    beaches = [b for b in BEACHES if not zones or any(z in [t.lower() for t in b.get("zone_tags", [])] for z in zones)]
    cells: dict[tuple[float, float], list[dict]] = {}
    for b in beaches:
        cells.setdefault(round_cell(b["lat"], b["lon"], args.cell_res), []).append(b)

    cell_items = list(cells.items())
    if args.limit_cells > 0:
        cell_items = cell_items[: args.limit_cells]

    print(f"> Praias: {len(beaches)} | Células: {len(cell_items)} | Dias: {days} | skip_marine={args.skip_marine}")

    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(days=days)

    limits = httpx.Limits(max_keepalive_connections=args.concurrency, max_connections=args.concurrency)
    timeout = httpx.Timeout(30)

    sem = asyncio.Semaphore(args.concurrency)
    results: list[dict] = []

    async with httpx.AsyncClient(limits=limits, timeout=timeout, http2=False) as client:

        async def worker(cell_idx: int, clat: float, clon: float, group: list[dict]):
            # pequeno jitter por tarefa
            if args.sleep_ms > 0:
                await asyncio.sleep(random.uniform(0, args.sleep_ms / 1000.0))
            async with sem:
                out = await process_cell(client, clat, clon, group, days, now, horizon, args.ua, args.skip_marine)
                results.extend(out)
                if (cell_idx % 10 == 0) or (cell_idx == len(cell_items)):
                    print(f"   célula {cell_idx}/{len(cell_items)} concluída")

        tasks = [
            asyncio.create_task(worker(idx, clat, clon, group))
            for idx, ((clat, clon), group) in enumerate(cell_items, start=1)
        ]
        await asyncio.gather(*tasks)

    # saída local
    payload = json.dumps(results, ensure_ascii=False, indent=None if args.minify else 2)
    out_path = Path(args.out or (DATA / "scores_demo.json"))
    out_path.write_text(payload, "utf-8")
    print(f"✓ Escrevi {len(results)} → {out_path}")

    # upload S3 (produção)
    bucket = os.getenv("SCORES_S3_BUCKET")
    key    = os.getenv("SCORES_S3_KEY", "scores/scores.json")
    if bucket:
        try:
            import boto3  # import tardio → não obriga em dev
            boto3.client("s3").put_object(
                Bucket=bucket, Key=key,
                Body=payload.encode("utf-8"),
                ContentType="application/json"
            )
            print(f"✓ Enviado para s3://{bucket}/{key}")
        except Exception as e:
            print(f"[warn] Falha a enviar para S3: {e}")

    print("Dica: chama /reload na API para recarregar.")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zones", default="", help="Zonas (ex: 'lisboa,algarve'). Vazio = todas.")
    ap.add_argument("--days", type=int, default=3, help="Dias de previsão (1..6).")
    ap.add_argument("--cell-res", type=float, default=0.1, help="Resolução da célula (graus).")
    ap.add_argument("--sleep-ms", type=int, default=150, help="Jitter entre tarefas (ms).")
    ap.add_argument("--limit-cells", type=int, default=0, help="Limite nº de células (debug). 0 = sem limite.")
    ap.add_argument("--skip-marine", action="store_true", help="Ignorar API de ondas (marine).")
    ap.add_argument("--ua", default="PraiaFinder/0.2 (+https://example.local)", help="User-Agent HTTP.")
    ap.add_argument("--out", default="", help="Ficheiro de saída (default: data/scores_demo.json).")
    ap.add_argument("--minify", action="store_true", help="Escrever JSON minificado.")
    ap.add_argument("--concurrency", type=int, default=8, help="Concorrência de células (HTTP).")
    args = ap.parse_args()
    asyncio.run(main_async(args))

if __name__ == "__main__":
    main()
