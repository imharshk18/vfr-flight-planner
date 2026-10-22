import type { AircraftProfile, AirportLocation, TerrainPoint } from "./aviation-types";
import type { RunwayRecommendation } from "./aviation-intel";
import { haversineNm, computeCourseDeg } from "./aviation-api";

export type ProfilePhase = "takeoff" | "climb" | "cruise" | "descent" | "approach";

export type ProfileSample = {
  distanceNm: number;
  lat: number;
  lon: number;
  altitudeFt: number;
  terrainFt: number;
  phase: ProfilePhase;
  groundSpeedKt: number;
  windDirDeg: number;
  windSpeedKt: number;
  headwindKt: number;
  timeMin: number;
};

export type FlightProfile = {
  samples: ProfileSample[];
  climbDistanceNm: number;
  descentDistanceNm: number;
  cruiseDistanceNm: number;
  totalTimeMin: number;
  avgGroundSpeedKt: number;
  windSamples: Array<{ lat: number; lon: number; dirDeg: number; speedKt: number; altFt: number }>;
  depRunway: RunwayRecommendation;
  arrRunway: RunwayRecommendation;
};

function windComponents(windSpeedKt: number, windDirDeg: number, courseDeg: number) {
  const rel = ((windDirDeg - courseDeg + 180) % 360) - 180;
  const rad = (rel * Math.PI) / 180;
  return {
    headwindKt: windSpeedKt * Math.cos(rad),
    crosswindKt: Math.abs(windSpeedKt * Math.sin(rad)),
  };
}

/** Sample Open-Meteo winds at a few points/levels along the corridor (public, free). */
export async function fetchWindsAlongRoute(
  points: Array<{ lat: number; lon: number }>,
  cruiseAltitudeFt: number
): Promise<Array<{ lat: number; lon: number; dirDeg: number; speedKt: number; altFt: number }>> {
  const picks = [0, Math.floor(points.length / 2), points.length - 1]
    .map((i) => points[Math.max(0, Math.min(points.length - 1, i))])
    .filter(Boolean);

  // Open-Meteo pressure levels near cruise
  const levelHpa =
    cruiseAltitudeFt < 4000 ? 925 : cruiseAltitudeFt < 7000 ? 850 : cruiseAltitudeFt < 10000 ? 700 : 500;

  const results = await Promise.all(
    picks.map(async (p) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
          `&hourly=wind_speed_${levelHpa}hPa,wind_direction_${levelHpa}hPa&forecast_days=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error("wind");
        const data = await res.json();
        const speeds: number[] = data?.hourly?.[`wind_speed_${levelHpa}hPa`] || [];
        const dirs: number[] = data?.hourly?.[`wind_direction_${levelHpa}hPa`] || [];
        const idx = Math.min(12, speeds.length - 1);
        const speedMs = speeds[idx] ?? 8;
        const dirDeg = dirs[idx] ?? 270;
        return {
          lat: p.lat,
          lon: p.lon,
          dirDeg,
          speedKt: Math.round(speedMs * 1.94384),
          altFt: cruiseAltitudeFt,
        };
      } catch {
        return { lat: p.lat, lon: p.lon, dirDeg: 270, speedKt: 12, altFt: cruiseAltitudeFt };
      }
    })
  );
  return results;
}

function interpolateWind(
  samples: FlightProfile["windSamples"],
  lat: number,
  lon: number
): { dirDeg: number; speedKt: number } {
  if (!samples.length) return { dirDeg: 270, speedKt: 10 };
  let best = samples[0];
  let bestD = Infinity;
  for (const s of samples) {
    const d = haversineNm(lat, lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { dirDeg: best.dirDeg, speedKt: best.speedKt };
}

/**
 * Build a climb / cruise / descent altitude profile from POH performance,
 * terrain samples, and winds aloft. Used for 3D path and briefing graph.
 */
export function buildFlightProfile(input: {
  origin: AirportLocation;
  destination: AirportLocation;
  aircraft: AircraftProfile;
  cruiseAltitudeFt: number;
  climbFpm: number;
  terrainProfile: TerrainPoint[];
  windSamples: FlightProfile["windSamples"];
  depRunway: RunwayRecommendation;
  arrRunway: RunwayRecommendation;
}): FlightProfile {
  const {
    origin,
    destination,
    aircraft,
    cruiseAltitudeFt,
    climbFpm,
    terrainProfile,
    windSamples,
    depRunway,
    arrRunway,
  } = input;

  const totalNm =
    terrainProfile.at(-1)?.distanceNm ||
    haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);

  // Climb / descent distance from rate and typical climb IAS ~75 kt GS approx
  const climbGs = Math.max(60, aircraft.cruiseTasKt * 0.7);
  const climbAltGain = Math.max(500, cruiseAltitudeFt - origin.elevationFt);
  const descentAltLoss = Math.max(500, cruiseAltitudeFt - destination.elevationFt);
  const climbMin = climbAltGain / Math.max(200, climbFpm);
  const descentMin = descentAltLoss / Math.max(400, climbFpm * 0.85);
  let climbDistanceNm = (climbMin / 60) * climbGs;
  let descentDistanceNm = (descentMin / 60) * (aircraft.cruiseTasKt * 0.75);

  // Keep room for cruise segment
  const maxShare = totalNm * 0.4;
  climbDistanceNm = Math.min(climbDistanceNm, maxShare);
  descentDistanceNm = Math.min(descentDistanceNm, maxShare);
  if (climbDistanceNm + descentDistanceNm > totalNm * 0.85) {
    const scale = (totalNm * 0.85) / (climbDistanceNm + descentDistanceNm);
    climbDistanceNm *= scale;
    descentDistanceNm *= scale;
  }
  const cruiseDistanceNm = Math.max(0, totalNm - climbDistanceNm - descentDistanceNm);

  const courseDeg = computeCourseDeg(origin.lat, origin.lon, destination.lat, destination.lon);
  const samples: ProfileSample[] = [];
  let timeMin = 0;

  for (let i = 0; i < terrainProfile.length; i++) {
    const p = terrainProfile[i];
    const d = p.distanceNm;
    let altitudeFt: number;
    let phase: ProfilePhase;

    if (d <= 0.3) {
      phase = "takeoff";
      altitudeFt = origin.elevationFt + 50;
    } else if (d < climbDistanceNm) {
      phase = "climb";
      const f = d / Math.max(0.1, climbDistanceNm);
      altitudeFt = origin.elevationFt + climbAltGain * f;
    } else if (d < climbDistanceNm + cruiseDistanceNm) {
      phase = "cruise";
      altitudeFt = cruiseAltitudeFt;
    } else if (d < totalNm - 0.5) {
      phase = "descent";
      const remaining = totalNm - d;
      const f = 1 - remaining / Math.max(0.1, descentDistanceNm);
      altitudeFt = cruiseAltitudeFt - descentAltLoss * Math.max(0, Math.min(1, f));
    } else {
      phase = "approach";
      altitudeFt = destination.elevationFt + 1000; // pattern
    }

    // Stay above terrain + 500 ft for profile visualization
    altitudeFt = Math.max(altitudeFt, p.elevationFt + 500);

    const wind = interpolateWind(windSamples, p.lat, p.lon);
    const { headwindKt } = windComponents(wind.speedKt, wind.dirDeg, courseDeg);
    const tas =
      phase === "climb" || phase === "takeoff"
        ? climbGs
        : phase === "descent" || phase === "approach"
        ? aircraft.cruiseTasKt * 0.8
        : aircraft.cruiseTasKt;
    const groundSpeedKt = Math.max(45, tas - headwindKt);

    if (i > 0) {
      const segNm = d - terrainProfile[i - 1].distanceNm;
      timeMin += (segNm / groundSpeedKt) * 60;
    }

    samples.push({
      distanceNm: d,
      lat: p.lat,
      lon: p.lon,
      altitudeFt: Math.round(altitudeFt),
      terrainFt: p.elevationFt,
      phase,
      groundSpeedKt: Math.round(groundSpeedKt),
      windDirDeg: wind.dirDeg,
      windSpeedKt: wind.speedKt,
      headwindKt: Math.round(headwindKt * 10) / 10,
      timeMin: Math.round(timeMin * 10) / 10,
    });
  }

  const avgGroundSpeedKt = Math.round(
    samples.reduce((s, p) => s + p.groundSpeedKt, 0) / Math.max(1, samples.length)
  );

  return {
    samples,
    climbDistanceNm: Math.round(climbDistanceNm * 10) / 10,
    descentDistanceNm: Math.round(descentDistanceNm * 10) / 10,
    cruiseDistanceNm: Math.round(cruiseDistanceNm * 10) / 10,
    totalTimeMin: Math.round(timeMin),
    avgGroundSpeedKt,
    windSamples,
    depRunway,
    arrRunway,
  };
}
