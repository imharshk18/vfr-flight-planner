import type { StationWeather, CloudDeck } from './aviation-types';
import { fetchMetar } from './aviation-api';

type Period = { timeFrom: number; timeTo: number; changeIndicator?: string; wspd?: number; wdir?: number; visib?: number | string; clouds?: { cover: string; base: number }[] };
/** Select a prevailing TAF period valid at departure. Retain change-group caveats. */
export async function weatherAtDeparture(icao: string, elevationFt: number, departure: string): Promise<StationWeather> {
  const observed = await fetchMetar(icao, elevationFt);
  const at = new Date(departure).getTime() / 1000;
  if (!Number.isFinite(at) || at <= Date.now() / 1000 + 3600) return observed;
  try {
    const response = await fetch(`/api/aviation?kind=taf&ids=${encodeURIComponent(icao)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('No forecast');
    const data = await response.json();
    const taf = data[0];
    const applicable: Period[] = (taf?.fcsts || []).filter((p: Period) => p.timeFrom <= at && at < p.timeTo);
    const period = applicable.filter(p => !p.changeIndicator || p.changeIndicator === 'FM').at(-1);
    if (!period?.clouds) throw new Error('Outside forecast coverage');
    const cloudDecks: CloudDeck[] = period.clouds.filter(c => ['FEW', 'SCT', 'BKN', 'OVC'].includes(c.cover)).map(c => ({ coverage: c.cover as CloudDeck['coverage'], baseAglFt: c.base, baseMslFt: c.base + elevationFt }));
    const ceilings = cloudDecks.filter(c => c.coverage === 'BKN' || c.coverage === 'OVC');
    const ceiling = ceilings.length ? Math.min(...ceilings.map(c => c.baseAglFt)) : null;
    const visibility = parseFloat(String(period.visib ?? 10));
    return { ...observed, source: 'TAF', validTime: new Date(at * 1000).toISOString(), rawMetar: taf.rawTAF || 'TAF', cloudDecks, ceilingAglFt: ceiling, windSpeedKt: period.wspd ?? observed.windSpeedKt, windDirDeg: typeof period.wdir === 'number' ? period.wdir : observed.windDirDeg,
      flightCategory: (ceiling ?? 99999) < 500 || visibility < 1 ? 'LIFR' : (ceiling ?? 99999) < 1000 || visibility < 3 ? 'IFR' : (ceiling ?? 99999) < 3000 || visibility < 5 ? 'MVFR' : 'VFR',
      forecastNote: applicable.some(p => p.changeIndicator && p.changeIndicator !== 'FM') ? 'Temporary/probability changes also apply; inspect the raw TAF.' : undefined };
  } catch {
    return { ...observed, forecastNote: 'No applicable TAF. Showing observation, not a departure-time forecast.' };
  }
}
