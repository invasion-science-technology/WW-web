import type { DailyTemps } from "./meteo";

export type GddPoint = { date: string; gddDay: number; cumulative: number };

/** Simple mean temperature model: daily GDD = max(0, ((Tmax+Tmin)/2) − base), °C. */
export function cumulativeGddSeries(
  temps: DailyTemps,
  baseTempC: number,
): GddPoint[] {
  const out: GddPoint[] = [];
  let cumulative = 0;
  const n = temps.dates.length;
  for (let i = 0; i < n; i++) {
    const hi = temps.tmax[i];
    const lo = temps.tmin[i];
    if (hi == null || lo == null) continue;
    const mean = (hi + lo) / 2;
    const gddDay = Math.max(0, mean - baseTempC);
    cumulative += gddDay;
    out.push({ date: temps.dates[i], gddDay, cumulative });
  }
  return out;
}

export function formatISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
