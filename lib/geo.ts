import * as THREE from "three";

const EARTH_RADIUS_M = 6378137;

export function latLonAltToVector3(
  lat: number,
  lon: number,
  altMeters = 0,
  target = new THREE.Vector3()
): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lon);
  const r = EARTH_RADIUS_M + altMeters;
  const cosPhi = Math.cos(phi);
  return target.set(
    r * cosPhi * Math.cos(theta),
    r * Math.sin(phi),
    -r * cosPhi * Math.sin(theta)
  );
}

export function feetToMeters(ft: number): number {
  return ft * 0.3048;
}

export function midPoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { lat: number; lon: number } {
  return { lat: (lat1 + lat2) / 2, lon: (lon1 + lon2) / 2 };
}

/** How far ahead weather forecasts are trustworthy for VFR planning. */
export function weatherHorizonNote(departureLocalIso: string): string | null {
  const dep = new Date(departureLocalIso);
  if (Number.isNaN(dep.getTime())) return null;
  const hoursAhead = (dep.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursAhead <= 24) return null;
  if (hoursAhead <= 72) {
    return "Departure is more than 24 hours out. METAR is current observation only. Use TAF trends and re-brief closer to launch.";
  }
  return "Departure is too far out for reliable terminal forecasts. We can preview the corridor and terrain now, but live Go/No-Go weather should be re-run within 24 hours of departure.";
}
