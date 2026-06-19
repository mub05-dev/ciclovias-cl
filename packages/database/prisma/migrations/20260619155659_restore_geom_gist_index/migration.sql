CREATE INDEX IF NOT EXISTS edges_geom_idx ON edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS nodes_geom_idx ON nodes USING GIST (geom);
