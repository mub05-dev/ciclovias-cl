"use client";

import { useState, useCallback, useEffect } from "react";
import Map, { Source, Layer, Marker, type MapMouseEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const WELCOME_SEEN_KEY = "ciclovias-cl-welcome-seen";

type RouteMode = "short" | "safe" | "flat" | "balanced";

const MODE_LABELS: Record<RouteMode, string> = {
  short: "Short",
  safe: "Safe",
  flat: "Flat",
  balanced: "Balanced",
};

type RouteSegment = {
  lengthMeters: number;
  slopePercent: number | null;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
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

export default function RouteMap() {
  const [origin, setOrigin] = useState<ClickPoint>(null);
  const [destination, setDestination] = useState<ClickPoint>(null);
  const [mode, setMode] = useState<RouteMode>("balanced");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

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
    },
    [origin, destination, loading],
  );

  const calculateRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, mode }),
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
  }, [origin, destination, mode]);

  const reset = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setError(null);
  };

  const routeFeatureCollection = route
    ? {
        type: "FeatureCollection" as const,
        features: route.segmentDetails.map((seg, i) => ({
          type: "Feature" as const,
          id: i,
          properties: {
            slopePercent: seg.slopePercent !== null ? Math.abs(seg.slopePercent) : 0,
          },
          geometry: seg.geometry,
        })),
      }
    : null;

  return (
    <div className="relative h-screen w-full bg-carbon">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -70.62, latitude: -33.45, zoom: 11 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onClick={handleMapClick}
      >
        {origin && <Marker longitude={origin.lon} latitude={origin.lat} color="#4d8af0" />}
        {destination && <Marker longitude={destination.lon} latitude={destination.lat} color="#4ade80" />}

        {routeFeatureCollection && (
          <Source id="route" type="geojson" data={routeFeatureCollection}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-width": 4,
                "line-opacity": 0.9,
                "line-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "slopePercent"],
                  0, "#4ade80",
                  4, "#facc15",
                  8, "#f97316",
                  15, "#ef4444",
                ],
              }}
            />
          </Source>
        )}
      </Map>

      {/* Overlay de carga sobre el mapa */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-carbon/20">
          <div className="rounded-full bg-carbon-surface/90 px-4 py-2 text-sm text-white shadow-lg">
            Calculating route…
          </div>
        </div>
      )}

      {/* Mensaje de bienvenida (solo primera visita) */}
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

      <div className="absolute top-4 left-4 w-80 rounded-xl bg-carbon-surface/95 p-4 shadow-lg backdrop-blur">
        <h1 className="mb-3 text-lg font-semibold text-white">ciclovias-cl</h1>

        {/* Indicador de pasos */}
        <div className="mb-3 flex items-center gap-1">
          {([1, 2, 3, 4] as Step[]).map((step) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition ${
                step <= currentStep ? "bg-accent-blue" : "bg-carbon"
              }`}
            />
          ))}
        </div>

        <p className="mb-3 text-sm text-muted">
          {currentStep === 1 && "1. Click the map to set your starting point."}
          {currentStep === 2 && "2. Now click to set your destination."}
          {currentStep === 3 && "3. Choose a mode and calculate your route."}
          {currentStep === 4 && `4. Route ready — showing "${MODE_LABELS[mode]}" mode.`}
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["short", "safe", "flat", "balanced"] as RouteMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-2 text-sm transition ${
                mode === m ? "bg-accent-blue text-white" : "bg-carbon text-muted hover:text-white"
              }`}
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
            {loading && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-carbon border-t-transparent" />
            )}
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
            <p>Segments: {route.segments}</p>
            <div className="flex items-center gap-1 text-xs text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#4ade80" }} />
              <span>flat</span>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#facc15" }} />
              <span>mild</span>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f97316" }} />
              <span>moderate</span>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#ef4444" }} />
              <span>steep</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}