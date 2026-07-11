"use client";

import { useState, useCallback, useEffect } from "react";
import Map, { Source, Layer, Marker, type MapMouseEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const WELCOME_SEEN_KEY = "ciclovias-cl-welcome-seen";

type RouteMode = "short" | "safe" | "flat" | "balanced";
type AppMode = "route" | "report";
type SegmentType = "protected" | "painted" | "shared" | "unprotected";
type SegmentCondition = "good" | "fair" | "poor";

const MODE_LABELS: Record<RouteMode, string> = {
  short: "Short",
  safe: "Safe",
  flat: "Flat",
  balanced: "Balanced",
};

type RouteSegment = {
  edgeId: number;
  lengthMeters: number;
  slopePercent: number | null;
  enriched: boolean;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type RouteResponse = {
  mode: string;
  distanceMeters: number;
  segments: number;
  segmentDetails: RouteSegment[];
  originSnap: { nodeId: number; distanceMeters: number };
  destinationSnap: { nodeId: number; distanceMeters: number };
};

type ClickPoint = { lat: number; lon: number } | null;
type Step = 1 | 2 | 3 | 4;

type ReportForm = {
  type: SegmentType;
  condition: SegmentCondition;
  lit: boolean | null;
  notes: string;
};

const DEFAULT_REPORT: ReportForm = {
  type: "protected",
  condition: "good",
  lit: null,
  notes: "",
};

export default function RouteMap() {
  const [origin, setOrigin] = useState<ClickPoint>(null);
  const [destination, setDestination] = useState<ClickPoint>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>("balanced");
  const [appMode, setAppMode] = useState<AppMode>("route");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Report mode state
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [reportForm, setReportForm] = useState<ReportForm>(DEFAULT_REPORT);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(WELCOME_SEEN_KEY);
    if (!seen) setShowWelcome(true);
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
    setShowWelcome(false);
  };

  const currentStep: Step = !origin ? 1 : !destination ? 2 : !route ? 3 : 4;

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      if (loading) return;

      if (appMode === "report" && route && e.features && e.features.length > 0) {
        const feature = e.features[0] as { id?: number | string };
        const featureId = feature.id as number;
        const seg = route.segmentDetails[featureId];
        if (seg) {
          setSelectedEdgeId(seg.edgeId);
          setReportForm(DEFAULT_REPORT);
          setReportSuccess(false);
        }
        return;
      }

      if (appMode === "route") {
        const point = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (!origin) {
          setOrigin(point);
        } else if (!destination) {
          setDestination(point);
        } else {
          setOrigin(point);
          setDestination(null);
          setRoute(null);
        }
      }
    },
    [origin, destination, loading, appMode, route],
  );

  const calculateRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, mode: routeMode }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Could not calculate route.");
      }
      const data: RouteResponse = await res.json();
      setRoute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, routeMode]);

  const submitReport = useCallback(async () => {
    if (!selectedEdgeId) return;
    setReportLoading(true);
    try {
      const body: Record<string, unknown> = {
        edgeId: selectedEdgeId,
        type: reportForm.type,
        condition: reportForm.condition,
      };
      if (reportForm.lit !== null) body.lit = reportForm.lit;
      if (reportForm.notes.trim()) body.notes = reportForm.notes.trim();

      const res = await fetch(`${API_URL}/segment-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to submit report.");
      setReportSuccess(true);
      setSelectedEdgeId(null);
      // Refresh route to update enriched flags
      await calculateRoute();
    } catch {
      setError("Could not submit report. Try again.");
    } finally {
      setReportLoading(false);
    }
  }, [selectedEdgeId, reportForm, calculateRoute]);

  const reset = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setError(null);
    setAppMode("route");
    setSelectedEdgeId(null);
    setReportSuccess(false);
  };

  const routeFeatureCollection = route
    ? {
        type: "FeatureCollection" as const,
        features: route.segmentDetails.map((seg, i) => ({
          type: "Feature" as const,
          id: i,
          properties: {
            slopePercent: seg.slopePercent !== null ? Math.abs(seg.slopePercent) : 0,
            enriched: seg.enriched === true || (seg.enriched as unknown) === "true" ? 1 : 0,
            edgeId: seg.edgeId,
          },
          geometry: seg.geometry,
        })),
      }
    : null;

  const enrichedCount = route?.segmentDetails.filter((s) => s.enriched === true || (s.enriched as unknown) === "true").length ?? 0;

  return (
    <div className="relative h-screen w-full bg-carbon">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -70.62, latitude: -33.45, zoom: 11 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onClick={handleMapClick}
        interactiveLayerIds={appMode === "report" && route ? ["route-line", "route-enriched", "route-clickable"] : []}
        cursor={appMode === "report" && route ? "pointer" : "default"}
      >
        {origin && <Marker longitude={origin.lon} latitude={origin.lat} color="#4d8af0" />}
        {destination && <Marker longitude={destination.lon} latitude={destination.lat} color="#4ade80" />}

        {routeFeatureCollection && (
          <Source id="route" type="geojson" data={routeFeatureCollection}>
            {/* Highlight layer for enriched segments */}
            <Layer
              id="route-enriched"
              type="line"
              filter={["==", ["get", "enriched"], 1]}
              paint={{
                "line-width": 6,
                "line-opacity": 1,
                "line-color": "#a78bfa",
              }}
            />
            {/* Main slope-colored layer */}
            <Layer
              id="route-line"
              type="line"
              filter={["==", ["get", "enriched"], 0]}
              paint={{
                "line-width": 4,
                "line-opacity": 0.9,
                "line-color": [
                  "interpolate", ["linear"], ["get", "slopePercent"],
                  0, "#4ade80",
                  4, "#facc15",
                  8, "#f97316",
                  15, "#ef4444",
                ],
              }}
            />
            {/* Invisible wider layer for easier clicking in report mode */}
            <Layer
              id="route-clickable"
              type="line"
              paint={{ "line-width": 12, "line-opacity": 0 }}
            />
          </Source>
        )}
      </Map>

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-carbon/20">
          <div className="rounded-full bg-carbon-surface/90 px-4 py-2 text-sm text-white shadow-lg">
            Calculating route…
          </div>
        </div>
      )}

      {showWelcome && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-carbon/70 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-xl bg-carbon-surface p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Welcome to ciclovias-cl</h2>
            <p className="mb-4 text-sm text-muted">
              A bike routing tool for Santiago that considers real cycleways, road
              safety, and slope — not just distance. Click the map to pick a starting
              point, then a destination, choose a mode, and calculate your route.
            </p>
            <button
              onClick={dismissWelcome}
              className="w-full rounded-lg bg-accent-blue px-3 py-2 text-sm font-medium text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Main panel */}
      <div className="absolute top-4 left-4 w-80 rounded-xl bg-carbon-surface/95 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">ciclovias-cl</h1>
          {route && (
            <div className="flex gap-1">
              <button
                onClick={() => { setAppMode("route"); setSelectedEdgeId(null); }}
                className={`rounded px-2 py-1 text-xs transition ${appMode === "route" ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
              >
                Route
              </button>
              <button
                onClick={() => { setAppMode("report"); setSelectedEdgeId(null); setReportSuccess(false); }}
                className={`rounded px-2 py-1 text-xs transition ${appMode === "report" ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
              >
                Report
              </button>
            </div>
          )}
        </div>

        {appMode === "route" && (
          <>
            <div className="mb-3 flex items-center gap-1">
              {([1, 2, 3, 4] as Step[]).map((step) => (
                <div
                  key={step}
                  className={`h-1.5 flex-1 rounded-full transition ${step <= currentStep ? "bg-accent-blue" : "bg-carbon"}`}
                />
              ))}
            </div>

            <p className="mb-3 text-sm text-muted">
              {currentStep === 1 && "1. Click the map to set your starting point."}
              {currentStep === 2 && "2. Now click to set your destination."}
              {currentStep === 3 && "3. Choose a mode and calculate your route."}
              {currentStep === 4 && `4. Route ready — showing "${MODE_LABELS[routeMode]}" mode.`}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {(["short", "safe", "flat", "balanced"] as RouteMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRouteMode(m)}
                  className={`rounded-lg px-3 py-2 text-sm transition ${routeMode === m ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={calculateRoute}
                disabled={!origin || !destination || loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-green px-3 py-2 text-sm font-medium text-carbon disabled:opacity-40"
              >
                {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-carbon border-t-transparent" />}
                {loading ? "Calculating..." : "Calculate route"}
              </button>
              <button onClick={reset} className="rounded-lg bg-carbon px-3 py-2 text-sm text-muted hover:text-white">
                Reset
              </button>
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            {route && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm text-white">
                <p>Distance: {(route.distanceMeters / 1000).toFixed(2)} km</p>
                <p>Segments: {route.segments} {enrichedCount > 0 && <span className="text-violet-400">· {enrichedCount} enriched</span>}</p>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#4ade80]" />flat
                  <span className="inline-block h-2 w-2 rounded-full bg-[#facc15]" />mild
                  <span className="inline-block h-2 w-2 rounded-full bg-[#f97316]" />moderate
                  <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />steep
                  <span className="inline-block h-2 w-2 rounded-full bg-[#a78bfa]" />enriched
                </div>
              </div>
            )}
          </>
        )}

        {appMode === "report" && (
          <div className="text-sm text-white">
            {reportSuccess && (
              <p className="mb-3 rounded-lg bg-accent-green/20 px-3 py-2 text-accent-green text-xs">
                Report submitted successfully.
              </p>
            )}

            {!selectedEdgeId ? (
              <p className="text-muted">Click a segment on the route to report its quality.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">Edge #{selectedEdgeId}</p>

                <div>
                  <p className="mb-1 text-xs text-muted">Type</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(["protected", "painted", "shared", "unprotected"] as SegmentType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setReportForm((f) => ({ ...f, type: t }))}
                        className={`rounded px-2 py-1 text-xs capitalize transition ${reportForm.type === t ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-muted">Condition</p>
                  <div className="flex gap-1">
                    {(["good", "fair", "poor"] as SegmentCondition[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setReportForm((f) => ({ ...f, condition: c }))}
                        className={`flex-1 rounded px-2 py-1 text-xs capitalize transition ${reportForm.condition === c ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-muted">Lit</p>
                  <div className="flex gap-1">
                    {([true, false, null] as (boolean | null)[]).map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => setReportForm((f) => ({ ...f, lit: v }))}
                        className={`flex-1 rounded px-2 py-1 text-xs transition ${reportForm.lit === v ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"}`}
                      >
                        {v === null ? "?" : v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-muted">Notes (optional)</p>
                  <textarea
                    value={reportForm.notes}
                    onChange={(e) => setReportForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded bg-carbon px-2 py-1 text-xs text-white placeholder-muted outline-none"
                    placeholder="Any observations..."
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={submitReport}
                    disabled={reportLoading}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent-green px-3 py-2 text-xs font-medium text-carbon disabled:opacity-40"
                  >
                    {reportLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-carbon border-t-transparent" />}
                    {reportLoading ? "Submitting..." : "Submit report"}
                  </button>
                  <button
                    onClick={() => setSelectedEdgeId(null)}
                    className="rounded-lg bg-carbon px-3 py-1 text-xs text-muted hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
