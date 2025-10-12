from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pathlib import Path
import json, math, datetime as dt
from .scoring import Beach, Conditions, score_family, score_surf, score_snorkel

app = FastAPI(title="PraiaFinder API", version="0.1.0")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"

with open(BEACHES_PATH, "r", encoding="utf-8") as f:
    BEACHES = json.load(f)

MODES = {"familia": score_family, "surf": score_surf, "snorkel": score_snorkel}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/beaches")
def beaches():
    return BEACHES

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@app.get("/top")
def top(
    lat: float | None = None,
    lon: float | None = None,
    radius_km: int = 40,
    zone: str | None = None,
    when: str | None = None,
    mode: str = Query("familia", pattern="^(familia|surf|snorkel)$"),
    limit: int = 5,
):
    """MVP: filtra por raio (se lat/lon), ou por zone; ordena por score calculado localmente
    com inputs mínimos (placeholder)."""
    # Parse time
    ts = dt.datetime.fromisoformat(when) if when else dt.datetime.utcnow()

    # Selecionar candidatas
    candidates = BEACHES
    if zone:
        z = zone.lower()
        candidates = [b for b in candidates if z in [t.lower() for t in b.get("zone_tags", [])]]
    if lat is not None and lon is not None:
        candidates = [
            b | {"dist_km": round(haversine_km(lat, lon, b["lat"], b["lon"]), 1)}
            for b in candidates
        ]
        candidates = [b for b in candidates if b["dist_km"] <= radius_km]
    else:
        for b in candidates:
            b["dist_km"] = None

    # Placeholder de condições (até ligarmos providers)
    # Por agora: vento leve offshore e ondas moderadas em geral; valores dummy
    results = []
    for b in candidates:
        beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0.0))
        cond = Conditions(
            wind_speed_ms=3.0,
            wind_from_deg=(beach.orientation_deg + 180) % 360,  # offshore simp.
            wave_hs_m=0.6,
            wave_tp_s=10.0,
            cloud_pct=30.0,
            precip_mm=0.0,
            water_temp_c=19.0,
        )
        if mode == "familia":
            score, breakdown = score_family(beach, cond)
        elif mode == "surf":
            score, breakdown = score_surf(beach, cond)
        else:
            score, breakdown = score_snorkel(beach, cond)

        results.append({
            "beach_id": b["id"],
            "nome": b["nome"],
            "ts": ts.isoformat(),
            "score": round(score, 1),
            "distancia_km": b["dist_km"],
            "breakdown": breakdown,
            "reasons": [
                "(demo) condições placeholder — ligar providers no batch",
            ],
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return JSONResponse(results[:limit])
