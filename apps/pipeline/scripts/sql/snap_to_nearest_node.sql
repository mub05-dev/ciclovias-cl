-- Función de utilidad: snap_to_nearest_node
--
-- Dado un punto lon/lat arbitrario (típicamente un clic en el mapa o una
-- dirección geocodificada), encuentra el vértice de la topología de
-- pgRouting (edges_vertices_pgr) más cercano, usando el operador KNN (<->)
-- que aprovecha el índice GiST existente en esa tabla.
--
-- Uso desde NestJS / psql:
--   SELECT * FROM snap_to_nearest_node(-70.6569, -33.5135);
--
-- Devuelve el id del nodo más cercano y la distancia real en metros,
-- para que el caller pueda decidir si el punto está razonablemente cerca
-- de la red vial (ej: rechazar si distancia_metros > 200).

CREATE OR REPLACE FUNCTION snap_to_nearest_node(
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS TABLE(nodo_id BIGINT, distancia_metros DOUBLE PRECISION) AS $$
    SELECT
        id AS nodo_id,
        ST_Distance(
            the_geom::geography,
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
        ) AS distancia_metros
    FROM edges_vertices_pgr
    ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
    LIMIT 1;
$$ LANGUAGE sql STABLE;
