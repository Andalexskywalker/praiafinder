# backend/app/scoring.py
import math
from dataclasses import dataclass

@dataclass
class Beach:
    orientation_deg: float  # 0..360, direção "para fora" do areal
    shelter: float = 0.0    # 0..1 (usado no batch.wave_component)

@dataclass
class Conditions:
    wind_speed_ms: float
    wind_from_deg: float
    wave_hs_m: float | None = None
    wave_tp_s: float | None = None
    cloud_pct: float | None = None
    precip_mm: float | None = None
    water_temp_c: float | None = None

def ang_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)

def offshore_factor(wind_from_deg: float | None, beach_orientation_deg: float | None) -> float:
    """
    1.0 = totalmente offshore; 0.0 = totalmente onshore.
    Se não houver orientação (p.ex. praia fluvial) ou direção de vento, devolve 0.5 (neutro).
    """
    if wind_from_deg is None or beach_orientation_deg is None:
        return 0.5
    target = (beach_orientation_deg + 180) % 360
    d = abs((wind_from_deg - target + 180) % 360 - 180)
    return (1 + math.cos(math.radians(d))) / 2


def tri(x: float, a: float, b: float, c: float) -> float:
    if x <= a or x >= c: return 0.0
    if x == b: return 1.0
    return (x - a) / (b - a) if x < b else (c - x) / (c - b)

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def score(beach: Beach, c: Conditions):
    off = offshore_factor(c.wind_from_deg, beach.orientation_deg)  # 0..1
    vento_ok = clamp01(tri(c.wind_speed_ms, 0, 3, 6) * (0.7*off + 0.3))
    onda_ok = 0.0 if c.wave_hs_m is None else tri(c.wave_hs_m, 0.1, 0.4, 0.8)
    meteo_ok = 0.0
    if c.cloud_pct is not None:
        meteo_ok += 0.5 * tri(100 - c.cloud_pct, 0, 20, 40)
    if c.water_temp_c is not None:
        meteo_ok += 0.3 * tri(c.water_temp_c, 17, 20, 23)
    if c.precip_mm is not None:
        meteo_ok += 0.2 * clamp01(1 - min(c.precip_mm/2.0, 1))
    score = 100 * (0.25*vento_ok + 0.25*onda_ok + 0.5*meteo_ok)
    # breakdown a 0..10; NÃO incluir "ondas" (o batch preenche isso)
    return score, {
        "vento": round(vento_ok*10, 1),
        "meteo": round(meteo_ok*10, 1),
        "offshore": round(off*10, 1),
        # "ondas" será adicionado no batch se houver mar
    }