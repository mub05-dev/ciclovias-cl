-- Snapping: dado un lat/lon arbitrario, encuentra el vértice de la topología
-- más cercano usando el operador KNN (<->), que aprovecha el índice GiST.
--
-- Parámetros de prueba: un punto cerca del nodo 86 (San Miguel), con offset
-- pequeño para simular un clic real que no cae exacto en un nodo.

SELECT
    id AS nodo_id,
    ST_X(the_geom) AS lon,
    ST_Y(the_geom) AS lat,
    ST_Distance(
        the_geom::geography,
        ST_SetSRID(ST_MakePoint(-70.6569, -33.5135), 4326)::geography
    ) AS distancia_metros
FROM edges_vertices_pgr
ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(-70.6569, -33.5135), 4326)
LIMIT 1;
