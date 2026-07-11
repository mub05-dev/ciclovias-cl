# ciclovias-cl

Bike routing platform for Chile · prioritizes real cycleways, slope and road safety · OSM + PostGIS + pgRouting

## Project status (updated 2026-06-21)

- ✅ M01 — Data Pipeline (issues #1-8)
- ✅ M02 — Routing Engine (issues #9-15)
- ✅ M03 — Map & Frontend (issues #16-24)
- ⬜ M04 — Enrichment Layer (next)
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
  - `safe`: `cost = lengthM * scoreTipo`
  - `flat`: `cost = lengthM * (1 + GREATEST(pendientePct, 0) / 5)` (only penalizes uphill; reverse direction flips slope sign)
  - `balanced`: `cost = lengthM * scoreFinal`
- Coordinate snapping: SQL function `snap_to_nearest_node(lon, lat)` (lives as a standalone script, not a Prisma migration — see `apps/pipeline/scripts/sql/`). Max acceptable snap distance: 500m, enforced in `RoutingService`.
- `POST /route` endpoint (`apps/api/src/routing/`): validates input (lat -90/90, lon -180/180, origin≠destination), returns `segmentDetails` (array of individual segments with `geometry` + `slopePercent`) instead of one fused LineString — this supports the frontend's slope-coloring feature.

## Frontend

- `RouteMap.tsx` component: click-to-select origin/destination, 4-mode selector, welcome overlay (localStorage-gated, shows once), 4-step progress indicator, loading spinner + map overlay during calculation.
- Signature visual element: route colored by real slope via Mapbox data-driven styling (`interpolate` expression: green 0% → amber 4% → orange 8% → red 15%+), with a flat/mild/moderate/steep legend. Confirmed visually that "flat" mode measurably reduces orange/red segments vs "short" mode in hilly areas (Las Condes/Vitacura).
- Color palette: `carbon` (#14161b), `carbon-surface` (#1e2233), `accent-blue` (#4d8af0), `accent-green` (#4ade80), `muted` (#8b93a7).

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

## Roadmap: M04 and M05 (remaining work)

### M04 — Enrichment Layer

The `TramoCalidad` table already exists in the Prisma schema (from M01) but is unused. This is the project's real long-term differentiator: OSM Chile has ~0% coverage on cycleway quality/safety tags (`cycleway`, `surface`, `segregated`, `lit` all showed 0% coverage when validated against the real dataset). Google Maps, Bicineta, and other existing tools all draw from this same weak dataset — this layer is what lets `ciclovias-cl` go beyond them instead of being "another router with the same data."

Planned scope:
- **Manual segment registration**: Marco registers real-world segment quality as he rides — protected/painted/shared type, condition (good/fair/poor), lit/unlit, free-text notes. `TramoCalidad` schema already supports this (`tipoReal`, `estado`, `iluminacion`, `notas`, `reportadoPor`, `createdAt`).
- **Router integration**: cost calculation in `RoutingService` should check `TramoCalidad` first for a given edge; if a manual entry exists, use it to adjust the cost; otherwise fall back to the existing `highway`-based `scoreTipo`/`scoreFinal`.
- **UI for registration**: simplest viable version is marking a segment on the existing map (desktop, after a ride) rather than live GPS tracking — live tracking adds real complexity (background location, battery, accuracy) that isn't needed for a v1 aimed at a single user (Marco) building up coverage on his own habitual routes.
- **Scope honesty**: this will NOT achieve citywide coverage in v1 — it covers only the segments Marco personally rides and registers. That's fine and should be communicated as such (a real differentiator on his actual routes, not a false claim of full-corridor superiority).
- Expected new Prisma work: none needed for the schema (`TramoCalidad` exists), but likely a new NestJS module/controller for CRUD on segment reports, and a corresponding UI panel/mode in `RouteMap.tsx` (e.g. "report a segment" mode alongside "plan a route" mode).

**M04 issues (not yet created in GitHub as of 2026-06-21 — create following the same pattern as M01-M03: title, labels, priority, assigned to milestone, starting in `Backlog`):**

| # | Title | Labels | Priority |
|---|---|---|---|
| 25 | Design API contract for segment quality reports (CRUD) | `routing`, `data` | high |
| 26 | Build TramoCalidad CRUD module in NestJS (create/read/update/delete reports) | `feature`, `data` | high |
| 27 | Modify cost calculation to check TramoCalidad first, fallback to highway-based scoreTipo/scoreFinal | `routing`, `feature` | high |
| 28 | Add "report a segment" mode to RouteMap.tsx (click a segment, submit quality report) | `frontend`, `feature` | high |
| 29 | Visual distinction for enriched vs non-enriched segments on the map | `frontend` | medium |
| 30 | Validate a segment click maps correctly to an edge id (snapping to nearest edge, not node) | `routing` | medium |
| 31 | Manual QA: register real segments from Marco's own routes, confirm router uses them | `data` | medium |
| 32 | Update README/CLAUDE.md with M04 outcomes and enrichment coverage stats | `data` | low |

Note on #30: this is a new technical challenge not faced in M01-M03 — all prior snapping was to *nodes* (for route origin/destination), but reporting a segment's quality requires snapping a click to an *edge* (a line between two nodes), which needs different logic (`ST_ClosestPoint` against lines, not points via KNN `<->` against points). Worth resolving early since the rest of the milestone depends on it.

### M05 — Deploy & Observability

Not yet scoped in detail (no GitHub issues created for this milestone as of 2026-06-21). Known constraints and prior experience that should shape it, based on Marco's other deployed projects (CFert, lab-analysis):
- Target infra: AWS EC2 (Marco's standard stack), Docker Compose for local parity, Bitbucket Pipelines is Marco's usual CI/CD tool in professional projects — but this is a GitHub-hosted portfolio repo, so **GitHub Actions is likely the better fit here** for consistency with the rest of the repo's tooling (this hasn't been decided yet, flag it as an open question when M05 starts).
- Needs: production Postgres+PostGIS+pgRouting instance (same image as local: `pgrouting/pgrouting:16-3.5-3.7`), environment variable management for `DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_API_URL` across environments, CORS origin update for the production frontend URL (currently hardcoded to `localhost:3000` in `apps/api/src/main.ts`).
- Observability: nothing built yet. At minimum should cover basic uptime/error visibility for the `/route` endpoint given it's the core value proposition — a broken router silently failing is the worst-case failure mode for this project.
- Before scoping issues for this milestone in GitHub Projects, revisit with Marco: hosting choice (single EC2 instance vs. something simpler for a portfolio piece), whether a custom domain is wanted, and whether M04's enrichment data needs any special handling in production (e.g., is `TramoCalidad` data seeded, or does it start empty in production and get built up over time the same way as local).

**M05 issues (not yet created in GitHub as of 2026-06-21 — create following the same pattern as M01-M04):**

| # | Title | Labels | Priority |
|---|---|---|---|
| 33 | Decide CI/CD tool: GitHub Actions vs Bitbucket Pipelines for this repo | `infra`, `setup` | high |
| 34 | Provision production Postgres+PostGIS+pgRouting instance on AWS EC2 | `infra` | high |
| 35 | Set up environment variable management across environments (DATABASE_URL, Mapbox token, API URL) | `infra`, `setup` | high |
| 36 | Update CORS configuration for production frontend origin | `infra` | high |
| 37 | Write Dockerfiles for apps/api and apps/web (production builds) | `infra` | high |
| 38 | Set up CI pipeline: run tests/lint on PR, build on merge to main | `infra` | medium |
| 39 | Deploy pipeline: automated deploy to EC2 on merge to main | `infra` | medium |
| 40 | Set up basic uptime/error monitoring for the /route endpoint | `infra` | medium |
| 41 | Decide on custom domain (optional) and configure DNS/SSL if applicable | `infra` | low |
| 42 | Production data seeding strategy: does TramoCalidad start empty or seeded? | `data`, `infra` | low |

Note on ordering: unlike M01-M04 where issues depended roughly linearly on the previous one, here #33 (CI/CD tool decision) should be resolved first since it shapes how the rest of the pipeline issues get implemented — no point writing `.github/workflows/` files if the decision lands on Bitbucket Pipelines, or vice versa.

## Next immediate step

Start M04. Issues #25-32 are planned (see table above) but **not yet created in GitHub** as of 2026-06-21 — create them on the kanban board first (Backlog → In Progress → Done, same workflow as M01-M03), then start with #25 (API contract design) since #26-30 depend on it.