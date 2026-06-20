SELECT
    SUM(e."lengthM") as distancia_real_metros,
    COUNT(*) as segmentos
FROM pgr_dijkstra(
    'SELECT id, source, target,
        CASE WHEN oneway AND oneway_invertido THEN -1
             ELSE "lengthM"
        END AS cost,
        CASE WHEN oneway AND NOT oneway_invertido THEN -1
             ELSE "lengthM"
        END AS reverse_cost
     FROM edges',
    86, 19444, directed := true
) d
JOIN edges e ON d.edge = e.id;
