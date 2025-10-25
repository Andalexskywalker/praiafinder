from pathlib import Path
import json, math, re
from typing import Iterable, Tuple, List, Dict, Any

BEACHES = Path("data/beaches.json")

# Preferir as linhas OSM 'coastlines' (só costa oceânica)
COAST_GEOJSON = Path("data/derived/coast_pt.geojson")
COAST_SHP_DIR = Path("data/raw/osm_coastlines")
PREFER_SHAPEFILE = True  # << podes pôr False se confiares no teu geojson

# Limiar mar vs fluvial (km)
FLUVIAL_THRESHOLD_KM = 8.0

# ---------- util ----------

def _pt_seg_dist_sq(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Distância^2 ponto→segmento, escalando lon por cos(lat) (aprox. planar)."""
    k = math.cos(math.radians((y1 + y2) / 2.0))
    px_, x1_, x2_ = px * k, x1 * k, x2 * k
    dx, dy = x2_ - x1_, y2 - y1
    if dx == 0 and dy == 0:
        return (px_ - x1_) ** 2 + (py - y1) ** 2
    t = ((px_ - x1_) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    projx, projy = x1_ + t * dx, y1 + t * dy
    return (px_ - projx) ** 2 + (py - projy) ** 2

def _bearing(x1: float, y1: float, x2: float, y2: float) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (x1, y1, x2, y2))
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.cos(lat2) * math.cos(dlon) - math.sin(lat1) * math.sin(lat2)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0

def _deg_to_km(deg: float) -> float:
    return 111.32 * deg  # já escalámos lon em _pt_seg_dist_sq

def _in_pt_bbox(lon: float, lat: float) -> bool:
    return (
        (-10.0 <= lon <= -6.0 and 36.5 <= lat <= 42.2) or   # continente
        (-31.7 <= lon <= -24.2 and 36.5 <= lat <= 40.1) or  # açores
        (-17.6 <= lon <= -15.0 and 31.0 <= lat <= 33.5)     # madeira
    )

# ---------- leitura de segmentos ----------

def _segments_from_geojson(path: Path) -> Iterable[Tuple[float, float, float, float]]:
    """Extrai segmentos da costa. Em Polygon/MultiPolygon — anel exterior only."""
    obj = json.loads(path.read_text("utf-8"))
    feats = obj["features"] if obj.get("type") == "FeatureCollection" else [obj]

    def _emit_line(coords):
        for i in range(len(coords) - 1):
            (x1, y1), (x2, y2) = coords[i], coords[i + 1]
            yield (x1, y1, x2, y2)

    for ft in feats:
        # Se houver metadados, tenta ignorar features que não são costa
        props = ft.get("properties") or {}
        tagvals = " ".join(str(v).lower() for v in props.values())
        if any(w in tagvals for w in ("lake", "reservoir", "lagoon", "dam")):
            continue  # não queremos lagos
        g = ft.get("geometry") or {}
        t = (g.get("type") or "").lower()
        if t == "linestring":
            yield from _emit_line(g.get("coordinates") or [])
        elif t == "multilinestring":
            for line in g.get("coordinates") or []:
                yield from _emit_line(line)
        elif t == "polygon":
            rings = g.get("coordinates") or []
            if rings:
                yield from _emit_line(rings[0])      # exterior only
        elif t == "multipolygon":
            for poly in g.get("coordinates") or []:
                if poly:
                    yield from _emit_line(poly[0])   # exterior only

def _segments_from_shapefile(dirpath: Path) -> Iterable[Tuple[float, float, float, float]]:
    import shapefile  # pyshp
    shp = next(iter(dirpath.glob("*.shp")), None)
    if not shp:
        raise FileNotFoundError(
            f"Nenhum .shp em {dirpath}. Esperava OSM coastlines (lines.shp/.dbf/.shx/.prj/.cpg)."
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

def _load_segments() -> List[Tuple[float, float, float, float]]:
    if PREFER_SHAPEFILE and COAST_SHP_DIR.exists():
        return list(_segments_from_shapefile(COAST_SHP_DIR))
    if COAST_GEOJSON.exists():
        segs = list(_segments_from_geojson(COAST_GEOJSON))
        if segs:
            return segs
    # fallback final
    return list(_segments_from_shapefile(COAST_SHP_DIR))

# ---------- nearest (2 passes) ----------

def _nearest_distance_km(px: float, py: float, segments: List[Tuple[float, float, float, float]]) -> float:
    """Primeiro passa com filtro de caixa ±0.5°, depois full-scan se nada encontrado."""
    best = 1e300
    # pass 1: caixa rápida
    for (x1, y1, x2, y2) in segments:
        if not (min(x1, x2) - 0.5 <= px <= max(x1, x2) + 0.5 and
                min(y1, y2) - 0.5 <= py <= max(y1, y2) + 0.5):
            continue
        d2 = _pt_seg_dist_sq(px, py, x1, y1, x2, y2)
        if d2 < best:
            best = d2
    # pass 2: full scan se nada perto
    if best >= 1e299:
        for (x1, y1, x2, y2) in segments:
            d2 = _pt_seg_dist_sq(px, py, x1, y1, x2, y2)
            if d2 < best:
                best = d2
    if best >= 1e299:
        return float("inf")
    return _deg_to_km(math.sqrt(best))

# ---------- fallback seguro ----------

def _fallback_classify_name_tags(b: dict) -> str:
    """Só fluvial com sinais fortes (inclui abreviações ALB., ALB)."""
    text = f"{(b.get('nome') or '')} {' '.join(b.get('zone_tags', []))}".lower()

    # sinais fortes
    if "praia fluvial" in text or re.search(r"\bfluvial\b", text):
        return "fluvial"
    if re.search(r"\b(barragem|lago)\b", text):
        return "fluvial"
    # albufeira de/do/da OU abreviações 'alb.' 'alb ' 'albuf.'
    if re.search(r"\balbufeira\s+(de|do|da)\b", text) or re.search(r"\balb\.?(\s|$)", text) or "albuf." in text:
        return "fluvial"

    return "mar"

# ---------- principal ----------

def derive_orientation():
    beaches: List[Dict[str, Any]] = json.loads(BEACHES.read_text("utf-8"))
    segments = _load_segments()
    print(f"Segments carregados: {len(segments)}")

    updated: List[Dict[str, Any]] = []
    for b in beaches:
        px, py = b["lon"], b["lat"]

        # 1) distância ao mar (sempre tenta encontrar)
        dist_km = _nearest_distance_km(px, py, segments)

        # 2) tipo por distância (não respeitar dados anteriores)
        if math.isinf(dist_km):
            tipo = _fallback_classify_name_tags(b)  # só fluvial com sinais fortes
        else:
            tipo = "fluvial" if dist_km >= FLUVIAL_THRESHOLD_KM else "mar"

        # 3) orientação (só para mar)
        if not math.isinf(dist_km):
            # recuperar segmento usado (segunda medição com best tracking)
            best = 1e300
            best_seg = None
            for (x1, y1, x2, y2) in segments:
                d2 = _pt_seg_dist_sq(px, py, x1, y1, x2, y2)
                if d2 < best:
                    best = d2; best_seg = (x1, y1, x2, y2)
            if tipo == "mar" and best_seg:
                x1, y1, x2, y2 = best_seg
                tang = _bearing(x1, y1, x2, y2)
                orient_deg = int(round((tang - 90.0) % 360.0))
            else:
                orient_deg = None
        else:
            orient_deg = None

        # 4) escrever
        b["water_type"] = tipo
        b["tipo"] = tipo          # remove se já não precisares deste campo
        b["dist_mar_km"] = None if math.isinf(dist_km) else round(dist_km, 2)
        b["orientacao_graus"] = orient_deg

        updated.append(b)

    BEACHES.write_text(json.dumps(updated, ensure_ascii=False, indent=2), "utf-8")
    print(f"Atualizadas {len(updated)} praias (water_type/tipo, dist_mar_km, orientacao_graus)")

if __name__ == "__main__":
    derive_orientation()
