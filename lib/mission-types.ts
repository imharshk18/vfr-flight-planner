import type { AircraftProfile, FlightCorridor, WeightAndBalanceState } from "./aviation-types";

export type RouteMode = "straight" | "pilotage";

export type AltitudeMode = "recommended" | "manual";

export type MissionIntake = {
  originIcao: string;
  destinationIcao: string;
  routeMode: RouteMode;
  altitudeMode: AltitudeMode;
  cruiseAltitudeFt: number;
  departureLocal: string;
  aircraftId: string;
  wb: WeightAndBalanceState;
};

export type PilotageLandmark = {
  id: string;
  name: string;
  kind: "water" | "ridge" | "city" | "road" | "airport" | "landmark";
  lat: number;
  lon: number;
  cue: string;
  distanceNmFromOrigin: number;
};

export type MissionBriefing = {
  surface?: import("./terrain-surface").TerrainSurface;
  intake: MissionIntake;
  corridor: FlightCorridor;
  landmarks: PilotageLandmark[];
  weatherHorizonNote: string | null;
  generatedAt: string;
  weatherIntel?: import("./aviation-intel").WeatherIntel;
  flightProfile?: import("./flight-profile").FlightProfile;
  /** Plain-English synopsis (Gemini when available) */
  aiSynopsis?: string;
  aiSynopsisSource?: "gemini" | "local";
};

export type MissionPhase = "intake" | "briefing";
