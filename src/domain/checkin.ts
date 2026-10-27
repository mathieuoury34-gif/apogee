// Point hebdomadaire : capacités (VO₂max, seuil de lactate, prédictions de course) et ressenti (sommeil, récupération, HRV).
// Une fiche par semaine (id = lundi). Les valeurs viennent de la montre (que l'utilisateur recopie) ; Apogée ne les recalcule pas.
import { addDays, mondayOf } from './dates';
import { liveRecords } from './load';
import type { AppData, Checkin, HrvStatus } from './types';

export const HRV_LABEL: Record<HrvStatus, string> = { poor: 'Médiocre', low: 'Faible', unbalanced: 'Déséquilibré', balanced: 'Équilibré' };

export const emptyCheckin = (week: string): Omit<Checkin, 'updatedAt'> => ({ id: week, week, vo2max: null, lthrBpm: null, lthPaceSecKm: null, hrvMs: null, hrvStatus: null, sleepFelt: null, recoveryFelt: null, pred5kSec: null, pred10kSec: null, predHalfSec: null, predMarathonSec: null, note: null });

export function checkinsSorted(data: AppData): Checkin[] {
  return liveRecords(data.checkins).sort((a, b) => (a.week < b.week ? -1 : 1));
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
  const hrv = vit.filter((v) => v.hrvMs !== null).map((v) => v.hrvMs!);
  draft.hrvMs = hrv.length ? Math.round(hrv.reduce((a, b) => a + b, 0) / hrv.length) : null;
  return { week, saved: null, draft };
}

/** Faut-il rappeler le point de la semaine ? Oui s'il n'existe pas encore pour la semaine en cours. */
export function checkinMissing(data: AppData, day: string): boolean {
  const c = data.checkins[mondayOf(day)];
  return !c || !!c.deleted;
}

export type CheckinMetric = 'vo2max' | 'lthrBpm' | 'lthPaceSecKm' | 'hrvMs' | 'sleepFelt' | 'recoveryFelt' | 'pred5kSec' | 'pred10kSec' | 'predHalfSec' | 'predMarathonSec';
export function metricSeries(data: AppData, k: CheckinMetric): { week: string; v: number }[] {
  return checkinsSorted(data).filter((c) => c[k] !== null).map((c) => ({ week: c.week, v: c[k] as number }));
}
