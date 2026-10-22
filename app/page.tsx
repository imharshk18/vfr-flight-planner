"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import FlightHud from "@/components/flight-hud";
import type {
  FlightCorridor,
  WeightAndBalanceState,
  AircraftProfile,
} from "@/lib/aviation-types";
import {
  resolveAirport,
  fetchMetar,
  fetchTerrainProfile,
  fetchWindsAloft,
  fetchActiveTfrs,
  fetchRunwayData,
  haversineNm,
} from "@/lib/aviation-api";
import { runVfrRulesEngine, autoOptimizeCruiseAltitude } from "@/lib/vfr-rules-engine";
import { DEFAULT_AIRCRAFT, loadCustomAircraft } from "@/lib/aircraft-fleet";

// Dynamically import the canvas to avoid SSR issues with Three.js
const FlightCanvas = dynamic(() => import("@/components/flight-canvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#070709]">
      <div className="text-cyan-400 font-mono text-sm animate-pulse">
        INITIALIZING 3D ENGINE...
      </div>
    </div>
  ),
});

const DEFAULT_WB: WeightAndBalanceState = {
  pilotWeightLbs: 170,
  passengerWeightLbs: 0,
  baggageLbs: 20,
  fuelGallons: 40,
};

function getAircraftById(id: string): AircraftProfile {
  const all = [...DEFAULT_AIRCRAFT, ...loadCustomAircraft()];
  return all.find((a) => a.id === id) || DEFAULT_AIRCRAFT[1];
}

export default function Page() {
  const [origin, setOrigin] = useState("KSQL");
  const [destination, setDestination] = useState("KMRY");
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(3500);
  const [selectedAircraftId, setSelectedAircraftId] = useState("c172s");
  const [wb, setWb] = useState<WeightAndBalanceState>(DEFAULT_WB);
  const [corridor, setCorridor] = useState<FlightCorridor | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simulateMarineLayer, setSimulateMarineLayer] = useState(false);

  const fetchRoute = useCallback(
    async (
      dep: string,
      dest: string,
      alt: number,
      acId: string,
      currentWb: WeightAndBalanceState,
      simMarine: boolean
    ) => {
      if (!dep || !dest) return;
      setLoading(true);
      try {
        const aircraft = getAircraftById(acId);

        // Parallel resolution of airports and terrain
        const [originAp, destAp] = await Promise.all([
          resolveAirport(dep),
          resolveAirport(dest),
        ]);

        const midLat = (originAp.lat + destAp.lat) / 2;
        const midLon = (originAp.lon + destAp.lon) / 2;

        const [
          originWx,
          destWx,
          terrainProfile,
          winds,
          activeTfrs,
          origRunway,
          destRunway,
        ] = await Promise.all([
          fetchMetar(originAp.icao, originAp.elevationFt),
          fetchMetar(destAp.icao, destAp.elevationFt),
          fetchTerrainProfile(originAp, destAp),
          fetchWindsAloft(midLat, midLon),
          fetchActiveTfrs(),
          fetchRunwayData(originAp.icao),
          fetchRunwayData(destAp.icao),
        ]);

        // Blend winds aloft with surface winds
        const blendedOriginWx = {
          ...originWx,
          windSpeedKt: Math.round((originWx.windSpeedKt + winds.speedKt) / 2),
          windDirDeg: originWx.windDirDeg,
        };

        const decision = runVfrRulesEngine({
          origin: originAp,
          destination: destAp,
          aircraft,
          wb: currentWb,
          originWeather: blendedOriginWx,
          destWeather: destWx,
          terrainProfile,
          cruiseAltitudeFt: alt,
          tfrs: activeTfrs,
          destRunwayData: destRunway,
          simulateMarineLayerBurnOff: simMarine,
        });

        setCorridor({
          origin: originAp,
          destination: destAp,
          cruiseAltitudeFt: alt,
          aircraft,
          wb: currentWb,
          weather: { origin: blendedOriginWx, destination: destWx },
          terrainProfile,
          decision,
          tfrs: activeTfrs,
          runwayData: { origin: origRunway, destination: destRunway },
        });
      } catch (err) {
        console.error("Route fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-fetch on marine layer toggle change if corridor exists
  useEffect(() => {
    if (corridor) {
      fetchRoute(origin, destination, cruiseAltitudeFt, selectedAircraftId, wb, simulateMarineLayer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulateMarineLayer]);

  const handleFetchRoute = useCallback(() => {
    fetchRoute(origin, destination, cruiseAltitudeFt, selectedAircraftId, wb, simulateMarineLayer);
  }, [origin, destination, cruiseAltitudeFt, selectedAircraftId, wb, simulateMarineLayer, fetchRoute]);

  const handleAutoOptimize = useCallback(() => {
    if (!corridor) return;
    const optimal = autoOptimizeCruiseAltitude(
      corridor.terrainProfile,
      corridor.weather.origin,
      corridor.weather.destination,
      corridor.destination,
      getAircraftById(selectedAircraftId)
    );
    setCruiseAltitudeFt(optimal);
    fetchRoute(origin, destination, optimal, selectedAircraftId, wb, simulateMarineLayer);
  }, [corridor, origin, destination, selectedAircraftId, wb, simulateMarineLayer, fetchRoute]);

  const handlePreset = useCallback(
    (dep: string, dest: string, alt: number) => {
      setOrigin(dep);
      setDestination(dest);
      setCruiseAltitudeFt(alt);
      setProgress(0);
      fetchRoute(dep, dest, alt, selectedAircraftId, wb, simulateMarineLayer);
    },
    [selectedAircraftId, wb, simulateMarineLayer, fetchRoute]
  );

  const handleAircraftChange = useCallback(
    (id: string) => {
      setSelectedAircraftId(id);
      const ac = getAircraftById(id);
      const newFuel = Math.min(wb.fuelGallons, ac.usableFuelGal);
      const newWb = { ...wb, fuelGallons: newFuel };
      setWb(newWb);
      if (corridor) {
        fetchRoute(origin, destination, cruiseAltitudeFt, id, newWb, simulateMarineLayer);
      }
    },
    [wb, corridor, origin, destination, cruiseAltitudeFt, simulateMarineLayer, fetchRoute]
  );

  const handleWbChange = useCallback(
    (newWb: WeightAndBalanceState) => {
      setWb(newWb);
      if (corridor) {
        fetchRoute(origin, destination, cruiseAltitudeFt, selectedAircraftId, newWb, simulateMarineLayer);
      }
    },
    [corridor, origin, destination, cruiseAltitudeFt, selectedAircraftId, simulateMarineLayer, fetchRoute]
  );

  const handleCruiseAltChange = useCallback(
    (alt: number) => {
      setCruiseAltitudeFt(alt);
      if (corridor) {
        fetchRoute(origin, destination, alt, selectedAircraftId, wb, simulateMarineLayer);
      }
    },
    [corridor, origin, destination, selectedAircraftId, wb, simulateMarineLayer, fetchRoute]
  );

  return (
    <div className="h-screen w-screen flex bg-[#070709] overflow-hidden">
      {/* 3D Canvas - takes most of the screen */}
      <div className="flex-1 relative">
        <FlightCanvas corridor={corridor} progress={progress} />

        {/* Overlay status bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center gap-2 pointer-events-none">
          {loading && (
            <div className="bg-cyan-950/80 border border-cyan-700/60 rounded px-3 py-1.5 text-xs font-mono text-cyan-300 backdrop-blur-sm">
              FETCHING LIVE WEATHER AND TERRAIN DATA...
            </div>
          )}
          {corridor && !loading && (
            <div className="bg-black/60 border border-slate-700/40 rounded px-3 py-1.5 text-xs font-mono text-slate-400 backdrop-blur-sm">
              {corridor.origin.icao} to {corridor.destination.icao} |{" "}
              {Math.round(haversineNm(
                corridor.origin.lat,
                corridor.origin.lon,
                corridor.destination.lat,
                corridor.destination.lon
              ))} NM |{" "}
              {cruiseAltitudeFt.toLocaleString()} ft MSL |{" "}
              {corridor.aircraft.modelName}
            </div>
          )}
        </div>
      </div>

      {/* HUD panel */}
      <div className="w-80 border-l border-cyan-900/30 flex-shrink-0 overflow-hidden">
        <FlightHud
          origin={origin}
          destination={destination}
          cruiseAltitudeFt={cruiseAltitudeFt}
          selectedAircraftId={selectedAircraftId}
          wb={wb}
          corridor={corridor}
          loading={loading}
          progress={progress}
          simulateMarineLayer={simulateMarineLayer}
          onOriginChange={setOrigin}
          onDestinationChange={setDestination}
          onCruiseAltChange={handleCruiseAltChange}
          onAircraftChange={handleAircraftChange}
          onWbChange={handleWbChange}
          onFetchRoute={handleFetchRoute}
          onProgressChange={setProgress}
          onSimulateMarineLayerChange={setSimulateMarineLayer}
          onAutoOptimize={handleAutoOptimize}
          onPreset={handlePreset}
        />
      </div>
    </div>
  );
}
