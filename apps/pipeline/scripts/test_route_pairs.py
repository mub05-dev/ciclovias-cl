"""
Pruebas comparadas del M02 / issue #15: corre los 4 modos de ruteo
(short, safe, flat, balanced) contra 5 pares de origen-destino reales
del corredor de 5 comunas, usando el endpoint HTTP real (no SQL directo).

Requisitos: pip install requests
Uso: python test_route_pairs.py
(con el servidor NestJS corriendo en localhost:4000)
"""
import requests
import json

API_URL = "http://localhost:3000/route"

PUNTOS = {
    "San Miguel (Plaza San Miguel)": (-33.4969, -70.6503),
    "Santiago (Plaza de Armas)": (-33.4372, -70.6506),
    "Providencia (Plaza Las Lilas)": (-33.4259, -70.6065),
    "Las Condes (Parque Araucano)": (-33.4036, -70.5694),
    "Vitacura (Parque Bicentenario)": (-33.3897, -70.5969),
}

PARES = [
    ("San Miguel (Plaza San Miguel)", "Santiago (Plaza de Armas)"),
    ("Santiago (Plaza de Armas)", "Providencia (Plaza Las Lilas)"),
    ("Providencia (Plaza Las Lilas)", "Las Condes (Parque Araucano)"),
    ("Las Condes (Parque Araucano)", "Vitacura (Parque Bicentenario)"),
    ("San Miguel (Plaza San Miguel)", "Vitacura (Parque Bicentenario)"),
]

MODOS = ["short", "safe", "flat", "balanced"]


def call_route(origin, destination, mode):
    lat_o, lon_o = origin
    lat_d, lon_d = destination
    payload = {
        "origin": {"lat": lat_o, "lon": lon_o},
        "destination": {"lat": lat_d, "lon": lon_d},
        "mode": mode,
    }
    try:
        resp = requests.post(API_URL, json=payload, timeout=15)
    except requests.exceptions.RequestException as e:
        return {"error": "connection", "detail": str(e)}
    if resp.status_code != 200:
        return {"error": resp.status_code, "detail": resp.json().get("message", resp.text)}
    data = resp.json()
    return {
        "distanceMeters": data["distanceMeters"],
        "segments": data["segments"],
    }


def main():
    resultados = []
    for origen_nombre, destino_nombre in PARES:
        origen = PUNTOS[origen_nombre]
        destino = PUNTOS[destino_nombre]
        print(f"\n=== {origen_nombre} -> {destino_nombre} ===")
        fila = {"par": f"{origen_nombre} -> {destino_nombre}"}
        for modo in MODOS:
            r = call_route(origen, destino, modo)
            if "error" in r:
                print(f"  {modo:10s}: ERROR {r['error']} - {r['detail']}")
                fila[modo] = None
            else:
                print(f"  {modo:10s}: {r['distanceMeters']:>7} m  ({r['segments']} segmentos)")
                fila[modo] = r["distanceMeters"]
        resultados.append(fila)

    print("\n\n=== Resumen consolidado (distancia en metros) ===\n")
    header = f"{'Par':<55} {'short':>8} {'safe':>8} {'flat':>8} {'balanced':>10}"
    print(header)
    print("-" * len(header))
    for fila in resultados:
        print(f"{fila['par']:<55} "
              f"{str(fila.get('short') or '-'):>8} "
              f"{str(fila.get('safe') or '-'):>8} "
              f"{str(fila.get('flat') or '-'):>8} "
              f"{str(fila.get('balanced') or '-'):>10}")

    with open("route_test_results.json", "w", encoding="utf-8") as f:
        json.dump(resultados, f, indent=2, ensure_ascii=False)
    print("\nResultados guardados en route_test_results.json")


if __name__ == "__main__":
    main()
