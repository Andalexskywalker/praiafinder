# scripts/ingest_apa.py
import argparse, json, re
from pathlib import Path

def slug(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-+", "-", s)

NUTS2_BY_DISTRITO = {
    # NUTS2 "Norte"
    "viana do castelo":"norte","braga":"norte","porto":"norte","vila real":"norte","bragança":"norte",
    # Centro
    "aveiro":"centro","viseu":"centro","guarda":"centro","coimbra":"centro",
    "castelo branco":"centro","leiria":"centro",
    # AML (tratamos como "lisboa")
    "lisboa":"lisboa","setúbal":"lisboa",
    # Alentejo
    "portalegre":"alentejo","évora":"alentejo","beja":"alentejo",
    # Algarve
    "faro":"algarve",
}
def infer_zone(row: dict) -> list[str]:
    # 1) distrito/região/ilha -> zona
    for k in ("distrito","districto","concelho","municipio","município","regiao","região","ilha","arquipelago","arquipélago","regiao_autonoma"):
        v = (row.get(k) or row.get(k.capitalize()) or "").strip().lower()
        if not v: continue
        # regiões autónomas
        if "açor" in v: return ["acores"]
        if "madeira" in v: return ["madeira"]
        if v in NUTS2_BY_DISTRITO: return [NUTS2_BY_DISTRITO[v]]
    # 2) fallback geográfico simples
    lat, lon = float(row.get("lat")), float(row.get("lon"))
    if lat < 33.5 and -17.4 < lon < -16.5: return ["madeira"]
    if 36.5 < lat < 40.1 and -31.5 < lon < -24.5: return ["acores"]
    if lat < 37.4 and -9.2 < lon < -7.3: return ["algarve"]
    if 37.4 <= lat < 38.5 and -9.5 < lon < -7.2: return ["alentejo"]
    if 38.5 <= lat < 39.3 and -9.7 < lon < -8.2: return ["lisboa"]
    if 39.3 <= lat < 41.0: return ["centro"]
    return ["norte"]

def get_lat_lon(row: dict):
    # tenta várias chaves comuns; adapta se o CSV tiver nomes diferentes
    for k_lat, k_lon in [
        ("lat","lon"), ("latitude","longitude"),
        ("lat_wgs84","lon_wgs84"), ("latitude_wgs84","longitude_wgs84"),
        ("y","x")
    ]:
        if k_lat in row and k_lon in row:
            try:
                return float(str(row[k_lat]).replace(",",".")), float(str(row[k_lon]).replace(",","."))
            except: pass
    # GeoJSON inline?
    geom = row.get("geometry") or row.get("geom")
    if isinstance(geom, str) and geom.strip().startswith("{"):
        import json
        g = json.loads(geom)
        if g.get("type") == "Point":
            lon, lat = g["coordinates"]
            return float(lat), float(lon)
    return None, None

def load_table(path: Path):
    if path.suffix.lower() in (".json",".geojson"):
        data = json.loads(path.read_text(encoding="utf-8"))
        # aceitar tanto FeatureCollection como lista simples
        feats = data["features"] if "features" in data else data
        rows = []
        for f in feats:
            props = f.get("properties", f)
            lat, lon = None, None
            if f.get("geometry", {}).get("type") == "Point":
                lon, lat = f["geometry"]["coordinates"]
            if "lat" not in props and lat is not None: props["lat"] = lat
            if "lon" not in props and lon is not None: props["lon"] = lon
            rows.append(props)
        return rows
    else:
        # CSV simples (sem pandas, para evitar deps)
        import csv
        with path.open("r", encoding="utf-8") as f:
            return list(csv.DictReader(f))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Caminho para CSV/GeoJSON da APA (download de dados.gov.pt)")
    ap.add_argument("--out", default="data/beaches.json", help="Ficheiro de saída JSON")
    args = ap.parse_args()

    src = Path(args.input)
    rows = load_table(src)
    out = []
    seen = set()
    for r in rows:
        # nome
        nome = (r.get("nome") or r.get("designacao") or r.get("name") or "").strip()
        if not nome:
            continue
        lat, lon = get_lat_lon(r)
        if lat is None or lon is None:
            continue
        item = {
            "id": slug(f'{nome}-{r.get("concelho") or r.get("municipio") or ""}')[:64],
            "nome": nome,
            "lat": round(float(lat), 6),
            "lon": round(float(lon), 6),
            "zone_tags": infer_zone({"lat":lat,"lon":lon, **r}),
            # a orientação virá noutro passo:
            # "orientacao_graus": 270
        }
        key = (item["nome"].lower(), item["lat"], item["lon"])
        if key in seen: 
            continue
        seen.add(key)
        out.append(item)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrevi {len(out)} praias → {args.out}")

if __name__ == "__main__":
    main()
