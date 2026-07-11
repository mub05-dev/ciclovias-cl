-- Get first 5 edges of the safe route WITH enrichment lateral
SELECT d.edge
FROM pgr_dijkstra(
  'SELECT e.id, e.source, e.target,
    CASE WHEN e.oneway AND e.oneway_invertido THEN -1
    ELSE e."lengthM" * COALESCE(
      tc.score, e."scoreTipo"
    ) END AS cost,
    CASE WHEN e.oneway AND NOT e.oneway_invertido THEN -1
    ELSE e."lengthM" * COALESCE(
      tc.score, e."scoreTipo"
    ) END AS reverse_cost
   FROM edges e
   LEFT JOIN LATERAL (
     SELECT
       CASE type WHEN ''protected'' THEN 1.0 WHEN ''painted'' THEN 1.2 WHEN ''shared'' THEN 1.5 WHEN ''unprotected'' THEN 2.5 END
       * CASE condition WHEN ''good'' THEN 1.0 WHEN ''fair'' THEN 1.2 WHEN ''poor'' THEN 1.5 END AS score
     FROM tramos_calidad
     WHERE "edgeId" = e.id
     ORDER BY created_at DESC LIMIT 1
   ) tc ON true',
  9480, 165, directed := true
) d
ORDER BY d.seq
LIMIT 5;
