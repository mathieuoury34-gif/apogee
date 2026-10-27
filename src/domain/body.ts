// Poids (tendance) et sommeil (durée récente, régularité) : lectures dérivées, rien n'est enregistré.
import { addDays } from './dates';
import { mean, median } from './hr';
import { liveRecords } from './load';
import type { AppData } from './types';

// ------------------------------------------------------------------ poids
export interface WeightTrend {
  latest: { day: string; kg: number; source: 'health' | 'manual' } | null;
  /** Moyenne des pesées des 7 derniers jours (lisse les variations d'hydratation). */
  avg7: number | null;
  /** Moyenne des pesées des 7 jours qui précèdent le 28ᵉ jour avant aujourd'hui. */
  avg7Before: number | null;
  /** Évolution de la moyenne 7 j par rapport à il y a 4 semaines (kg). */
  change: number | null;
  /** Pesées des 90 derniers jours, dans l'ordre. */
  points: { day: string; kg: number }[];
}

export function weightTrend(data: AppData, todayDay: string): WeightTrend {
  const all = liveRecords(data.weight).sort((a, b) => (a.day < b.day ? -1 : 1));
  const latest = all.length ? { day: all[all.length - 1].day, kg: all[all.length - 1].kg, source: all[all.length - 1].source } : null;
  const win = (from: number, to: number) => mean(all.filter((w) => w.day > addDays(todayDay, -to) && w.day <= addDays(todayDay, -from)).map((w) => w.kg));
  const avg7 = win(0, 7), avg7Before = win(28, 35);
  return {
    latest, avg7, avg7Before,
    change: avg7 !== null && avg7Before !== null ? avg7 - avg7Before : null,
    points: all.filter((w) => w.day > addDays(todayDay, -90)).map((w) => ({ day: w.day, kg: w.kg })),
  };
}

// ------------------------------------------------------------------ sommeil
export interface SleepStats {
  nights7: number;
  avg7: number | null;
  /** Durée moyenne des 21 nuits précédentes. */
  avgBefore: number | null;
  /** Écart-type de l'heure du coucher sur les 14 dernières nuits (minutes). */
  bedtimeSd: number | null;
  /** Heure du coucher médiane (minutes depuis minuit, peut dépasser 1 440 après minuit). */
  bedtimeMedian: number | null;
  nights14: number;
  /** Parmi les 14 dernières nuits, celles dont la durée est le temps réellement endormi (étapes connues). */
  staged14: number;
}

/** Minutes depuis midi de la veille ramenées à une échelle continue : 22 h = 1 320, 1 h = 1 500 (évite la coupure à minuit). */
function bedtimeMinutes(startAt: string, zoneOffsetMinutes: number | null): number {
  const d = new Date(Date.parse(startAt) + (zoneOffsetMinutes ?? -new Date(startAt).getTimezoneOffset()) * 60000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m < 12 * 60 ? m + 24 * 60 : m;
}

export function sleepStats(data: AppData, todayDay: string): SleepStats {
  const nights = liveRecords(data.sleep);
  const inRange = (from: number, to: number) => nights.filter((n) => n.nightDate > addDays(todayDay, -to) && n.nightDate <= addDays(todayDay, -from));
  const n7 = inRange(0, 7), nBefore = inRange(7, 28), n14 = inRange(0, 14);
  const bt = n14.map((n) => bedtimeMinutes(n.startAt, n.zoneOffsetMinutes));
  let sd: number | null = null;
  if (bt.length >= 5) { const m = mean(bt)!; sd = Math.sqrt(bt.reduce((t, v) => t + (v - m) ** 2, 0) / (bt.length - 1)); }
  return {
    nights7: n7.length,
    avg7: n7.length >= 3 ? mean(n7.map((n) => n.durationSec)) : null,
    avgBefore: nBefore.length >= 7 ? mean(nBefore.map((n) => n.durationSec)) : null,
    bedtimeSd: sd,
    bedtimeMedian: bt.length >= 5 ? median(bt) : null,
    nights14: n14.length,
    staged14: n14.filter((n) => n.fromStages).length,
  };
}

export interface SleepRow { nightDate: string; durationSec: number; startAt: string; endAt: string; zoneOffsetMinutes: number | null; fromStages: boolean }
/** Les `n` dernières nuits (jour de réveil, du plus récent au plus ancien), pour les comparer ligne à ligne avec la montre. */
export function recentNights(data: AppData, todayDay: string, n = 7): SleepRow[] {
  return liveRecords(data.sleep)
    .filter((x) => x.nightDate <= todayDay)
    .sort((a, b) => (a.nightDate < b.nightDate ? 1 : -1))
    .slice(0, n)
    .map((x) => ({ nightDate: x.nightDate, durationSec: x.durationSec, startAt: x.startAt, endAt: x.endAt, zoneOffsetMinutes: x.zoneOffsetMinutes, fromStages: !!x.fromStages }));
}
