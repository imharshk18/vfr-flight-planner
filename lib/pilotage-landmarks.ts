import type { AirportLocation } from "./aviation-types";
import type { PilotageLandmark } from "./mission-types";
import { haversineNm, interpolateGreatCircle } from "./aviation-api";

/**
 * Curated Northern California visual landmarks for pilotage routes.
 * Cost-safe: no Places API / Aerial View calls. Markers sit on Google Photorealistic tiles.
 */
const REGION_LANDMARKS: Array<Omit<PilotageLandmark, "distanceNmFromOrigin">> = [
  {
    id: "sf-bay",
    name: "San Francisco Bay",
    kind: "water",
    lat: 37.69,
    lon: -122.28,
    cue: "Wide blue water basin. Keep east of the city shoreline when southbound along the bay.",
  },
  {
    id: "dumbarton",
    name: "Dumbarton Bridge",
    kind: "road",
    lat: 37.5049,
    lon: -122.1193,
    cue: "Distinct bridge span across the south bay. Easy checkpoint for KPAO / KSQL departures.",
  },
  {
    id: "santa-cruz-mts",
    name: "Santa Cruz Mountains",
    kind: "ridge",
    lat: 37.15,
    lon: -122.05,
    cue: "Dark wooded ridge line between the peninsula and the coast. Stay high enough for terrain clearance.",
  },
  {
    id: "half-moon-bay",
    name: "Half Moon Bay Coastline",
    kind: "water",
    lat: 37.4636,
    lon: -122.4286,
    cue: "Pacific shoreline notch. Useful when hugging the coast toward Monterey.",
  },
  {
    id: "monterey-bay",
    name: "Monterey Bay",
    kind: "water",
    lat: 36.8,
    lon: -121.9,
    cue: "Large open bay. Marine layer often sits over the water and sneaks inland toward KMRY.",
  },
  {
    id: "moss-landing",
    name: "Moss Landing Power Stacks",
    kind: "landmark",
    lat: 36.805,
    lon: -121.785,
    cue: "Tall stacks visible for miles along the Monterey Bay shoreline.",
  },
  {
    id: "mt-diablo",
    name: "Mount Diablo",
    kind: "ridge",
    lat: 37.8816,
    lon: -121.9142,
    cue: "Isolated peak east of the bay. Classic VFR reference when crossing the East Bay.",
  },
  {
    id: "altamont",
    name: "Altamont Pass Wind Farm",
    kind: "landmark",
    lat: 37.735,
    lon: -121.655,
    cue: "White turbines in the pass. Marks the climb into the Central Valley / foothills.",
  },
  {
    id: "sierra-foothills",
    name: "Sierra Foothills",
    kind: "ridge",
    lat: 38.0,
    lon: -120.7,
    cue: "Rolling gold-green foothills rising toward the high country. Watch density altitude in summer.",
  },
  {
    id: "lake-tahoe",
    name: "Lake Tahoe",
    kind: "water",
    lat: 39.1,
    lon: -120.05,
    cue: "Deep blue alpine lake. High terrain all around. Confirm ceiling and DA before committing.",
  },
  {
    id: "sjc-stadium",
    name: "Levi's Stadium Area",
    kind: "city",
    lat: 37.403,
    lon: -121.97,
    cue: "Stadium complex near SJC. Check for event TFRs before transiting low.",
  },
];

function distToSegmentNm(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  // Approximate: sample 12 points along segment
  let min = Infinity;
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    const pLat = aLat + (bLat - aLat) * f;
    const pLon = aLon + (bLon - aLon) * f;
    min = Math.min(min, haversineNm(lat, lon, pLat, pLon));
  }
  return min;
}

/**
 * Pick landmarks near the great-circle corridor for pilotage mode.
 * Straight mode returns an empty list (no visual cue clutter).
 */
export function selectPilotageLandmarks(
  origin: AirportLocation,
  destination: AirportLocation,
  routeMode: "straight" | "pilotage",
  maxCount = 5
): PilotageLandmark[] {
  if (routeMode !== "pilotage") return [];

  const routeNm = haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const corridorWidthNm = routeNm < 30 ? 8 : 16;
  const scored = REGION_LANDMARKS.map((lm) => {
    const offTrack = distToSegmentNm(
      lm.lat,
      lm.lon,
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon
    );
    const along = haversineNm(origin.lat, origin.lon, lm.lat, lm.lon);
    return { lm, offTrack, along };
  })
    .filter((x) => x.offTrack <= corridorWidthNm && x.along <= routeNm + 5)
    .sort((a, b) => a.along - b.along);

  // Prefer evenly spaced cues along the route
  const picked: typeof scored = [];
  for (const item of scored) {
    if (picked.length >= maxCount) break;
    const tooClose = picked.some(
      (p) => Math.abs(p.along - item.along) < 12
    );
    if (!tooClose) picked.push(item);
  }

  return picked.map(({ lm, along }) => ({
    ...lm,
    distanceNmFromOrigin: Math.round(along * 10) / 10,
  }));
}

/** Build a slight dogleg route that visits landmark positions for pilotage visualization. */
export function buildPilotageWaypoints(
  origin: AirportLocation,
  destination: AirportLocation,
  landmarks: PilotageLandmark[]
): Array<{ lat: number; lon: number }> {
  if (landmarks.length === 0) {
    return interpolateGreatCircle(
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
      24
    );
  }

  const nodes = [
    { lat: origin.lat, lon: origin.lon },
    ...landmarks.map((l) => ({ lat: l.lat, lon: l.lon })),
    { lat: destination.lat, lon: destination.lon },
  ];

  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const seg = interpolateGreatCircle(
      nodes[i].lat,
      nodes[i].lon,
      nodes[i + 1].lat,
      nodes[i + 1].lon,
      6
    );
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}
