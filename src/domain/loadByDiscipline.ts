// Forme de fond décomposée par discipline : le même modèle exponentiel (42 jours) appliqué à la charge de
// chaque discipline. Le modèle est linéaire : la somme des disciplines redonne exactement la forme de fond
// totale (l'amorçage de chaque série suit la même règle). La part d'une interruption à charge forfaitaire
// est rangée dans « forfait ».
import { addDays } from './dates';
import { FITNESS_TAU, SEED_WINDOW, liveRecords, sessionDay, type LoadSeries, type SessionLoad } from './load';
import type { AppData } from './types';

export const LOAD_KEYS = ['SWIM', 'BIKE', 'RUN', 'STRENGTH', 'OTHER', 'FORFAIT'] as const;
export type LoadKey = (typeof LOAD_KEYS)[number];
export interface FitnessSlice { day: string; total: number; byKey: Record<LoadKey, number> }

export function fitnessByDiscipline(data: AppData, loads: Map<string, SessionLoad>, series: LoadSeries, sampleEveryDays = 7): FitnessSlice[] {
  if (!series.days.length) return [];
  const first = series.days[0].day;
  const perDay = new Map<string, Record<LoadKey, number>>();
  const blank = () => Object.fromEntries(LOAD_KEYS.map((k) => [k, 0])) as Record<LoadKey, number>;
  for (const s of liveRecords(data.actual)) {
    const l = loads.get(s.id);
    if (!l || l.load === null) continue;
    const row = perDay.get(sessionDay(s)) ?? blank();
    row[s.discipline] += l.load;
    perDay.set(sessionDay(s), row);
  }
  const days = series.days;
  for (const d of days) if (d.interruptionFill) { const row = perDay.get(d.day) ?? blank(); row.FORFAIT += d.load; perDay.set(d.day, row); }
  const seed = blank();
  for (const d of days.slice(0, SEED_WINDOW)) { const r = perDay.get(d.day); if (r) for (const k of LOAD_KEYS) seed[k] += r[k] / Math.min(SEED_WINDOW, days.length); }
  const kf = Math.exp(-1 / FITNESS_TAU);
  const fit = { ...seed };
  const out: FitnessSlice[] = [];
  const last = days[days.length - 1].day;
  let i = 0;
  for (let d = first; d <= last; d = addDays(d, 1), i++) {
    const r = perDay.get(d);
    for (const k of LOAD_KEYS) fit[k] = fit[k] * kf + (r?.[k] ?? 0) * (1 - kf);
    if (d === last || (last > d && (days.length - 1 - i) % sampleEveryDays === 0)) out.push({ day: d, total: LOAD_KEYS.reduce((t, k) => t + fit[k], 0), byKey: { ...fit } });
  }
  return out;
}
