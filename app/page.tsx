"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Cloud,
  Compass,
  Layers3,
  Maximize,
  Pause,
  Plane,
  Play,
  RotateCcw,
  Settings2,
} from "lucide-react";
import MissionIntakeModal from "@/components/mission-intake";
import CockpitHud from "@/components/cockpit-hud";
import type { MissionBriefing, MissionIntake } from "@/lib/mission-types";
import type { ViewMode } from "@/components/flight-scene";
import {
  resolveAirport,
  fetchRunwayData,
  haversineNm,
  interpolateGreatCircle,
  computeCourseDeg,
} from "@/lib/aviation-api";
import { gatherWeatherIntel, selectRunway } from "@/lib/aviation-intel";
import {
  buildFlightProfile,
  fetchWindsAlongRoute,
} from "@/lib/flight-profile";
import { loadTerrainSurface, surfaceProfile } from "@/lib/terrain-surface";
import {
  runVfrRulesEngine,
  autoOptimizeCruiseAltitude,
} from "@/lib/vfr-rules-engine";
import { DEFAULT_AIRCRAFT } from "@/lib/aircraft-fleet";
import {
  selectPilotageLandmarks,
  buildPilotageWaypoints,
} from "@/lib/pilotage-landmarks";
import type { DemoRoute } from "@/lib/demo-routes";

const FlightScene = dynamic(() => import("@/components/flight-scene"), {
  ssr: false,
  loading: () => <div className="scene-failure">Starting 3D engine…</div>,
});

export default function Page() {
  const [briefing, setBriefing] = useState<MissionBriefing | null>(null);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("orbit");
  const [clouds, setClouds] = useState(true);
  const [exaggeration, setExaggeration] = useState(2.5);
  const [progress, setProgress] = useState(0.08);
  const [playing, setPlaying] = useState(false);
  const [reset, setReset] = useState(0);

  useEffect(() => {
    if (!playing || editing) return;
    const timer = setInterval(
      () => setProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.0015))),
      80
    );
    return () => clearInterval(timer);
  }, [playing, editing]);

  const buildMission = useCallback(async (intake: MissionIntake, _demo?: DemoRoute) => {
    setLoading(true);
    setError(null);
    setStatus("Resolving airports…");
    try {
      if (intake.originIcao === intake.destinationIcao) {
        throw new Error("Choose different departure and arrival airports.");
      }
      const aircraft = DEFAULT_AIRCRAFT.find((a) => a.id === intake.aircraftId)!;
      const [origin, destination] = await Promise.all([
        resolveAirport(intake.originIcao),
        resolveAirport(intake.destinationIcao),
      ]);
      if (haversineNm(origin.lat, origin.lon, destination.lat, destination.lon) > 600) {
        throw new Error("This 3D rehearsal supports regional routes up to 600 NM.");
      }

      const landmarks = selectPilotageLandmarks(origin, destination, intake.routeMode, 5);
      const nodes =
        intake.routeMode === "pilotage"
          ? buildPilotageWaypoints(origin, destination, landmarks)
          : interpolateGreatCircle(
              origin.lat,
              origin.lon,
              destination.lat,
              destination.lon,
              64
            );
      const points = nodes.flatMap((p, i) =>
        i
          ? interpolateGreatCircle(
              nodes[i - 1].lat,
              nodes[i - 1].lon,
              p.lat,
              p.lon,
              4
            ).slice(1)
          : [p]
      );

      setStatus("Loading terrain mesh…");
      const surface = await loadTerrainSurface(points, setStatus);
      if (!surface.elevationComplete) {
        throw new Error("Some elevation tiles could not load. Retry to build the full 3D terrain.");
      }
      const terrainProfile = surfaceProfile(surface, points, haversineNm);
      const routeNm =
        terrainProfile.at(-1)?.distanceNm ||
        haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
      const courseDeg = computeCourseDeg(
        origin.lat,
        origin.lon,
        destination.lat,
        destination.lon
      );

      // Rough ETA for TAF period selection (refined after profile)
      const roughHours = routeNm / Math.max(80, aircraft.cruiseTasKt * 0.85);
      const depMs = new Date(intake.departureLocal || Date.now()).getTime();
      const etaLocal = new Date(depMs + roughHours * 3600 * 1000).toISOString();

      setStatus("Pulling METAR, TAF windows, enroute forecasts, PIREPs, AIRMETs…");
      // Demo presets only fix the route (save Google credits). Weather is always live NOAA.
      const [intel, origRunway, destRunway, windSamples] = await Promise.all([
        gatherWeatherIntel({
          origin,
          destination,
          departureLocal: intake.departureLocal || new Date().toISOString(),
          etaLocal,
          cruiseAltitudeFt: intake.cruiseAltitudeFt || 4500,
        }),
        fetchRunwayData(origin.icao),
        fetchRunwayData(destination.icao),
        fetchWindsAlongRoute(points, intake.cruiseAltitudeFt || 4500),
      ]);

      const cruiseAltitudeFt =
        intake.altitudeMode === "recommended"
          ? autoOptimizeCruiseAltitude(
              terrainProfile,
              intel.originForecast,
              intel.destForecast,
              destination,
              origin,
              aircraft,
              courseDeg,
              routeNm
            )
          : Math.max(3500, intake.cruiseAltitudeFt);

      const depRunway = selectRunway(
        origRunway,
        intel.originForecast.windDirDeg,
        intel.originForecast.windSpeedKt,
        aircraft.maxCrosswindKt,
        origin.icao
      );
      const arrRunway = selectRunway(
        destRunway,
        intel.destForecast.windDirDeg,
        intel.destForecast.windSpeedKt,
        aircraft.maxCrosswindKt,
        destination.icao
      );

      // Climb rate at departure DA for profile
      const originDA =
        origin.elevationFt +
        (29.92 - intel.originObs.altimeterInHg) * 1000 +
        120 *
          (intel.originObs.tempC -
            (15 - 2 * ((origin.elevationFt + (29.92 - intel.originObs.altimeterInHg) * 1000) / 1000)));
      const climbFpm = Math.max(
        50,
        aircraft.seaLevelClimbFpm - (originDA / 1000) * 48
      );

      setStatus("Building performance profile…");
      const flightProfile = buildFlightProfile({
        origin,
        destination,
        aircraft,
        cruiseAltitudeFt,
        climbFpm,
        terrainProfile,
        windSamples,
        depRunway,
        arrRunway,
      });

      const tfrs = intel.tfrs.filter((t) =>
        intel.advisories.some((a) => a.id === t.id && a.intersectsRoute)
      );

      const decision = runVfrRulesEngine({
        origin,
        destination,
        aircraft,
        wb: intake.wb,
        originWeather: intel.originObs,
        destWeather: intel.destObs,
        originForecastWeather: intel.originForecast,
        destForecastWeather: intel.destForecast,
        terrainProfile,
        cruiseAltitudeFt,
        tfrs,
        destRunwayData: destRunway,
        pireps: intel.pireps,
        advisories: intel.advisories,
        depRunway,
        arrRunway,
        profileTimeMin: flightProfile.totalTimeMin,
        profileAvgGs: flightProfile.avgGroundSpeedKt,
      });

      if (
        [intel.originObs, intel.destObs].some(
          (w) => w.source === "cached" || w.source === "unavailable"
        )
      ) {
        decision.cautions.unshift(
          "One or more METARs fell back to cache. Treat GO with extra caution."
        );
      }

      setBriefing({
        surface,
        intake: { ...intake, cruiseAltitudeFt },
        corridor: {
          origin,
          destination,
          aircraft,
          wb: intake.wb,
          weather: {
            origin: intel.originForecast,
            destination: intel.destForecast,
          },
          cruiseAltitudeFt,
          terrainProfile,
          decision,
          tfrs,
          runwayData: { origin: origRunway, destination: destRunway },
        },
        landmarks,
        weatherHorizonNote: null,
        generatedAt: new Date().toISOString(),
        weatherIntel: intel,
        flightProfile,
      });
      setEditing(false);
      setProgress(0.05);
      setPlaying(false);
      setView("orbit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build this flight. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  const corridor = briefing?.corridor;
  const d = corridor?.decision;
  const course = corridor
    ? computeCourseDeg(
        corridor.origin.lat,
        corridor.origin.lon,
        corridor.destination.lat,
        corridor.destination.lon
      )
    : 0;

  return (
    <main className={`flight-deck${briefing && view === "orbit" ? " brief-world" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setEditing(true)} aria-label="AeroTwin home">
          <span className="brand-icon">
            <Plane size={21} />
          </span>
          AERO<span>TWIN</span>
          <small>FLIGHT REHEARSAL</small>
        </button>
        <div className="top-status">
          <span className="status-dot good" /> SYSTEM READY <span className="divider" /> VFR / DAY
          {briefing?.weatherIntel && (
            <>
              <span className="divider" />
              {briefing.weatherIntel.sourcesUsed.join(" · ")}
            </>
          )}
        </div>
        <button className="quiet-button" onClick={() => setEditing(true)}>
          <Settings2 size={15} /> Flight setup
        </button>
      </header>

      <div
        className={`scene-stage ${briefing ? "has-brief" : ""}`}
        data-verdict={d?.verdict || undefined}
      >
        {briefing ? (
          <FlightScene
            briefing={briefing}
            progress={progress}
            view={view}
            clouds={clouds}
            exaggeration={exaggeration}
            reset={reset}
            briefZoom={view === "orbit"}
          />
        ) : (
          <div className="standby-scene">
            <div className="standby-grid" />
            <Compass size={250} strokeWidth={0.4} />
            <span>AEROTWIN / SYNTHETIC VISION</span>
          </div>
        )}

        {briefing && corridor && d && view === "orbit" && (
          <CockpitHud
            briefing={briefing}
            onEdit={() => setEditing(true)}
            onVisualize={() => {
              setProgress(0.05);
              setReset((r) => r + 1);
              setView("follow");
              setPlaying(true);
            }}
          />
        )}

        {briefing && corridor && d && (
          <>
            <div className="view-controls segmented">
              {(["orbit", "follow", "profile"] as const).map((v) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => {
                    setView(v);
                    if (v === "follow") {
                      setPlaying(true);
                      setProgress((p) => (p < 0.02 ? 0.05 : p));
                    } else {
                      setPlaying(false);
                    }
                  }}
                >
                  {v === "orbit" ? (
                    <Compass size={14} />
                  ) : v === "follow" ? (
                    <Plane size={14} />
                  ) : (
                    <Layers3 size={14} />
                  )}
                  {v === "orbit" ? "Brief" : v === "follow" ? "Fly" : "Side"}
                </button>
              ))}
            </div>
            <div className="scene-tools">
              <button
                title="Reset camera"
                aria-label="Reset camera"
                onClick={() => {
                  setView("orbit");
                  setPlaying(false);
                  setReset((r) => r + 1);
                }}
              >
                <RotateCcw size={17} />
              </button>
              <button
                title="Cloud layers"
                aria-label="Toggle cloud layers"
                aria-pressed={clouds}
                className={clouds ? "active" : ""}
                onClick={() => setClouds((c) => !c)}
              >
                <Cloud size={17} />
              </button>
              <button
                title="Toggle vertical scale"
                onClick={() => setExaggeration((v) => (v === 2.5 ? 1.6 : v === 1.6 ? 3.2 : 2.5))}
              >
                {exaggeration}×
              </button>
              <button
                title="Full screen"
                aria-label="Toggle full screen"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else
                    void document.documentElement
                      .requestFullscreen()
                      .catch(() =>
                        setError("Full screen is unavailable in this browser.")
                      );
                }}
              >
                <Maximize size={17} />
              </button>
            </div>
            {view !== "orbit" && (
              <>
                <div className="heading-indicator">
                  <span>HDG</span>
                  <b>{Math.round(course).toString().padStart(3, "0")}°</b>
                  <div>W ─── N ─── E</div>
                </div>
                <div className="attribution">
                  Imagery © Esri/Maxar · Elev Mapzen/AWS · Wx NOAA AWC
                </div>
              </>
            )}
          </>
        )}
      </div>

      {corridor && d && view !== "orbit" && (
        <footer className="instrument-panel">
          <div className="playback">
            <button
              className="play-button"
              aria-label={playing ? "Pause flight" : "Play flight"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <div>
              <div className="playback-label">
                <span>FLIGHT PLAYBACK</span>
                <b>{Math.round(progress * 100)}%</b>
              </div>
              <input
                aria-label="Flight progress"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
              />
              <div className="playback-ends">
                <span>{corridor.origin.icao}</span>
                <span>
                  {briefing?.flightProfile
                    ? `${briefing.flightProfile.samples[Math.floor(progress * (briefing.flightProfile.samples.length - 1))]?.phase.toUpperCase() || "CRUISE"}`
                    : "CRUISE"}
                </span>
                <span>{corridor.destination.icao}</span>
              </div>
            </div>
          </div>
          <div className="instrument">
            <span>CRUISE ALT / MSL</span>
            <strong>
              {corridor.cruiseAltitudeFt.toLocaleString()}
              <small>FT</small>
            </strong>
            <em>
              {briefing?.intake.altitudeMode === "recommended"
                ? "AUTO RECOMMENDED"
                : "PILOT SELECTED"}
            </em>
          </div>
          <div className="instrument">
            <span>GROUND SPEED</span>
            <strong>
              {d.groundSpeedKt}
              <small>KT</small>
            </strong>
            <em>PROFILE AVG</em>
          </div>
          <div className="instrument">
            <span>TIME ENROUTE</span>
            <strong>
              {d.estimatedTimeEnrouteMin}
              <small>MIN</small>
            </strong>
            <em>FULL ROUTE</em>
          </div>
          <div className="instrument fuel">
            <span>FUEL REQUIRED</span>
            <strong>
              {d.fuelRequiredGal}
              <small>GAL</small>
            </strong>
            <em>{d.reserveFuelRemainingGal} GAL REMAINING</em>
          </div>
        </footer>
      )}

      {editing && (
        <MissionIntakeModal
          key={briefing?.generatedAt || "initial"}
          initial={briefing?.intake}
          loading={loading}
          status={status}
          onSubmit={buildMission}
          onClose={briefing ? () => setEditing(false) : undefined}
        />
      )}
      {error && (
        <div role="alert" className="error-toast">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
