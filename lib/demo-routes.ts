import type { StationWeather } from "./aviation-types";
import type { MissionIntake } from "./mission-types";

/**
 * Two locked demo missions for the pitch.
 * Weather packs are deterministic so GO vs NO-GO always reads clearly.
 */

export type DemoRouteId = "clear_vfr" | "marine_trap";

export type DemoRoute = {
  id: DemoRouteId;
  title: string;
  subtitle: string;
  badge: "GO demo" | "NO-GO demo";
  tone: "good" | "bad";
  originIcao: string;
  destinationIcao: string;
  cruiseAltitudeFt: number;
  routeMode: "straight" | "pilotage";
  weather: {
    origin: StationWeather;
    destination: StationWeather;
  };
};

export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: "clear_vfr",
    title: "KHWD → KRHV",
    subtitle: "East Bay hop · clear VFR · short corridor",
    badge: "GO demo",
    tone: "good",
    originIcao: "KHWD",
    destinationIcao: "KRHV",
    cruiseAltitudeFt: 3500,
    routeMode: "pilotage",
    weather: {
      origin: {
        icao: "KHWD",
        rawMetar: "KHWD 222050Z 28008KT 10SM SKC 19/08 A3001",
        flightCategory: "VFR",
        windSpeedKt: 8,
        windDirDeg: 280,
        tempC: 19,
        dewpointC: 8,
        altimeterInHg: 30.01,
        densityAltitudeFt: 420,
        ceilingAglFt: null,
        cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
      },
      destination: {
        icao: "KRHV",
        rawMetar: "KRHV 222050Z 30007KT 10SM SKC 20/07 A3000",
        flightCategory: "VFR",
        windSpeedKt: 7,
        windDirDeg: 300,
        tempC: 20,
        dewpointC: 7,
        altimeterInHg: 30.0,
        densityAltitudeFt: 680,
        ceilingAglFt: null,
        cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
      },
    },
  },
  {
    id: "marine_trap",
    title: "KHWD → KMRY",
    subtitle: "Marine layer trap · low OVC at Monterey",
    badge: "NO-GO demo",
    tone: "bad",
    originIcao: "KHWD",
    destinationIcao: "KMRY",
    cruiseAltitudeFt: 5500,
    routeMode: "pilotage",
    weather: {
      origin: {
        icao: "KHWD",
        rawMetar: "KHWD 222050Z 27010KT 10SM FEW025 17/09 A2998",
        flightCategory: "VFR",
        windSpeedKt: 10,
        windDirDeg: 270,
        tempC: 17,
        dewpointC: 9,
        altimeterInHg: 29.98,
        densityAltitudeFt: 510,
        ceilingAglFt: null,
        cloudDecks: [{ coverage: "FEW", baseAglFt: 2500, baseMslFt: 2552 }],
      },
      destination: {
        icao: "KMRY",
        rawMetar: "KMRY 222050Z 20012KT 4SM OVC012 13/12 A3001",
        flightCategory: "IFR",
        windSpeedKt: 12,
        windDirDeg: 200,
        tempC: 13,
        dewpointC: 12,
        altimeterInHg: 30.01,
        densityAltitudeFt: -180,
        ceilingAglFt: 1200,
        cloudDecks: [{ coverage: "OVC", baseAglFt: 1200, baseMslFt: 1457 }],
      },
    },
  },
];

export function intakeFromDemo(demo: DemoRoute): MissionIntake {
  return {
    originIcao: demo.originIcao,
    destinationIcao: demo.destinationIcao,
    routeMode: demo.routeMode,
    altitudeMode: "manual",
    cruiseAltitudeFt: demo.cruiseAltitudeFt,
    departureLocal: "", // filled client-side
    aircraftId: "c172s",
    wb: {
      pilotWeightLbs: 170,
      passengerWeightLbs: 0,
      baggageLbs: 15,
      fuelGallons: 40,
    },
  };
}
