// Saisie manuelle de séances réalisées (une séance ou un lot collé) et import groupé de séances planifiées.
// Formats de collage inchangés (health/manualEntry.ts, planning/manualPlannedImport.ts) :
//   réalisées : AAAA-MM-JJ;DISCIPLINE;durée_min;distance_km;FC_moyenne;RPE
//   planifiées : AAAA-MM-JJ;DISCIPLINE;durée_min;titre
// Dates acceptées aussi en jj/mm/aaaa.
import { newBlock } from './blocks';
import { fnv1a, newId, nowIso } from './ids';
import { liveRecords } from './load';
import type { ActualDiscipline, ActualSession, AppData, PlannedDiscipline, PlannedSession } from './types';
import { ACTUAL_DISCIPLINES, PLANNED_DISCIPLINES } from './types';

export interface ManualInput { date: string; discipline: ActualDiscipline; durationMin: number; distanceKm: number | null; avgHrBpm: number | null; rpe: number | null; comment?: string | null }

export const ALIASES: Record<string, string> = {
  COURSE: 'RUN', CAP: 'RUN', VELO: 'BIKE', VÉLO: 'BIKE', NATATION: 'SWIM', NAT: 'SWIM', RENFO: 'STRENGTH', RENFORCEMENT: 'STRENGTH', MUSCU: 'STRENGTH', AUTRE: 'OTHER', ENCHAINEMENT: 'BRICK', ENCHAÎNEMENT: 'BRICK',
};

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (!m) return null;
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}
const num = (raw: string | undefined): number | null => {
  const t = (raw ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

export function parseManualFields(f: { date: string; discipline: string; durationMin: string; distanceKm?: string; avgHrBpm?: string; rpe?: string }): { input: ManualInput } | { error: string } {
  const date = parseDate(f.date);
  if (!date) return { error: `date invalide : « ${f.date} »` };
  const up = f.discipline.trim().toUpperCase();
  const disc = ALIASES[up] ?? up;
  if (!(ACTUAL_DISCIPLINES as readonly string[]).includes(disc)) return { error: `discipline inconnue « ${f.discipline} » (RUN, BIKE, SWIM, STRENGTH, OTHER)` };
  const dur = num(f.durationMin);
  if (dur === null || Number.isNaN(dur) || dur <= 0) return { error: `durée invalide : « ${f.durationMin} »` };
  const dist = num(f.distanceKm);
  if (Number.isNaN(dist)) return { error: `distance invalide : « ${f.distanceKm} »` };
  const hr = num(f.avgHrBpm);
  if (Number.isNaN(hr) || (hr !== null && (hr < 30 || hr > 230))) return { error: `FC moyenne invalide : « ${f.avgHrBpm} »` };
  const rpe = num(f.rpe);
  if (Number.isNaN(rpe) || (rpe !== null && (rpe < 1 || rpe > 10))) return { error: `RPE invalide (1 à 10) : « ${f.rpe} »` };
  return { input: { date, discipline: disc as ActualDiscipline, durationMin: dur, distanceKm: dist, avgHrBpm: hr, rpe: rpe === null ? null : Math.round(rpe) } };
}

export function parseBulkActual(text: string): { valid: ManualInput[]; issues: { line: number; message: string }[] } {
  const valid: ManualInput[] = [], issues: { line: number; message: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const p = line.split(/[;\t]/);
    if (p.length < 3) { issues.push({ line: i + 1, message: 'attendu au moins date;discipline;durée' }); return; }
    const r = parseManualFields({ date: p[0], discipline: p[1], durationMin: p[2], distanceKm: p[3], avgHrBpm: p[4], rpe: p[5] });
    if ('error' in r) issues.push({ line: i + 1, message: r.error }); else valid.push(r.input);
  });
  return { valid, issues };
}

/** Identifiant d'origine déterministe : recoller la même ligne ne crée pas de doublon. */
export function manualSourceId(i: Pick<ManualInput, 'date' | 'discipline' | 'durationMin' | 'distanceKm' | 'avgHrBpm'>): string {
  return 'manual:' + fnv1a([i.date, i.discipline, i.durationMin, i.distanceKm ?? '', i.avgHrBpm ?? ''].join('|'));
}

export function buildManualSession(i: ManualInput, id = newId()): ActualSession {
  const durationSec = Math.round(i.durationMin * 60);
  const distanceM = i.distanceKm !== null ? i.distanceKm * 1000 : null;
  const startAt = i.date + 'T12:00:00.000Z';
  const now = nowIso();
  return {
    id, updatedAt: now, sourceId: manualSourceId(i), source: 'manual', discipline: i.discipline, rawExerciseType: 'manual',
    startAt, endAt: new Date(Date.parse(startAt) + durationSec * 1000).toISOString(), zoneOffsetMinutes: 0, durationSec, distanceM,
    activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: null, avgHrBpm: i.avgHrBpm, maxHrBpm: null, minHrBpm: null,
    hrCoverageRatio: null, hrSampleCount: null, avgSpeedMs: distanceM && durationSec ? distanceM / durationSec : null, maxSpeedMs: null,
    hasSeries: false, edited: [], rpe: i.rpe, comment: i.comment ?? null, ingestedAt: now,
  };
}

export function existingSourceIds(data: AppData): Set<string> {
  return new Set(liveRecords(data.actual).map((s) => s.sourceId));
}

export function parseBulkPlanned(text: string): { valid: PlannedSession[]; issues: { line: number; message: string }[] } {
  const valid: PlannedSession[] = [], issues: { line: number; message: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const p = line.split(/[;\t]/);
    const date = parseDate(p[0] ?? '');
    const up = (p[1] ?? '').trim().toUpperCase();
    const disc = ALIASES[up] ?? up;
    const dur = num(p[2]);
    if (!date) { issues.push({ line: i + 1, message: `date invalide : « ${p[0] ?? ''} »` }); return; }
    if (!(PLANNED_DISCIPLINES as readonly string[]).includes(disc)) { issues.push({ line: i + 1, message: `discipline inconnue « ${p[1] ?? ''} »` }); return; }
    if (dur === null || Number.isNaN(dur) || dur <= 0) { issues.push({ line: i + 1, message: `durée invalide : « ${p[2] ?? ''} »` }); return; }
    const now = nowIso();
    const work = { ...newBlock('WORK'), measureValue: Math.round(dur * 60) };
    valid.push({ id: newId(), updatedAt: now, createdAt: now, discipline: disc as PlannedDiscipline, plannedDate: date, title: (p[3] ?? '').trim() || null, notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: [work] });
  });
  return { valid, issues };
}
