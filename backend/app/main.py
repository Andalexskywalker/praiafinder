from __future__ import annotations

from fastapi import FastAPI, Query, Response
from fastapi.responses import JSONResponse
from pathlib import Path
from collections import defaultdict
from bisect import bisect_left
import json, math, datetime as dt
from typing import Dict, List, Tuple, Optional

from .scoring import Beach, Conditions, score_family, score_surf, score_snorkel

app = FastAPI(title="PraiaFinder API", version="0.4.0")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"
SCORES_PATH = DATA_DIR / "scores_demo.json"

# ----------------- utils -----------------

SCORE_MAX_BY_MODE: Dict[str, float] = {"familia": 40.0, "surf": 40.0, "snorkel": 40.0}

def cap_score(mode: str, v: float) -> float:
    m = SCORE_MAX_BY_MODE.get(mode, 40.0)
    try:
        x = float(v)
    except Exception:
        x = 0.0
    return max(0.0, min(x, m))

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default

def parse_ts(s: str) -> dt.datetime:
    # aceita "...Z" ou ISO com offset
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(dt.timezone.utc)

def to_iso_z(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1); dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ---- índice para buscar previsões rapidamente por (beach, mode) ----
IndexType = Dict[Tuple[str, str], List[Tuple[dt.datetime, dict]]]

def build_index(scores: List[dict]) -> IndexType:
    idx: IndexType = defaultdict(list)
    for it in scores:
        b = it.get("beach_id"); m = it.get("mode"); ts = it.get("ts")
        if not (b and m and ts): 
            continue
        try:
            tt = parse_ts(ts)
        except Exception:
            continue
        idx[(b, m)].append((tt, it))
    # mantém ordenado por timestamp para usar bisect
    for k in idx:
        idx[k].sort(key=lambda x: x[0])
    return idx

def nearest_from_index(idx: IndexType, beach_id: str, mode: str, target: dt.datetime):
    arr = idx.get((beach_id, mode))
    if not arr:
        return None, None
    times = [ts for ts, _ in arr]
    i = bisect_left(times, target)
    if i < len(arr):         # preferência por previsão à frente do alvo
        ts, it = arr[i]
        return it, ts
    # senão, devolve a última disponível (para trás)
    ts, it = arr[-1]
    return it, ts

# ----------------- endpoints -----------------

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/beaches")
def beaches():
    return load_json(BEACHES_PATH, [])

# ... imports e helpers que já te dei ...

@app.get("/top")
def top(
    response: Response,
    lat: float | None = None, lon: float | None = None, radius_km: int = 40,
    zone: str | None = None, when: str | None = None,
    mode: str = Query("familia", pattern="^(familia|surf|snorkel)$"),
    order: str = Query("score", pattern="^(score|dist)$"),  # 'score' = nota
    limit: int = 5,
):
    beaches = load_json(BEACHES_PATH, [])
    scores  = load_json(SCORES_PATH, [])

    try:
        last_ts = max(parse_ts(it["ts"]) for it in scores) if scores else None
        if last_ts: response.headers["x-available-until"] = to_iso_z(last_ts)
    except Exception: pass

    scores_idx = build_index(scores) if scores else {}
    target_ts = parse_ts(when) if when else dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)

    cand = beaches
    if zone:
        z = zone.lower()
        cand = [b for b in cand if z in [t.lower() for t in b.get("zone_tags", [])]]

    if lat is not None and lon is not None:
        for b in cand: b["dist_km"] = round(haversine_km(lat, lon, b["lat"], b["lon"]), 1)
        if radius_km and radius_km > 0:
            cand = [b for b in cand if b["dist_km"] <= radius_km]
    else:
        for b in cand: b["dist_km"] = None

    out = []
    for b in cand:
        item, used_dt = (None, None)
        if scores_idx:
            item, used_dt = nearest_from_index(scores_idx, b["id"], mode, target_ts)

        if item:
            score40 = float(item.get("score", 0.0))
            nota10  = float(item.get("nota", round(score40/4.0, 1)))
            breakdown = item.get("breakdown", {})
            water_type = item.get("water_type") or "mar"
            used_ts = to_iso_z(used_dt)
        else:
            # fallback simples (sem batch)
            beach = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0.0))
            cond = Conditions(3.0, (beach.orientation_deg+180)%360, 0.6, 10.0, 30.0, 0.0, 19.0)
            fn = {"familia": score_family, "surf": score_surf, "snorkel": score_snorkel}[mode]
            raw, breakdown = fn(beach, cond)
            score40 = float(raw)
            nota10  = round(score40/4.0, 1)
            water_type = "mar"
            used_ts = to_iso_z(target_ts)

        out.append({
            "beach_id": b["id"],
            "nome": b["nome"],
            "nota": max(0.0, min(10.0, nota10)),
            "score": max(0.0, min(40.0, score40)),  # compat
            "distancia_km": b["dist_km"],
            "breakdown": breakdown,
            "used_timestamp": used_ts,
            "water_type": water_type,
        })

    if order == "dist":
        out.sort(key=lambda x: (x["distancia_km"] is None, x["distancia_km"] if x["distancia_km"] is not None else 0.0))
    else:
        out.sort(key=lambda x: x["nota"], reverse=True)

    return JSONResponse(out[: max(1, min(limit, 50))])

