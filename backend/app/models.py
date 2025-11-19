from typing import Literal, List, Optional, Dict, Any
from pydantic import BaseModel, Field

# Modos suportados
Mode = Literal["familia", "surf"]
WaterType = Literal["mar", "fluvial"]
WaterFilter = Literal["all", "mar", "fluvial"]
SortOrder = Literal["nota", "dist"]

class Beach(BaseModel):
    id: str
    nome: str
    lat: float
    lon: float
    zone_tags: List[str] = []
    water_type: WaterType = "mar"
    orientation_deg: Optional[float] = None  # Para cálculo de vento offshore
    dist_mar_km: Optional[float] = None
    
    # Campos extra que podem vir do JSON
    dist_km: Optional[float] = None  # Calculado em runtime

class ScoreBreakdown(BaseModel):
    vento: float
    meteo: float
    # Campos opcionais dependendo do modo/tipo
    offshore: Optional[float] = None
    ondas: Optional[float] = None
    temp_agua: Optional[float] = None
    
class BeachScore(BaseModel):
    beach_id: str
    nome: str
    nota: float          # 0..10
    score: Optional[float] = None  # Compatibilidade (0..40)
    distancia_km: Optional[float] = None
    water_type: WaterType
    breakdown: Dict[str, float]  # Flexível para UI
    used_timestamp: Optional[str] = None
    reasons: List[str] = []