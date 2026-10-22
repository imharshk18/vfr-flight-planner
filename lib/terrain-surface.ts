import type { TerrainPoint } from './aviation-types';

export type SurfaceTile = { x: number; y: number; heights: Float32Array; image: HTMLImageElement | null };
export type TerrainSurface = { zoom: number; centerX: number; centerY: number; kmPerTile: number; tiles: SurfaceTile[]; widthKm: number; depthKm: number; elevationComplete: boolean; imageryComplete: boolean };
export function tilePoint(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom, r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return { x: (lon + 180) / 360 * n, y: (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n };
}
export function worldPoint(surface: TerrainSurface, lat: number, lon: number): [number, number] {
  const p = tilePoint(lat, lon, surface.zoom);
  return [(p.x - surface.centerX) * surface.kmPerTile, (p.y - surface.centerY) * surface.kmPerTile];
}
function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('Tile timed out')); }, 14000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Tile unavailable')); };
    img.src = url;
  });
}
export async function loadTerrainSurface(points: { lat: number; lon: number }[], onProgress?: (text: string) => void): Promise<TerrainSurface> {
  // Prefer sharper tiles on short regional hops so the mesh reads less "map-like".
  let zoom = 14;
  let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (; zoom >= 3; zoom--) {
    const p = points.map(p => tilePoint(p.lat, p.lon, zoom));
    const xs = p.map(p => p.x), ys = p.map(p => p.y);
    const pad = Math.max(.45, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * .22);
    bounds = { minX: Math.floor(Math.min(...xs) - pad), maxX: Math.floor(Math.max(...xs) + pad), minY: Math.floor(Math.min(...ys) - pad), maxY: Math.floor(Math.max(...ys) + pad) };
    if ((bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) <= 96) break;
  }
  const kmPerTile = 40075.016686 * Math.cos(points[0].lat * Math.PI / 180) / 2 ** zoom;
  const surface: TerrainSurface = { zoom, centerX: (bounds.minX + bounds.maxX + 1) / 2, centerY: (bounds.minY + bounds.maxY + 1) / 2, kmPerTile, widthKm: (bounds.maxX - bounds.minX + 1) * kmPerTile, depthKm: (bounds.maxY - bounds.minY + 1) * kmPerTile, tiles: [], elevationComplete: true, imageryComplete: true };
  const jobs: { x: number; y: number }[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) jobs.push({ x, y });
  let done = 0;
  // Bound simultaneous downloads while loading each tile's imagery and DEM together.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (jobs.length) {
      const { x, y } = jobs.shift()!;
      const [dem, photo] = await Promise.allSettled([
        image(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`),
        image(`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`),
      ]);
      const heights = new Float32Array(256 * 256);
      if (dem.status === 'fulfilled') {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(dem.value, 0, 0);
        const rgba = ctx.getImageData(0, 0, 256, 256).data;
        for (let i = 0; i < heights.length; i++) {
          // Mapzen Terrarium: meters = R*256 + G + B/256 - 32768
          let m = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
          // Flatten sea / bay noise — micro DEM jitter at ~0 m z-fights into "TV static".
          if (m < 2.5) m = 0;
          heights[i] = m;
        }
      } else surface.elevationComplete = false;
      if (photo.status === 'rejected') surface.imageryComplete = false;
      surface.tiles.push({ x, y, heights, image: photo.status === 'fulfilled' ? photo.value : null });
      onProgress?.(`Building terrain · ${++done} tiles loaded`);
    }
  }));
  return surface;
}
export function elevationAt(surface: TerrainSurface, lat: number, lon: number) {
  const p = tilePoint(lat, lon, surface.zoom), x = Math.floor(p.x), y = Math.floor(p.y);
  const tile = surface.tiles.find(t => t.x === x && t.y === y);
  if (!tile) return 0;
  return tile.heights[Math.min(255, Math.floor((p.y - y) * 256)) * 256 + Math.min(255, Math.floor((p.x - x) * 256))] * 3.28084;
}
export function surfaceProfile(surface: TerrainSurface, points: { lat: number; lon: number }[], distance: (a: number, b: number, c: number, d: number) => number): TerrainPoint[] {
  let nm = 0;
  return points.map((p, i) => {
    if (i) nm += distance(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
    return { ...p, distanceNm: nm, elevationFt: Math.round(elevationAt(surface, p.lat, p.lon)) };
  });
}
