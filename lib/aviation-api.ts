import type {
  AirportLocation,
  StationWeather,
  CloudDeck,
  TerrainPoint,
  TfrZone,
  AirportRunwayData,
} from "./aviation-types";

// ---- Embedded benchmark airport dictionary ----

const AIRPORT_DB: Record<string, AirportLocation> = {
  KSQL: { icao: "KSQL", name: "San Carlos Airport", lat: 37.5119, lon: -122.2494, elevationFt: 5 },
  KHWD: { icao: "KHWD", name: "Hayward Executive Airport", lat: 37.6591, lon: -122.122, elevationFt: 52 },
  KMRY: { icao: "KMRY", name: "Monterey Regional Airport", lat: 36.587, lon: -121.8429, elevationFt: 257 },
  O22: { icao: "O22", name: "Columbia Airport", lat: 38.0314, lon: -120.4147, elevationFt: 2118 },
  KPAO: { icao: "KPAO", name: "Palo Alto Airport", lat: 37.4611, lon: -122.115, elevationFt: 4 },
  KTRK: { icao: "KTRK", name: "Truckee-Tahoe Airport", lat: 39.32, lon: -120.1396, elevationFt: 5901 },
  KSBP: { icao: "KSBP", name: "San Luis Obispo Airport", lat: 35.2371, lon: -120.6424, elevationFt: 212 },
  KRHV: { icao: "KRHV", name: "Reid-Hillview Airport", lat: 37.3329, lon: -121.8199, elevationFt: 135 },
  KOSH: { icao: "KOSH", name: "Oshkosh Wittman Airport", lat: 43.9844, lon: -88.557, elevationFt: 808 },
  KUGN: { icao: "KUGN", name: "Waukegan National Airport", lat: 42.4222, lon: -87.8679, elevationFt: 727 },
};

// ---- Cached baseline weather for fallback ----

const CACHED_WEATHER: Record<string, StationWeather> = {
  KSQL: {
    icao: "KSQL",
    rawMetar: "KSQL 221755Z 27008KT 10SM CLR 18/07 A2998",
    flightCategory: "VFR",
    windSpeedKt: 8,
    windDirDeg: 270,
    tempC: 18,
    dewpointC: 7,
    altimeterInHg: 29.98,
    densityAltitudeFt: 830,
    ceilingAglFt: null,
    cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
  },
  KMRY: {
    icao: "KMRY",
    rawMetar: "KMRY 221755Z 20010KT 5SM OVC018 13/11 A3002",
    flightCategory: "IFR",
    windSpeedKt: 10,
    windDirDeg: 200,
    tempC: 13,
    dewpointC: 11,
    altimeterInHg: 30.02,
    densityAltitudeFt: -200,
    ceilingAglFt: 1800,
    cloudDecks: [{ coverage: "OVC", baseAglFt: 1800, baseMslFt: 2057 }],
  },
  O22: {
    icao: "O22",
    rawMetar: "O22 221755Z 30005KT 10SM SKC 22/04 A3000",
    flightCategory: "VFR",
    windSpeedKt: 5,
    windDirDeg: 300,
    tempC: 22,
    dewpointC: 4,
    altimeterInHg: 30.0,
    densityAltitudeFt: 3200,
    ceilingAglFt: null,
    cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
  },
  KPAO: {
    icao: "KPAO",
    rawMetar: "KPAO 221755Z 31009KT 10SM CLR 19/06 A2997",
    flightCategory: "VFR",
    windSpeedKt: 9,
    windDirDeg: 310,
    tempC: 19,
    dewpointC: 6,
    altimeterInHg: 29.97,
    densityAltitudeFt: 920,
    ceilingAglFt: null,
    cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
  },
  KTRK: {
    icao: "KTRK",
    rawMetar: "KTRK 221755Z 24006KT 10SM FEW060 25/-01 A3004",
    flightCategory: "VFR",
    windSpeedKt: 6,
    windDirDeg: 240,
    tempC: 25,
    dewpointC: -1,
    altimeterInHg: 30.04,
    densityAltitudeFt: 7800,
    ceilingAglFt: null,
    cloudDecks: [{ coverage: "FEW", baseAglFt: 6000, baseMslFt: 11901 }],
  },
};

// ---- Runway database ----

const RUNWAY_DB: Record<string, AirportRunwayData> = {
  KSQL: {
    icao: "KSQL",
    runways: [{ designation: "12/30", lengthFt: 2598, widthFt: 75, surfaceType: "ASPHALT" }],
    primaryRunwayLength: 2598,
  },
  KMRY: {
    icao: "KMRY",
    runways: [
      { designation: "10R/28L", lengthFt: 7616, widthFt: 150, surfaceType: "ASPHALT" },
      { designation: "10L/28R", lengthFt: 4308, widthFt: 75, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 7616,
  },
  O22: {
    icao: "O22",
    runways: [{ designation: "17/35", lengthFt: 3200, widthFt: 60, surfaceType: "ASPHALT" }],
    primaryRunwayLength: 3200,
  },
  KPAO: {
    icao: "KPAO",
    runways: [
      { designation: "13/31", lengthFt: 2443, widthFt: 70, surfaceType: "ASPHALT" },
      { designation: "16/34", lengthFt: 1150, widthFt: 50, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 2443,
  },
  KTRK: {
    icao: "KTRK",
    runways: [
      { designation: "11/29", lengthFt: 7000, widthFt: 100, surfaceType: "ASPHALT" },
      { designation: "02/20", lengthFt: 4650, widthFt: 75, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 7000,
  },
  KSBP: {
    icao: "KSBP",
    runways: [
      { designation: "11/29", lengthFt: 6299, widthFt: 150, surfaceType: "ASPHALT" },
      { designation: "07/25", lengthFt: 5000, widthFt: 100, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 6299,
  },
  KRHV: {
    icao: "KRHV",
    runways: [
      { designation: "13R/31L", lengthFt: 3101, widthFt: 75, surfaceType: "ASPHALT" },
      { designation: "13L/31R", lengthFt: 3101, widthFt: 75, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 3101,
  },
  KHWD: {
    icao: "KHWD",
    runways: [
      { designation: "10L/28R", lengthFt: 3107, widthFt: 75, surfaceType: "ASPHALT" },
      { designation: "10R/28L", lengthFt: 5694, widthFt: 150, surfaceType: "ASPHALT" },
    ],
    primaryRunwayLength: 5694,
  },
};

// ---- Active TFR dataset (California airspace hazard boxes) ----

const ACTIVE_TFRS: TfrZone[] = [
  {
    id: "tfr-sjc-stadium",
    name: "San Jose Levi's Stadium Event TFR",
    centerLat: 37.4049,
    centerLon: -121.9697,
    radiusNm: 3.0,
    floorMsl: 0,
    ceilingMsl: 3000,
    isActive: true,
    notamRef: "FDC 6/8972",
  },
  {
    id: "tfr-sf-sfb",
    name: "Presidential Security TFR - SFO Region",
    centerLat: 37.6213,
    centerLon: -122.379,
    radiusNm: 10.0,
    floorMsl: 0,
    ceilingMsl: 18000,
    isActive: false,
    notamRef: "FDC 7/1134",
  },
  {
    id: "tfr-coastal-hazard",
    name: "Point Sur Coastal Military Operations Area",
    centerLat: 36.3025,
    centerLon: -121.9,
    radiusNm: 8.0,
    floorMsl: 0,
    ceilingMsl: 8000,
    isActive: true,
    notamRef: "FDC 6/5541",
  },
  {
    id: "tfr-yosemite",
    name: "Yosemite National Park Wildlife TFR",
    centerLat: 37.8651,
    centerLon: -119.5383,
    radiusNm: 5.0,
    floorMsl: 0,
    ceilingMsl: 9000,
    isActive: true,
    notamRef: "FDC 5/3321",
  },
];

// ---- Great Circle interpolation ----

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function interpolateGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  count: number
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    const d =
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(((toRad(lat2) - toRad(lat1)) / 2)) ** 2 +
            Math.cos(toRad(lat1)) *
              Math.cos(toRad(lat2)) *
              Math.sin(((toRad(lon2) - toRad(lon1)) / 2)) ** 2
        )
      );
    if (d === 0) {
      points.push({ lat: lat1, lon: lon1 });
      continue;
    }
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(toRad(lat1)) * Math.cos(toRad(lon1)) +
      B * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2));
    const y =
      A * Math.cos(toRad(lat1)) * Math.sin(toRad(lon1)) +
      B * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2));
    const z = A * Math.sin(toRad(lat1)) + B * Math.sin(toRad(lat2));
    points.push({
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lon: toDeg(Math.atan2(y, x)),
    });
  }
  return points;
}

// ---- Procedural terrain fallback ----

function buildProceduralTerrain(
  origin: AirportLocation,
  destination: AirportLocation,
  count: number
): TerrainPoint[] {
  const totalNm = haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const gcPoints = interpolateGreatCircle(origin.lat, origin.lon, destination.lat, destination.lon, count);
  // Short bay hops stay low. Longer XC corridors get a realistic ridge bump.
  const ridgeExtra = totalNm < 25 ? 200 : totalNm < 60 ? 1200 : 2800;
  return gcPoints.map((pt, i) => {
    const f = i / count;
    const baseElev = origin.elevationFt + (destination.elevationFt - origin.elevationFt) * f;
    const ridgeFactor = Math.sin(f * Math.PI);
    const midElev = Math.max(origin.elevationFt, destination.elevationFt) + ridgeExtra;
    const elev = Math.round(baseElev + ridgeFactor * (midElev - baseElev));
    return {
      distanceNm: f * totalNm,
      lat: pt.lat,
      lon: pt.lon,
      elevationFt: Math.max(0, elev),
    };
  });
}

// ---- Public airport lookup ----

async function fetchUnknownAirport(icao: string): Promise<AirportLocation | null> {
  try {
    const url = `/api/aviation?kind=airport&ids=${encodeURIComponent(icao)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const ap = data[0];
    return {
      icao: ap.icaoId || icao,
      name: ap.name || icao,
      lat: parseFloat(ap.lat),
      lon: parseFloat(ap.lon),
      elevationFt: Math.round(parseFloat(ap.elev) * 3.28084),
    };
  } catch {
    return null;
  }
}

export async function resolveAirport(icao: string): Promise<AirportLocation> {
  const key = icao.toUpperCase();
  if (AIRPORT_DB[key]) return AIRPORT_DB[key];
  const remote = await fetchUnknownAirport(key);
  if (remote) return remote;
  throw new Error(`Airport ${key} could not be resolved. Check the identifier or try again.`);
}

// ---- METAR parse helpers ----

function parseCoverage(raw: string): CloudDeck["coverage"] | null {
  const cov = raw as CloudDeck["coverage"];
  if (["FEW", "SCT", "BKN", "OVC", "SKC", "CLR"].includes(raw)) {
    return raw === "CLR" ? "SKC" : cov;
  }
  return null;
}

function computeFlightCategory(
  ceilingAglFt: number | null,
  visibilitySm: number
): StationWeather["flightCategory"] {
  const ceil = ceilingAglFt ?? 99999;
  if (ceil < 500 || visibilitySm < 1) return "LIFR";
  if (ceil < 1000 || visibilitySm < 3) return "IFR";
  if (ceil < 3000 || visibilitySm < 5) return "MVFR";
  return "VFR";
}

function computeDensityAltitude(
  elevationFt: number,
  altimeterInHg: number,
  tempC: number
): number {
  const pressureAlt = elevationFt + (29.92 - altimeterInHg) * 1000;
  const standardTemp = 15 - 2 * (pressureAlt / 1000);
  return Math.round(pressureAlt + 120 * (tempC - standardTemp));
}

// ---- Live METAR fetch ----

export async function fetchMetar(
  icao: string,
  stationElevFt: number
): Promise<StationWeather> {
  const fallback = CACHED_WEATHER[icao.toUpperCase()];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const url = `/api/aviation?kind=metar&ids=${encodeURIComponent(icao)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("no data");

    const obs = data[0];
    const rawMetar: string = obs.rawOb || obs.raw || "";
    const windSpeedKt: number = obs.wspd ?? 0;
    const windDirDeg: number = obs.wdir ?? 0;
    const tempC: number = obs.temp ?? 15;
    const dewpointC: number = obs.dewp ?? 10;
    const altimeterInHg: number = obs.altim ? obs.altim / 33.8639 : 29.92;
    const visibilitySm: number = obs.visib ?? 10;

    const cloudDecks: CloudDeck[] = [];
    const sky: Array<{ cover: string; base: number }> = obs.clouds ?? [];
    for (const layer of sky) {
      const cov = parseCoverage(layer.cover);
      if (cov && layer.base != null) {
        const baseAgl = layer.base; // AWC JSON already reports feet AGL.
        cloudDecks.push({
          coverage: cov,
          baseAglFt: baseAgl,
          baseMslFt: baseAgl + stationElevFt,
        });
      }
    }
    if (cloudDecks.length === 0) {
      cloudDecks.push({ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 });
    }

    const ceilingLayers = cloudDecks.filter(
      (d) => d.coverage === "BKN" || d.coverage === "OVC"
    );
    const ceilingAglFt =
      ceilingLayers.length > 0
        ? Math.min(...ceilingLayers.map((d) => d.baseAglFt))
        : null;

    const densityAltitudeFt = computeDensityAltitude(stationElevFt, altimeterInHg, tempC);
    const flightCategory = computeFlightCategory(ceilingAglFt, visibilitySm);

    return {
      icao,
      source: "METAR",
      rawMetar: rawMetar || `${icao} LIVE METAR`,
      flightCategory,
      windSpeedKt,
      windDirDeg,
      windGustKt: obs.wgst ?? undefined,
      visibilitySm,
      tempC,
      dewpointC,
      altimeterInHg,
      densityAltitudeFt,
      ceilingAglFt,
      cloudDecks,
    };
  } catch {
    if (fallback) return { ...fallback, source: "cached" };
    // Generic fallback for unknown stations
    const densityAltitudeFt = computeDensityAltitude(stationElevFt, 29.92, 15);
    return {
      icao,
      source: "unavailable",
      rawMetar: `${icao} DATA UNAVAILABLE`,
      flightCategory: "VFR",
      windSpeedKt: 8,
      windDirDeg: 270,
      tempC: 15,
      dewpointC: 5,
      altimeterInHg: 29.92,
      densityAltitudeFt,
      ceilingAglFt: null,
      cloudDecks: [{ coverage: "SKC", baseAglFt: 0, baseMslFt: 0 }],
    };
  }
}

// ---- Live terrain elevation via Open-Elevation ----

export async function fetchTerrainProfile(
  origin: AirportLocation,
  destination: AirportLocation
): Promise<TerrainPoint[]> {
  const COUNT = 24;
  const gcPoints = interpolateGreatCircle(
    origin.lat, origin.lon,
    destination.lat, destination.lon,
    COUNT
  );
  const totalNm = haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const locations = gcPoints.map((p) => ({ latitude: p.lat, longitude: p.lon }));

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Elevation API HTTP ${res.status}`);
    const data = await res.json();
    const results: Array<{ latitude: number; longitude: number; elevation: number }> =
      data.results || [];
    if (results.length === 0) throw new Error("empty");

    return results.map((pt, i) => ({
      distanceNm: (i / COUNT) * totalNm,
      lat: pt.latitude,
      lon: pt.longitude,
      elevationFt: Math.round(pt.elevation * 3.28084),
    }));
  } catch {
    return buildProceduralTerrain(origin, destination, COUNT);
  }
}

/** Elevation samples along an arbitrary waypoint list (pilotage doglegs). Free Open-Elevation, not Google. */
export async function fetchTerrainAlongWaypoints(
  origin: AirportLocation,
  waypoints: Array<{ lat: number; lon: number }>
): Promise<TerrainPoint[]> {
  if (waypoints.length < 2) {
    return fetchTerrainProfile(origin, origin);
  }

  const locations = waypoints.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Elevation API HTTP ${res.status}`);
    const data = await res.json();
    const results: Array<{ latitude: number; longitude: number; elevation: number }> =
      data.results || [];
    if (results.length === 0) throw new Error("empty");

    let cumulative = 0;
    return results.map((pt, i) => {
      if (i > 0) {
        cumulative += haversineNm(
          results[i - 1].latitude,
          results[i - 1].longitude,
          pt.latitude,
          pt.longitude
        );
      }
      return {
        distanceNm: cumulative,
        lat: pt.latitude,
        lon: pt.longitude,
        elevationFt: Math.round(pt.elevation * 3.28084),
      };
    });
  } catch {
    const dest = {
      ...origin,
      lat: waypoints[waypoints.length - 1].lat,
      lon: waypoints[waypoints.length - 1].lon,
    };
    return buildProceduralTerrain(origin, dest, Math.max(8, waypoints.length - 1));
  }
}

// ---- Winds aloft via Open-Meteo ----

export async function fetchWindsAloft(
  midLat: number,
  midLon: number
): Promise<{ speedKt: number; dirDeg: number }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${midLat}&longitude=${midLon}` +
      `&current=wind_speed_10m,wind_direction_10m`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Wind API HTTP ${res.status}`);
    const data = await res.json();
    const speedMs: number = data?.current?.wind_speed_10m ?? 10;
    const dirDeg: number = data?.current?.wind_direction_10m ?? 270;
    const speedKt = Math.round(speedMs * 1.94384);
    return { speedKt, dirDeg };
  } catch {
    return { speedKt: 12, dirDeg: 270 };
  }
}

// ---- TFR data source ----

export async function fetchActiveTfrs(): Promise<TfrZone[]> {
  // Return only active TFRs from the embedded dataset
  return ACTIVE_TFRS.filter((t) => t.isActive);
}

// ---- Runway data source ----

export async function fetchRunwayData(icao: string): Promise<AirportRunwayData> {
  const key = icao.toUpperCase();
  if (RUNWAY_DB[key]) return RUNWAY_DB[key];
  return {
    icao: key,
    runways: [{ designation: "18/36", lengthFt: 3000, widthFt: 75, surfaceType: "ASPHALT" }],
    primaryRunwayLength: 3000,
  };
}

// ---- Course bearing ----

export function computeCourseDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
