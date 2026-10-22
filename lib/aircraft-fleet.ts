import type { AircraftProfile } from "./aviation-types";

export const DEFAULT_AIRCRAFT: AircraftProfile[] = [
  {
    id: "c152",
    tailNumber: "N67890",
    modelName: "Cessna 152",
    emptyWeightLbs: 1199.3,
    maxGrossWeightLbs: 1675,
    usefulLoadLbs: 475.7,
    usableFuelGal: 24.5,
    fuelBurnGph: 6.1,
    cruiseTasKt: 105,
    serviceCeilingFt: 14700,
    seaLevelClimbFpm: 715,
    maxCrosswindKt: 12,
    isCustom: false,
  },
  {
    id: "c172s",
    tailNumber: "N6146Q",
    modelName: "Cessna 172S Skyhawk",
    emptyWeightLbs: 1663,
    maxGrossWeightLbs: 2550,
    usefulLoadLbs: 887,
    usableFuelGal: 53.0,
    fuelBurnGph: 8.8,
    cruiseTasKt: 122,
    serviceCeilingFt: 14000,
    seaLevelClimbFpm: 730,
    maxCrosswindKt: 15,
    isCustom: false,
  },
  {
    id: "pa28-181",
    tailNumber: "N8823T",
    modelName: "Piper Archer II PA-28-181",
    emptyWeightLbs: 1582,
    maxGrossWeightLbs: 2550,
    usefulLoadLbs: 968,
    usableFuelGal: 48.0,
    fuelBurnGph: 9.5,
    cruiseTasKt: 125,
    serviceCeilingFt: 14100,
    seaLevelClimbFpm: 667,
    maxCrosswindKt: 17,
    isCustom: false,
  },
];

const STORAGE_KEY = "aerotwin_custom_aircraft";

export function loadCustomAircraft(): AircraftProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AircraftProfile[];
  } catch {
    return [];
  }
}

export function saveCustomAircraft(profiles: AircraftProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Storage quota exceeded or private mode
  }
}

export function addCustomAircraft(profile: Omit<AircraftProfile, "id" | "isCustom">): AircraftProfile {
  const newProfile: AircraftProfile = {
    ...profile,
    id: `custom_${Date.now()}`,
    isCustom: true,
  };
  const existing = loadCustomAircraft();
  saveCustomAircraft([...existing, newProfile]);
  return newProfile;
}

export function deleteCustomAircraft(id: string): void {
  const existing = loadCustomAircraft();
  saveCustomAircraft(existing.filter((p) => p.id !== id));
}

export function getAllAircraft(): AircraftProfile[] {
  return [...DEFAULT_AIRCRAFT, ...loadCustomAircraft()];
}
