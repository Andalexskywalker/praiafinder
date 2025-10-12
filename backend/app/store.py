# backend/app/store.py
from pathlib import Path
import time, json

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES = DATA_DIR / "beaches.json"
SCORES  = DATA_DIR / "scores_demo.json"

_cache = {}

def _load_json(path: Path):
    return json.loads(path.read_text("utf-8"))

def load_beaches():
    m = BEACHES.stat().st_mtime if BEACHES.exists() else 0
    k = ("beaches", m)
    if k not in _cache:
        _cache.clear()
        _cache[k] = _load_json(BEACHES) if BEACHES.exists() else []
    return _cache[k]

def load_scores():
    m = SCORES.stat().st_mtime if SCORES.exists() else 0
    k = ("scores", m)
    if k not in _cache:
        _cache.clear()
        _cache[k] = _load_json(SCORES) if SCORES.exists() else []
    return _cache[k], m  # devolve mtime para "data_source_time"
