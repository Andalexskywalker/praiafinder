from pathlib import Path
import json, math
from typing import Iterable, Tuple, List, Dict, Any

BEACHES = Path("data/beaches.json")

# Fonte preferida (leve, já cortada a PT via mapshaper)
COAST_GEOJSON = Path("data/derived/coast_pt.geojson")
# Fallback (OSM coastlines unzipadas: lines.shp/.dbf/.shx/.prj/.cpg)
COAST_SHP_DIR = Path("data/raw/osm_coastlines")

# Limite para inferir fluvial vs mar (km)
FLUVIAL_THRESHOLD_KM = 8.0

# ---------- util ----------

def _pt_seg_dist_sq(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float]:
    """Distância ao quadrado ponto→segmento, escalando a longitude por cos(lat) (aprox. planar).
    Devolve (dist2_em_graus^2, t)."""
    k = math.cos(math.radians((y1 + y2) / 2.0))
    px_, x1_, x2_ = px * k, x1 * k, x2 * k
    dx, dy = x2_ - x1_, y2 - y1
    if dx == 0 and dy == 0:
        return (px_ - x1_) ** 2 + (py - y1) ** 2, 0.0
    t = ((px_ - x1_) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    projx, projy = x1_ + t * dx, y1 + t * dy
    return (px_ - projx) ** 2 + (py - projy) ** 2, t


def _bearing(x1: float, y1: float, x2: float, y2: float) -> float:
    """Azimute (graus) de (x1,y1) → (x2,y2) em lon/lat."""
    lon1, lat1, lon2, lat2 = map(math.radians, (x1, y1, x2, y2))
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.cos(lat2) * math.cos(dlon) - math.sin(lat1) * math.sin(lat2)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _deg_to_km(lat: float, deg: float) -> float:
    """Converte graus (distância planar aprox) → km (1° ~ 111 km)."""
    # usa 111.32 km/deg (ok para PT); lat não é usado porque já escalámos a lon no _pt_seg_dist_sq
    return 111.32 * deg


def _in_pt_bbox(lon: float, lat: float) -> bool:
    # caixas largas para PT + arquipélagos (fallback para shapefile global)
    return (
        (-10.0 <= lon <= -6.0 and 36.5 <= lat <= 42.2) or
        (-31.7 <= lon <= -24.2 and 36.5 <= lat <= 40.1) or
        (-17.6 <= lon <= -15.0 and 31.0 <= lat <= 33.5)
    )

# ---------- leitura de segmentos ----------

def _segments_from_geojson(path: Path) -> Iterable[Tuple[float,float,float,float]]:
    obj = json.loads(path.read_text("utf-8"))
    feats = obj["features"] if obj.get("type") == "FeatureCollection" else [obj]
    for ft in feats:
        g = ft.get("geometry") or {}
        t = (g.get("type") or "").lower()
        if t == "linestring":
            c = g.get("coordinates") or []
            for i in range(len(c) - 1):
                (x1, y1), (x2, y2) = c[i], c[i + 1]
                yield (x1, y1, x2, y2)
        elif t == "multilinestring":
            for line in g.get("coordinates") or []:
                for i in range(len(line) - 1):
                    (x1, y1), (x2, y2) = line[i], line[i + 1]
                    yield (x1, y1, x2, y2)


def _segments_from_shapefile(dirpath: Path) -> Iterable[Tuple[float,float,float,float]]:
    import shapefile  # pyshp
    shp = next(iter(dirpath.glob("*.shp")), None)
    if not shp:
        raise FileNotFoundError(
            f"Nenhum .shp encontrado em {dirpath} (esperava OSM coastlines unzipados: lines.shp/.dbf/.shx/.prj/.cpg)."
        )
    r = shapefile.Reader(str(shp))
    for sh in r.shapes():
        pts = sh.points
        parts = list(sh.parts) + [len(pts)]
        for a, b in zip(parts[:-1], parts[1:]):
            seq = pts[a:b]
            for i in range(len(seq) - 1):
                x1, y1 = seq[i]
                x2, y2 = seq[i + 1]
                if _in_pt_bbox(x1, y1) or _in_pt_bbox(x2, y2):
                    yield (x1, y1, x2, y2)


def _load_segments() -> List[Tuple[float,float,float,float]]:
    if COAST_GEOJSON.exists():
        segs = list(_segments_from_geojson(COAST_GEOJSON))
        # GeoJSON já vem cortado a PT; ótimo.
        return segs
    # Fallback
    return list(_segments_from_shapefile(COAST_SHP_DIR))

# ---------- principal ----------

def derive_orientation():
    beaches: List[Dict[str, Any]] = json.loads(BEACHES.read_text("utf-8"))
    segments = _load_segments()
    print(f"Segments carregados: {len(segments)}")

    updated: List[Dict[str, Any]] = []
    for b in beaches:
        px, py = b["lon"], b["lat"]

        # 1) encontra segmento de costa mais próximo
        best_d2 = 1e300
        best_idx = -1
        for idx, (x1, y1, x2, y2) in enumerate(segments):
            # filtro grossa caixa local para acelerar
            if not (min(x1, x2) - 0.25 <= px <= max(x1, x2) + 0.25 and
                    min(y1, y2) - 0.25 <= py <= max(y1, y2) + 0.25):
                continue
            d2, _ = _pt_seg_dist_sq(px, py, x1, y1, x2, y2)
            if d2 < best_d2:
                best_d2, best_idx = d2, idx

        # distância em km até à costa (se tivermos segmento)
        if best_idx >= 0 and best_d2 < 1e299:
            dist_deg = math.sqrt(best_d2)
            dist_km = _deg_to_km(py, dist_deg)
        else:
            dist_km = float("inf")  # sem costa próxima

        # 2) determina tipo (respeita override manual)
        tipo = (b.get("tipo") or "").lower()
        if tipo not in ("mar", "fluvial"):
            tipo = "fluvial" if dist_km > FLUVIAL_THRESHOLD_KM else "mar"

        # 3) orientação: só para praias de mar
        if tipo == "mar" and best_idx >= 0:
            x1, y1, x2, y2 = segments[best_idx]
            tang = _bearing(x1, y1, x2, y2)
            normal = (tang - 90.0) % 360.0  # “mar→terra” (troca para +90 se preferires o oposto)
            orient_deg = int(round(normal)) % 360
        else:
            orient_deg = None  # para fluviais, orientação de costa marítima não faz sentido

        # 4) escreve campos
        b["tipo"] = tipo               # "mar" | "fluvial"
        b["dist_mar_km"] = None if math.isinf(dist_km) else round(dist_km, 2)
        b["orientacao_graus"] = orient_deg

        updated.append(b)

    BEACHES.write_text(json.dumps(updated, ensure_ascii=False, indent=2), "utf-8")
    print(f"Atualizadas {len(updated)} praias (tipo, dist_mar_km, orientacao_graus)")

if __name__ == "__main__":
    derive_orientation()
