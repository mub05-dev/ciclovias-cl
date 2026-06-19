-- Columnas de topología que pgRouting necesita (IDs secuenciales, no los osmid originales)
ALTER TABLE edges ADD COLUMN source INTEGER;
ALTER TABLE edges ADD COLUMN target INTEGER;

-- Columna de costo base (la usamos en distintos modos de ruteo en el siguiente paso)
ALTER TABLE edges ADD COLUMN cost DOUBLE PRECISION;
ALTER TABLE edges ADD COLUMN reverse_cost DOUBLE PRECISION;
