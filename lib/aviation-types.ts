export type AirportLocation = {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
};

export type CloudDeck = {
  coverage: "SKC" | "FEW" | "SCT" | "BKN" | "OVC";
  baseAglFt: number;
  baseMslFt: number;
};

export type StationWeather = {
  source?: "METAR" | "TAF" | "demo" | "cached" | "unavailable";
  validTime?: string;
  forecastNote?: string;
  icao: string;
  rawMetar: string;
  flightCategory: "VFR" | "MVFR" | "IFR" | "LIFR";
  windSpeedKt: number;
  windDirDeg: number;
  windGustKt?: number;
  visibilitySm?: number;
  tempC: number;
  dewpointC: number;
  altimeterInHg: number;
  densityAltitudeFt: number;
  ceilingAglFt: number | null;
  cloudDecks: CloudDeck[];
};

export type TerrainPoint = {
  distanceNm: number;
  lat: number;
  lon: number;
  elevationFt: number;
};

export type AircraftProfile = {
  id: string;
  tailNumber: string;
  modelName: string;
  emptyWeightLbs: number;
  maxGrossWeightLbs: number;
  usefulLoadLbs: number;
  usableFuelGal: number;
  fuelBurnGph: number;
  cruiseTasKt: number;
  serviceCeilingFt: number;
  seaLevelClimbFpm: number;
  maxCrosswindKt: number;
  isCustom?: boolean;
};

export type WeightAndBalanceState = {
  pilotWeightLbs: number;
  passengerWeightLbs: number;
  baggageLbs: number;
  fuelGallons: number;
};

export type VfrCorridorDecision = {
  verdict: "GO" | "MARGINAL" | "NO_GO";
  summary: string;
  blockers: string[];
  cautions: string[];
  regulatoryCitations: string[];
  minTerrainClearanceFt: number;
  cloudBufferFt: number;
  calculatedClimbRateFpm: number;
  headwindComponentKt: number;
  crosswindComponentKt: number;
  groundSpeedKt: number;
  estimatedTimeEnrouteMin: number;
  fuelRequiredGal: number;
  reserveFuelRemainingGal: number;
  totalRampWeightLbs: number;
  weightStatus: "LEGAL" | "OVERWEIGHT";
  /** Briefing highlights for ForeFlight-style summary */
  briefingHighlights?: string[];
  hazardCounts?: {
    pireps: number;
    airmets: number;
    sigmets: number;
    tfrs: number;
    severePireps: number;
  };
  recommendedDepRunway?: string;
  recommendedArrRunway?: string;
};

export type TfrZone = {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusNm: number;
  floorMsl: number;
  ceilingMsl: number;
  isActive: boolean;
  notamRef: string;
};

export type RunwayInfo = {
  designation: string;
  lengthFt: number;
  widthFt: number;
  surfaceType: string;
};

export type AirportRunwayData = {
  icao: string;
  runways: RunwayInfo[];
  primaryRunwayLength: number;
};

export type FlightCorridor = {
  origin: AirportLocation;
  destination: AirportLocation;
  cruiseAltitudeFt: number;
  aircraft: AircraftProfile;
  wb: WeightAndBalanceState;
  weather: { origin: StationWeather; destination: StationWeather };
  terrainProfile: TerrainPoint[];
  decision: VfrCorridorDecision;
  tfrs: TfrZone[];
  runwayData: { origin: AirportRunwayData; destination: AirportRunwayData };
};
