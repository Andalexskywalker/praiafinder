from pathlib import Path
import json, datetime as dt, time
import httpx, random, os

from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA / "beaches.json").read_text("utf-8"))

BASE = "https://api.open-meteo.com/v1/forecast"
HEADERS = {"User-Agent": "PraiaFinder/0.2 (+https://github.com/Andalexskywalker/praiafinder)"}

ZONE_FILTER = os.environ.get("ZONES")  # ex.: "lisboa,algarve"
if ZONE_FILTER:
    zones = [z.strip().lower() for z in ZONE_FILTER.split(",")]
    BEACHES = [b for b in BEACHES if any(z in [t.lower() for t in b.get("zone_tags",[])] for z in zones)]

def fetch_hourly(lat: float, lon: float):
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ["windspeed_10m","winddirection_10m","cloudcover","precipitation"],
        "forecast_days": 2,
        "timezone": "UTC",
    }
    delay = 1.0
    for attempt in range(5):  # 5 tentativas com backoff
        try:
            with httpx.Client(timeout=30, headers=HEADERS) as client:
                r = client.get(BASE, params=params)
                r.raise_for_status()
                js = r.json()
                return js["hourly"]
        except httpx.HTTPError as e:
            if attempt == 4:
                raise
            time.sleep(delay)
            delay *= 1.8  # backoff exponencial
    return None

def to_dt(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)

def main():
    items = []
    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(hours=48)

    print(f"Beaches a processar: {len(BEACHES)}")
    for idx, b in enumerate(BEACHES, 1):
        try:
            hourly = fetch_hourly(b["lat"], b["lon"])
        except Exception as e:
            print(f"[WARN] Falha a obter {b['nome']}: {e}")
            continue

        times = [to_dt(t) for t in hourly["time"]]
        for t, wspd, wdir, cloud, precip in zip(
            times, hourly["windspeed_10m"], hourly["winddirection_10m"],
            hourly["cloudcover"], hourly["precipitation"]
        ):
            if not (now <= t <= horizon):
                continue
            beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0))
            cond = Conditions(
                wind_speed_ms = (wspd or 0) / 3.6,  # km/h -> m/s
                wind_from_deg = wdir or 0,
                wave_hs_m     = None,   # integrar ondas na próxima etapa
                wave_tp_s     = None,
                cloud_pct     = cloud or 0,
                precip_mm     = precip or 0,
                water_temp_c  = None,
            )
            for mode, fn in [("familia", score_family), ("surf", score_surf), ("snorkel", score_snorkel)]:
                score, breakdown = fn(beach, cond)
                items.append({
                    "beach_id": b["id"],
                    "ts": t.isoformat().replace("+00:00","Z"),
                    "mode": mode,
                    "score": round(score, 1),
                    "breakdown": breakdown,
                })

        # pequena pausa entre praias para ser simpático com a API
        time.sleep(0.3 + random.random()*0.2)

    out = DATA / "scores_demo.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")
    print(f"Escrevi {len(items)} scores → {out}")

if __name__ == "__main__":
    main()
