// Temps passé par zone de fréquence cardiaque, par séance et par semaine, et répartition « 80/20 ».
// Zones en % de la FC max retenue (la même que pour la charge) : Z1 < 60 %, Z2 60–70 %, Z3 70–80 %,
// Z4 80–90 %, Z5 ≥ 90 %. Répartition en trois classes : facile (< 80 % : Z1–Z3), soutenue (80–90 % : Z4),
// intense (≥ 90 % : Z5). Ce sont des repères génériques, pas tes seuils personnels : sans test de lactate
// ou de seuil, la frontière exacte entre « facile » et « soutenue » varie d'un sportif à l'autre.
import { addDays, mondayOf } from './dates';
import { analyzeHr, weightSamples, type Series } from './hr';
import { liveRecords, sessionDay } from './load';
import type { ActualDiscipline, AppData } from './types';

export const HR_ZONE_EDGES = [0.6, 0.7, 0.8, 0.9] as const;
export const ZONE_COUNT = 5;
/** Disciplines d'endurance dont la FC a un sens pour la répartition (le renforcement en est exclu). */
export const ZONE_DISCIPLINES: ActualDiscipline[] = ['RUN', 'BIKE', 'SWIM'];
export type ZoneSeconds = [number, number, number, number, number];
export const emptyZones = (): ZoneSeconds => [0, 0, 0, 0, 0];

export function zoneIndex(bpm: number, hrMax: number): number {
  const r = bpm / hrMax;
  let i = 0;
  while (i < HR_ZONE_EDGES.length && r >= HR_ZONE_EDGES[i]) i++;
  return i;
}

/** Secondes par zone ; les trous du capteur sont plafonnés comme pour le TRIMP. */
export function zoneTimes(series: Series, hrMax: number): ZoneSeconds {
  const out = emptyZones();
  if (!(hrMax > 0)) return out;
  for (const s of weightSamples(series)) out[zoneIndex(s.bpm, hrMax)] += s.dtSec;
  return out;
}

export interface Polar { easy: number; hard: number; intense: number; total: number }
export function polarSplit(z: ZoneSeconds): Polar {
  const easy = z[0] + z[1] + z[2];
  return { easy, hard: z[3], intense: z[4], total: easy + z[3] + z[4] };
}

export interface ZoneWeek { start: string; zones: ZoneSeconds; sessions: number }
export interface ZoneReport { weeks: ZoneWeek[]; total: ZoneSeconds; sessions: number; withoutHr: number }

/** Temps par zone sur les `n` dernières semaines (semaine en cours comprise). */
export function weeklyZones(data: AppData, hrMax: number | null, todayDay: string, n: number, withOther = false, fromDay?: string): ZoneReport {
  const last = mondayOf(todayDay);
  const weeks: ZoneWeek[] = Array.from({ length: n }, (_, i) => ({ start: addDays(last, -7 * (n - 1 - i)), zones: emptyZones(), sessions: 0 }));
  const idx = new Map(weeks.map((w, i) => [w.start, i]));
  const total = emptyZones();
  let sessions = 0, withoutHr = 0;
  if (!hrMax) return { weeks, total, sessions, withoutHr };
  for (const s of liveRecords(data.actual)) {
    if (!(ZONE_DISCIPLINES.includes(s.discipline) || (withOther && s.discipline === 'OTHER'))) continue;
    const day = sessionDay(s);
    if (day > todayDay || (fromDay && day < fromDay)) continue;
    const i = idx.get(mondayOf(day));
    if (i === undefined) continue;
    const ser = data.series[s.id];
    const hr = ser && !ser.deleted ? analyzeHr(ser.hr).clean : [];
    if (hr.length < 10) { withoutHr++; continue; }
    const z = zoneTimes(hr, hrMax);
    weeks[i].sessions++; sessions++;
    for (let k = 0; k < ZONE_COUNT; k++) { weeks[i].zones[k] += z[k]; total[k] += z[k]; }
  }
  return { weeks, total, sessions, withoutHr };
}
