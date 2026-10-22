import type {
  AircraftProfile,
  WeightAndBalanceState,
  StationWeather,
  TerrainPoint,
  VfrCorridorDecision,
  TfrZone,
  AirportRunwayData,
  AirportLocation,
} from "./aviation-types";
import { haversineNm, computeCourseDeg } from "./aviation-api";

// ---- Weight and Balance ----

function computeRampWeight(
  aircraft: AircraftProfile,
  wb: WeightAndBalanceState
): number {
  return (
    aircraft.emptyWeightLbs +
    wb.pilotWeightLbs +
    wb.passengerWeightLbs +
    wb.baggageLbs +
    wb.fuelGallons * 6.0
  );
}

// ---- Density Altitude ----

function computePressureAlt(elevationFt: number, altimeterInHg: number): number {
  return elevationFt + (29.92 - altimeterInHg) * 1000;
}

function computeDensityAlt(
  elevationFt: number,
  altimeterInHg: number,
  tempC: number
): number {
  const pa = computePressureAlt(elevationFt, altimeterInHg);
  const stdTemp = 15 - 2 * (pa / 1000);
  return Math.round(pa + 120 * (tempC - stdTemp));
}

// ---- POH Climb Rate Degradation ----

function computeClimbRate(aircraft: AircraftProfile, densityAltFt: number): number {
  return Math.max(50, aircraft.seaLevelClimbFpm - (densityAltFt / 1000) * 48);
}

// ---- Wind Components ----

function computeWindComponents(
  windSpeedKt: number,
  windDirDeg: number,
  courseDeg: number
): { headwindKt: number; crosswindKt: number } {
  const relAngle = ((windDirDeg - courseDeg + 180) % 360) - 180;
  const rad = (relAngle * Math.PI) / 180;
  return {
    headwindKt: Math.round(windSpeedKt * Math.cos(rad) * 10) / 10,
    crosswindKt: Math.round(Math.abs(windSpeedKt * Math.sin(rad)) * 10) / 10,
  };
}

// ---- TFR Intersection Check ----

function greatCircleSegmentClipsTfr(
  terrainPoints: TerrainPoint[],
  tfr: TfrZone,
  cruiseAltFt: number
): boolean {
  // If cruise altitude is above TFR ceiling or below TFR floor, no conflict
  if (cruiseAltFt > tfr.ceilingMsl || cruiseAltFt < tfr.floorMsl) return false;
  for (let i = 0; i < terrainPoints.length - 1; i++) {
    const p = terrainPoints[i];
    const q = terrainPoints[i + 1];
    // Check if either endpoint is inside the TFR cylinder radius
    const distP = haversineNm(p.lat, p.lon, tfr.centerLat, tfr.centerLon);
    const distQ = haversineNm(q.lat, q.lon, tfr.centerLat, tfr.centerLon);
    if (distP <= tfr.radiusNm || distQ <= tfr.radiusNm) return true;
    // Midpoint check for extra resolution
    const midLat = (p.lat + q.lat) / 2;
    const midLon = (p.lon + q.lon) / 2;
    const distMid = haversineNm(midLat, midLon, tfr.centerLat, tfr.centerLon);
    if (distMid <= tfr.radiusNm) return true;
  }
  return false;
}

// ---- Landing Distance at Density Altitude ----

function computeLandingDistanceFt(
  aircraft: AircraftProfile,
  densityAltFt: number
): number {
  // Sea-level baseline ground roll ~1000 ft for GA singles at 50 kt approach
  // Increase ~2% per 1000 ft density altitude above sea level
  const baseline = 900 + aircraft.maxGrossWeightLbs * 0.05;
  const factor = 1 + 0.02 * (densityAltFt / 1000);
  return Math.round(baseline * factor);
}

// ---- Main Rules Engine ----

export interface RulesEngineInput {
  origin: AirportLocation;
  destination: AirportLocation;
  aircraft: AircraftProfile;
  wb: WeightAndBalanceState;
  originWeather: StationWeather;
  destWeather: StationWeather;
  terrainProfile: TerrainPoint[];
  cruiseAltitudeFt: number;
  tfrs: TfrZone[];
  destRunwayData: AirportRunwayData;
  simulateMarineLayerBurnOff?: boolean;
}

export function runVfrRulesEngine(input: RulesEngineInput): VfrCorridorDecision {
  const {
    origin,
    destination,
    aircraft,
    wb,
    originWeather,
    destWeather,
    terrainProfile,
    cruiseAltitudeFt,
    tfrs,
    destRunwayData,
    simulateMarineLayerBurnOff = false,
  } = input;

  const blockers: string[] = [];
  const cautions: string[] = [];
  const citations: string[] = [];

  // ---- 1. Weight and Balance ----
  const totalRampWeightLbs = computeRampWeight(aircraft, wb);
  const weightStatus: VfrCorridorDecision["weightStatus"] =
    totalRampWeightLbs > aircraft.maxGrossWeightLbs ? "OVERWEIGHT" : "LEGAL";

  if (weightStatus === "OVERWEIGHT") {
    blockers.push(
      `Aircraft overweight: ${totalRampWeightLbs.toFixed(0)} lbs exceeds MGTOW of ${aircraft.maxGrossWeightLbs} lbs by ${(totalRampWeightLbs - aircraft.maxGrossWeightLbs).toFixed(0)} lbs`
    );
    citations.push("14 CFR 91.9 - Max Gross Weight Limitation");
  }

  // ---- 2. Density Altitude at Origin ----
  const originDA = computeDensityAlt(
    origin.elevationFt,
    originWeather.altimeterInHg,
    originWeather.tempC
  );
  const calculatedClimbRateFpm = Math.round(computeClimbRate(aircraft, originDA));

  if (originDA > 8000) {
    cautions.push(
      `High density altitude at departure: ${originDA.toLocaleString()} ft MSL. Performance significantly degraded.`
    );
  }

  // ---- 3. Terrain Clearance (14 CFR 91.119) ----
  const maxTerrainElevFt =
    terrainProfile.length > 0
      ? Math.max(...terrainProfile.map((p) => p.elevationFt))
      : origin.elevationFt;
  const requiredMinAltFt = maxTerrainElevFt + 1000;
  const minTerrainClearanceFt = cruiseAltitudeFt - maxTerrainElevFt;

  if (cruiseAltitudeFt < requiredMinAltFt) {
    blockers.push(
      `Terrain penetration: cruise altitude ${cruiseAltitudeFt.toLocaleString()} ft is below required ${requiredMinAltFt.toLocaleString()} ft MSL (1,000 ft above ${maxTerrainElevFt.toLocaleString()} ft obstacle)`
    );
    citations.push("14 CFR 91.119 - Minimum Safe Altitudes Over Congested and Other Areas");
  }

  // ---- 4. Climb Gradient vs Rising Terrain ----
  const terrainClimb =
    terrainProfile.length > 1
      ? Math.max(0, maxTerrainElevFt - origin.elevationFt)
      : 0;
  const distNm = haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const requiredClimbFpm =
    distNm > 0 ? (terrainClimb / ((distNm * 0.5) / (aircraft.cruiseTasKt / 60))) : 0;

  if (calculatedClimbRateFpm < 250 && requiredClimbFpm > 300) {
    blockers.push(
      `Climb deficit: aircraft climb rate ${calculatedClimbRateFpm} FPM at density altitude ${originDA.toLocaleString()} ft cannot meet required ${Math.round(requiredClimbFpm)} FPM gradient over terrain`
    );
    citations.push("POH Climb Performance Limitation at Density Altitude");
  } else if (calculatedClimbRateFpm < 400) {
    cautions.push(
      `Marginal climb rate: ${calculatedClimbRateFpm} FPM at density altitude ${originDA.toLocaleString()} ft. Allow extra runway distance.`
    );
  }

  // ---- 5. Cloud Clearance (14 CFR 91.155) ----
  const effectiveDestWeather = simulateMarineLayerBurnOff
    ? {
        ...destWeather,
        ceilingAglFt: destWeather.ceilingAglFt
          ? destWeather.ceilingAglFt + 2000
          : null,
        cloudDecks: destWeather.cloudDecks.map((d) => ({
          ...d,
          baseAglFt: d.coverage === "SKC" ? d.baseAglFt : d.baseAglFt + 2000,
          baseMslFt: d.coverage === "SKC" ? d.baseMslFt : d.baseMslFt + 2000,
        })),
      }
    : destWeather;

  const patternAltFt = destination.elevationFt + 1000;
  let cloudBufferFt = 99999;

  if (effectiveDestWeather.ceilingAglFt !== null) {
    const ceilingMsl = destination.elevationFt + effectiveDestWeather.ceilingAglFt;
    cloudBufferFt = ceilingMsl - patternAltFt;

    if (cloudBufferFt < 500) {
      blockers.push(
        `Destination cloud clearance violation: ceiling ${Math.round(ceilingMsl).toLocaleString()} ft MSL leaves only ${Math.round(cloudBufferFt)} ft buffer above pattern altitude ${patternAltFt.toLocaleString()} ft MSL (500 ft below clouds required)`
      );
      citations.push("14 CFR 91.155 - Basic VFR Weather Minimums: 500 ft Below Clouds");
    } else if (cloudBufferFt < 1000) {
      cautions.push(
        `Tight cloud buffer at destination: ${Math.round(cloudBufferFt)} ft between pattern altitude and ceiling.`
      );
    }
  }

  // Check if cruise altitude penetrates ceiling
  const ceilingDecks = [...originWeather.cloudDecks, ...destWeather.cloudDecks].filter(
    (d) => d.coverage === "BKN" || d.coverage === "OVC"
  );
  for (const deck of ceilingDecks) {
    if (deck.baseMslFt > 0 && cruiseAltitudeFt > deck.baseMslFt - 500) {
      blockers.push(
        `Cruise altitude ${cruiseAltitudeFt.toLocaleString()} ft penetrates or is within 500 ft below cloud deck at ${deck.baseMslFt.toLocaleString()} ft MSL`
      );
      citations.push("14 CFR 91.155 - 500 ft Below Cloud Clearance Requirement");
      break;
    }
  }

  // ---- 6. Fuel and Reserves (14 CFR 91.151) ----
  const courseDeg = computeCourseDeg(origin.lat, origin.lon, destination.lat, destination.lon);
  const avgWindSpeedKt = (originWeather.windSpeedKt + destWeather.windSpeedKt) / 2;
  const avgWindDirDeg = originWeather.windDirDeg;
  const { headwindKt, crosswindKt } = computeWindComponents(
    avgWindSpeedKt,
    avgWindDirDeg,
    courseDeg
  );

  const groundSpeedKt = Math.max(30, aircraft.cruiseTasKt - headwindKt);
  const flightTimeHours = distNm / groundSpeedKt;
  const estimatedTimeEnrouteMin = Math.round(flightTimeHours * 60);
  const fuelRequiredGal = flightTimeHours * aircraft.fuelBurnGph;
  const dayVfrReserveGal = 0.5 * aircraft.fuelBurnGph;
  const totalFuelNeededGal = fuelRequiredGal + dayVfrReserveGal;
  const reserveFuelRemainingGal = wb.fuelGallons - fuelRequiredGal;

  if (wb.fuelGallons < totalFuelNeededGal) {
    blockers.push(
      `Fuel exhaustion risk: ${wb.fuelGallons.toFixed(1)} gal on board insufficient for ${fuelRequiredGal.toFixed(1)} gal enroute plus ${dayVfrReserveGal.toFixed(1)} gal VFR reserve (${totalFuelNeededGal.toFixed(1)} gal total required)`
    );
    citations.push("14 CFR 91.151 - Day VFR 30-Minute Fuel Reserve Requirement");
  } else if (reserveFuelRemainingGal < dayVfrReserveGal * 1.5) {
    cautions.push(
      `Reserve fuel tight: ${reserveFuelRemainingGal.toFixed(1)} gal remaining after flight (minimum ${dayVfrReserveGal.toFixed(1)} gal required).`
    );
  }

  // ---- 7. Crosswind Check ----
  if (crosswindKt > aircraft.maxCrosswindKt) {
    blockers.push(
      `Crosswind component ${crosswindKt.toFixed(1)} kt exceeds aircraft maximum demonstrated crosswind of ${aircraft.maxCrosswindKt} kt`
    );
    citations.push("POH Maximum Demonstrated Crosswind Limitation");
  } else if (crosswindKt > aircraft.maxCrosswindKt * 0.75) {
    cautions.push(
      `Crosswind component ${crosswindKt.toFixed(1)} kt approaching aircraft maximum of ${aircraft.maxCrosswindKt} kt.`
    );
  }

  // ---- 8. TFR Conflict Check ----
  for (const tfr of tfrs) {
    const clips = greatCircleSegmentClipsTfr(terrainProfile, tfr, cruiseAltitudeFt);
    if (clips) {
      blockers.push(
        `TFR conflict: flight path intersects "${tfr.name}" (${tfr.notamRef}) - ${tfr.radiusNm} NM radius centered at ${tfr.centerLat.toFixed(4)}, ${tfr.centerLon.toFixed(4)}, surface to ${tfr.ceilingMsl.toLocaleString()} ft MSL`
      );
      citations.push(
        "14 CFR 91.141 - Temporary Flight Restriction Airspace Breach"
      );
    }
  }

  // ---- 9. Runway Length Check at Density Altitude ----
  const destDA = computeDensityAlt(
    destination.elevationFt,
    destWeather.altimeterInHg,
    destWeather.tempC
  );
  const landingRollFt = computeLandingDistanceFt(aircraft, destDA);
  const availableRunwayFt = destRunwayData.primaryRunwayLength;
  const runwayUsageRatio = landingRollFt / availableRunwayFt;

  if (runwayUsageRatio > 0.8) {
    blockers.push(
      `Runway length violation: estimated landing roll ${landingRollFt.toLocaleString()} ft exceeds 80% of available ${availableRunwayFt.toLocaleString()} ft runway at density altitude ${destDA.toLocaleString()} ft`
    );
    citations.push("POH Runway Performance - 80% Runway Buffer Violation");
  } else if (runwayUsageRatio > 0.6) {
    cautions.push(
      `Runway margin tight: landing roll estimated at ${landingRollFt.toLocaleString()} ft on ${availableRunwayFt.toLocaleString()} ft runway (${Math.round(runwayUsageRatio * 100)}% used) at density altitude ${destDA.toLocaleString()} ft.`
    );
  }

  // ---- Verdict ----
  let verdict: VfrCorridorDecision["verdict"];
  let summary: string;

  if (blockers.length > 0) {
    verdict = "NO_GO";
    summary = `Flight BLOCKED: ${blockers.length} regulatory violation${blockers.length > 1 ? "s" : ""} detected. Do not depart.`;
  } else if (cautions.length >= 2) {
    verdict = "MARGINAL";
    summary = `Flight MARGINAL: ${cautions.length} caution item${cautions.length > 1 ? "s" : ""} require pilot-in-command judgment. Proceed with awareness.`;
  } else {
    verdict = "GO";
    summary = "Flight APPROVED: All VFR regulatory checks passed. Standard pre-flight diligence required.";
  }

  return {
    verdict,
    summary,
    blockers,
    cautions,
    regulatoryCitations: [...new Set(citations)],
    minTerrainClearanceFt,
    cloudBufferFt: cloudBufferFt === 99999 ? 99999 : Math.round(cloudBufferFt),
    calculatedClimbRateFpm,
    headwindComponentKt: headwindKt,
    crosswindComponentKt: crosswindKt,
    groundSpeedKt: Math.round(groundSpeedKt),
    estimatedTimeEnrouteMin,
    fuelRequiredGal: Math.round(fuelRequiredGal * 10) / 10,
    reserveFuelRemainingGal: Math.round(reserveFuelRemainingGal * 10) / 10,
    totalRampWeightLbs: Math.round(totalRampWeightLbs),
    weightStatus,
  };
}

// ---- Auto-optimize cruise altitude ----

export function autoOptimizeCruiseAltitude(
  terrainProfile: TerrainPoint[],
  originWeather: StationWeather,
  destWeather: StationWeather,
  destination: { elevationFt: number },
  aircraft: AircraftProfile
): number {
  const maxObstacleFt =
    terrainProfile.length > 0
      ? Math.max(...terrainProfile.map((p) => p.elevationFt))
      : 0;
  const minForTerrain = maxObstacleFt + 1000;

  // Find lowest ceiling across both stations
  const allCeilings = [
    ...(originWeather.ceilingAglFt !== null
      ? [originWeather.ceilingAglFt + (originWeather.densityAltitudeFt > 0 ? 0 : 0)]
      : []),
    ...(destWeather.ceilingAglFt !== null
      ? [destWeather.ceilingAglFt + destination.elevationFt]
      : []),
  ];

  let minForClouds = aircraft.serviceCeilingFt;
  if (allCeilings.length > 0) {
    const lowestCeilingMsl = Math.min(...allCeilings);
    minForClouds = lowestCeilingMsl - 500;
  }

  const optimal = Math.round(Math.min(minForTerrain, minForClouds) / 500) * 500;
  return Math.max(1500, Math.min(13500, optimal));
}
