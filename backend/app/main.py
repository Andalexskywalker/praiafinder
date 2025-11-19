from contextlib import asynccontextmanager
from pathlib import Path
import json, math, os
from datetime import datetime, timezone
from bisect import bisect_left
from typing import List, Dict, Tuple

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Importar lógica local
from .models import Beach, BeachScore, Mode, WaterFilter, SortOrder
from .scoring import calculate_score, Conditions, BeachInfo

# --- CONFIG ---
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BEACHES_PATH = DATA_DIR / "beaches.json"
SCORES_PATH = DATA_DIR / "scores.json"

# Globais em Memória ( RAM é barata, JSON parsing é caro)
DB_BEACHES: List[Beach] = []
DB_SCORES: Dict[str, List[dict]] = {} # Indexado por beach_id
LAST_UPDATE: datetime | None = None

# --- UTILS ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def load_data():
    """Carrega dados para a RAM no arranque."""
    global DB_BEACHES, DB_SCORES, LAST_UPDATE
    
    print("Loading Beaches...")
    if BEACHES_PATH.exists():
        raw = json.loads(BEACHES_PATH.read_text("utf-8"))
        DB_BEACHES = [Beach(**b) for b in raw]
    
    print("Loading Scores...")
    # Aqui podes adicionar a lógica S3 se quiseres manter
    if SCORES_PATH.exists():
        raw_scores = json.loads(SCORES_PATH.read_text("utf-8"))
        # Indexar scores por ID para lookup O(1)
        temp_idx = {}
        last_ts = datetime.min.replace(tzinfo=timezone.utc)
        
        for s in raw_scores:
            bid = s.get("beach_id")
            if not bid: continue
            
            # Parse TS
            try:
                ts_str = s.get("ts")
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                if ts > last_ts: last_ts = ts
                
                if bid not in temp_idx: temp_idx[bid] = []
                
                # Guardar objeto 'condições' limpo
                # Assumimos que o JSON já tem os campos 'wind_speed', etc.
                # Se o teu JSON de scores tem estrutura diferente, adapta aqui.
                temp_idx[bid].append((ts, s))
            except Exception:
                continue
                
        # Ordenar listas temporais
        for bid in temp_idx:
            temp_idx[bid].sort(key=lambda x: x[0])
            
        DB_SCORES = temp_idx
        LAST_UPDATE = last_ts
        print(f"Loaded scores for {len(DB_SCORES)} beaches. Last data: {LAST_UPDATE}")

# --- LIFESPAN ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    load_data()
    yield
    # Shutdown (se precisares de fechar conexões DB)
    pass

app = FastAPI(title="PraiaFinder Pro", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ENDPOINTS ---

@app.get("/health")
def health():
    return {
        "status": "ok", 
        "beaches": len(DB_BEACHES), 
        "scores_cached": len(DB_SCORES),
        "last_data": LAST_UPDATE.isoformat() if LAST_UPDATE else None
    }

@app.get("/reload")
def reload_data():
    load_data()
    return {"status": "reloaded"}

@app.get("/beaches")
def get_beaches():
    # Retorna JSON leve para frontend (cache first)
    return [b.model_dump(exclude={'dist_km'}) for b in DB_BEACHES]

@app.get("/top", response_model=List[BeachScore])
def get_top_beaches(
    lat: float | None = None,
    lon: float | None = None,
    radius_km: int = 50,
    zone: str | None = None,
    when: str | None = None,
    mode: Mode = "familia",
    water: WaterFilter = "all",
    order: SortOrder = "nota",
    limit: int = 20
):
    # 1. Filtrar Praias (Geo ou Zona)
    candidates = []
    
    if lat is not None and lon is not None:
        # Geo Search
        for b in DB_BEACHES:
            dist = haversine(lat, lon, b.lat, b.lon)
            if dist <= radius_km:
                # Copia leve para não alterar o objeto global
                b_copy = b.model_copy() 
                b_copy.dist_km = round(dist, 1)
                candidates.append(b_copy)
    elif zone:
        # Zone Search
        z = zone.lower()
        for b in DB_BEACHES:
            if z in [t.lower() for t in b.zone_tags]:
                b_copy = b.model_copy()
                b_copy.dist_km = None # Zona não tem distância relativa definida
                candidates.append(b_copy)
    else:
        # Default: mostra tudo (pode ser pesado, limita-se depois)
        candidates = [b.model_copy() for b in DB_BEACHES]

    # 2. Filtrar por Tipo de Água
    if water != "all":
        candidates = [b for b in candidates if b.water_type == water]

    # 3. Calcular Scores
    results = []
    
    # Target Timestamp
    target_ts = datetime.now(timezone.utc)
    if when:
        try:
            target_ts = datetime.fromisoformat(when.replace("Z", "+00:00"))
        except: pass
        
    for b in candidates:
        # Buscar dados meteo
        beach_data = DB_SCORES.get(b.id)
        
        nota = 0.0
        breakdown = {}
        used_ts = None
        
        if beach_data:
            # Encontrar slot temporal mais próximo (Binary Search O(log n))
            times = [x[0] for x in beach_data]
            idx = bisect_left(times, target_ts)
            
            # Escolher o mais próximo entre idx e idx-1
            best_entry = None
            if idx < len(beach_data):
                best_entry = beach_data[idx]
            elif len(beach_data) > 0:
                best_entry = beach_data[-1]
                
            if best_entry:
                ts, raw_data = best_entry
                used_ts = ts.isoformat()
                
                # Converter raw JSON em objeto Conditions
                # Adapta estas chaves ao teu JSON real do OpenMeteo
                cond = Conditions(
                    wind_speed_kmh=raw_data.get("wind_speed", 0) * 3.6, # m/s -> km/h se necessário
                    wind_from_deg=raw_data.get("wind_deg", 0),
                    wave_height_m=raw_data.get("wave_height"),
                    wave_period_s=raw_data.get("wave_period"),
                    cloud_pct=raw_data.get("cloud_cover"),
                    precip_mm=raw_data.get("precip"),
                    air_temp_c=raw_data.get("temp"),
                    water_temp_c=raw_data.get("water_temp")
                )
                
                b_info = BeachInfo(orientation_deg=b.orientation_deg, water_type=b.water_type)
                nota, breakdown = calculate_score(b_info, cond, mode=mode)

        # Adicionar ao resultado
        results.append(BeachScore(
            beach_id=b.id,
            nome=b.nome,
            nota=nota,
            distancia_km=b.dist_km,
            water_type=b.water_type,
            breakdown=breakdown,
            used_timestamp=used_ts
        ))

    # 4. Ordenar e Cortar
    if order == "dist":
        # Empurrar os sem distância (infinito) para o fim
        results.sort(key=lambda x: x.distancia_km if x.distancia_km is not None else 99999)
    else:
        results.sort(key=lambda x: x.nota, reverse=True)
        
    return results[:limit]