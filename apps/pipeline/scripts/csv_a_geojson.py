"""
Convierte el CSV exportado de Postgres (con geometría como texto GeoJSON
en una columna) a un archivo .geojson válido para abrir en kepler.gl.

Uso:
    python csv_a_geojson.py
"""
import csv
import json

INPUT_CSV = "edges_export.csv"
OUTPUT_GEOJSON = "edges_para_kepler.geojson"

features = []
with open(INPUT_CSV, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        geometry = json.loads(row["geometry"])
        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "id": row["id"],
                "highway": row["highway"],
                "comuna": row["comuna"],
                "pendientePct": row["pendientePct"],
                "scoreFinal": row["scoreFinal"],
            }
        })

geojson = {
    "type": "FeatureCollection",
    "features": features,
}

with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
    json.dump(geojson, f)

print(f"Generado {OUTPUT_GEOJSON} con {len(features)} features.")
