SELECT
    SUM(e."lengthM") as distancia_real_metros,
    AVG(e."scoreTipo") as score_tipo_promedio,
    COUNT(*) as segmentos
FROM pgr_dijkstra(
    'SELECT id, source, target,
        CASE WHEN oneway AND oneway_invertido THEN -1
             ELSE "lengthM" * "scoreTipo"
        END AS cost,
        CASE WHEN oneway AND NOT oneway_invertido THEN -1
             ELSE "lengthM" * "scoreTipo"
        END AS reverse_cost
     FROM edges',
    86, 19444, directed := true
) d
JOIN edges e ON d.edge = e.id;
