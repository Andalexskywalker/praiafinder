from __future__ import annotations

from fastapi import FastAPI, Query, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from collections import defaultdict
from bisect import bisect_left
from typing import Dict, List, Tuple
import os, json, math, datetime as dt
import re

# boto3 é opcional; só usado se tiveres variáveis S3 definidas
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:  # ambiente local sem boto3
    boto3 = None
    BotoCoreError = ClientError = Exception  # type: ignore

from .scoring import Beach, Conditions, score_family, score_surf, score_snorkel

app = FastAPI(title="PraiaFinder API", version="0.5.0")

# --- paths & S3 ---
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"
SCORES_PATH = DATA_DIR / "scores_demo.json"  # fallback local

S3_BUCKET = os.getenv("SCORES_S3_BUCKET")              # ex: praiafinder-prod
S3_KEY    = os.getenv("SCORES_S3_KEY", "scores/scores.json")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGIN", "*")],
    allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
)

# ----------------- utils -----------------

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default

def parse_ts(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(dt.timezone.utc)

def to_iso_z(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1); dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

import re
# ...

def classify_water_type(b: dict) -> str:
    """
    Classifica 'mar' vs 'fluvial' com heurística segura.

    Regras:
    - Respeita campos explícitos (water_type/tipo/...).
    - Fluvial SÓ com sinais fortes: 'praia fluvial', 'fluvial',
      'barragem', 'lago' ou 'albufeira de|do|da ...'.
    - NÃO usar 'interior', 'rio', 'ribeira' como gatilhos (muitos falsos positivos).
    - 'Albufeira' (município) sozinho NÃO conta.
    - Caso não haja sinais fortes → assume 'mar'.
    """

    # 1) Campos explícitos (prioridade)
    for key in ("water_type", "tipo", "tipo_agua", "water_body"):
        v = (b.get(key) or "").strip().lower()
        if v in {"mar", "oceano", "ocean", "sea"}:
            return "mar"
        if v in {"rio", "ribeira", "albufeira", "lago", "fluvial", "fresh", "freshwater"}:
            return "fluvial"

    # 2) Heurística por nome/tags
    name = (b.get("nome") or "").lower()
    tags = " ".join([(t or "").lower() for t in b.get("zone_tags", [])])
    text = f"{name} {tags}"

    # Sinais fortes de fluvial
    if "praia fluvial" in text or re.search(r"\bfluvial\b", text):
        return "fluvial"
    if re.search(r"\b(barragem|lago)\b", text):
        return "fluvial"
    if re.search(r"\balbufeira\s+(de|do|da)\b", text):
        return "fluvial"

    # (Opcional) Sinais de mar — ajudam a desfazer ambiguidades
    if re.search(r"\b(litoral|costa|oceano|mar)\b", text):
        return "mar"

    # Caso contrário, assume mar
    return "mar"


# ---- carregar scores (S3 → fallback local) ----
def load_scores():
    if S3_BUCKET and boto3 is not None:
        try:
            s3 = boto3.client("s3")
            obj = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY)
            return json.loads(obj["Body"].read().decode("utf-8"))
        except (BotoCoreError, ClientError, Exception):
            pass
    return load_json(SCORES_PATH, [])

SCORES_CACHE = load_scores()

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
    for k in idx:
        idx[k].sort(key=lambda x: x[0])
    return idx

def nearest_from_index(idx: IndexType, beach_id: str, mode: str, target: dt.datetime):
    arr = idx.get((beach_id, mode))
    if not arr:
        return None, None
    times = [ts for ts, _ in arr]
    i = bisect_left(times, target)
    if i < len(arr):
        ts, it = arr[i]
        return it, ts
    ts, it = arr[-1]
    return it, ts

# ----------------- endpoints -----------------

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/beaches")
def beaches():
    return load_json(BEACHES_PATH, [])

@app.get("/reload")
def reload():
    global SCORES_CACHE
    SCORES_CACHE = load_scores()
    return {"status": "reloaded", "items": len(SCORES_CACHE)}

@app.get("/top")
def top(
    response: Response,
    lat: float | None = None, lon: float | None = None, radius_km: int = 40,
    zone: str | None = None, when: str | None = None,
    mode: str = Query("familia", pattern="^(familia|surf|snorkel)$"),
    water: str = Query("all", pattern="^(all|mar|fluvial)$"),
    order: str = Query("nota", pattern="^(nota|dist)$"),
    limit: int = 5,
):
    beaches = load_json(BEACHES_PATH, [])
    scores  = SCORES_CACHE  # cache (S3 ou local)

    # Cabeçalho: horizonte disponível
    try:
        last_ts = max(parse_ts(it["ts"]) for it in scores) if scores else None
        if last_ts:
            response.headers["x-available-until"] = to_iso_z(last_ts)
    except Exception:
        pass

    scores_idx = build_index(scores) if scores else {}
    target_ts = parse_ts(when) if when else dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)

    # filtro base
    cand = beaches
    if zone:
        z = zone.lower()
        cand = [b for b in cand if z in [t.lower() for t in b.get("zone_tags", [])]]

    # distância (opcional)
    if lat is not None and lon is not None:
        for b in cand:
            b["dist_km"] = round(haversine_km(lat, lon, b["lat"], b["lon"]), 1)
        if radius_km and radius_km > 0:
            cand = [b for b in cand if b["dist_km"] <= radius_km]
    else:
        for b in cand:
            b["dist_km"] = None

    out = []
    for b in cand:
        wt = classify_water_type(b)
        if water != "all" and wt != water:
            continue

        item, used_dt = (None, None)
        if scores_idx:
            item, used_dt = nearest_from_index(scores_idx, b["id"], mode, target_ts)

        if item:  # batch
            score_compat = item.get("score")  # 0..40
            nota = item.get("nota")
            if nota is None and score_compat is not None:
                try:
                    nota = round(float(score_compat) / 4.0, 1)
                except Exception:
                    nota = None
            breakdown = item.get("breakdown", {})
            used_ts = to_iso_z(used_dt) if used_dt else None
            reasons = ["batch"]
        else:      # fallback leve
            beach_obj = Beach(orientation_deg=b.get("orientacao_graus", 270), shelter=b.get("abrigo", 0.0))
            # condições neutras
            cond = Conditions(3.0, (beach_obj.orientation_deg + 180) % 360, 0.6, 10.0, 30.0, 0.0, 19.0)
            fn = {"familia": score_family, "surf": score_surf, "snorkel": score_snorkel}[mode]
            score100, breakdown = fn(beach_obj, cond)  # 0..100
            nota = round(float(score100) / 10.0, 1)
            score_compat = None
            used_ts = to_iso_z(target_ts)
            reasons = ["fallback"]

        out.append({
            "beach_id": b["id"],
            "nome": b["nome"],
            "nota": nota,                    # 0..10
            "score": score_compat,           # 0..40 (compat, se batch)
            "distancia_km": b.get("dist_km"),
            "breakdown": breakdown,
            "used_timestamp": used_ts,
            "reasons": reasons,
            "water_type": wt,
        })

    # ordenação
    if order == "dist":
        out.sort(key=lambda x: (x["distancia_km"] is None,
                                x["distancia_km"] if x["distancia_km"] is not None else 0.0))
    else:  # "nota"
        out.sort(key=lambda x: (x.get("nota") is None, x.get("nota", 0.0)), reverse=True)

    return JSONResponse(out[: max(1, min(limit, 50))])
