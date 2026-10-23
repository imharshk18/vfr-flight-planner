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
  /** ISO timestamp — product valid-from / start */
  validFrom?: string;
  /** ISO timestamp — product expire / end */
  validTo?: string;
  /** ISO timestamp — when the product was issued */
  issuedAt?: string;
  /** Altitude floor label, e.g. "SFC" or "12,000 ft" */
  altitudeBase?: string;
  /** Altitude top label, e.g. "UNL" or "FL340" */
  altitudeTop?: string;
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

/** CONUS TAF-capable stations for corridor sampling (not Bay-Area-only). */
const ENROUTE_TAF_POOL: Array<{
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
}> = [
  // West
  { icao: "KSFO", name: "San Francisco", lat: 37.6213, lon: -122.379, elevationFt: 13 },
  { icao: "KOAK", name: "Oakland", lat: 37.7213, lon: -122.2207, elevationFt: 9 },
  { icao: "KSJC", name: "San Jose", lat: 37.3626, lon: -121.929, elevationFt: 62 },
  { icao: "KSMF", name: "Sacramento", lat: 38.6954, lon: -121.5908, elevationFt: 27 },
  { icao: "KMRY", name: "Monterey", lat: 36.587, lon: -121.8429, elevationFt: 257 },
  { icao: "KLAX", name: "Los Angeles", lat: 33.9425, lon: -118.4081, elevationFt: 128 },
  { icao: "KSAN", name: "San Diego", lat: 32.7336, lon: -117.1897, elevationFt: 17 },
  { icao: "KSEA", name: "Seattle", lat: 47.4502, lon: -122.3088, elevationFt: 433 },
  { icao: "KPDX", name: "Portland", lat: 45.5898, lon: -122.5951, elevationFt: 31 },
  { icao: "KLAS", name: "Las Vegas", lat: 36.084, lon: -115.1537, elevationFt: 2181 },
  { icao: "KPHX", name: "Phoenix", lat: 33.4342, lon: -112.0116, elevationFt: 1135 },
  { icao: "KDEN", name: "Denver", lat: 39.8561, lon: -104.6737, elevationFt: 5431 },
  { icao: "KSLC", name: "Salt Lake", lat: 40.7899, lon: -111.9791, elevationFt: 4227 },
  // Midwest / Great Lakes (KMSN–KRFD corridor + neighbors)
  { icao: "KMSN", name: "Madison", lat: 43.1399, lon: -89.3375, elevationFt: 887 },
  { icao: "KRFD", name: "Rockford", lat: 42.1954, lon: -89.0972, elevationFt: 742 },
  { icao: "KMKE", name: "Milwaukee", lat: 42.9472, lon: -87.8966, elevationFt: 678 },
  { icao: "KORD", name: "Chicago O'Hare", lat: 41.9742, lon: -87.9073, elevationFt: 672 },
  { icao: "KMDW", name: "Chicago Midway", lat: 41.7868, lon: -87.7522, elevationFt: 620 },
  { icao: "KJVL", name: "Janesville", lat: 42.6203, lon: -89.0416, elevationFt: 808 },
  { icao: "KUES", name: "Waukesha", lat: 43.041, lon: -88.2371, elevationFt: 911 },
  { icao: "KOSH", name: "Oshkosh", lat: 43.9844, lon: -88.5569, elevationFt: 808 },
  { icao: "KDBQ", name: "Dubuque", lat: 42.402, lon: -90.7095, elevationFt: 1077 },
  { icao: "KCID", name: "Cedar Rapids", lat: 41.8847, lon: -91.7108, elevationFt: 869 },
  { icao: "KMSP", name: "Minneapolis", lat: 44.8848, lon: -93.2223, elevationFt: 841 },
  { icao: "KDSM", name: "Des Moines", lat: 41.534, lon: -93.6631, elevationFt: 958 },
  { icao: "KIND", name: "Indianapolis", lat: 39.7173, lon: -86.2944, elevationFt: 797 },
  { icao: "KDTW", name: "Detroit", lat: 42.2124, lon: -83.3534, elevationFt: 645 },
  { icao: "KSTL", name: "St Louis", lat: 38.7487, lon: -90.3700, elevationFt: 618 },
  { icao: "KMCI", name: "Kansas City", lat: 39.2976, lon: -94.7139, elevationFt: 1026 },
  { icao: "KOMA", name: "Omaha", lat: 41.3032, lon: -95.8941, elevationFt: 984 },
  // South / East
  { icao: "KDFW", name: "Dallas/Fort Worth", lat: 32.8998, lon: -97.0403, elevationFt: 607 },
  { icao: "KAUS", name: "Austin", lat: 30.1945, lon: -97.6699, elevationFt: 542 },
  { icao: "KIAH", name: "Houston", lat: 29.9902, lon: -95.3368, elevationFt: 97 },
  { icao: "KATL", name: "Atlanta", lat: 33.6407, lon: -84.4277, elevationFt: 1026 },
  { icao: "KBNA", name: "Nashville", lat: 36.1245, lon: -86.6782, elevationFt: 599 },
  { icao: "KCLT", name: "Charlotte", lat: 35.214, lon: -80.9431, elevationFt: 748 },
  { icao: "KMIA", name: "Miami", lat: 25.7959, lon: -80.287, elevationFt: 8 },
  { icao: "KFLL", name: "Fort Lauderdale", lat: 26.0726, lon: -80.1527, elevationFt: 9 },
  { icao: "KPBI", name: "West Palm Beach", lat: 26.6832, lon: -80.0956, elevationFt: 19 },
  { icao: "KHWO", name: "North Perry", lat: 25.9989, lon: -80.2407, elevationFt: 9 },
  { icao: "KOPF", name: "Opa-Locka", lat: 25.907, lon: -80.2784, elevationFt: 8 },
  { icao: "KTMB", name: "Miami Executive", lat: 25.6479, lon: -80.4328, elevationFt: 10 },
  { icao: "KFXE", name: "Fort Lauderdale Exec", lat: 26.1973, lon: -80.1707, elevationFt: 13 },
  { icao: "KMCO", name: "Orlando", lat: 28.4312, lon: -81.3081, elevationFt: 96 },
  { icao: "KTPA", name: "Tampa", lat: 27.9755, lon: -82.5332, elevationFt: 26 },
  { icao: "KJAX", name: "Jacksonville", lat: 30.4941, lon: -81.6879, elevationFt: 30 },
  { icao: "KBOS", name: "Boston", lat: 42.3656, lon: -71.0096, elevationFt: 20 },
  { icao: "KJFK", name: "New York JFK", lat: 40.6413, lon: -73.7781, elevationFt: 13 },
  { icao: "KEWR", name: "Newark", lat: 40.6895, lon: -74.1745, elevationFt: 18 },
  { icao: "KPHL", name: "Philadelphia", lat: 39.8744, lon: -75.2424, elevationFt: 36 },
  { icao: "KIAD", name: "Washington Dulles", lat: 38.9531, lon: -77.4565, elevationFt: 312 },
  { icao: "KBWI", name: "Baltimore", lat: 39.1754, lon: -76.6683, elevationFt: 146 },
  { icao: "KCVG", name: "Cincinnati", lat: 39.0488, lon: -84.6678, elevationFt: 896 },
  { icao: "KCLE", name: "Cleveland", lat: 41.4117, lon: -81.8498, elevationFt: 791 },
  { icao: "KPIT", name: "Pittsburgh", lat: 40.4915, lon: -80.2329, elevationFt: 1203 },
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

function parseTafVisibility(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const s = raw.trim().toUpperCase().replace(/SM$/, "");
  if (s.endsWith("+")) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : fallback;
  }
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    if (b) return a / b;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
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
  const visibility = parseTafVisibility(period.visib, observed.visibilitySm ?? 10);
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
      visibilitySm: visibility,
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
  const routeNm = haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  // Wider corridor for short hops so coastal / metro stations still sample.
  const corridorNm = Math.min(80, Math.max(40, routeNm * 0.4));

  const candidates = ENROUTE_TAF_POOL.filter(
    (s) =>
      s.icao !== origin.icao &&
      s.icao !== destination.icao &&
      pointNearRoute(s.lat, s.lon, origin, destination, corridorNm)
  ).map((s) => ({
    ...s,
    // Progress along route (0 at origin → 1 at dest) for even spacing
    t: Math.min(
      1,
      haversineNm(origin.lat, origin.lon, s.lat, s.lon) / Math.max(1, routeNm)
    ),
  }));

  candidates.sort((a, b) => a.t - b.t);

  // Prefer stations spread along the corridor, not clustered at the midpoint.
  const targets =
    routeNm < 40
      ? [0.25, 0.5, 0.75]
      : routeNm < 120
        ? [0.15, 0.35, 0.5, 0.65, 0.85]
        : [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];

  const picks: typeof candidates = [];
  for (const target of targets) {
    const next = candidates
      .filter((c) => !picks.some((p) => p.icao === c.icao))
      .sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))[0];
    if (next) picks.push(next);
  }
  // Fill remaining nearby stations up to 8
  for (const c of candidates) {
    if (picks.length >= 8) break;
    if (!picks.some((p) => p.icao === c.icao)) picks.push(c);
  }

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
  return results.filter((r) => r.taf.source === "TAF" || r.weather.source === "METAR");
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

/** Ray-cast point-in-polygon on lon/lat ring (adequate for regional AIRMET areas). */
function pointInPolygon(
  lat: number,
  lon: number,
  ring: Array<{ lat: number; lon: number }>
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lon;
    const yj = ring[j].lat;
    const xj = ring[j].lon;
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True only when the flight path actually clips the advisory area —
 * NOT when a distant polygon merely has a vertex within N NM of the route.
 */
function routeClipsPolygon(
  ring: Array<{ lat: number; lon: number }>,
  origin: AirportLocation,
  destination: AirportLocation
): boolean {
  if (ring.length < 3) return false;
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const lat = origin.lat + (destination.lat - origin.lat) * f;
    const lon = origin.lon + (destination.lon - origin.lon) * f;
    if (pointInPolygon(lat, lon, ring)) return true;
  }
  return false;
}

function parseAdvisoryCoords(
  raw: unknown
): Array<{ lat: number; lon: number }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const coords = raw
    .map((c) => ({
      lat: Number((c as { lat?: unknown }).lat),
      lon: Number((c as { lon?: unknown }).lon),
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  return coords.length ? coords : undefined;
}

function advisoryTimeMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // AWC sometimes returns unix seconds
    return value < 1e12 ? value * 1000 : value;
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/**
 * Keep products that overlap the flight — or are still active now when the
 * planned departure is near-term / already past (matches ForeFlight “live” brief).
 * Previously, SIGMETs with null times always passed; once we parsed real
 * validTimeFrom/To, a dep a few hours off the SIGMET window dropped convective
 * NO-GOs that were still active on the corridor.
 */
function advisoryCoversMission(
  validFrom: unknown,
  expireTime: unknown,
  missionFromMs: number,
  missionToMs: number
): boolean {
  const from = advisoryTimeMs(validFrom);
  const to = advisoryTimeMs(expireTime);
  if (from == null && to == null) return true;

  const now = Date.now();
  const dep = Number.isFinite(missionFromMs) ? missionFromMs : now;
  const arr = Number.isFinite(missionToMs) ? missionToMs : dep + 3 * 3600_000;

  // Near-term (dep in the past or within 12h): also cover what's active *right now*
  // so a 6pm local pickup still sees a live convective SIGMET ForeFlight shows.
  const nearTerm = dep <= now + 12 * 3600_000;
  const windowFrom = nearTerm ? Math.min(dep, now) : dep;
  const windowTo = nearTerm ? Math.max(arr, now + 90 * 60_000) : arr;

  const a0 = from ?? windowFrom - 6 * 3600_000;
  const a1 = to ?? windowTo + 6 * 3600_000;
  return a0 <= windowTo && a1 >= windowFrom;
}

function toIsoTime(value: unknown): string | undefined {
  const ms = advisoryTimeMs(value);
  if (ms == null) return undefined;
  return new Date(ms).toISOString();
}

/** Format AWC times for the brief (UTC + local). */
export function formatAdvisoryClock(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const utc = new Date(t).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const local = new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${utc} · local ${local}`;
}

/**
 * G-AIRMET base/top are usually hundreds of feet MSL ("120" → 12,000),
 * or tokens like SFC / FZL. SIGMET altitudes often arrive as feet MSL.
 */
function formatAltitudeToken(raw: unknown, mode: "gairmet" | "sigmet" | "raw"): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim().toUpperCase();
  if (!s) return undefined;
  if (/^(SFC|SURFACE|GND|GROUND)$/.test(s)) return "SFC";
  if (/^(UNL|UNLTD|UNLIMITED)$/.test(s)) return "UNL";
  if (s.startsWith("FL") && /^\d+$/.test(s.slice(2))) {
    return `FL${s.slice(2)} (${(Number(s.slice(2)) * 100).toLocaleString()} ft)`;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (mode === "gairmet") {
    // AWC G-AIRMET: values are typically in 100s of feet (120 = 12,000)
    if (n <= 450) return `${(n * 100).toLocaleString()} ft`;
    return `${n.toLocaleString()} ft`;
  }
  if (mode === "sigmet") {
    if (n >= 1000) return `${n.toLocaleString()} ft`;
    if (n <= 450) return `FL${String(Math.round(n)).padStart(3, "0")}`;
    return `${n.toLocaleString()} ft`;
  }
  return s;
}

function formatAltitudeLayer(base?: string, top?: string): string {
  if (!base && !top) return "Altitude · not specified";
  return `Altitude ${base || "SFC"} – ${top || "UNL"}`;
}

function formatValidityBlock(opts: {
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  altitudeBase?: string;
  altitudeTop?: string;
}): string {
  const lines = [
    `Issued  ${formatAdvisoryClock(opts.issuedAt)}`,
    `Valid   ${formatAdvisoryClock(opts.validFrom)}`,
    `Expires ${formatAdvisoryClock(opts.validTo)}`,
    formatAltitudeLayer(opts.altitudeBase, opts.altitudeTop),
  ];
  return lines.join("\n");
}

function formatGairmetProduct(g: Record<string, unknown>): {
  raw: string;
  summary: string;
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  altitudeBase?: string;
  altitudeTop?: string;
} {
  const due = g.due_to ? String(g.due_to) : "";
  const hazard = String(g.hazard || "G-AIRMET");
  const tag = g.tag ? String(g.tag) : "";
  const altitudeBase = formatAltitudeToken(g.base, "gairmet");
  const altitudeTop = formatAltitudeToken(g.top, "gairmet");
  // Freeze level products carry fzlbase/fzltop
  const fzlBase = formatAltitudeToken(g.fzlbase, "gairmet");
  const fzlTop = formatAltitudeToken(g.fzltop, "gairmet");
  const issuedAt = toIsoTime(g.issueTime ?? g.receiptTime);
  const validFrom = toIsoTime(g.validTime ?? g.issueTime);
  const validTo = toIsoTime(g.expireTime);
  const layerBase = altitudeBase || fzlBase;
  const layerTop = altitudeTop || fzlTop;
  const validity = formatValidityBlock({
    issuedAt,
    validFrom,
    validTo,
    altitudeBase: layerBase,
    altitudeTop: layerTop,
  });
  const headline = `G-AIRMET${tag ? ` ${tag}` : ""} ${hazard}`;
  const upstream = String(g.rawAirmet || g.raw || "").trim();
  const body = upstream || (due ? due : `${hazard} area`);
  const raw = `${headline}\n${body}\n${validity}`;
  const summary = `${headline} · ${formatAltitudeLayer(layerBase, layerTop)} · exp ${formatAdvisoryClock(validTo)}`;
  return { raw, summary, issuedAt, validFrom, validTo, altitudeBase: layerBase, altitudeTop: layerTop };
}

export async function fetchRouteAdvisories(
  origin: AirportLocation,
  destination: AirportLocation,
  missionFromIso?: string,
  missionToIso?: string
): Promise<HazardAdvisory[]> {
  const bbox = routeBbox(origin, destination, 0.9);
  const out: HazardAdvisory[] = [];
  const missionFromMs = Date.parse(missionFromIso || "") || Date.now();
  const missionToMs = Date.parse(missionToIso || "") || missionFromMs + 3 * 3600_000;

  try {
    const gair = (await apiGet({ kind: "gairmet", bbox })) as Array<Record<string, unknown>>;
    if (Array.isArray(gair)) {
      for (const g of gair.slice(0, 80)) {
        const geom = String(g.geometryType || g.geom || "AREA").toUpperCase();
        // Freeze levels are lines, not area weather for VFR GO/NO-GO.
        if (geom === "LINE") continue;
        const hazard = String(g.hazard || g.product || "G-AIRMET");
        if (!advisoryCoversMission(g.validTime, g.expireTime, missionFromMs, missionToMs)) {
          continue;
        }
        const coords = parseAdvisoryCoords(g.coords);
        const intersects = coords ? routeClipsPolygon(coords, origin, destination) : false;
        if (!intersects) continue; // drop regional noise that never clips the path
        const formatted = formatGairmetProduct(g);
        const severe = /IFR|ICE|MT_OBSC|MTN/i.test(hazard);
        out.push({
          id: `gair-${g.tag || g.receiptTime || out.length}-${hazard}`,
          product: "G-AIRMET",
          hazard,
          severity: severe ? "caution" : "info",
          raw: formatted.raw,
          summary: formatted.summary,
          issuedAt: formatted.issuedAt,
          validFrom: formatted.validFrom,
          validTo: formatted.validTo,
          altitudeBase: formatted.altitudeBase,
          altitudeTop: formatted.altitudeTop,
          intersectsRoute: true,
        });
      }
    }
  } catch {
    /* keep going */
  }

  try {
    // Wider bbox on short hops so convective outlook polygons aren't clipped away
    const sigBbox = routeBbox(origin, destination, 1.4);
    const sigs = (await apiGet({ kind: "airsigmet", bbox: sigBbox })) as Array<
      Record<string, unknown>
    >;
    if (Array.isArray(sigs)) {
      for (const s of sigs.slice(0, 40)) {
        const validFromRaw = s.validTimeFrom ?? s.validTime;
        const validToRaw = s.validTimeTo ?? s.expireTime;
        if (!advisoryCoversMission(validFromRaw, validToRaw, missionFromMs, missionToMs)) {
          continue;
        }
        const hazard = String(s.hazard || s.airSigmetType || "SIGMET");
        const coords = parseAdvisoryCoords(s.coords);
        const intersects = coords ? routeClipsPolygon(coords, origin, destination) : false;
        if (!intersects) continue;

        const issuedAt = toIsoTime(s.creationTime ?? s.issueTime ?? s.receiptTime);
        const validFrom = toIsoTime(validFromRaw);
        const validTo = toIsoTime(validToRaw);
        const altitudeBase = formatAltitudeToken(
          s.altitudeLow1 ?? s.altitudeLo1 ?? s.base,
          "sigmet"
        );
        const altitudeTop = formatAltitudeToken(
          s.altitudeHi1 ?? s.altitudeHigh1 ?? s.top,
          "sigmet"
        );
        const upstream = String(s.rawAirSigmet || s.rawSigmet || s.raw || "").trim();
        const validity = formatValidityBlock({
          issuedAt,
          validFrom,
          validTo,
          altitudeBase,
          altitudeTop,
        });
        const headline = `SIGMET ${hazard}`;
        const raw = upstream
          ? `${headline}\n${upstream}\n${validity}`
          : `${headline}\n${validity}`;
        out.push({
          id: `sig-${s.alphaChar || s.seriesId || s.receiptTime || out.length}`,
          product: "SIGMET",
          hazard,
          severity: "severe",
          raw,
          summary: `${headline} · ${formatAltitudeLayer(altitudeBase, altitudeTop)} · exp ${formatAdvisoryClock(validTo)}`,
          issuedAt,
          validFrom,
          validTo,
          altitudeBase,
          altitudeTop,
          intersectsRoute: true,
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
        const rawBody = String(c.rawCwa || c.raw || "").trim();
        const coords = parseAdvisoryCoords(c.coords);
        const intersects = coords
          ? routeClipsPolygon(coords, origin, destination)
          : pointNearRoute(
              Number(c.lat ?? origin.lat),
              Number(c.lon ?? origin.lon),
              origin,
              destination,
              40
            );
        if (!intersects) continue;
        const issuedAt = toIsoTime(c.issueTime ?? c.receiptTime);
        const validFrom = toIsoTime(c.validTime ?? c.validTimeFrom ?? c.issueTime);
        const validTo = toIsoTime(c.expireTime ?? c.validTimeTo);
        const altitudeBase = formatAltitudeToken(c.base ?? c.altitudeLow1, "raw");
        const altitudeTop = formatAltitudeToken(c.top ?? c.altitudeHi1, "raw");
        const validity = formatValidityBlock({
          issuedAt,
          validFrom,
          validTo,
          altitudeBase,
          altitudeTop,
        });
        const hazard = String(c.hazard || "CWA");
        const raw = rawBody
          ? `CWA ${hazard}\n${rawBody}\n${validity}`
          : `CWA ${hazard}\n${validity}`;
        out.push({
          id: `cwa-${c.cwsu || c.receiptTime || out.length}`,
          product: "CWA",
          hazard,
          severity: "caution",
          raw,
          summary: `CWA ${hazard} · exp ${formatAdvisoryClock(validTo)}`,
          issuedAt,
          validFrom,
          validTo,
          altitudeBase,
          altitudeTop,
          intersectsRoute: true,
        });
      }
    }
  } catch {
    /* keep going */
  }

  const tfrs = await fetchActiveTfrs();
  for (const t of tfrs) {
    const near = pointNearRoute(t.centerLat, t.centerLon, origin, destination, t.radiusNm + 8);
    if (!near) continue;
    out.push({
      id: t.id,
      product: "TFR",
      hazard: "TFR",
      severity: "severe",
      raw: `${t.notamRef} ${t.name}`,
      intersectsRoute: true,
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
    fetchRouteAdvisories(
      input.origin,
      input.destination,
      input.departureLocal,
      input.etaLocal
    ),
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
