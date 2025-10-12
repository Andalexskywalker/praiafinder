from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pathlib import Path
import json, math, datetime as dt

from .scoring import Beach, Conditions, score_family, score_surf, score_snorkel

app = FastAPI(title="PraiaFinder API", version="0.3.1")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"
SCORES_PATH = DATA_DIR / "scores_demo.json"

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default

def parse_ts(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z","+00:00")).astimezone(dt.timezone.utc)

def nearest_score(scores, beach_id: str, mode: str, target: dt.datetime):
    candidates = []
    for it in scores:
        if it.get("beach_id") != beach_id or it.get("mode") != mode:
            continue
        its = parse_ts(it["ts"])
        candidates.append((its, it))
    if not candidates:
        return None, None

    # 1) tenta primeira previsão >= target (preferir “para a frente”)
    future = [(ts, it) for ts, it in candidates if ts >= target]
    if future:
        ts, it = min(future, key=lambda x: (x[0] - target))
        return it, ts

    # 2) senão, usa a mais próxima (para trás)
    ts, it = max(candidates, key=lambda x: x[0])  # última disponível
    return it, ts

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1); dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@app.get("/health")
def health(): return {"status":"ok"}

@app.get("/beaches")
def beaches():
    return load_json(BEACHES_PATH, [])

@app.get("/top")
def top(
    lat: float | None = None, lon: float | None = None, radius_km: int = 40,
    zone: str | None = None, when: str | None = None,
    mode: str = Query("familia", pattern="^(familia|surf|snorkel)$"), limit: int = 5,
):
    beaches = load_json(BEACHES_PATH, [])
    scores  = load_json(SCORES_PATH, [])

    target_ts = parse_ts(when) if when else dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)

    # filtrar candidatas
    cand = beaches
    if zone:
        z = zone.lower()
        cand = [b for b in cand if z in [t.lower() for t in b.get("zone_tags", [])]]
    if lat is not None and lon is not None:
        for b in cand:
            b["dist_km"] = round(haversine_km(lat, lon, b["lat"], b["lon"]), 1)
        cand = [b for b in cand if b["dist_km"] <= radius_km]
    else:
        for b in cand: b["dist_km"] = None

    out = []
    for b in cand:
        item, used_dt = (None, None)
        if scores:
            item, used_dt = nearest_score(scores, b["id"], mode, target_ts)

        if item:
            score = item["score"]; breakdown = item.get("breakdown", {})
            reasons = ["score via batch (Open-Meteo)"]
            used_ts = used_dt.isoformat().replace("+00:00","Z")
        else:
            beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0.0))
            cond = Conditions(3.0, (beach.orientation_deg+180)%360, 0.6, 10.0, 30.0, 0.0, 19.0)
            fn = {"familia": score_family, "surf": score_surf, "snorkel": score_snorkel}[mode]
            score, breakdown = fn(beach, cond)
            reasons = ["fallback demo (sem batch ou fora do horizonte)"]
            used_ts = target_ts.isoformat().replace("+00:00","Z")

        out.append({
            "beach_id": b["id"], "nome": b["nome"], "score": round(score,1),
            "distancia_km": b["dist_km"], "breakdown": breakdown,
            "used_timestamp": used_ts, "reasons": reasons
        })

    out.sort(key=lambda x: x["score"], reverse=True)
    return JSONResponse(out[:limit])
