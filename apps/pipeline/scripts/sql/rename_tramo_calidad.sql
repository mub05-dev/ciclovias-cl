ALTER TABLE tramos_calidad RENAME COLUMN "tipoReal" TO type;
ALTER TABLE tramos_calidad RENAME COLUMN estado TO condition;
ALTER TABLE tramos_calidad RENAME COLUMN iluminacion TO lit;
ALTER TABLE tramos_calidad RENAME COLUMN notas TO notes;
ALTER TABLE tramos_calidad RENAME COLUMN "reportadoPor" TO reported_by;
ALTER TABLE tramos_calidad RENAME COLUMN "createdAt" TO created_at;
