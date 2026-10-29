// Point hebdomadaire : capacités (VO₂max, seuil de lactate, prédictions de course) et ressenti (sommeil, récupération).
// Une fiche par semaine (id = lundi). Les valeurs viennent de la montre (que l'utilisateur recopie) ; Apogée ne les recalcule pas.
import { addDays, mondayOf } from './dates';
import { liveRecords } from './load';
import type { AppData, Checkin } from './types';


export const emptyCheckin = (week: string): Omit<Checkin, 'updatedAt'> => ({ id: week, week, vo2max: null, lthrBpm: null, lthPaceSecKm: null, hrvMs: null, hrvStatus: null, sleepFelt: null, recoveryFelt: null, pred5kSec: null, pred10kSec: null, predHalfSec: null, predMarathonSec: null, note: null });

export function checkinsSorted(data: AppData): Checkin[] {
  return liveRecords(data.checkins).sort((a, b) => ((a.day || a.week) < (b.day || b.week) ? -1 : 1));
}

export function hasContent(c: Omit<Checkin, 'id' | 'updatedAt' | 'week' | 'deleted'>): boolean {
  return Object.values(c).some((v) => v !== null && v !== undefined && v !== '');
}

/** La fiche de la semaine de `day`, ou une fiche vide pré-remplie par les dernières valeurs connues (Health Connect puis fiche précédente). */
export function currentCheckin(data: AppData, day: string): { week: string; saved: Checkin | null; draft: Omit<Checkin, 'updatedAt'> } {
  const week = mondayOf(day);
  const cur = data.checkins[week];
  const saved = cur && !cur.deleted ? cur : null;
  if (saved) return { week, saved, draft: saved };
  const draft = emptyCheckin(week);
  // dernières valeurs de la montre (Health Connect) sur les 7 derniers jours
  const vit = liveRecords(data.vitals).filter((v) => v.day > addDays(day, -8) && v.day <= day).sort((a, b) => (a.day < b.day ? 1 : -1));
  draft.vo2max = vit.find((v) => v.vo2max !== null)?.vo2max ?? null;
  return { week, saved: null, draft };
}

/** Faut-il rappeler le point de la semaine ? Oui s'il n'existe pas encore pour la semaine en cours. */
export function checkinMissing(data: AppData, day: string): boolean {
  const c = data.checkins[mondayOf(day)];
  return !c || !!c.deleted;
}

/** Dimanche de la semaine de `day` (le jour même s'il est dimanche) : jour proposé par défaut pour recopier la montre. */
export const sundayOf = (day: string): string => addDays(mondayOf(day), 6);

/** État du rendez-vous hebdomadaire : fait pour la semaine en cours ou non, et date du prochain point. */
export function checkinStatus(data: AppData, today: string): { done: boolean; doneDay: string | null; next: string } {
  const week = mondayOf(today);
  const c = data.checkins[week];
  const done = !!c && !c.deleted;
  return { done, doneDay: done ? (c.day || null) : null, next: done ? addDays(sundayOf(today), 7) : sundayOf(today) };
}

export type CheckinMetric = 'vo2max' | 'lthrBpm' | 'lthPaceSecKm' | 'sleepFelt' | 'recoveryFelt' | 'pred5kSec' | 'pred10kSec' | 'predHalfSec' | 'predMarathonSec';
export function metricSeries(data: AppData, k: CheckinMetric): { week: string; day: string; v: number }[] {
  return checkinsSorted(data).filter((c) => c[k] !== null).map((c) => ({ week: c.week, day: c.day || c.week, v: c[k] as number }));
}
