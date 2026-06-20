SELECT
    SUM(e."lengthM") as distancia_real_metros,
    SUM(GREATEST(e."pendientePct", 0)) as subida_total_aprox,
    COUNT(*) as segmentos
FROM pgr_dijkstra(
    'SELECT id, source, target,
        CASE WHEN oneway AND oneway_invertido THEN -1
             ELSE "lengthM" * (1 + GREATEST(COALESCE("pendientePct", 0), 0) / 5)
        END AS cost,
        CASE WHEN oneway AND NOT oneway_invertido THEN -1
             ELSE "lengthM" * (1 + GREATEST(COALESCE(-"pendientePct", 0), 0) / 5)
        END AS reverse_cost
     FROM edges',
    86, 19444, directed := true
) d
JOIN edges e ON d.edge = e.id;
