"""
Descarga el corredor de 5 comunas como UN SOLO grafo unificado usando OSMnx.

Reemplaza el approach anterior (descargar comuna por comuna y combinar con
nx.compose_all), que generaba nodos de borde duplicados y dejaba las comunas
desconectadas entre sí.

Uso:
    python download_corredor.py

Requisitos:
    pip install osmnx requests python-dotenv
"""
import json
import os
import time

import osmnx as ox
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

GRAPHML_PATH = os.path.join(DATA_DIR, "corredor_5_comunas.graphml")
ELEVACIONES_PATH = os.path.join(DATA_DIR, "elevaciones_corredor.json")

COMUNAS = [
    "San Miguel, Región Metropolitana, Chile",
    "Santiago, Región Metropolitana, Chile",
    "Providencia, Región Metropolitana, Chile",
    "Las Condes, Región Metropolitana, Chile",
    "Vitacura, Región Metropolitana, Chile",
]

OPEN_ELEVATION_API = "https://api.open-elevation.com/api/v1/lookup"
BATCH_SIZE = 100


def download_elevaciones(G):
    print("Descargando elevaciones desde Open-Elevation...")
    node_ids = list(G.nodes())
    elevaciones = {}
    total = len(node_ids)

    for i in range(0, total, BATCH_SIZE):
        batch = node_ids[i: i + BATCH_SIZE]
        locations = [
            {"latitude": G.nodes[n]["y"], "longitude": G.nodes[n]["x"]}
            for n in batch
        ]
        try:
            resp = requests.post(
                OPEN_ELEVATION_API,
                json={"locations": locations},
                timeout=30,
            )
            resp.raise_for_status()
            results = resp.json()["results"]
            for node_id, result in zip(batch, results):
                elevaciones[str(node_id)] = result["elevation"]
        except Exception as e:
            print(f"  Error en batch {i}-{i+BATCH_SIZE}: {e} — se omiten")

        if i % (BATCH_SIZE * 10) == 0:
            print(f"  {i}/{total} nodos procesados...")
        time.sleep(0.3)

    return elevaciones


def main():
    inicio = time.time()

    print(f"Descargando grafo unificado para {len(COMUNAS)} comunas...")
    print("Esto puede tardar varios minutos.\n")

    cf = '["highway"~"cycleway|residential|primary|secondary|tertiary|living_street|pedestrian|service|unclassified|trunk_link|path|track|busway"]'
    G = ox.graph_from_place(COMUNAS, network_type="bike", custom_filter=cf)

    print(f"Grafo descargado: {len(G.nodes)} nodos, {len(G.edges)} edges")
    print(f"Guardando en {GRAPHML_PATH}...")
    ox.save_graphml(G, GRAPHML_PATH)
    print("GraphML guardado.\n")

    elevaciones = download_elevaciones(G)
    print(f"\nElevaciones obtenidas: {len(elevaciones)}/{len(G.nodes)} nodos")
    with open(ELEVACIONES_PATH, "w") as f:
        json.dump(elevaciones, f)
    print(f"Elevaciones guardadas en {ELEVACIONES_PATH}")

    duracion = time.time() - inicio
    print(f"\n=== Descarga completa en {duracion/60:.1f} min ===")
    print(f"Nodos: {len(G.nodes)}, Edges: {len(G.edges)}")
    print(f"Siguiente paso: python ingest_corredor.py")


if __name__ == "__main__":
    main()
