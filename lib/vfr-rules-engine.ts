import type {
  AircraftProfile,
  WeightAndBalanceState,
  StationWeather,
  TerrainPoint,
  VfrCorridorDecision,
  VfrRuleCheck,
  TfrZone,
  AirportRunwayData,
  AirportLocation,
  CloudDeck,
} from "./aviation-types";
import { haversineNm, computeCourseDeg } from "./aviation-api";
import type { HazardAdvisory, PirepReport, RunwayRecommendation } from "./aviation-intel";
import { calculateLoading } from "./weight-balance";

/** Official ceiling = lowest BKN or OVC. FEW/SCT are clouds, not a ceiling. */
function officialCeilingAgl(wx: StationWeather): number | null {
  const layers = wx.cloudDecks.filter((d) => d.coverage === "BKN" || d.coverage === "OVC");
  if (!layers.length) return null;
  return Math.min(...layers.map((d) => d.baseAglFt));
}

function scatteredDecks(wx: StationWeather): CloudDeck[] {
  return wx.cloudDecks.filter((d) => d.coverage === "FEW" || d.coverage === "SCT");
}

function visSm(wx: StationWeather): number | null {
  if (typeof wx.visibilitySm === "number" && Number.isFinite(wx.visibilitySm)) {
    return wx.visibilitySm;
  }
  // Recover from raw METAR when structured vis was omitted (demo packs / partial TAF).
  const m = wx.rawMetar?.match(/\b(\d{1,2}(?:\/\d{1,2})?)SM\b/);
  if (m) {
    const raw = m[1];
    if (raw.includes("/")) {
      const [a, b] = raw.split("/").map(Number);
      if (b) return a / b;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  // Flight category already encodes visibility bands when AWC computed it.
  if (wx.flightCategory === "VFR") return 6;
  if (wx.flightCategory === "MVFR") return 4;
  if (wx.flightCategory === "IFR") return 2;
  if (wx.flightCategory === "LIFR") return 0.5;
  return null;
}

function describeSky(wx: StationWeather): string {
  const ceil = officialCeilingAgl(wx);
  const scat = scatteredDecks(wx);
  const bits: string[] = [];
  if (ceil != null) bits.push(`ceiling ${ceil.toLocaleString()} ft AGL (BKN/OVC)`);
  else bits.push("no ceiling (sky clear of BKN/OVC)");
  if (scat.length) {
    bits.push(
      `scattered/few at ${scat
        .map((d) => `${d.coverage}${Math.round(d.baseAglFt / 100)
          .toString()
          .padStart(3, "0")}`)
        .join(", ")} — not a ceiling`
    );
  }
  const v = visSm(wx);
  bits.push(v != null ? `vis ${v} SM` : "vis unreported");
  return bits.join("; ");
}

// ---- Weight and Balance ----

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
  /** Prefer forecast-at-ETA for destination category checks when provided */
  destForecastWeather?: StationWeather;
  originForecastWeather?: StationWeather;
  terrainProfile: TerrainPoint[];
  cruiseAltitudeFt: number;
  tfrs: TfrZone[];
  destRunwayData: AirportRunwayData;
  simulateMarineLayerBurnOff?: boolean;
  pireps?: PirepReport[];
  advisories?: HazardAdvisory[];
  /** Mid-corridor METAR/TAF samples — used for enroute VFR category / ceiling / vis */
  enrouteStations?: Array<{
    icao: string;
    name?: string;
    weather: StationWeather;
  }>;
  depRunway?: RunwayRecommendation;
  arrRunway?: RunwayRecommendation;
  profileTimeMin?: number;
  profileAvgGs?: number;
}

export function runVfrRulesEngine(input: RulesEngineInput): VfrCorridorDecision {
  const {
    origin,
    destination,
    aircraft,
    wb,
    originWeather,
    destWeather,
    destForecastWeather,
    originForecastWeather,
    terrainProfile,
    cruiseAltitudeFt,
    tfrs,
    destRunwayData,
    simulateMarineLayerBurnOff = false,
    pireps = [],
    advisories = [],
    enrouteStations = [],
    depRunway,
    arrRunway,
    profileTimeMin,
    profileAvgGs,
  } = input;

  // Use forecast-at-time for terminal VFR category when available
  const depWx = originForecastWeather || originWeather;
  const arrWx = destForecastWeather || destWeather;

  const blockers: string[] = [];
  const cautions: string[] = [];
  const citations: string[] = [];
  const briefingHighlights: string[] = [];
  const ruleChecks: VfrRuleCheck[] = [];
  let ruleSeq = 0;

  const pushFail = (id: string, regulation: string, title: string, detail: string) => {
    blockers.push(detail);
    citations.push(regulation);
    ruleChecks.push({ id: `${id}-${++ruleSeq}`, regulation, title, result: "fail", detail });
  };
  const pushCaution = (id: string, regulation: string, title: string, detail: string) => {
    cautions.push(detail);
    ruleChecks.push({ id: `${id}-${++ruleSeq}`, regulation, title, result: "caution", detail });
  };
  const pushPass = (id: string, regulation: string, title: string, detail: string) => {
    ruleChecks.push({ id: `${id}-${++ruleSeq}`, regulation, title, result: "pass", detail });
  };

  // ---- 1. Weight and Balance ----
  const loading = calculateLoading(aircraft, wb);
  const totalRampWeightLbs = loading.rampWeightLbs;
  const weightStatus: VfrCorridorDecision["weightStatus"] =
    loading.weightLegal ? "LEGAL" : "OVERWEIGHT";
  const cgStatus: VfrCorridorDecision["cgStatus"] =
    loading.cgLegal ? "IN_ENVELOPE" : "OUT_OF_ENVELOPE";

  if (weightStatus === "OVERWEIGHT") {
    const maxRamp = aircraft.maxRampWeightLbs ?? aircraft.maxGrossWeightLbs;
    pushFail(
      "weight",
      "14 CFR 91.9 / POH",
      "Weight limits",
      `Aircraft overweight: ${totalRampWeightLbs.toFixed(0)} lbs exceeds maximum ramp weight of ${maxRamp} lbs by ${(totalRampWeightLbs - maxRamp).toFixed(0)} lbs`
    );
  } else {
    pushPass(
      "weight",
      "14 CFR 91.9 / POH",
      "Weight limits",
      `Ramp weight ${Math.round(totalRampWeightLbs).toLocaleString()} lbs is within max ${(aircraft.maxRampWeightLbs ?? aircraft.maxGrossWeightLbs).toLocaleString()} lbs.`
    );
  }
  if (!loading.cgLegal) {
    pushFail(
      "cg",
      "Aircraft POH — Weight and Balance",
      "Center of gravity",
      `Center of gravity ${loading.centerOfGravityIn.toFixed(1)} in is outside the ${loading.forwardLimitIn.toFixed(1)}–${loading.aftLimitIn.toFixed(1)} in loading envelope.`
    );
  } else {
    pushPass(
      "cg",
      "Aircraft POH — Weight and Balance",
      "Center of gravity",
      `CG ${loading.centerOfGravityIn.toFixed(1)} in is inside ${loading.forwardLimitIn.toFixed(1)}–${loading.aftLimitIn.toFixed(1)} in.`
    );
  }

  // ---- 2. Density Altitude at Origin ----
  const originDA = computeDensityAlt(
    origin.elevationFt,
    originWeather.altimeterInHg,
    originWeather.tempC
  );
  const calculatedClimbRateFpm = Math.round(computeClimbRate(aircraft, originDA));

  if (originDA > 8000) {
    pushCaution(
      "da",
      "POH — Density altitude",
      "Departure density altitude",
      `High density altitude at departure: ${originDA.toLocaleString()} ft. Performance significantly degraded.`
    );
  } else {
    pushPass(
      "da",
      "POH — Density altitude",
      "Departure density altitude",
      `Departure DA ~${originDA.toLocaleString()} ft · estimated climb ${calculatedClimbRateFpm} fpm.`
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
    pushFail(
      "terrain",
      "14 CFR 91.119",
      "Minimum safe altitude",
      `Terrain penetration: cruise altitude ${cruiseAltitudeFt.toLocaleString()} ft is below required ${requiredMinAltFt.toLocaleString()} ft MSL (1,000 ft above ${maxTerrainElevFt.toLocaleString()} ft obstacle)`
    );
  } else {
    pushPass(
      "terrain",
      "14 CFR 91.119",
      "Minimum safe altitude",
      `${minTerrainClearanceFt.toLocaleString()} ft above highest corridor terrain (${maxTerrainElevFt.toLocaleString()} ft).`
    );
  }

  // ---- 4. Climb Gradient vs Rising Terrain ----
  const terrainClimb =
    terrainProfile.length > 1
      ? Math.max(0, maxTerrainElevFt - origin.elevationFt)
      : 0;
  const distNm = terrainProfile.at(-1)?.distanceNm || haversineNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const requiredClimbFpm =
    distNm > 0 ? (terrainClimb / ((distNm * 0.5) / (aircraft.cruiseTasKt / 60))) : 0;

  if (calculatedClimbRateFpm < 250 && requiredClimbFpm > 300) {
    pushFail(
      "climb",
      "POH — Climb performance",
      "Climb vs terrain",
      `Climb deficit: aircraft climb rate ${calculatedClimbRateFpm} FPM at density altitude ${originDA.toLocaleString()} ft cannot meet required ${Math.round(requiredClimbFpm)} FPM gradient over terrain`
    );
  } else if (calculatedClimbRateFpm < 400) {
    pushCaution(
      "climb",
      "POH — Climb performance",
      "Climb vs terrain",
      `Marginal climb rate: ${calculatedClimbRateFpm} FPM at density altitude ${originDA.toLocaleString()} ft. Allow extra runway distance.`
    );
  } else {
    pushPass(
      "climb",
      "POH — Climb performance",
      "Climb vs terrain",
      `Climb ${calculatedClimbRateFpm} fpm is adequate for the corridor gradient.`
    );
  }

  // ---- 5. Basic VFR weather (14 CFR 91.155) — ceiling ≠ FEW/SCT ----
  // Day private-pilot XC assumption: Class E below 10,000 MSL enroute
  // (3 SM, 500 below / 1,000 above / 2,000 horiz). Surface B/C/D/E also
  // needs ceiling ≥ 1,000 AGL (91.155(c)) and 3 SM for takeoff/landing (91.155(d)).
  const effectiveDestWeather = simulateMarineLayerBurnOff
    ? {
        ...arrWx,
        ceilingAglFt: officialCeilingAgl(arrWx)
          ? (officialCeilingAgl(arrWx) as number) + 2000
          : null,
        cloudDecks: arrWx.cloudDecks.map((d) => ({
          ...d,
          baseAglFt: d.coverage === "SKC" ? d.baseAglFt : d.baseAglFt + 2000,
          baseMslFt: d.coverage === "SKC" ? d.baseMslFt : d.baseMslFt + 2000,
        })),
      }
    : arrWx;

  const depCeil = officialCeilingAgl(depWx);
  const arrCeil = officialCeilingAgl(effectiveDestWeather);
  const depVis = visSm(depWx);
  const arrVis = visSm(effectiveDestWeather);

  const catFrom = (ceil: number | null, vis: number | null): StationWeather["flightCategory"] => {
    const c = ceil ?? 99999;
    const v = vis ?? 10;
    if (c < 500 || v < 1) return "LIFR";
    if (c < 1000 || v < 3) return "IFR";
    if (c < 3000 || v < 5) return "MVFR";
    return "VFR";
  };
  const depCat = catFrom(depCeil, depVis);
  const arrCat = catFrom(arrCeil, arrVis);

  // 91.155(d) — takeoff / landing visibility in surface controlled airspace
  if (depVis != null && depVis < 3) {
    pushFail(
      "dep-vis",
      "14 CFR 91.155(d)",
      "Departure visibility",
      `Departure ground/flight visibility ${depVis} SM is below the 3 SM required to take off VFR in surface controlled airspace.`
    );
  } else if (depVis != null) {
    pushPass(
      "dep-vis",
      "14 CFR 91.155(d)",
      "Departure visibility",
      `Departure visibility ${depVis} SM meets the 3 SM takeoff/landing minimum.`
    );
  } else {
    pushCaution(
      "dep-vis",
      "14 CFR 91.155(d)",
      "Departure visibility",
      "Departure visibility not reported — confirm at least 3 SM before takeoff."
    );
  }

  if (arrVis != null && arrVis < 3) {
    pushFail(
      "arr-vis",
      "14 CFR 91.155(d)",
      "Arrival visibility",
      `Arrival visibility ${arrVis} SM is below the 3 SM required to land VFR in surface controlled airspace.`
    );
  } else if (arrVis != null) {
    pushPass(
      "arr-vis",
      "14 CFR 91.155(d)",
      "Arrival visibility",
      `Arrival visibility ${arrVis} SM meets the 3 SM landing minimum.`
    );
  } else {
    pushCaution(
      "arr-vis",
      "14 CFR 91.155(d)",
      "Arrival visibility",
      "Arrival visibility not reported — confirm at least 3 SM before entering the pattern."
    );
  }

  // 91.155(c) — ceiling under surface controlled airspace (BKN/OVC only)
  if (depCeil != null && depCeil < 1000) {
    pushFail(
      "dep-ceil",
      "14 CFR 91.155(c)",
      "Departure ceiling",
      `Departure ceiling ${depCeil.toLocaleString()} ft AGL (BKN/OVC) is below the 1,000 ft required to operate beneath the ceiling in surface controlled airspace. FEW/SCT layers are not ceilings.`
    );
  } else if (depCeil != null) {
    pushPass(
      "dep-ceil",
      "14 CFR 91.155(c)",
      "Departure ceiling",
      `Departure ceiling ${depCeil.toLocaleString()} ft AGL (BKN/OVC) is at/above 1,000 ft. ${describeSky(depWx)}.`
    );
  } else {
    pushPass(
      "dep-ceil",
      "14 CFR 91.155(c)",
      "Departure ceiling",
      `No BKN/OVC ceiling at departure — ${describeSky(depWx)}. FEW/SCT alone do not create a ceiling or force a NO-GO.`
    );
  }

  if (arrCeil != null && arrCeil < 1000) {
    pushFail(
      "arr-ceil",
      "14 CFR 91.155(c)",
      "Arrival ceiling",
      `Arrival ceiling ${arrCeil.toLocaleString()} ft AGL (BKN/OVC) is below the 1,000 ft required to operate beneath the ceiling in surface controlled airspace.`
    );
  } else if (arrCeil != null) {
    pushPass(
      "arr-ceil",
      "14 CFR 91.155(c)",
      "Arrival ceiling",
      `Arrival ceiling ${arrCeil.toLocaleString()} ft AGL (BKN/OVC) is at/above 1,000 ft. ${describeSky(effectiveDestWeather)}.`
    );
  } else {
    pushPass(
      "arr-ceil",
      "14 CFR 91.155(c)",
      "Arrival ceiling",
      `No BKN/OVC ceiling at arrival — ${describeSky(effectiveDestWeather)}. A few/scattered clouds are not the flight ceiling.`
    );
  }

  // Category from ceiling (BKN/OVC only) + vis — never trust a stale label alone
  if (depCat === "IFR" || depCat === "LIFR") {
    // Already covered by 91.155(c)/(d) fails; keep a category note only if those somehow passed
    if (
      !ruleChecks.some((r) => r.id === "dep-ceil" && r.result === "fail") &&
      !ruleChecks.some((r) => r.id === "dep-vis" && r.result === "fail")
    ) {
      pushFail(
        "dep-cat",
        "14 CFR 91.155",
        "Departure flight category",
        `Departure computes ${depCat} from ceiling/vis (${describeSky(depWx)}). Basic VFR is not supported without Special VFR.`
      );
    }
  } else if (depCat === "MVFR") {
    pushCaution(
      "dep-cat",
      "14 CFR 91.155",
      "Departure flight category",
      `Departure is MVFR — may still be legal VFR, but margins are thin. ${describeSky(depWx)}.`
    );
  }

  if (arrCat === "IFR" || arrCat === "LIFR") {
    if (
      !ruleChecks.some((r) => r.id === "arr-ceil" && r.result === "fail") &&
      !ruleChecks.some((r) => r.id === "arr-vis" && r.result === "fail")
    ) {
      pushFail(
        "arr-cat",
        "14 CFR 91.155",
        "Arrival flight category",
        `Arrival computes ${arrCat} at ETA (${describeSky(effectiveDestWeather)}). Basic VFR arrival not supported without Special VFR.`
      );
    }
  } else if (arrCat === "MVFR") {
    pushCaution(
      "arr-cat",
      "14 CFR 91.155",
      "Arrival flight category",
      `Arrival is MVFR from ceiling/vis. Legal VFR may still exist — have a divert. ${describeSky(effectiveDestWeather)}.`
    );
  }

  // Pattern altitude vs true ceiling (BKN/OVC) — 500 ft below clouds in Class E
  const patternAltFt = destination.elevationFt + 1000;
  let cloudBufferFt = 99999;

  if (arrCeil != null) {
    const ceilingMsl = destination.elevationFt + arrCeil;
    cloudBufferFt = ceilingMsl - patternAltFt;

    if (cloudBufferFt < 500) {
      pushFail(
        "pattern-cloud",
        "14 CFR 91.155(a) — 500 ft below",
        "Pattern cloud clearance",
        `Destination ceiling ${Math.round(ceilingMsl).toLocaleString()} ft MSL leaves only ${Math.round(cloudBufferFt)} ft above pattern altitude ${patternAltFt.toLocaleString()} ft MSL (need 500 ft below BKN/OVC).`
      );
    } else if (cloudBufferFt < 1000) {
      pushCaution(
        "pattern-cloud",
        "14 CFR 91.155(a) — 500 ft below",
        "Pattern cloud clearance",
        `Tight buffer: ${Math.round(cloudBufferFt)} ft between pattern altitude and the BKN/OVC ceiling.`
      );
    } else {
      pushPass(
        "pattern-cloud",
        "14 CFR 91.155(a) — 500 ft below",
        "Pattern cloud clearance",
        `${Math.round(cloudBufferFt)} ft between pattern altitude and the BKN/OVC ceiling.`
      );
    }
  } else {
    pushPass(
      "pattern-cloud",
      "14 CFR 91.155(a)",
      "Pattern cloud clearance",
      "No BKN/OVC ceiling at destination — pattern altitude is not capped by a ceiling. FEW/SCT still require clear-of-clouds judgment."
    );
  }

  // ---- Enroute stations along the corridor (not just dep/arr) ----
  type CorridorWx = { icao: string; label: string; wx: StationWeather };
  const corridorWx: CorridorWx[] = [
    { icao: origin.icao, label: "Departure", wx: depWx },
    ...enrouteStations.map((s) => ({
      icao: s.icao,
      label: s.name || s.icao,
      wx: s.weather,
    })),
    { icao: destination.icao, label: "Arrival", wx: effectiveDestWeather },
  ];

  let enrouteWxFail = false;
  for (const stop of enrouteStations) {
    const ceil = officialCeilingAgl(stop.weather);
    const vis = visSm(stop.weather);
    const cat = catFrom(ceil, vis);
    if (cat === "IFR" || cat === "LIFR") {
      enrouteWxFail = true;
      pushFail(
        "enroute-cat",
        "14 CFR 91.155 — basic VFR",
        `Enroute ${stop.icao} flight category`,
        `${stop.icao}${stop.name ? ` (${stop.name})` : ""} along the corridor is ${cat}` +
          `${ceil != null ? ` · ceiling ${ceil.toLocaleString()} ft AGL` : ""}` +
          `${vis != null ? ` · vis ${vis} SM` : ""}. VFR through that weather is not legal/safe — delay, reroute, or stay clear.`
      );
    } else if (vis != null && vis < 3) {
      enrouteWxFail = true;
      pushFail(
        "enroute-vis",
        "14 CFR 91.155(a) — 3 SM",
        `Enroute ${stop.icao} visibility`,
        `${stop.icao} reports ${vis} SM — below the 3 SM Class E VFR minimum along the route.`
      );
    } else if (cat === "MVFR") {
      pushCaution(
        "enroute-mvfr",
        "14 CFR 91.155 — basic VFR",
        `Enroute ${stop.icao} MVFR`,
        `${stop.icao}${stop.name ? ` (${stop.name})` : ""} is MVFR` +
          `${ceil != null ? ` · ceiling ${ceil.toLocaleString()} ft AGL` : ""}` +
          `${vis != null ? ` · vis ${vis} SM` : ""}. Legal VFR may exist — leave an out and watch trends.`
      );
    }
  }
  if (enrouteStations.length && !enrouteWxFail) {
    const ids = enrouteStations.map((s) => s.icao).join(", ");
    pushPass(
      "enroute-cat",
      "14 CFR 91.155",
      "Enroute corridor weather",
      `Corridor stations (${ids || "none"}) support basic VFR at the sampled times — not only dep/arr.`
    );
  } else if (!enrouteStations.length) {
    pushCaution(
      "enroute-cat",
      "14 CFR 91.155",
      "Enroute corridor weather",
      "No mid-route TAF/METAR stations sampled for this corridor — decision is based on departure and arrival only. Cross-check enroute weather."
    );
  }

  // Cruise vs ceiling (BKN/OVC only) — hard stop if inside / within 500 ft below
  const ceilingDecks = corridorWx
    .flatMap((s) => s.wx.cloudDecks)
    .filter((d) => (d.coverage === "BKN" || d.coverage === "OVC") && d.baseMslFt > 0);

  let cruiseCeilingHit = false;
  for (const deck of ceilingDecks) {
    if (deck.baseMslFt > 0 && cruiseAltitudeFt > deck.baseMslFt - 500) {
      cruiseCeilingHit = true;
      pushFail(
        "cruise-ceiling",
        "14 CFR 91.155(a) — Class E cloud clearance",
        "Cruise vs ceiling",
        `Cruise ${cruiseAltitudeFt.toLocaleString()} ft is within 500 ft below (or into) a ${deck.coverage} ceiling at ${deck.baseMslFt.toLocaleString()} ft MSL — that is IMC risk, not “a few clouds.”`
      );
      break;
    }
  }
  if (!cruiseCeilingHit) {
    pushPass(
      "cruise-ceiling",
      "14 CFR 91.155(a)",
      "Cruise vs ceiling",
      `Cruise ${cruiseAltitudeFt.toLocaleString()} ft stays ≥500 ft below any BKN/OVC ceiling from dep, enroute, and arrival stations.`
    );
  }

  // FEW/SCT are NOT ceilings — caution only for Class E 500/1000 clearance
  const scatterDecks = corridorWx
    .flatMap((s) => s.wx.cloudDecks)
    .filter((d) => (d.coverage === "FEW" || d.coverage === "SCT") && d.baseMslFt > 0);

  let scatterCaution = false;
  for (const deck of scatterDecks) {
    const below = deck.baseMslFt - cruiseAltitudeFt;
    const above = cruiseAltitudeFt - deck.baseMslFt;
    // Inside / very near a scattered layer → caution (maintain clearance), not NO-GO
    if (below >= 0 && below < 500) {
      scatterCaution = true;
      pushCaution(
        "cruise-scatter",
        "14 CFR 91.155(a) — cloud clearance",
        "Scattered/few cloud clearance",
        `${deck.coverage} at ${deck.baseMslFt.toLocaleString()} ft MSL is only ${Math.round(below)} ft above cruise. That is NOT a ceiling, but Class E still wants 500 ft below clouds — descend, climb above with 1,000 ft, or deviate laterally.`
      );
      break;
    }
    if (above >= 0 && above < 1000) {
      scatterCaution = true;
      pushCaution(
        "cruise-scatter",
        "14 CFR 91.155(a) — cloud clearance",
        "Scattered/few cloud clearance",
        `Cruise is ${Math.round(above)} ft above a ${deck.coverage} layer at ${deck.baseMslFt.toLocaleString()} ft MSL. Not a ceiling — keep 1,000 ft above or stay clear of clouds.`
      );
      break;
    }
  }
  if (!scatterCaution && scatterDecks.length) {
    pushPass(
      "cruise-scatter",
      "14 CFR 91.155(a)",
      "Scattered/few cloud clearance",
      `FEW/SCT layers present along the corridor but cruise maintains Class E clearance margins. Reminder: FEW/SCT do not define the flight ceiling.`
    );
  } else if (!scatterDecks.length) {
    pushPass(
      "cruise-scatter",
      "14 CFR 91.155(a)",
      "Scattered/few cloud clearance",
      "No FEW/SCT layers in the corridor sky groups (dep · enroute · arr) used for this check."
    );
  }

  // Hemispheric VFR cruise (91.159) — advisory
  const courseDeg = computeCourseDeg(origin.lat, origin.lon, destination.lat, destination.lon);
  if (cruiseAltitudeFt >= 3000) {
    const eastbound = ((courseDeg % 360) + 360) % 360 < 180;
    const thousands = Math.floor(cruiseAltitudeFt / 1000);
    const isOdd = thousands % 2 === 1;
    const isPlus500 = cruiseAltitudeFt % 1000 === 500;
    const ok = isPlus500 && ((eastbound && isOdd) || (!eastbound && !isOdd));
    const suggested = nextVfrCruiseAltitude(Math.max(3500, cruiseAltitudeFt - 500), courseDeg);
    if (!ok) {
      pushCaution(
        "hemi",
        "14 CFR 91.159",
        "VFR cruising altitude",
        `Cruise ${cruiseAltitudeFt.toLocaleString()} ft may not match hemispheric VFR (${eastbound ? "eastbound odd+500" : "westbound even+500"}). Consider ${suggested.toLocaleString()} ft.`
      );
    } else {
      pushPass(
        "hemi",
        "14 CFR 91.159",
        "VFR cruising altitude",
        `Cruise ${cruiseAltitudeFt.toLocaleString()} ft matches day VFR hemispheric rule for this course.`
      );
    }
  }

  // ---- 6. Fuel and Reserves (14 CFR 91.151) ----
  const avgWindSpeedKt = (depWx.windSpeedKt + arrWx.windSpeedKt) / 2;
  const avgWindDirDeg = depWx.windDirDeg;
  const { headwindKt, crosswindKt } = computeWindComponents(
    avgWindSpeedKt,
    avgWindDirDeg,
    courseDeg
  );

  const groundSpeedKt = Math.max(
    30,
    profileAvgGs ?? aircraft.cruiseTasKt - headwindKt
  );
  const flightTimeHours = (profileTimeMin ? profileTimeMin / 60 : distNm / groundSpeedKt);
  const estimatedTimeEnrouteMin = Math.round(flightTimeHours * 60);
  const fuelRequiredGal = flightTimeHours * aircraft.fuelBurnGph;
  const dayVfrReserveGal = 0.5 * aircraft.fuelBurnGph;
  const totalFuelNeededGal = fuelRequiredGal + dayVfrReserveGal;
  const reserveFuelRemainingGal = wb.fuelGallons - fuelRequiredGal;

  if (wb.fuelGallons < totalFuelNeededGal) {
    pushFail(
      "fuel",
      "14 CFR 91.151",
      "Day VFR fuel reserve",
      `Fuel exhaustion risk: ${wb.fuelGallons.toFixed(1)} gal on board insufficient for ${fuelRequiredGal.toFixed(1)} gal enroute plus ${dayVfrReserveGal.toFixed(1)} gal VFR reserve (${totalFuelNeededGal.toFixed(1)} gal total required)`
    );
  } else if (reserveFuelRemainingGal < dayVfrReserveGal * 1.5) {
    pushCaution(
      "fuel",
      "14 CFR 91.151",
      "Day VFR fuel reserve",
      `Reserve fuel tight: ${reserveFuelRemainingGal.toFixed(1)} gal remaining after flight (minimum ${dayVfrReserveGal.toFixed(1)} gal / 30 min required).`
    );
  } else {
    pushPass(
      "fuel",
      "14 CFR 91.151",
      "Day VFR fuel reserve",
      `${wb.fuelGallons.toFixed(1)} gal on board covers ${fuelRequiredGal.toFixed(1)} gal enroute + ${dayVfrReserveGal.toFixed(1)} gal (30 min) day VFR reserve.`
    );
  }

  // ---- 7. Crosswind / runway recommendation ----
  const arrXw = arrRunway?.crosswindKt ?? crosswindKt;
  if (arrRunway && !arrRunway.legal) {
    pushFail(
      "xwind",
      "POH — Max demonstrated crosswind",
      "Arrival crosswind",
      `Arrival runway ${arrRunway.designation}: crosswind ${arrRunway.crosswindKt} kt exceeds max demonstrated ${aircraft.maxCrosswindKt} kt`
    );
  } else if (arrXw > aircraft.maxCrosswindKt) {
    pushFail(
      "xwind",
      "POH — Max demonstrated crosswind",
      "Arrival crosswind",
      `Crosswind component ${arrXw.toFixed(1)} kt exceeds aircraft maximum demonstrated crosswind of ${aircraft.maxCrosswindKt} kt`
    );
  } else if (arrXw > aircraft.maxCrosswindKt * 0.75) {
    pushCaution(
      "xwind",
      "POH — Max demonstrated crosswind",
      "Arrival crosswind",
      `Arrival crosswind ${arrXw.toFixed(1)} kt approaching max demonstrated ${aircraft.maxCrosswindKt} kt.`
    );
  } else {
    pushPass(
      "xwind",
      "POH — Max demonstrated crosswind",
      "Arrival crosswind",
      `Arrival crosswind ${arrXw.toFixed(1)} kt within demonstrated ${aircraft.maxCrosswindKt} kt.`
    );
  }
  if (depRunway) {
    briefingHighlights.push(`Dep Rwy ${depRunway.designation}: ${depRunway.reason}`);
  }
  if (arrRunway) {
    briefingHighlights.push(`Arr Rwy ${arrRunway.designation}: ${arrRunway.reason}`);
  }

  // ---- 8. TFR Conflict Check ----
  let tfrHit = false;
  for (const tfr of tfrs) {
    const clips = greatCircleSegmentClipsTfr(terrainProfile, tfr, cruiseAltitudeFt);
    if (clips) {
      tfrHit = true;
      pushFail(
        "tfr",
        "14 CFR 91.141",
        "Temporary flight restriction",
        `TFR conflict: flight path intersects "${tfr.name}" (${tfr.notamRef}) - ${tfr.radiusNm} NM radius centered at ${tfr.centerLat.toFixed(4)}, ${tfr.centerLon.toFixed(4)}, surface to ${tfr.ceilingMsl.toLocaleString()} ft MSL`
      );
    }
  }
  if (!tfrHit) {
    pushPass(
      "tfr",
      "14 CFR 91.141",
      "Temporary flight restriction",
      "No active TFR cylinder intersects the planned corridor at cruise altitude."
    );
  }

  // ---- 9. Runway Length Check at Density Altitude ----
  const destDA = computeDensityAlt(
    destination.elevationFt,
    arrWx.altimeterInHg,
    arrWx.tempC
  );
  const landingRollFt = computeLandingDistanceFt(aircraft, destDA);
  const availableRunwayFt = arrRunway?.lengthFt || destRunwayData.primaryRunwayLength;
  const runwayUsageRatio = landingRollFt / availableRunwayFt;

  if (runwayUsageRatio > 0.8) {
    pushFail(
      "runway",
      "POH — Landing distance",
      "Runway length",
      `Runway length violation: estimated landing roll ${landingRollFt.toLocaleString()} ft exceeds 80% of available ${availableRunwayFt.toLocaleString()} ft on Rwy ${arrRunway?.designation || "primary"} at DA ${destDA.toLocaleString()} ft`
    );
  } else if (runwayUsageRatio > 0.6) {
    pushCaution(
      "runway",
      "POH — Landing distance",
      "Runway length",
      `Runway margin tight: landing roll ${landingRollFt.toLocaleString()} ft on ${availableRunwayFt.toLocaleString()} ft (${Math.round(runwayUsageRatio * 100)}% used).`
    );
  } else {
    pushPass(
      "runway",
      "POH — Landing distance",
      "Runway length",
      `Landing roll ~${landingRollFt.toLocaleString()} ft on ${availableRunwayFt.toLocaleString()} ft available (${Math.round(runwayUsageRatio * 100)}% used).`
    );
  }

  // ---- 10. PIREPs / AIRMETs / SIGMETs ----
  const severePireps = pireps.filter((p) => p.severity === "severe");
  const cautionPireps = pireps.filter((p) => p.severity === "caution");
  for (const p of severePireps.slice(0, 3)) {
    pushFail("pirep", "PIREP", "Severe pilot report", `Severe PIREP near corridor: ${p.summary}`);
  }
  for (const p of cautionPireps.slice(0, 3)) {
    pushCaution("pirep", "PIREP", "Pilot report", `PIREP: ${p.summary} (${p.ageHours}h ago)`);
  }

  const sigmets = advisories.filter((a) => a.product === "SIGMET" && a.intersectsRoute);
  for (const s of sigmets.slice(0, 3)) {
    // `raw` already carries issued / valid / expires / altitude from AWC fields
    const body = (s.raw || s.summary).trim();
    pushFail(
      "sigmet",
      "SIGMET",
      "Significant weather",
      `SIGMET ${s.hazard} clips the planned corridor.\n${body}`
    );
  }

  const airmets = advisories.filter(
    (a) =>
      a.product === "G-AIRMET" &&
      a.intersectsRoute &&
      /IFR|ICE|TURB|MT_OBSC|MTN|LLWS|SFC_WND/i.test(a.hazard)
  );
  for (const a of airmets.slice(0, 4)) {
    const body = (a.raw || a.summary).trim();
    if (/IFR/i.test(a.hazard)) {
      // Polygon-clipped IFR AIRMET = widespread IMC on the path → hard stop for basic VFR
      pushFail(
        "airmet",
        "G-AIRMET SIERRA",
        "AIRMET IFR on corridor",
        `G-AIRMET IFR area clips your route (ceilings/visibility below basic VFR).\n${body}`
      );
    } else if (/ICE/i.test(a.hazard)) {
      pushFail(
        "airmet",
        "G-AIRMET ZULU",
        "AIRMET icing on corridor",
        `G-AIRMET icing clips your route.\n${body}`
      );
    } else {
      pushCaution(
        "airmet",
        "G-AIRMET",
        `AIRMET ${a.hazard}`,
        `G-AIRMET ${a.hazard} clips your route.\n${body}`
      );
    }
  }

  const cwas = advisories.filter((a) => a.product === "CWA" && a.intersectsRoute);
  for (const c of cwas.slice(0, 2)) {
    pushCaution(
      "cwa",
      "CWA",
      "Center weather advisory",
      `${c.summary}${c.raw && c.raw !== c.summary ? `\n${c.raw}` : ""}`
    );
  }

  briefingHighlights.push(
    `Wx sources: METAR + TAF (${depWx.source}/${arrWx.source}) · ${pireps.length} PIREPs · ${advisories.filter((a) => a.product === "G-AIRMET").length} G-AIRMETs · ${sigmets.length} SIGMETs`
  );
  briefingHighlights.push(
    `Dep ${depCat} · Arr ${arrCat} · Ceiling ${arrCeil == null && depCeil == null ? "none (FEW/SCT ≠ ceiling)" : `buf ${cloudBufferFt === 99999 ? "CLR" : `${Math.round(cloudBufferFt)} ft`}`}`
  );

  // ---- Verdict ----
  let verdict: VfrCorridorDecision["verdict"];
  let summary: string;

  if (blockers.length > 0) {
    verdict = "NO_GO";
    summary = `NO-GO: ${blockers.length} hard stop${blockers.length > 1 ? "s" : ""} under private-pilot day VFR rules (91.155/91.151/91.119 and performance). Do not depart VFR as planned.`;
  } else if (cautions.length >= 2) {
    verdict = "MARGINAL";
    summary = `MARGINAL: ${cautions.length} caution items. Legal VFR may exist — PIC judgment required. FEW/SCT alone are not treated as a ceiling.`;
  } else {
    verdict = "GO";
    summary =
      cautions.length === 1
        ? `GO with one caution: ${cautions[0]}`
        : "GO: Day VFR checks (ceiling=BKN/OVC only, 3 SM, terrain, fuel, runway) support the plan. You remain PIC.";
  }

  // Fail → caution → pass so NO-GO drivers surface first in every UI list.
  const rank = { fail: 0, caution: 1, pass: 2 } as const;
  ruleChecks.sort((a, b) => rank[a.result] - rank[b.result]);

  return {
    verdict,
    summary,
    blockers,
    cautions,
    regulatoryCitations: [...new Set(citations)],
    ruleChecks,
    minTerrainClearanceFt,
    cloudBufferFt: cloudBufferFt === 99999 ? 99999 : Math.round(cloudBufferFt),
    calculatedClimbRateFpm,
    headwindComponentKt: headwindKt,
    crosswindComponentKt: arrXw,
    groundSpeedKt: Math.round(groundSpeedKt),
    estimatedTimeEnrouteMin,
    briefingHighlights,
    hazardCounts: {
      pireps: pireps.length,
      airmets: advisories.filter((a) => a.product === "G-AIRMET").length,
      sigmets: sigmets.length,
      tfrs: advisories.filter((a) => a.product === "TFR" && a.intersectsRoute).length,
      severePireps: severePireps.length,
    },
    recommendedDepRunway: depRunway?.designation,
    recommendedArrRunway: arrRunway?.designation,
    fuelRequiredGal: Math.round(fuelRequiredGal * 10) / 10,
    reserveFuelRemainingGal: Math.round(reserveFuelRemainingGal * 10) / 10,
    totalRampWeightLbs: Math.round(totalRampWeightLbs),
    takeoffWeightLbs: Math.round(loading.takeoffWeightLbs),
    centerOfGravityIn: Math.round(loading.centerOfGravityIn * 10) / 10,
    cgStatus,
    weightStatus,
  };
}

// ---- Auto-optimize cruise altitude ----

/** VFR cruise (14 CFR 91.159): eastbound odd+500, westbound even+500. */
export function nextVfrCruiseAltitude(minFt: number, courseDeg: number): number {
  const eastbound = ((courseDeg % 360) + 360) % 360 < 180;
  let alt = Math.max(3500, Math.ceil(minFt / 500) * 500);
  for (let i = 0; i < 40; i++) {
    const thousands = Math.floor(alt / 1000);
    const isOdd = thousands % 2 === 1;
    const isPlus500 = alt % 1000 === 500;
    if (isPlus500 && ((eastbound && isOdd) || (!eastbound && !isOdd))) return alt;
    alt += 500;
  }
  return alt;
}

export function autoOptimizeCruiseAltitude(
  terrainProfile: TerrainPoint[],
  originWeather: StationWeather,
  destWeather: StationWeather,
  destination: { elevationFt: number },
  origin: { elevationFt: number },
  aircraft: AircraftProfile,
  courseDeg = 90,
  distanceNm = 30,
  /** Mid-route METAR/TAF stations — ceilings cap cruise like dep/arr */
  enrouteStations: Array<{ elevationFt: number; weather: StationWeather }> = []
): number {
  const maxObstacleFt =
    terrainProfile.length > 0
      ? Math.max(...terrainProfile.map((p) => p.elevationFt))
      : 0;
  // Legal floor is +1,000 ft (91.119). Practical XC floor is higher.
  const legalTerrain = maxObstacleFt + 1000;
  const practicalTerrain = maxObstacleFt + 1500;
  const routeFloor = distanceNm < 25 ? 3500 : distanceNm < 80 ? 4500 : 5500;
  const minPractical = Math.max(legalTerrain, practicalTerrain, routeFloor);

  // Snap to hemispheric VFR altitude. If clouds make that illegal, keep the
  // terrain-safe VFR altitude and let the rules engine flag the cloud conflict.
  let optimal = nextVfrCruiseAltitude(minPractical, courseDeg);

  // Cap only on true ceilings (BKN/OVC). FEW/SCT must not pull cruise down.
  // Use every sampled station along the corridor — not just dep/arr.
  const ceilingMslValues: number[] = [];
  const originCeil = officialCeilingAgl(originWeather);
  const destCeil = officialCeilingAgl(destWeather);
  if (originCeil !== null) {
    ceilingMslValues.push(originCeil + origin.elevationFt);
  }
  if (destCeil !== null) {
    ceilingMslValues.push(destCeil + destination.elevationFt);
  }
  for (const stop of enrouteStations) {
    const ceil = officialCeilingAgl(stop.weather);
    if (ceil !== null) {
      ceilingMslValues.push(ceil + stop.elevationFt);
    }
  }
  if (ceilingMslValues.length > 0) {
    const cloudCap = Math.min(...ceilingMslValues) - 500;
    if (cloudCap >= minPractical) {
      optimal = nextVfrCruiseAltitude(minPractical, courseDeg);
      while (optimal > cloudCap && optimal - 1000 >= minPractical) {
        optimal -= 1000;
      }
      if (optimal > cloudCap) {
        optimal = nextVfrCruiseAltitude(minPractical, courseDeg);
      }
    }
  }

  return Math.min(aircraft.serviceCeilingFt, Math.min(13500, optimal));
}
