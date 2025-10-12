from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pathlib import Path
import json, math, datetime as dt

from .scoring import Beach, Conditions, score_family, score_surf, score_snorkel

app = FastAPI(title="PraiaFinder API", version="0.2.0")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"
SCORES_PATH = DATA_DIR / "scores_demo.json"

with open(BEACHES_PATH, "r", encoding="utf-8") as f:
    BEACHES = json.load(f)

def parse_ts(s: str) -> dt.datetime:
    if s.endswith("Z"):
        s = s.replace("Z", "+00:00")
    return dt.datetime.fromisoformat(s)

def nearest_score(scores, beach_id: str, mode: str, target: dt.datetime):
    best, best_dt = None, None
    for it in scores:
        if it.get("beach_id") != beach_id or it.get("mode") != mode:
            continue
        its = parse_ts(it["ts"])
        if best is None or abs(its - target) < abs(best_dt - target):
            best, best_dt = it, its
    return best

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/beaches")
def beaches():
    return BEACHES

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
    target_ts = dt.datetime.fromisoformat(when) if when else dt.datetime.utcnow()
    target_ts = (target_ts.replace(tzinfo=dt.timezone.utc)
                 if target_ts.tzinfo is None else target_ts.astimezone(dt.timezone.utc))

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

    scores = []
    if SCORES_PATH.exists():
        try:
            scores = json.loads(SCORES_PATH.read_text("utf-8"))
        except Exception:
            scores = []

    results = []
    for b in candidates:
        item = nearest_score(scores, b["id"], mode, target_ts) if scores else None
        if item:
            score = item["score"]
            reasons = ["Score calculado via batch com dados reais"]
            breakdown = item.get("breakdown", {})
            ts = item["ts"]
        else:
            beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0.0))
            cond = Conditions(3.0, (beach.orientation_deg + 180) % 360, 0.6, 10.0, 30.0, 0.0, 19.0)
            fn = {"familia": score_family, "surf": score_surf, "snorkel": score_snorkel}[mode]
            score, breakdown = fn(beach, cond)
            reasons, ts = ["(demo) condições placeholder — corre o batch"], target_ts.isoformat()

        results.append({
            "beach_id": b["id"], "nome": b["nome"], "ts": ts,
            "score": round(score, 1), "distancia_km": b["dist_km"],
            "breakdown": breakdown, "reasons": reasons,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return JSONResponse(results[:limit])
