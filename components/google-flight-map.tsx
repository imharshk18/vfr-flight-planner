"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { MissionBriefing } from "@/lib/mission-types";

/**
 * COST-SAFE MAP
 * Uses Maps JavaScript API (Dynamic Maps / satellite) which you already enabled.
 * Photorealistic 3D Tiles were returning 403 on this key, so we do not call them.
 * Still no Aerial View / Places / Elevation charges.
 */

let mapsConfigured = false;

function ensureMaps(apiKey: string) {
  if (!mapsConfigured) {
    setOptions({ key: apiKey, v: "weekly" });
    mapsConfigured = true;
  }
}

export default function GoogleFlightMap({
  briefing,
}: {
  briefing: MissionBriefing | null;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.MVCObject | google.maps.Polyline>>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (!apiKey || !mapDivRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        ensureMaps(apiKey);
        const { Map } = await importLibrary("maps");
        if (cancelled || !mapDivRef.current) return;

        const map = new Map(mapDivRef.current, {
          center: { lat: 37.5, lng: -122.0 },
          zoom: 10,
          mapTypeId: "hybrid",
          tilt: 45,
          heading: 20,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
          gestureHandling: "greedy",
          backgroundColor: "#c9daf0",
        });
        mapRef.current = map;
        setReady(true);
        setMapError(null);
      } catch (e) {
        console.error(e);
        setMapError(
          "Google Maps failed to load. Check that Maps JavaScript API is enabled and this key allows http://127.0.0.1:4321/*"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Draw / update corridor overlays when briefing changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !briefing || !ready) return;

    // Clear previous overlays
    for (const o of overlaysRef.current) {
      if ("setMap" in o) (o as google.maps.Polyline).setMap(null);
    }
    overlaysRef.current = [];

    const path = briefing.corridor.terrainProfile.map((p) => ({
      lat: p.lat,
      lng: p.lon,
    }));
    if (path.length < 2) {
      path.push(
        { lat: briefing.corridor.origin.lat, lng: briefing.corridor.origin.lon },
        {
          lat: briefing.corridor.destination.lat,
          lng: briefing.corridor.destination.lon,
        }
      );
    }

    const isNoGo = briefing.corridor.decision.verdict === "NO_GO";
    const stroke = isNoGo ? "#e11d48" : "#c026d3";

    const glow = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: stroke,
      strokeOpacity: 0.25,
      strokeWeight: 14,
      map,
      zIndex: 2,
    });
    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: stroke,
      strokeOpacity: 0.95,
      strokeWeight: 4,
      map,
      zIndex: 3,
    });
    overlaysRef.current.push(glow, line);

    const originMarker = new google.maps.Marker({
      map,
      position: {
        lat: briefing.corridor.origin.lat,
        lng: briefing.corridor.origin.lon,
      },
      label: {
        text: briefing.corridor.origin.icao,
        color: "#ffffff",
        fontWeight: "700",
        fontSize: "11px",
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#0284c7",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
      zIndex: 5,
    });

    const destMarker = new google.maps.Marker({
      map,
      position: {
        lat: briefing.corridor.destination.lat,
        lng: briefing.corridor.destination.lon,
      },
      label: {
        text: briefing.corridor.destination.icao,
        color: "#ffffff",
        fontWeight: "700",
        fontSize: "11px",
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#059669",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
      zIndex: 5,
    });
    overlaysRef.current.push(originMarker, destMarker);

    if (briefing.intake.routeMode === "pilotage") {
      for (const lm of briefing.landmarks.slice(0, 5)) {
        const m = new google.maps.Marker({
          map,
          position: { lat: lm.lat, lng: lm.lon },
          title: lm.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#d97706",
            fillOpacity: 1,
            strokeColor: "#fffbeb",
            strokeWeight: 2,
          },
          zIndex: 4,
        });
        overlaysRef.current.push(m);
      }
    }

    // Destination ceiling as translucent circle (visual cue, not a 3D deck)
    const ceil = briefing.corridor.weather.destination.cloudDecks.find(
      (d) => d.coverage === "BKN" || d.coverage === "OVC"
    );
    if (ceil) {
      const conflict =
        briefing.corridor.cruiseAltitudeFt > ceil.baseMslFt - 500 ||
        (briefing.corridor.decision.cloudBufferFt !== 99999 &&
          briefing.corridor.decision.cloudBufferFt < 500);
      const circle = new google.maps.Circle({
        map,
        center: {
          lat: briefing.corridor.destination.lat,
          lng: briefing.corridor.destination.lon,
        },
        radius: 12000,
        fillColor: conflict ? "#f43f5e" : "#64748b",
        fillOpacity: conflict ? 0.28 : 0.14,
        strokeColor: conflict ? "#e11d48" : "#94a3b8",
        strokeOpacity: 0.7,
        strokeWeight: 1,
        zIndex: 1,
      });
      overlaysRef.current.push(circle);
    }

    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds, { top: 80, bottom: 220, left: 60, right: 60 });

    // Cinematic tilt after fit
    const idle = map.addListener("idle", () => {
      map.setTilt(47);
      google.maps.event.removeListener(idle);
    });
  }, [briefing, ready]);

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-black/5">
          <p className="text-lg font-semibold text-slate-900">Google Maps key needed</p>
          <p className="mt-2 text-sm text-slate-500">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart.
          </p>
        </div>
      </div>
    );
  }

  const go = briefing?.corridor.decision.verdict === "GO";

  return (
    <div className="relative h-full w-full">
      <div ref={mapDivRef} className="absolute inset-0" />

      {!briefing && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-200/40 to-transparent" />
      )}

      {mapError && (
        <div className="absolute left-1/2 top-6 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-rose-600 px-4 py-3 text-center text-sm text-white shadow-xl">
          {mapError}
        </div>
      )}

      {briefing && (
        <>
          <div className="pointer-events-none absolute left-5 top-5 space-y-2">
            <div className="rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">
                {briefing.corridor.origin.icao} → {briefing.corridor.destination.icao}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {briefing.corridor.cruiseAltitudeFt.toLocaleString()} ft ·{" "}
                {briefing.intake.routeMode === "pilotage" ? "Pilotage" : "Straight"} ·{" "}
                {briefing.corridor.aircraft.modelName}
              </div>
            </div>
            <div
              className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold text-white shadow ${
                go ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              {go ? "GO corridor" : "NO-GO corridor"}
            </div>
          </div>

          {briefing.landmarks.length > 0 && (
            <div className="pointer-events-none absolute right-5 top-5 max-w-[210px] rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-black/5 backdrop-blur">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Visual cues
              </div>
              <ul className="mt-1.5 space-y-1">
                {briefing.landmarks.slice(0, 4).map((lm) => (
                  <li key={lm.id} className="text-[11px] font-medium text-slate-700">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {lm.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
