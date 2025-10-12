import math
from dataclasses import dataclass

@dataclass
class Beach:
    orientation_deg: float  # 0..360, para fora do areal
    shelter: float = 0.0    # 0..1

@dataclass
class Conditions:
    wind_speed_ms: float
    wind_from_deg: float
    wave_hs_m: float | None = None
    wave_tp_s: float | None = None
    cloud_pct: float | None = None
    precip_mm: float | None = None
    water_temp_c: float | None = None

def ang_diff(a, b):
    d = abs((a - b + 180) % 360 - 180)
    return d

def offshore_factor(wind_from_deg, beach_orientation_deg):
    target = (beach_orientation_deg + 180) % 360
    return (1 + math.cos(math.radians(ang_diff(wind_from_deg, target)))) / 2

def tri(x, a, b, c):
    if x <= a or x >= c:
        return 0.0
    if x == b:
        return 1.0
    return (x - a) / (b - a) if x < b else (c - x) / (c - b)

def clamp01(x):
    return max(0.0, min(1.0, x))

def score_family(beach: Beach, c: Conditions):
    off = offshore_factor(c.wind_from_deg, beach.orientation_deg)
    vento_ok = clamp01(tri(c.wind_speed_ms, 0, 3, 6) * (0.7*off + 0.3))
    onda_ok = 0.0 if c.wave_hs_m is None else tri(c.wave_hs_m, 0.1, 0.4, 0.8)
    meteo_ok = 0.0
    if c.cloud_pct is not None:
        meteo_ok += 0.5 * tri(100 - c.cloud_pct, 0, 20, 40)
    if c.water_temp_c is not None:
        meteo_ok += 0.3 * tri(c.water_temp_c, 17, 20, 23)
    if c.precip_mm is not None:
        meteo_ok += 0.2 * clamp01(1 - min(c.precip_mm/2.0, 1))
    score = 100 * (0.5*vento_ok + 0.3*onda_ok + 0.2*meteo_ok)
    return score, {"vento": round(vento_ok,2), "onda": round(onda_ok,2), "meteo": round(meteo_ok,2), "offshore": round(off,2)}

def score_surf(beach: Beach, c: Conditions):
    off = offshore_factor(c.wind_from_deg, beach.orientation_deg)
    onda_ok = 0.7 * tri(c.wave_hs_m or 0, 1.0, 1.8, 2.5) + 0.3 * tri(c.wave_tp_s or 0, 8, 11, 15)
    vento_ok = clamp01(tri(c.wind_speed_ms, 0, 5, 9) * (0.6*off + 0.4))
    meteo_ok = 0.0
    if c.cloud_pct is not None:
        meteo_ok += 0.5 * tri(100 - c.cloud_pct, 0, 40, 70)
    if c.precip_mm is not None:
        meteo_ok += 0.5 * clamp01(1 - min(c.precip_mm/2.0, 1))
    score = 100 * (0.2*vento_ok + 0.6*onda_ok + 0.2*meteo_ok)
    return score, {"vento": round(vento_ok,2), "onda": round(onda_ok,2), "meteo": round(meteo_ok,2), "offshore": round(off,2)}

def score_snorkel(beach: Beach, c: Conditions):
    off = offshore_factor(c.wind_from_deg, beach.orientation_deg)
    vento_ok = clamp01(tri(c.wind_speed_ms, 0, 2, 4) * (0.8*off + 0.2))
    onda_ok = 0.0 if c.wave_hs_m is None else tri(c.wave_hs_m, 0.0, 0.3, 0.5)
    meteo_ok = 0.0
    if c.cloud_pct is not None:
        meteo_ok += 0.6 * tri(100 - c.cloud_pct, 0, 30, 60)
    if c.precip_mm is not None:
        meteo_ok += 0.4 * clamp01(1 - min(c.precip_mm/2.0, 1))
    score = 100 * (0.4*vento_ok + 0.3*onda_ok + 0.3*meteo_ok)
    return score, {"vento": round(vento_ok,2), "onda": round(onda_ok,2), "meteo": round(meteo_ok,2), "offshore": round(off,2)}
