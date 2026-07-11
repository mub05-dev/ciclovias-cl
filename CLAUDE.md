# ciclovias-cl

Bike routing platform for Chile · prioritizes real cycleways, slope and road safety · OSM + PostGIS + pgRouting

## Project status (updated 2026-07-11)

- ✅ M01 — Data Pipeline (issues #1-8)
- ✅ M02 — Routing Engine (issues #9-15)
- ✅ M03 — Map & Frontend (issues #16-24)
- ✅ M04 — Enrichment Layer (issues #25-32)
- ⬜ M05 — Deploy & Observability

GitHub Projects kanban board tracks all milestones/issues. Check there for granular task status.

## Architecture

Turborepo + npm monorepo:
- `apps/web` — Next.js 16 + React 19, port 3000. Mapbox GL JS + react-map-gl v8 (`react-map-gl/mapbox`), Tailwind v4 (no config file, `@theme` in `globals.css`).
- `apps/api` — NestJS, port 4000, CORS enabled for localhost:3000.
- `apps/pipeline` — Python scripts for OSM ingestion + elevation data.
- `packages/database` — `@ciclovias-cl/database`, Prisma schema. `@prisma/client` is a real dependency (not devDependency). Client is hoisted to root `node_modules` via npm workspaces (no custom Prisma `output` path).
- `packages/types`, `packages/config` — shared code.

## Data pipeline

- Source: OSMNX, **always download the 5 comunas as a single unified polygon** (San Miguel, Santiago, Providencia, Las Condes, Vitacura) — never per-comuna separately, this fragments the graph (learned the hard way, see Lessons Learned).
- Storage: PostGIS 3.5 + pgRouting 3.7 (Docker image `pgrouting/pgrouting:16-3.5-3.7`).
- Current dataset: 23,529 nodes, 49,630 edges, single connected component (verified with `pgr_connectedComponents`).
- Edge fields: `highway`, `lengthM`, `desnivelM`, `pendientePct`, `scoreTipo`, `scoreFinal`, `oneway`, `onewayInvertido`, `comuna`, plus pgRouting topology columns (`source`, `target`, `cost`, `reverse_cost`).
- `oneway`/`onewayInvertido` parsed from OSM tag (handles graphml string serialization of Python booleans: `'True'`/`'False'` strings, not real booleans). No `-1` (inverted) cases found in current dataset but code handles it.
- Ingestion script: `apps/pipeline/scripts/ingest_corredor.py`. Idempotent via `ON CONFLICT ("sourceId", "targetId") DO UPDATE`. Deduplicates edges sharing the same node pair (keeps the shortest).

## Routing engine

- `pgr_dijkstra` with `directed := true` — **street direction (oneway) is always respected**, this was a deliberate decision (safer/more realistic even if routes are longer).
- 4 modes, cost calculated on-the-fly in SQL (not precomputed in a column), respecting oneway via `CASE WHEN oneway AND oneway_invertido THEN -1 ...`:
  - `short`: `cost = lengthM`
  - `safe`: `cost = lengthM * COALESCE(tc.score, scoreTipo)` — uses TramoCalidad enrichment if available, falls back to OSM-based scoreTipo
  - `flat`: `cost = lengthM * (1 + GREATEST(pendientePct, 0) / 5)` (only penalizes uphill; reverse direction flips slope sign)
  - `balanced`: `cost = lengthM * COALESCE(tc.score * (1 + GREATEST(pendientePct,0)/5), scoreFinal)` — enrichment + slope combined
- Coordinate snapping: SQL function `snap_to_nearest_node(lon, lat)` (lives as a standalone script, not a Prisma migration — see `apps/pipeline/scripts/sql/`). Max acceptable snap distance: 500m, enforced in `RoutingService`.
- `POST /route` endpoint (`apps/api/src/routing/`): validates input (lat -90/90, lon -180/180, origin≠destination), returns `segmentDetails` (array of individual segments with `geometry` + `slopePercent`) instead of one fused LineString — this supports the frontend's slope-coloring feature.

## Frontend

- `RouteMap.tsx` component: click-to-select origin/destination, 4-mode selector, welcome overlay (localStorage-gated, shows once), 4-step progress indicator, loading spinner + map overlay during calculation.
- Signature visual element: route colored by real slope via Mapbox data-driven styling (`interpolate` expression: green 0% → amber 4% → orange 8% → red 15%+), with a flat/mild/moderate/steep legend. Confirmed visually that "flat" mode measurably reduces orange/red segments vs "short" mode in hilly areas (Las Condes/Vitacura).
- **Enrichment layer (M04)**: enriched segments (with a TramoCalidad report) render in purple (#a78bfa) instead of slope colors. "Report" mode toggle lets user click a route segment to submit a quality report (type, condition, lit, notes). `enriched` stored as 0/1 in GeoJSON properties (not boolean) for reliable Mapbox filter compatibility.
- Color palette: `carbon` (#14161b), `carbon-surface` (#1e2233), `accent-blue` (#4d8af0), `accent-green` (#4ade80), `muted` (#8b93a7), `violet` (#a78bfa, enriched segments).

## Conventions

- Code, commits, issue titles, API contracts: **English**.
- Conversational docs/explanations: Spanish (Marco's preference).
- Commit messages follow conventional commits style (`feat:`, `fix:`, `chore:`).

## Lessons learned (avoid repeating these)

1. **pgRouting topology IDs are not stable** across `pgr_createTopology` runs — they get renumbered if the table is truncated and reloaded. Don't hardcode node IDs in tests/docs across sessions.
2. **Always verify Docker Desktop is running** before debugging Prisma/Postgres errors — a dead daemon produces Prisma errors that look like code bugs.
3. **NestJS defaults to port 3000**, same as Next.js — always set an explicit port in `main.ts` when both run locally.
4. **Never download OSM data per-comuna and merge graphs afterward** — border nodes get different IDs across separate downloads and never connect. Always download the full corridor as one unified polygon query.
5. Tailwind v4 has no `tailwind.config.js`/`init` command — configuration lives in CSS via `@theme` and `@import "tailwindcss"`.

## M04 — Enrichment Layer (completed 2026-07-11)

OSM Chile has ~0% coverage on cycleway quality/safety tags (`cycleway`, `surface`, `segregated`, `lit`). Google Maps, Bicineta, and other existing tools all draw from this same weak dataset. M04 adds a real-world data layer on top of OSM to correct this.

### What was built

- **TramoCalidad schema**: columns renamed to English (`type`, `condition`, `lit`, `notes`, `reported_by`, `created_at`) with `@map` decorators. Table: `tramos_calidad`.
- **Segment types**: `protected` (score 1.0), `painted` (1.2), `shared` (1.5), `unprotected` (2.5). Condition multiplier: `good` ×1.0, `fair` ×1.2, `poor` ×1.5.
- **CRUD API**: `POST/GET/PUT/DELETE /segment-reports` (`apps/api/src/segment-reports/`).
- **Router integration**: `RoutingService` uses a `LEFT JOIN LATERAL` inside the pgr_dijkstra SQL string to look up `tramos_calidad` per edge. `COALESCE(tc.score, scoreTipo/scoreFinal)` — enriched data wins, OSM data is fallback.
- **"Report" UI mode**: toggle in `RouteMap.tsx` — click any segment of a calculated route to submit a quality report. edgeId comes from the GeoJSON feature directly (no snap-to-edge needed).
- **Visual distinction**: enriched segments render purple (#a78bfa); non-enriched use slope color scheme as before.

### Coverage as of 2026-07-11

4 segments registered (edges 14360, 14367, 14392, 37432 — all in the San Miguel / Santiago corridor). All reported as `protected`, confirming OSM underestimates quality on these streets. Coverage grows as Marco rides and reports.

### Key implementation notes

- Single quotes inside the pgr_dijkstra SQL string literal must be doubled (`''protected''`).
- `enriched` stored as 0/1 integer in GeoJSON properties — boolean serialization from PostgreSQL via Prisma is unreliable in Mapbox filter expressions.
- `#30` (snap-to-edge) was resolved by design: reports are limited to route segments already displayed, so edgeId is read from the rendered GeoJSON feature, not computed via `ST_ClosestPoint`.

## Roadmap: M05 (remaining work)

### M05 — Deploy & Observability

M05 is partially complete as of 2026-07-11. Remaining work is blocked on infrastructure cost decision.

### Decisions made (2026-07-11)

- **CI/CD**: GitHub Actions (#33 ✅)
- **Hosting**: EC2 ruled out (Marco has no AWS account). **Railway Hobby plan (~$5/month)** is the chosen target — supports custom Docker images including `pgrouting/pgrouting:16-3.5-3.7`, 5 GB storage, 8 GB RAM per service. Decision pending Marco's budget approval.
- **Domain**: No domain yet. Will deploy to Railway-provided URL initially. Custom domain deferred (#41).
- **Web**: Can also use Vercel for Next.js (free), with API + DB on Railway.

### Work completed so far

- `apps/api/Dockerfile` — multi-stage build, prisma generate with dummy DATABASE_URL, `node apps/api/dist/main`
- `apps/web/Dockerfile` — multi-stage build, Next.js standalone output, NEXT_PUBLIC_* as build args
- `apps/web/next.config.js` — `output: "standalone"` added
- `.dockerignore` at root
- `docker-compose.prod.yml` — postgres + api + web, postgres not exposed publicly, api on :4000, web on :3000
- `.env.prod.example` — template for POSTGRES_USER/PASSWORD/DB, NEXT_PUBLIC_MAPBOX_TOKEN, EC2_PUBLIC_IP
- `infra/bootstrap-ec2.sh` — EC2 bootstrap script (still valid if EC2 is ever used)

### Remaining issues (#35-42)

| # | Title | Status |
|---|---|---|
| 35 | Set up environment variable management across environments | ⬜ blocked on hosting decision |
| 36 | Update CORS for production frontend origin | ⬜ blocked on hosting decision (need the URL) |
| 37 | Write Dockerfiles for api and web | ✅ done |
| 38 | CI pipeline: lint/build on PR | ⬜ ready to implement (GitHub Actions) |
| 39 | Deploy pipeline: automated deploy on merge to main | ⬜ blocked on hosting decision |
| 40 | Basic uptime/error monitoring for /route | ⬜ blocked on hosting decision |
| 41 | Custom domain + SSL | ⬜ deferred (no domain yet) |
| 42 | Production data seeding strategy for TramoCalidad | ⬜ decision: start empty, build up same as local |

### Key technical notes for when M05 resumes

- `docker-compose.prod.yml` targets a single-host Docker setup (EC2 or similar). For Railway, each service deploys independently via its own Dockerfile — the compose file is not used.
- Railway deployment: point each service at the repo + Dockerfile path. Set env vars in Railway dashboard. `DATABASE_URL` in api service should reference Railway's internal postgres service URL.
- `NEXT_PUBLIC_API_URL` is baked at build time (Next.js limitation) — needs the final production URL before building the web image.
- CORS in `apps/api/src/main.ts` currently hardcoded to `http://localhost:3000` — must update to production web URL before deploy (#36).
- TramoCalidad starts empty in production — Marco registers segments manually after deploy, same workflow as local.

## Next immediate step

Resume M05 when Marco decides on Railway Hobby plan (~$5/month). Start with #36 (update CORS to production URL) + #35 (set env vars in Railway dashboard), then #38 (GitHub Actions CI), then #39 (deploy pipeline).