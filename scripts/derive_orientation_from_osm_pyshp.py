from pathlib import Path
import json, math
import shapefile  # pyshp

BEACHES = Path("data/beaches.json")
COAST_SHP = Path("data/osm_coastlines/coastlines.shp")

# distância ponto-segmento em plano lon/lat com correção simples de longitude
def _pt_seg_dist_sq(px, py, x1, y1, x2, y2):
    # escala longitude pela latitude média para reduzir distorção
    k = math.cos(math.radians((y1+y2)/2.0))
    px_, x1_, x2_ = px*k, x1*k, x2*k
    # projeção do ponto no segmento
    dx, dy = x2_-x1_, y2-y1
    if dx == 0 and dy == 0:
        return (px_-x1_)**2 + (py-y1)**2
    t = ((px_-x1_)*dx + (py-y1)*dy) / (dx*dx + dy*dy)
    t = max(0.0, min(1.0, t))
    projx, projy = x1_ + t*dx, y1 + t*dy
    return (px_-projx)**2 + (py-projy)**2, t

def _bearing(x1,y1,x2,y2):
    # p1,p2 em lon/lat -> rumo [0..360)
    lon1, lat1, lon2, lat2 = map(math.radians, [x1,y1,x2,y2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1)*math.cos(lat2)*math.cos(dlon) - math.sin(lat1)*math.sin(lat2)
    brng = (math.degrees(math.atan2(x, y)) + 360) % 360
    return brng

def derive_orientation():
    beaches = json.loads(BEACHES.read_text(encoding="utf-8"))
    r = shapefile.Reader(str(COAST_SHP))
    shapes = r.shapes()

    # Pré-filtro: só segmentos próximos de PT (e RA)
    def in_pt_bbox(lon, lat):
        return (
            (-10.0 <= lon <= -6.0 and 36.5 <= lat <= 42.2) or           # Continente
            (-31.7 <= lon <= -24.2 and 36.5 <= lat <= 40.1) or          # Açores
            (-17.6 <= lon <= -15.8 and 32.2 <= lat <= 33.2)             # Madeira
        )

    segments = []
    for sh in shapes:
        pts = sh.points
        parts = list(sh.parts) + [len(pts)]
        for a, b in zip(parts[:-1], parts[1:]):
            seq = pts[a:b]
            for i in range(len(seq)-1):
                x1,y1 = seq[i]
                x2,y2 = seq[i+1]
                if in_pt_bbox(x1,y1) or in_pt_bbox(x2,y2):
                    segments.append((x1,y1,x2,y2))

    print(f"Segments in PT bbox: {len(segments)}")

    updated = []
    for b in beaches:
        px, py = b["lon"], b["lat"]
        best = (1e9, None)  # (dist2, idx)
        # janela pequena para acelerar
        for idx, (x1,y1,x2,y2) in enumerate(segments):
            if not (min(x1,x2)-0.25 <= px <= max(x1,x2)+0.25 and min(y1,y2)-0.25 <= py <= max(y1,y2)+0.25):
                continue
            d2, _ = _pt_seg_dist_sq(px, py, x1, y1, x2, y2)
            if d2 < best[0]:
                best = (d2, idx)
        if best[1] is None:
            # fallback: oeste (270)
            b["orientacao_graus"] = 270
        else:
            x1,y1,x2,y2 = segments[best[1]]
            tang = _bearing(x1,y1,x2,y2)          # rumo da costa
            normal = (tang - 90) % 360            # normal -> exposição do areal
            b["orientacao_graus"] = int(round(normal)) % 360
        updated.append(b)

    BEACHES.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Atualizadas {len(updated)} praias com orientacao_graus")

if __name__ == "__main__":
    derive_orientation()
