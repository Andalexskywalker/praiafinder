from pathlib import Path
import json, time, math, random, argparse, datetime as dt
import httpx

from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA / "beaches.json").read_text("utf-8"))

WX = "https://api.open-meteo.com/v1/forecast"
MR = "https://marine-api.open-meteo.com/v1/marine"

def to_utc(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)

def round_cell(lat: float, lon: float, res_deg: float = 0.1):
    # 0.1° ~ 8–11 km → agrupa praias próximas, reduz chamadas
    return (round(lat / res_deg) * res_deg, round(lon / res_deg) * res_deg)

def fetch_json(client: httpx.Client, url: str, params: dict, retries: int = 3, sleep_base: float = 0.6, ua: str | None = None):
    headers = {"User-Agent": ua} if ua else None
    for attempt in range(retries + 1):
        try:
            r = client.get(url, params=params, headers=headers)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, httpx.ConnectError) as e:
            if attempt >= retries:
                raise
            wait = sleep_base * (1.8 ** attempt) + random.uniform(0, 0.25)
            time.sleep(wait)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zones", default="", help="Zonas a incluir (ex: 'lisboa,algarve'). Vazio = todas.")
    ap.add_argument("--days", type=int, default=3, help="Dias de previsão (1..6).")
    ap.add_argument("--cell-res", type=float, default=0.1, help="Resolução da célula (graus).")
    ap.add_argument("--sleep-ms", type=int, default=300, help="Atraso entre chamadas (ms).")
    ap.add_argument("--limit-cells", type=int, default=0, help="Limite nº de células (debug). 0 = sem limite.")
    ap.add_argument("--skip-marine", action="store_true", help="Ignorar API de ondas (marine).")
    ap.add_argument("--ua", default="PraiaFinder/0.1 (+https://example.local)", help="User-Agent a usar nas chamadas HTTP.")
    args = ap.parse_args()

    zones = [z.strip().lower() for z in args.zones.split(",") if z.strip()]
    days = max(1, min(args.days, 6))
    sleep_s = args.sleep_ms / 1000.0

    # 1) Selecionar praias e agrupar por célula
    beaches = [b for b in BEACHES if not zones or any(z in [t.lower() for t in b.get("zone_tags", [])] for z in zones)]
    cells = {}
    for b in beaches:
        key = round_cell(b["lat"], b["lon"], args.cell_res)
        cells.setdefault(key, []).append(b)

    cell_items = list(cells.items())
    if args.limit_cells > 0:
        cell_items = cell_items[:args.limit_cells]

    print(f"> Praias: {len(beaches)} | Células únicas: {len(cell_items)} | Dias: {days} | skip_marine={args.skip_marine}")

    items = []
    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(days=days)

    limits = httpx.Limits(max_keepalive_connections=8, max_connections=8)
    # http2=False melhora estabilidade em alguns ambientes Windows
    with httpx.Client(timeout=30, limits=limits, http2=False) as client:
        for idx, ((clat, clon), group) in enumerate(cell_items, start=1):
            # Weather
            wx = fetch_json(client, WX, {
                "latitude": clat, "longitude": clon, "timezone": "UTC",
                "hourly": ["windspeed_10m","winddirection_10m","cloudcover","precipitation"],
                "forecast_days": days
            }, ua=args.ua)
            time.sleep(sleep_s)

            # Marine (opcional)
            mrh = {}
            if not args.skip_marine:
                try:
                    mr = fetch_json(client, MR, {
                        "latitude": clat, "longitude": clon, "timezone": "UTC",
                        "cell_selection":"sea",
                        "hourly": ["wave_height","wave_period","wave_direction","sea_surface_temperature"],
                        "forecast_days": days
                    }, ua=args.ua)
                    mrh = mr.get("hourly", {})
                except Exception as e:
                    print(f"   [warn] Marine falhou na célula {clat:.2f},{clon:.2f}: {e}. Continuo sem ondas.")
                time.sleep(sleep_s)

            wxh = wx["hourly"]
            times = [to_utc(t) for t in wxh["time"]]

            # 3) Aplicar os valores desta célula a todas as praias do grupo
            for b in group:
                beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0))
                for i, t in enumerate(times):
                    if not (now <= t <= horizon):
                        continue
                    cond = Conditions(
                        wind_speed_ms = (wxh["windspeed_10m"][i] or 0) / 3.6,  # km/h -> m/s
                        wind_from_deg = wxh["winddirection_10m"][i] or 0,
                        wave_hs_m     = (mrh.get("wave_height") or [None]*len(times))[i] if mrh else None,
                        wave_tp_s     = (mrh.get("wave_period") or [None]*len(times))[i] if mrh else None,
                        cloud_pct     = wxh["cloudcover"][i] or 0,
                        precip_mm     = wxh["precipitation"][i] or 0,
                        water_temp_c  = (mrh.get("sea_surface_temperature") or [None]*len(times))[i] if mrh else None,
                    )
                    for mode, fn in [("familia", score_family), ("surf", score_surf), ("snorkel", score_snorkel)]:
                        score, breakdown = fn(beach, cond)
                        items.append({
                            "beach_id": b["id"],
                            "ts": t.isoformat().replace("+00:00","Z"),
                            "mode": mode,
                            "score": round(score, 1),
                            "breakdown": breakdown
                        })

            if idx % 10 == 0 or idx == len(cell_items):
                print(f"   célula {idx}/{len(cell_items)} concluída")

    out = DATA / "scores_demo.json"
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")
    print(f"✓ Escrevi {len(items)} scores → {out}")
    print("Dica: chama /reload na API para recarregar.")
if __name__ == "__main__":
    main()
