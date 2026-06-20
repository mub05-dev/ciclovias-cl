"""
Script de ingesta: carga corredor_5_comunas.graphml + elevaciones_corredor.json
a las tablas nodes y edges de PostGIS.

No vuelve a consultar OSM ni Open-Elevation — usa los archivos ya generados
en sesiones anteriores de validación de datos.

Uso:
    python ingest_corredor.py

Requisitos:
    pip install psycopg2-binary networkx osmnx python-dotenv
"""
import os
import json
import time
import networkx as nx
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
GRAPHML_PATH = os.path.join(DATA_DIR, "corredor_5_comunas.graphml")
ELEVACIONES_PATH = os.path.join(DATA_DIR, "elevaciones_corredor.json")

DATABASE_URL = os.environ["DATABASE_URL"]

# Bounding boxes aproximados por comuna (mismos que usamos en la validación)
BBOX_COMUNAS = {
    "San Miguel":   (-33.475, -33.510, -70.630, -70.670),
    "Santiago":     (-33.420, -33.470, -70.630, -70.680),
    "Providencia":  (-33.415, -33.450, -70.590, -70.640),
    "Las Condes":   (-33.370, -33.450, -70.480, -70.600),
    "Vitacura":     (-33.355, -33.400, -70.540, -70.600),
}

# Score por tipo de vía (M02 los va a usar en la función de costo de ruteo)
SCORE_TIPO = {
    "cycleway": 1.0,
    "living_street": 1.3,
    "pedestrian": 1.3,
    "residential": 1.5,
    "service": 1.6,
    "unclassified": 1.8,
    "tertiary": 2.2,
    "tertiary_link": 2.2,
    "secondary": 2.6,
    "secondary_link": 2.6,
    "primary": 3.0,
    "primary_link": 3.0,
    "trunk_link": 3.2,
    "busway": 2.8,
    "path": 1.4,
    "track": 1.7,
}
SCORE_DEFAULT = 2.0  # para tipos de highway no listados arriba


def classify_comuna(lat, lon):
    for nombre, (north, south, east, west) in BBOX_COMUNAS.items():
        if south <= lat <= north and west <= lon <= east:
            return nombre
    return None


def normalize_highway(val):
    """
    networkx serializa listas de Python como strings literales al guardar
    en .graphml (ej: "['service', 'residential']"), no como listas reales.
    Detectamos ese patrón y tomamos el primer valor.
    """
    if isinstance(val, list):
        return val[0]
    if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
        import ast
        try:
            parsed = ast.literal_eval(val)
            if isinstance(parsed, list) and parsed:
                return parsed[0]
        except (ValueError, SyntaxError):
            pass
    return val


def parse_oneway(val):
    """
    Determina si un edge es de sentido único y si está invertido respecto
    a la geometría almacenada (u -> v).

    OSM expresa oneway de varias formas, y networkx además serializa
    booleanos de Python como strings al guardar en .graphml:
    - True / "True" / "yes"  -> sentido único, normal (u -> v permitido)
    - "-1"                   -> sentido único, invertido (solo v -> u permitido)
    - False / "False" / "no" / ausente -> bidireccional

    Devuelve (es_oneway: bool, invertido: bool).
    """
    if val in (True, "True", "yes"):
        return True, False
    if val == "-1":
        return True, True
    return False, False


def main():
    inicio = time.time()
    print(f"Cargando grafo desde {GRAPHML_PATH}...")
    G = nx.read_graphml(GRAPHML_PATH)
    print(f"Grafo cargado: {len(G.nodes)} nodos, {len(G.edges)} edges\n")

    print(f"Cargando elevaciones desde {ELEVACIONES_PATH}...")
    with open(ELEVACIONES_PATH) as f:
        elevaciones_raw = json.load(f)
    elevaciones = {str(k): v for k, v in elevaciones_raw.items()}
    print(f"Elevaciones cargadas: {len(elevaciones)}\n")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # --- Insertar/actualizar nodos ---
    print("Preparando nodos para inserción...")
    nodos_rows = []
    for node_id, data in G.nodes(data=True):
        lat = float(data["y"])
        lon = float(data["x"])
        elevation = elevaciones.get(str(node_id))
        nodos_rows.append((int(node_id), lat, lon, lon, lat, elevation))

    print(f"Insertando {len(nodos_rows)} nodos...")
    execute_values(cur, """
        INSERT INTO nodes (id, lat, lon, geom, elevation)
        VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            geom = EXCLUDED.geom,
            elevation = EXCLUDED.elevation
    """, nodos_rows, template="(%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)")
    conn.commit()
    print("Nodos insertados.\n")

    # --- Calcular y preparar edges (con deduplicación por par de nodos) ---
    print("Preparando edges para inserción (calculando pendiente y score)...")
    node_coords = {n: (float(d["y"]), float(d["x"])) for n, d in G.nodes(data=True)}

    edges_dict = {}  # (u, v) -> row, se queda con el edge más corto si hay duplicados
    omitidos_sin_elevacion = 0
    total_edges_originales = 0

    for u, v, data in G.edges(data=True):
        total_edges_originales += 1
        elev_u = elevaciones.get(str(u))
        elev_v = elevaciones.get(str(v))

        length_m = float(data.get("length", 0))
        highway = normalize_highway(data.get("highway"))

        desnivel = None
        pendiente_pct = None
        if elev_u is not None and elev_v is not None and length_m > 0:
            desnivel = elev_v - elev_u
            # Filtro de calidad: tramos muy cortos generan ruido (ver validación previa)
            if length_m >= 50:
                pendiente_pct = round(100 * desnivel / length_m, 2)
                if abs(pendiente_pct) > 25:
                    pendiente_pct = None  # outlier descartado, igual que en la validación
        else:
            omitidos_sin_elevacion += 1

        score_tipo = SCORE_TIPO.get(highway, SCORE_DEFAULT)
        score_final = score_tipo
        if pendiente_pct is not None:
            score_final = score_tipo * (1 + abs(pendiente_pct) / 10)

        es_oneway, oneway_invertido = parse_oneway(data.get("oneway"))

        lat_u, lon_u = node_coords[u]
        comuna = classify_comuna(lat_u, lon_u)

        # Construir WKT LineString a partir de los dos nodos
        lat_v, lon_v = node_coords[v]
        wkt = f"LINESTRING({lon_u} {lat_u}, {lon_v} {lat_v})"

        row = (int(u), int(v), highway, length_m, wkt,
               desnivel, pendiente_pct, score_tipo, score_final, comuna,
               es_oneway, oneway_invertido)
        key = (int(u), int(v))
        if key not in edges_dict or length_m < edges_dict[key][3]:
            edges_dict[key] = row

    edges_rows = list(edges_dict.values())
    print(f"Edges sin elevación disponible (omitidos del cálculo de pendiente): {omitidos_sin_elevacion}")
    print(f"Insertando {len(edges_rows)} edges (deduplicados de {total_edges_originales})...")

    execute_values(cur, """
        INSERT INTO edges (
            "sourceId", "targetId", highway, "lengthM", geom,
            "desnivelM", "pendientePct", "scoreTipo", "scoreFinal", comuna,
            oneway, oneway_invertido
        )
        VALUES %s
        ON CONFLICT ("sourceId", "targetId") DO UPDATE SET
            highway = EXCLUDED.highway,
            "lengthM" = EXCLUDED."lengthM",
            geom = EXCLUDED.geom,
            "desnivelM" = EXCLUDED."desnivelM",
            "pendientePct" = EXCLUDED."pendientePct",
            "scoreTipo" = EXCLUDED."scoreTipo",
            "scoreFinal" = EXCLUDED."scoreFinal",
            comuna = EXCLUDED.comuna,
            oneway = EXCLUDED.oneway,
            oneway_invertido = EXCLUDED.oneway_invertido
    """, edges_rows, template="(%s, %s, %s, %s, ST_SetSRID(ST_GeomFromText(%s), 4326), %s, %s, %s, %s, %s, %s, %s)")
    conn.commit()
    print("Edges insertados/actualizados (idempotente).\n")

    # --- Registrar el job de ingesta ---
    duracion_ms = int((time.time() - inicio) * 1000)
    cur.execute("""
        INSERT INTO jobs_ingesta (comuna, "nodosCount", "edgesCount", "duracionMs", status)
        VALUES (%s, %s, %s, %s, %s)
    """, ("corredor_5_comunas", len(nodos_rows), len(edges_rows), duracion_ms, "success"))
    conn.commit()

    cur.close()
    conn.close()

    print(f"=== Ingesta completa en {duracion_ms / 1000:.1f}s ===")
    print(f"Nodos: {len(nodos_rows)}")
    print(f"Edges: {len(edges_rows)}")


if __name__ == "__main__":
    main()
