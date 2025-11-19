import math
from dataclasses import dataclass
from typing import Tuple, Dict, Any

@dataclass
class BeachInfo:
    orientation_deg: float | None
    water_type: str

@dataclass
class Conditions:
    wind_speed_kmh: float
    wind_from_deg: float
    wave_height_m: float | None = None
    wave_period_s: float | None = None
    cloud_pct: float | None = None
    precip_mm: float | None = None
    air_temp_c: float | None = None
    water_temp_c: float | None = None

def clamp(x: float, mn=0.0, mx=1.0) -> float:
    return max(mn, min(mx, x))

def interpolate(x: float, x1: float, y1: float, x2: float, y2: float) -> float:
    if x <= x1: return y1
    if x >= x2: return y2
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1)

def calc_offshore_factor(wind_dir: float | None, beach_ori: float | None) -> float:
    if wind_dir is None or beach_ori is None:
        return 0.5
    diff = abs((wind_dir - beach_ori + 180) % 360 - 180)
    return (1 - math.cos(math.radians(diff))) / 2.0

def calculate_score(beach: BeachInfo, c: Conditions, mode: str = "familia") -> Tuple[float, Dict[str, float]]:
    
    air_temp = c.air_temp_c or 15.0
    wind_spd = c.wind_speed_kmh
    
    # --- FIX 1: Abrigo Natural para Rios ---
    # Praias fluviais geralmente estão em vales ou protegidas por árvores.
    # O vento medido a 10m (meteo) é muito mais forte do que na toalha.
    if beach.water_type == "fluvial":
        wind_spd = wind_spd * 0.6  # Reduzimos 40% da força do vento
    
    # --- TEMPERATURE GATING (Mantemos a lógica de inverno) ---
    score_cap = 10.0
    if mode == "familia":
        if air_temp < 16.0: score_cap = 4.5
        elif air_temp < 19.0: score_cap = 6.5
        elif air_temp < 22.0: score_cap = 8.0
        elif air_temp < 25.0: score_cap = 9.0
    else: # Surf
        if air_temp < 12.0: score_cap = 6.0
        elif air_temp < 16.0: score_cap = 8.0

    # --- VENTO ---
    offshore = calc_offshore_factor(c.wind_from_deg, beach.orientation_deg)
    score_vento = 0.0

    if mode == "surf":
        # Surf logic (Offshore é rei)
        if offshore > 0.7: score_vento = interpolate(wind_spd, 5, 1.0, 35, 0.2)
        else: score_vento = interpolate(wind_spd, 5, 1.0, 20, 0.0)
    else:
        # Família logic
        # Ajuste térmico: se estiver frio, toleramos menos vento
        wind_tolerance_factor = interpolate(air_temp, 15, 0.7, 30, 1.2)
        
        # Vento 0 é 10. Vento 20 é 0.
        # Com o fix fluvial, um vento real de 20km/h num rio conta como 12km/h.
        limit = 20 * wind_tolerance_factor
        score_vento = interpolate(wind_spd, 2, 1.0, limit, 0.0)

    # --- ONDAS (FIX 2: Mais rigoroso) ---
    score_ondas = 0.0
    
    # Se não houver dados (Rio ou Falha API Mar), assumimos:
    # Familia: Bom (1.0) | Surf: Mau (0.2)
    default_wave_score = 1.0 if mode == "familia" else 0.2

    if beach.water_type == "mar":
        if c.wave_height_m is not None:
            h = c.wave_height_m
            if mode == "surf":
                if h < 0.5: score_ondas = interpolate(h, 0, 0.0, 0.5, 0.4)
                elif h <= 2.0: score_ondas = 1.0 
                else: score_ondas = interpolate(h, 2.0, 1.0, 5.0, 0.2)
                if c.wave_period_s and c.wave_period_s > 9:
                    score_ondas = clamp(score_ondas * 1.15)
            else:
                # Família (Rigoroso!)
                # 0.1m = 1.0 (Piscina)
                # 0.5m = 0.7 (Ondulação leve)
                # 1.0m = 0.3 (Já assusta crianças)
                # 1.5m = 0.0 (Perigoso)
                score_ondas = interpolate(h, 0.1, 1.0, 1.5, 0.0)
        else:
            score_ondas = default_wave_score
    else:
        # Fluvial
        score_ondas = 1.0 # Rios não têm ondas (geralmente)

    # --- METEO ---
    real_feel = air_temp - (wind_spd * 0.15)
    if real_feel < 20: score_temp = interpolate(real_feel, 14, 0.0, 20, 0.6)
    else: score_temp = interpolate(real_feel, 20, 0.6, 26, 1.0)

    cloud_pen = interpolate(c.cloud_pct or 0, 20, 1.0, 100, 0.2)
    rain_pen = 1.0
    if c.precip_mm and c.precip_mm > 0.2: rain_pen = 0.0

    score_meteo = (score_temp * 0.8 + cloud_pen * 0.2) * rain_pen
    if mode == "surf": score_meteo = clamp(score_meteo + 0.4)

    # --- ÁGUA ---
    score_agua = 0.5
    if c.water_temp_c:
        score_agua = interpolate(c.water_temp_c, 14, 0.2, 22, 1.0)

    # --- FINAL ---
    if mode == "surf":
        final = (score_ondas * 0.5) + (score_vento * 0.3) + (score_meteo * 0.1) + (score_agua * 0.1)
    else:
        final = (score_meteo * 0.50) + (score_vento * 0.30) + (score_ondas * 0.15) + (score_agua * 0.05)

    final_score = min(final * 10.0, score_cap)
    
    # --- FIX 3: Limpar Breakdown para UI ---
    breakdown = {
        "vento": round(score_vento * 10, 1),
        "meteo": round(score_meteo * 10, 1),
        "agua": round(score_agua * 10, 1),
    }
    
    # Só mostramos ondas se for mar
    if beach.water_type == "mar":
        breakdown["ondas"] = round(score_ondas * 10, 1)
        
    # Só mostramos Offshore se for Surf (Família não quer saber)
    if mode == "surf" and beach.water_type == "mar":
        breakdown["offshore"] = round(offshore * 10, 1)
        
    return round(final_score, 1), breakdown