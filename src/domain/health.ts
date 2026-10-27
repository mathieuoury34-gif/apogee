// Transposition des enregistrements Health Connect (lus par le module natif de l'APK) en données Apogée.
// Repris de health/ingest.ts et exerciseTypes.ts, avec trois corrections :
//  - une séance déjà connue est MISE À JOUR si Garmin a déposé sa série cardio après coup (avant : jamais
//    relue, la séance restait sans charge mesurée) — sauf si tu l'as corrigée à la main ;
//  - plusieurs sommeils pour une même nuit (sieste) : on garde le plus long (avant : le premier lu) ;
//  - l'identifiant d'une séance ne change jamais, même après édition (avant : l'édition fabriquait un
//    nouvel identifiant `manual:` et la séance revenait en double à la collecte suivante).
import { $t } from '../i18n';
import { aggregates, cleanHr } from './hr';
import { localDay } from './dates';
import { newId, nowIso } from './ids';
import { liveRecords } from './load';
import { sameActivity } from './dossier';
import { EXERCISE_TO_SUBSPORT } from './subsports';
import type { ActualDiscipline, ActualSession, AppData, RestingHr, SessionSeries, SleepNight, WeightReading } from './types';
import { KCAL_J } from './stats';

export const EXERCISE_TO_DISCIPLINE: Record<number, ActualDiscipline> = {
  8: 'BIKE', 9: 'BIKE', 56: 'RUN', 57: 'RUN', 73: 'SWIM', 74: 'SWIM', 70: 'STRENGTH', 81: 'STRENGTH', 13: 'STRENGTH', 36: 'STRENGTH', 10: 'STRENGTH',
};
export const EXERCISE_LABEL: Record<number, string> = {
  0: $t("Autre"), 8: $t("Vélo"), 9: $t("Vélo intérieur"), 10: $t("Circuit"), 13: $t("Renforcement au poids du corps"), 25: $t("Elliptique"), 36: $t("Fractionné haute intensité"), 37: $t("Randonnée"), 53: $t("Aviron"),
  56: $t("Course"), 57: $t("Tapis de course"), 61: $t("Ski"), 70: $t("Renforcement"), 71: $t("Étirements"), 73: $t("Natation eau libre"), 74: $t("Natation en bassin"), 79: $t("Marche"), 81: $t("Musculation"), 83: $t("Yoga"),
};
export const exerciseLabel = (t: string | null) => (t === null || t === 'manual' ? $t("Saisie manuelle") : EXERCISE_LABEL[+t] ?? $t("Type ") + t);

/** Ce que rend le module natif `ApogeeHealth.readSessions`. */
export interface NativeSession {
  id: string;
  clientRecordId: string | null;
  startTime: string;
  endTime: string;
  startZoneOffsetSeconds: number | null;
  exerciseType: number;
  distanceM: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  elevationM: number | null;
  hr: [number, number][];
  speed: [number, number][];
}
export interface NativeSleep { id: string; clientRecordId: string | null; startTime: string; endTime: string; startZoneOffsetSeconds: number | null; /** Temps endormi d'après les étapes (absent avant l'APK qui les lit ; null si pas d'étapes). */ asleepSec?: number | null }
export interface NativeResting { id: string; time: string; zoneOffsetSeconds: number | null; bpm: number }
export interface NativeWeight { id: string; time: string; zoneOffsetSeconds: number | null; kg: number }

export interface IngestOps { actual: ActualSession[]; series: SessionSeries[]; sleep: SleepNight[]; resting: RestingHr[]; weight: WeightReading[] }
export interface NativeExtras { weight?: NativeWeight[] }
export interface IngestReport { found: number; inserted: number; updated: number; known: number; nights: number; restingDays: number; weights?: number; unmapped: number[] }

export function ingest(data: AppData, sessions: NativeSession[], nights: NativeSleep[], resting: NativeResting[], extras: NativeExtras = {}): { ops: IngestOps; report: IngestReport } {
  const now = nowIso();
  const bySource = new Map(liveRecords(data.actual).map((s) => [s.sourceId, s]));
  const ops: IngestOps = { actual: [], series: [], sleep: [], resting: [], weight: [] };
  const report: IngestReport = { found: sessions.length, inserted: 0, updated: 0, known: 0, nights: 0, restingDays: 0, weights: 0, unmapped: [] };
  for (const n of sessions) {
    const sourceId = n.clientRecordId || n.id;
    if (!sourceId) continue;
    const hr = cleanHr(n.hr);
    const speed = (n.speed || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
    // séance reprise du dossier coach de l'ancienne app (sans identifiant Garmin) : même activité, même heure
    const placeholder = bySource.has(sourceId) ? undefined : liveRecords(data.actual).find((s) => s.sourceId.startsWith('dossier:') && sameActivity(s, EXERCISE_TO_DISCIPLINE[n.exerciseType] ?? 'OTHER', n.startTime));
    const existing = bySource.get(sourceId) ?? placeholder;
    if (existing && !placeholder) {
      const better = hr.length > (existing.hrSampleCount ?? 0) + 5 && existing.edited.length === 0;
      if (!better) { report.known++; continue; }
    }
    const durationSec = Math.max(0, Math.round((Date.parse(n.endTime) - Date.parse(n.startTime)) / 1000));
    if (!(n.exerciseType in EXERCISE_TO_DISCIPLINE) && !report.unmapped.includes(n.exerciseType)) report.unmapped.push(n.exerciseType);
    const id = existing?.id ?? newId();
    const agg = aggregates(hr, speed, durationSec);
    const s: ActualSession = {
      ...(existing ?? { rpe: null, comment: null, edited: [], ingestedAt: now }),
      id, updatedAt: now, sourceId, source: 'health',
      discipline: existing?.discipline ?? EXERCISE_TO_DISCIPLINE[n.exerciseType] ?? 'OTHER',
      subSport: existing ? existing.subSport ?? (existing.discipline === 'OTHER' ? EXERCISE_TO_SUBSPORT[n.exerciseType] ?? null : null) : (n.exerciseType in EXERCISE_TO_DISCIPLINE ? null : EXERCISE_TO_SUBSPORT[n.exerciseType] ?? null),
      rawExerciseType: String(n.exerciseType),
      startAt: new Date(n.startTime).toISOString(), endAt: new Date(n.endTime).toISOString(),
      zoneOffsetMinutes: n.startZoneOffsetSeconds == null ? null : Math.round(n.startZoneOffsetSeconds / 60),
      durationSec,
      distanceM: n.distanceM && n.distanceM > 0 ? n.distanceM : null,
      activeCaloriesJ: n.activeKcal == null ? null : n.activeKcal * KCAL_J,
      totalCaloriesJ: n.totalKcal == null ? null : n.totalKcal * KCAL_J,
      elevationGainM: n.elevationM ?? null,
      ...agg,
      hasSeries: hr.length > 0 || speed.length > 0,
    } as ActualSession;
    ops.actual.push(s);
    if (s.hasSeries) {
      ops.series.push({ id, updatedAt: now, hr, speed });
    }
    if (existing) report.updated++; else report.inserted++;
  }
  // sommeil : jour de réveil, la nuit la plus longue l'emporte
  const bestNight = new Map<string, SleepNight>();
  for (const n of nights) {
    const off = n.startZoneOffsetSeconds == null ? null : Math.round(n.startZoneOffsetSeconds / 60);
    const nightDate = localDay(n.endTime, off);
    const inBed = Math.round((Date.parse(n.endTime) - Date.parse(n.startTime)) / 1000);
    // temps réellement endormi quand les étapes sont connues (Garmin affiche ce temps, pas celui passé au lit)
    const stages = typeof n.asleepSec === 'number' && n.asleepSec > 0;
    const dur = stages ? Math.min(Math.round(n.asleepSec!), inBed) : inBed;
    const cur = bestNight.get(nightDate) ?? (data.sleep[nightDate] && !data.sleep[nightDate].deleted ? data.sleep[nightDate] : undefined);
    if (cur) {
      if (cur.fromStages && !stages) continue;
      if (!!cur.fromStages === stages && cur.durationSec >= dur) continue;
    }
    bestNight.set(nightDate, { id: nightDate, updatedAt: now, nightDate, startAt: new Date(n.startTime).toISOString(), endAt: new Date(n.endTime).toISOString(), zoneOffsetMinutes: off, durationSec: dur, ...(stages ? { fromStages: true } : {}), sourceId: n.clientRecordId || n.id });
  }
  for (const v of bestNight.values()) if (!data.sleep[v.id] || data.sleep[v.id].durationSec !== v.durationSec || !!data.sleep[v.id].fromStages !== !!v.fromStages) { ops.sleep.push(v); report.nights++; }
  for (const r of resting) {
    const day = localDay(r.time, r.zoneOffsetSeconds == null ? null : Math.round(r.zoneOffsetSeconds / 60));
    if (data.resting[day] && !data.resting[day].deleted && data.resting[day].bpm === r.bpm) continue;
    if (ops.resting.some((x) => x.id === day)) continue;
    ops.resting.push({ id: day, updatedAt: now, day, bpm: r.bpm });
    report.restingDays++;
  }
  // poids : dernière pesée du jour ; une pesée saisie à la main n'est jamais écrasée
  const lastWeight = new Map<string, { t: number; kg: number }>();
  for (const r of extras.weight ?? []) {
    if (!(r.kg >= 25 && r.kg <= 300)) continue;
    const day = localDay(r.time, r.zoneOffsetSeconds == null ? null : Math.round(r.zoneOffsetSeconds / 60));
    const t = Date.parse(r.time);
    if (!lastWeight.has(day) || lastWeight.get(day)!.t < t) lastWeight.set(day, { t, kg: r.kg });
  }
  for (const [day, w] of lastWeight) {
    const cur = data.weight[day];
    const kg = Math.round(w.kg * 10) / 10;
    if (cur && (cur.deleted || cur.source === 'manual' || cur.kg === kg)) continue; // une pesée supprimée ou saisie à la main n'est pas ré-importée
    ops.weight.push({ id: day, updatedAt: now, day, kg, source: 'health' });
    report.weights!++;
  }
  return { ops, report };
}
