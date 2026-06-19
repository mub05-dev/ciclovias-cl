CREATE INDEX edges_geom_idx ON edges USING GIST (geom);
CREATE INDEX nodes_geom_idx ON nodes USING GIST (geom);
