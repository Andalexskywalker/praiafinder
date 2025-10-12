from pathlib import Path
import json, datetime as dt, httpx
from backend.app.scoring import Beach, Conditions, score_family, score_surf, score_snorkel

DATA = Path(__file__).resolve().parents[1] / "data"
BEACHES = json.loads((DATA / "beaches.json").read_text("utf-8"))
WX = "https://api.open-meteo.com/v1/forecast"
MR = "https://marine-api.open-meteo.com/v1/marine"

def to_utc(s):  # "YYYY-MM-DDTHH:00"
    return dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)

def main():
    items = []
    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(days=6)

    for b in BEACHES:
        wx = httpx.get(WX, params={
            "latitude": b["lat"], "longitude": b["lon"], "timezone": "UTC",
            "hourly": ["windspeed_10m","winddirection_10m","cloudcover","precipitation"],
            "forecast_days": 6
        }, timeout=25).json()["hourly"]

        mr = httpx.get(MR, params={
            "latitude": b["lat"], "longitude": b["lon"], "timezone": "UTC",
            "cell_selection":"sea",
            "hourly": ["wave_height","wave_period","wave_direction","sea_surface_temperature"],
            "forecast_days": 6
        }, timeout=25).json()["hourly"]

        times = [to_utc(t) for t in wx["time"]]
        for i, t in enumerate(times):
            if not (now <= t <= horizon): 
                continue
            beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0))
            cond = Conditions(
                wind_speed_ms = (wx["windspeed_10m"][i] or 0) / 3.6,  # km/h -> m/s
                wind_from_deg = wx["winddirection_10m"][i] or 0,
                wave_hs_m     = mr.get("wave_height",[None]*len(times))[i],
                wave_tp_s     = mr.get("wave_period",[None]*len(times))[i],
                cloud_pct     = wx["cloudcover"][i] or 0,
                precip_mm     = wx["precipitation"][i] or 0,
                water_temp_c  = mr.get("sea_surface_temperature",[None]*len(times))[i],
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

    out = DATA / "scores_demo.json"
    out.write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")
    print(f"Escrevi {len(items)} scores → {out}")

if __name__ == "__main__":
    main()
