CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "nodes" (
    "id" BIGINT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) NOT NULL,
    "elevation" DOUBLE PRECISION,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" SERIAL NOT NULL,
    "sourceId" BIGINT NOT NULL,
    "targetId" BIGINT NOT NULL,
    "highway" TEXT,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "geom" geometry(LineString, 4326) NOT NULL,
    "desnivelM" DOUBLE PRECISION,
    "pendientePct" DOUBLE PRECISION,
    "scoreTipo" DOUBLE PRECISION,
    "scoreFinal" DOUBLE PRECISION,
    "comuna" TEXT,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tramos_calidad" (
    "id" SERIAL NOT NULL,
    "edgeId" INTEGER NOT NULL,
    "tipoReal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "iluminacion" BOOLEAN,
    "notas" TEXT,
    "reportadoPor" TEXT NOT NULL DEFAULT 'marco',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tramos_calidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs_ingesta" (
    "id" SERIAL NOT NULL,
    "comuna" TEXT NOT NULL,
    "nodosCount" INTEGER NOT NULL,
    "edgesCount" INTEGER NOT NULL,
    "duracionMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_ingesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edges_highway_idx" ON "edges"("highway");

-- CreateIndex
CREATE INDEX "edges_comuna_idx" ON "edges"("comuna");

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramos_calidad" ADD CONSTRAINT "tramos_calidad_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "edges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
