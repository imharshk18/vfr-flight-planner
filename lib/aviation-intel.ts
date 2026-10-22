import type { AirportLocation, StationWeather, CloudDeck } from "./aviation-types";
import { fetchMetar, haversineNm, fetchActiveTfrs } from "./aviation-api";
import type { TfrZone } from "./aviation-types";

export type TafPeriod = {
  timeFrom: number;
  timeTo: number;
  changeIndicator?: string;
  wspd?: number;
  wdir?: number | string;
  visib?: number | string;
  clouds?: { cover: string; base: number }[];
  raw?: string;
};

export type TafBundle = {
  icao: string;
  raw: string;
  issueTime?: string;
  periods: TafPeriod[];
  source: "TAF" | "unavailable";
};

export type PirepReport = {
  id: string;
  raw: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  aircraft?: string;
  turbulence?: string;
  icing?: string;
  visibilitySm?: number | null;
  clouds?: string;
  ageHours: number;
  severity: "info" | "caution" | "severe";
  summary: string;
};

export type HazardAdvisory = {
  id: string;
  product: "G-AIRMET" | "SIGMET" | "CWA" | "TFR";
  hazard: string;
  severity: "info" | "caution" | "severe";
  raw: string;
  validFrom?: string;
  validTo?: string;
  intersectsRoute: boolean;
  summary: string;
};

export type RunwayRecommendation = {
  icao: string;
  designation: string; // e.g. "28L"
  reciprocal: string;
  lengthFt: number;
  headingDeg: number;
  headwindKt: number;
  crosswindKt: number;
  reason: string;
  legal: boolean;
};

export type EnrouteStationIntel = {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
  weather: StationWeather;
  taf: TafBundle;
  periodFrom?: number;
  periodTo?: number;
};

export type WeatherIntel = {
  originObs: StationWeather;
  destObs: StationWeather;
  originForecast: StationWeather;
  destForecast: StationWeather;
  originTaf: TafBundle;
  destTaf: TafBundle;
  originPeriodFrom?: number;
  originPeriodTo?: number;
  destPeriodFrom?: number;
  destPeriodTo?: number;
  enroute: EnrouteStationIntel[];
  pireps: PirepReport[];
  advisories: HazardAdvisory[];
  tfrs: TfrZone[];
  sourcesUsed: string[];
  fetchedAt: string;
};

/** Nearby TAF stations used to sample forecast along Bay Area / NorCal demos. */
const ENROUTE_TAF_POOL: Array<{
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
}> = [
  { icao: "KOAK", name: "Oakland", lat: 37.7213, lon: -122.2207, elevationFt: 9 },
  { icao: "KSFO", name: "San Francisco", lat: 37.6213, lon: -122.379, elevationFt: 13 },
  { icao: "KSJC", name: "San Jose", lat: 37.3626, lon: -121.929, elevationFt: 62 },
  { icao: "KSQL", name: "San Carlos", lat: 37.5119, lon: -122.2495, elevationFt: 5 },
  { icao: "KLVK", name: "Livermore", lat: 37.6934, lon: -121.8203, elevationFt: 400 },
  { icao: "KWVI", name: "Watsonville", lat: 36.9357, lon: -121.7896, elevationFt: 163 },
  { icao: "KSNS", name: "Salinas", lat: 36.6628, lon: -121.6064, elevationFt: 85 },
  { icao: "KMRY", name: "Monterey", lat: 36.587, lon: -121.8429, elevationFt: 257 },
  { icao: "KMOD", name: "Modesto", lat: 37.6258, lon: -120.9544, elevationFt: 97 },
];

function category(
  ceilingAglFt: number | null,
  visibilitySm: number
): StationWeather["flightCategory"] {
  const ceil = ceilingAglFt ?? 99999;
  if (ceil < 500 || visibilitySm < 1) return "LIFR";
  if (ceil < 1000 || visibilitySm < 3) return "IFR";
  if (ceil < 3000 || visibilitySm < 5) return "MVFR";
  return "VFR";
}

function parseClouds(
  clouds: { cover: string; base: number }[] | undefined,
  elevFt: number
): CloudDeck[] {
  if (!clouds?.length) return [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }];
  const decks = clouds
    .filter((c) => ["FEW", "SCT", "BKN", "OVC", "SKC", "CLR"].includes(c.cover))
    .map((c) => {
      const coverage = (c.cover === "CLR" ? "SKC" : c.cover) as CloudDeck["coverage"];
      const baseAglFt = c.base ?? 0;
      return { coverage, baseAglFt, baseMslFt: baseAglFt + elevFt };
    });
  return decks.length ? decks : [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }];
}

async function apiGet(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api/aviation?${qs}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`aviation proxy ${res.status}`);
  return res.json();
}

/** Airports that often lack their own TAF — borrow a nearby issued TAF. */
const TAF_NEIGHBORS: Record<string, string[]> = {
  KHWD: ["KOAK", "KSFO", "KSQL", "KSJC"],
  KRHV: ["KSJC", "KNUQ", "KPAO", "KOAK"],
  KPAO: ["KSQL", "KSJC", "KOAK"],
  KSQL: ["KSFO", "KOAK", "KPAO"],
  KLVK: ["KOAK", "KSJC"],
  KWVI: ["KSNS", "KMRY"],
};

export async function fetchTafBundle(icao: string): Promise<TafBundle> {
  try {
    const data = (await apiGet({ kind: "taf", ids: icao })) as Array<{
      rawTAF?: string;
      issueTime?: string;
      fcsts?: TafPeriod[];
    }>;
    const taf = Array.isArray(data) ? data[0] : null;
    if (!taf?.fcsts?.length && !taf?.rawTAF) throw new Error("empty");
    return {
      icao,
      raw: taf.rawTAF || "",
      issueTime: taf.issueTime,
      periods: taf.fcsts || [],
      source: "TAF",
    };
  } catch {
    return { icao, raw: "", periods: [], source: "unavailable" };
  }
}

/** Prefer the station TAF; if missing, pull the nearest neighbor that publishes one. */
export async function fetchTafWithNeighbors(icao: string): Promise<TafBundle & { proxyIcao?: string }> {
  const own = await fetchTafBundle(icao);
  if (own.source === "TAF" && own.periods.length) return own;

  for (const neighbor of TAF_NEIGHBORS[icao.toUpperCase()] || []) {
    const proxied = await fetchTafBundle(neighbor);
    if (proxied.source === "TAF" && proxied.periods.length) {
      return {
        ...proxied,
        icao, // keep requested station for UI
        proxyIcao: neighbor,
        raw: `${proxied.raw} (via ${neighbor})`,
      };
    }
  }
  return own;
}

function pickTafPeriod(periods: TafPeriod[], atSec: number): {
  period: TafPeriod | null;
  overlapping: TafPeriod[];
} {
  const overlapping = periods.filter((p) => p.timeFrom <= atSec && atSec < p.timeTo);
  // Prefer prevailing FM/BASE over TEMPO/PROB for the primary category
  const prevailing =
    overlapping.filter((p) => !p.changeIndicator || p.changeIndicator === "FM").at(-1) ||
    overlapping.at(-1) ||
    null;
  return { period: prevailing, overlapping };
}

function fmtWindow(from: number, to: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${new Date(from * 1000).toLocaleString(undefined, opts)} → ${new Date(
    to * 1000
  ).toLocaleString(undefined, opts)}`;
}

/** Station weather at a specific epoch using TAF periods; falls back to METAR. */
export async function weatherAtTime(
  icao: string,
  elevationFt: number,
  whenIso: string,
  role: "departure" | "arrival" | "enroute"
): Promise<{
  weather: StationWeather;
  taf: TafBundle;
  periodFrom?: number;
  periodTo?: number;
}> {
  const observed = await fetchMetar(icao, elevationFt);
  const taf = await fetchTafWithNeighbors(icao);
  const at = new Date(whenIso).getTime() / 1000;
  const proxyNote =
    "proxyIcao" in taf && taf.proxyIcao
      ? `TAF borrowed from nearby ${taf.proxyIcao} (no issued TAF at ${icao}). `
      : "";

  if (!Number.isFinite(at) || taf.source === "unavailable" || !taf.periods.length) {
    return {
      weather: {
        ...observed,
        source: observed.rawMetar.includes("UNAVAILABLE") ? "unavailable" : "METAR",
        forecastNote:
          role === "arrival"
            ? "No TAF covers your ETA. Using current METAR (may not match arrival)."
            : "No TAF covers this time. Using current METAR.",
      },
      taf,
    };
  }

  const { period, overlapping } = pickTafPeriod(taf.periods, at);

  if (!period) {
    // Closest period by start time if outside coverage
    const sorted = [...taf.periods].sort(
      (a, b) => Math.abs(a.timeFrom - at) - Math.abs(b.timeFrom - at)
    );
    const near = sorted[0];
    return {
      weather: {
        ...observed,
        source: "METAR",
        forecastNote: near
          ? `Outside TAF coverage for ${role}. Nearest TAF window ${fmtWindow(
              near.timeFrom,
              near.timeTo
            )}. Showing METAR.`
          : `Outside TAF coverage for ${role}. Showing latest METAR.`,
      },
      taf,
      periodFrom: near?.timeFrom,
      periodTo: near?.timeTo,
    };
  }

  const cloudDecks = parseClouds(period.clouds, elevationFt);
  const ceilings = cloudDecks.filter((c) => c.coverage === "BKN" || c.coverage === "OVC");
  const ceilingAglFt = ceilings.length
    ? Math.min(...ceilings.map((c) => c.baseAglFt))
    : null;
  const visibility = parseFloat(String(period.visib ?? 10));
  const tempoOrProb = overlapping.some(
    (p) => p.changeIndicator && p.changeIndicator !== "FM"
  );

  return {
    weather: {
      ...observed,
      source: "TAF",
      validTime: new Date(at * 1000).toISOString(),
      rawMetar: taf.raw || observed.rawMetar,
      cloudDecks,
      ceilingAglFt,
      windSpeedKt: period.wspd ?? observed.windSpeedKt,
      windDirDeg:
        typeof period.wdir === "number" ? period.wdir : observed.windDirDeg,
      visibilitySm: Number.isFinite(visibility) ? visibility : observed.visibilitySm,
      flightCategory: category(ceilingAglFt, visibility),
      forecastNote: tempoOrProb
        ? `${proxyNote}TAF window ${fmtWindow(period.timeFrom, period.timeTo)} for ${role}. TEMPO/PROB also in this window — conditions may briefly worsen.`
        : `${proxyNote}TAF window ${fmtWindow(period.timeFrom, period.timeTo)} selected for ${role} time (TAFs refresh ~every 6 hours).`,
    },
    taf,
    periodFrom: period.timeFrom,
    periodTo: period.timeTo,
  };
}

async function fetchEnrouteTafs(
  origin: AirportLocation,
  destination: AirportLocation,
  whenIso: string
): Promise<EnrouteStationIntel[]> {
  const midLat = (origin.lat + destination.lat) / 2;
  const midLon = (origin.lon + destination.lon) / 2;
  const picks = ENROUTE_TAF_POOL.filter(
    (s) =>
      s.icao !== origin.icao &&
      s.icao !== destination.icao &&
      pointNearRoute(s.lat, s.lon, origin, destination, 35)
  )
    .sort(
      (a, b) =>
        haversineNm(a.lat, a.lon, midLat, midLon) -
        haversineNm(b.lat, b.lon, midLat, midLon)
    )
    .slice(0, 3);

  const results = await Promise.all(
    picks.map(async (s) => {
      const { weather, taf, periodFrom, periodTo } = await weatherAtTime(
        s.icao,
        s.elevationFt,
        whenIso,
        "enroute"
      );
      return {
        icao: s.icao,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        elevationFt: s.elevationFt,
        weather,
        taf,
        periodFrom,
        periodTo,
      };
    })
  );
  return results;
}

function routeBbox(
  origin: AirportLocation,
  destination: AirportLocation,
  padDeg = 0.75
): string {
  const minLat = Math.min(origin.lat, destination.lat) - padDeg;
  const maxLat = Math.max(origin.lat, destination.lat) + padDeg;
  const minLon = Math.min(origin.lon, destination.lon) - padDeg;
  const maxLon = Math.max(origin.lon, destination.lon) + padDeg;
  // AWC bbox: west,south,east,north
  return `${minLon.toFixed(3)},${minLat.toFixed(3)},${maxLon.toFixed(3)},${maxLat.toFixed(3)}`;
}

function pointNearRoute(
  lat: number,
  lon: number,
  origin: AirportLocation,
  destination: AirportLocation,
  widthNm: number
): boolean {
  const steps = 24;
  let min = Infinity;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const pLat = origin.lat + (destination.lat - origin.lat) * f;
    const pLon = origin.lon + (destination.lon - origin.lon) * f;
    min = Math.min(min, haversineNm(lat, lon, pLat, pLon));
  }
  return min <= widthNm;
}

export async function fetchRoutePireps(
  origin: AirportLocation,
  destination: AirportLocation,
  cruiseFt: number
): Promise<PirepReport[]> {
  const bbox = routeBbox(origin, destination);
  try {
    const data = (await apiGet({
      kind: "pirep",
      bbox,
      age: "6",
      level: String(Math.round(cruiseFt)),
    })) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) return [];

    return data
      .map((p, i) => {
        const lat = Number(p.lat ?? p.latitude);
        const lon = Number(p.lon ?? p.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        if (!pointNearRoute(lat, lon, origin, destination, 40)) return null;
        const raw = String(p.rawOb || p.raw || p.report || "");
        const turb = String(p.tbInten1 || p.turbulence || "");
        const ice = String(p.icgInten1 || p.icing || "");
        const alt = p.fltLvl != null ? Number(p.fltLvl) * 100 : p.altitude != null ? Number(p.altitude) : null;
        const ageHours =
          p.obsTime != null
            ? Math.max(0, (Date.now() / 1000 - Number(p.obsTime)) / 3600)
            : 0;
        let severity: PirepReport["severity"] = "info";
        if (/SEV|SEVERE|HVY|HEAVY/i.test(`${turb} ${ice} ${raw}`)) severity = "severe";
        else if (/MOD|MODERATE/i.test(`${turb} ${ice} ${raw}`)) severity = "caution";
        return {
          id: String(p.receiptTime || p.obsTime || i),
          raw,
          lat,
          lon,
          altitudeFt: Number.isFinite(alt as number) ? (alt as number) : null,
          aircraft: p.acType ? String(p.acType) : undefined,
          turbulence: turb || undefined,
          icing: ice || undefined,
          ageHours: Math.round(ageHours * 10) / 10,
          severity,
          summary:
            [
              turb && `Turb ${turb}`,
              ice && `Ice ${ice}`,
              alt != null && `FL${Math.round((alt as number) / 100)}`,
            ]
              .filter(Boolean)
              .join(" · ") || raw.slice(0, 80),
        } as PirepReport;
      })
      .filter(Boolean) as PirepReport[];
  } catch {
    return [];
  }
}

function advisoryIntersects(
  coords: Array<{ lat: number; lon: number }> | undefined,
  origin: AirportLocation,
  destination: AirportLocation
): boolean {
  if (!coords?.length) {
    // If no geometry, keep as regional caution (don't hard-block)
    return false;
  }
  return coords.some((c) => pointNearRoute(c.lat, c.lon, origin, destination, 50));
}

export async function fetchRouteAdvisories(
  origin: AirportLocation,
  destination: AirportLocation
): Promise<HazardAdvisory[]> {
  const bbox = routeBbox(origin, destination, 1.2);
  const out: HazardAdvisory[] = [];

  try {
    const gair = (await apiGet({ kind: "gairmet", bbox })) as Array<Record<string, unknown>>;
    if (Array.isArray(gair)) {
      for (const g of gair.slice(0, 40)) {
        const hazard = String(g.hazard || g.product || "G-AIRMET");
        const raw = String(g.rawAirmet || g.raw || JSON.stringify(g).slice(0, 200));
        const coords = Array.isArray(g.coords)
          ? (g.coords as Array<{ lat?: number; lon?: number }>).map((c) => ({
              lat: Number(c.lat),
              lon: Number(c.lon),
            })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
          : undefined;
        const intersects = advisoryIntersects(coords, origin, destination);
        const severe = /IFR|ICE|TURB|MTN|SFC_WND|LLWS/i.test(hazard);
        out.push({
          id: `gair-${g.tag || g.receiptTime || out.length}`,
          product: "G-AIRMET",
          hazard,
          severity: severe && intersects ? "caution" : "info",
          raw,
          validFrom: g.validTime ? String(g.validTime) : undefined,
          validTo: g.expireTime ? String(g.expireTime) : undefined,
          intersectsRoute: intersects,
          summary: `G-AIRMET ${hazard}${intersects ? " near corridor" : " in region"}`,
        });
      }
    }
  } catch {
    /* keep going */
  }

  try {
    const sigs = (await apiGet({ kind: "airsigmet", bbox })) as Array<Record<string, unknown>>;
    if (Array.isArray(sigs)) {
      for (const s of sigs.slice(0, 30)) {
        const hazard = String(s.hazard || s.airSigmetType || "SIGMET");
        const raw = String(s.rawSigmet || s.raw || "");
        const coords = Array.isArray(s.coords)
          ? (s.coords as Array<{ lat?: number; lon?: number }>).map((c) => ({
              lat: Number(c.lat),
              lon: Number(c.lon),
            })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
          : undefined;
        const intersects = advisoryIntersects(coords, origin, destination);
        out.push({
          id: `sig-${s.airSigmetId || s.receiptTime || out.length}`,
          product: "SIGMET",
          hazard,
          severity: intersects ? "severe" : "caution",
          raw,
          intersectsRoute: intersects,
          summary: intersects
            ? `SIGMET ${hazard} intersects corridor: ${raw.slice(0, 100)}`
            : `SIGMET ${hazard} in region (not on corridor): ${raw.slice(0, 80)}`,
        });
      }
    }
  } catch {
    /* keep going */
  }

  try {
    const cwas = (await apiGet({ kind: "cwa", bbox })) as Array<Record<string, unknown>>;
    if (Array.isArray(cwas)) {
      for (const c of cwas.slice(0, 20)) {
        const raw = String(c.rawCwa || c.raw || "");
        out.push({
          id: `cwa-${c.cwsu || c.receiptTime || out.length}`,
          product: "CWA",
          hazard: String(c.hazard || "CWA"),
          severity: "caution",
          raw,
          intersectsRoute: true,
          summary: `CWA: ${raw.slice(0, 120)}`,
        });
      }
    }
  } catch {
    /* keep going */
  }

  const tfrs = await fetchActiveTfrs();
  for (const t of tfrs) {
    const near = pointNearRoute(t.centerLat, t.centerLon, origin, destination, t.radiusNm + 15);
    out.push({
      id: t.id,
      product: "TFR",
      hazard: "TFR",
      severity: near ? "severe" : "info",
      raw: `${t.notamRef} ${t.name}`,
      intersectsRoute: near,
      summary: `TFR ${t.name} (${t.notamRef}) SFC-${t.ceilingMsl.toLocaleString()} ft`,
    });
  }

  return out;
}

export function selectRunway(
  runwayData: { runways: Array<{ designation: string; lengthFt: number }>; primaryRunwayLength: number },
  windDirDeg: number,
  windSpeedKt: number,
  maxCrosswindKt: number,
  icao: string
): RunwayRecommendation {
  type Cand = RunwayRecommendation;
  const cands: Cand[] = [];

  for (const rwy of runwayData.runways) {
    const parts = rwy.designation.split("/");
    for (const end of parts) {
      const num = parseInt(end.replace(/[LRC]/g, ""), 10);
      if (!Number.isFinite(num)) continue;
      const heading = (num * 10) % 360;
      const rel = ((windDirDeg - heading + 180) % 360) - 180;
      const rad = (rel * Math.PI) / 180;
      const headwindKt = Math.round(windSpeedKt * Math.cos(rad) * 10) / 10;
      const crosswindKt = Math.round(Math.abs(windSpeedKt * Math.sin(rad)) * 10) / 10;
      const other = parts.find((p) => p !== end) || end;
      cands.push({
        icao,
        designation: end,
        reciprocal: other,
        lengthFt: rwy.lengthFt,
        headingDeg: heading,
        headwindKt,
        crosswindKt,
        reason: "",
        legal: crosswindKt <= maxCrosswindKt && headwindKt > -3,
      });
    }
  }

  cands.sort((a, b) => {
    // Prefer headwind, then lower crosswind, then longer runway
    if (b.headwindKt !== a.headwindKt) return b.headwindKt - a.headwindKt;
    if (a.crosswindKt !== b.crosswindKt) return a.crosswindKt - b.crosswindKt;
    return b.lengthFt - a.lengthFt;
  });

  const best = cands[0] || {
    icao,
    designation: "??",
    reciprocal: "??",
    lengthFt: runwayData.primaryRunwayLength,
    headingDeg: 0,
    headwindKt: 0,
    crosswindKt: windSpeedKt,
    reason: "No runway data",
    legal: false,
  };

  best.reason = best.legal
    ? `Best into-wind: Rwy ${best.designation} (${best.headingDeg.toString().padStart(3, "0")}°) HW ${best.headwindKt} / XW ${best.crosswindKt} kt`
    : `Rwy ${best.designation} XW ${best.crosswindKt} kt exceeds max demonstrated ${maxCrosswindKt} kt`;

  return best;
}

/** Full intel pull for a mission (public NOAA + local TFR). */
export async function gatherWeatherIntel(input: {
  origin: AirportLocation;
  destination: AirportLocation;
  departureLocal: string;
  etaLocal: string;
  cruiseAltitudeFt: number;
  lockedOriginWeather?: StationWeather;
  lockedDestWeather?: StationWeather;
}): Promise<WeatherIntel> {
  const sourcesUsed: string[] = [];
  const midIso = new Date(
    (new Date(input.departureLocal).getTime() + new Date(input.etaLocal).getTime()) / 2
  ).toISOString();

  const [
    originObs,
    destObs,
    depForecast,
    arrForecast,
    enroute,
    pireps,
    advisories,
    tfrs,
  ] = await Promise.all([
    input.lockedOriginWeather
      ? Promise.resolve(input.lockedOriginWeather)
      : fetchMetar(input.origin.icao, input.origin.elevationFt),
    input.lockedDestWeather
      ? Promise.resolve(input.lockedDestWeather)
      : fetchMetar(input.destination.icao, input.destination.elevationFt),
    input.lockedOriginWeather
      ? Promise.resolve({
          weather: { ...input.lockedOriginWeather, source: "demo" as const },
          taf: {
            icao: input.origin.icao,
            raw: input.lockedOriginWeather.rawMetar,
            periods: [],
            source: "unavailable" as const,
          },
          periodFrom: undefined as number | undefined,
          periodTo: undefined as number | undefined,
        })
      : weatherAtTime(
          input.origin.icao,
          input.origin.elevationFt,
          input.departureLocal,
          "departure"
        ),
    input.lockedDestWeather
      ? Promise.resolve({
          weather: { ...input.lockedDestWeather, source: "demo" as const },
          taf: {
            icao: input.destination.icao,
            raw: input.lockedDestWeather.rawMetar,
            periods: [],
            source: "unavailable" as const,
          },
          periodFrom: undefined as number | undefined,
          periodTo: undefined as number | undefined,
        })
      : weatherAtTime(
          input.destination.icao,
          input.destination.elevationFt,
          input.etaLocal,
          "arrival"
        ),
    fetchEnrouteTafs(input.origin, input.destination, midIso),
    fetchRoutePireps(input.origin, input.destination, input.cruiseAltitudeFt),
    fetchRouteAdvisories(input.origin, input.destination),
    fetchActiveTfrs(),
  ]);

  sourcesUsed.push("METAR");
  if (
    depForecast.taf.source === "TAF" ||
    arrForecast.taf.source === "TAF" ||
    enroute.some((e) => e.taf.source === "TAF")
  ) {
    sourcesUsed.push("TAF");
  }
  if (pireps.length) sourcesUsed.push("PIREP");
  if (advisories.some((a) => a.product === "G-AIRMET")) sourcesUsed.push("G-AIRMET");
  if (advisories.some((a) => a.product === "SIGMET" && a.intersectsRoute))
    sourcesUsed.push("SIGMET");
  if (advisories.some((a) => a.product === "CWA")) sourcesUsed.push("CWA");
  if (advisories.some((a) => a.product === "TFR" && a.intersectsRoute))
    sourcesUsed.push("TFR/NOTAM");

  return {
    originObs,
    destObs,
    originForecast: depForecast.weather,
    destForecast: arrForecast.weather,
    originTaf: depForecast.taf,
    destTaf: arrForecast.taf,
    originPeriodFrom: depForecast.periodFrom,
    originPeriodTo: depForecast.periodTo,
    destPeriodFrom: arrForecast.periodFrom,
    destPeriodTo: arrForecast.periodTo,
    enroute,
    pireps,
    advisories,
    tfrs,
    sourcesUsed: [...new Set(sourcesUsed)],
    fetchedAt: new Date().toISOString(),
  };
}
