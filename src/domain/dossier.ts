// Complément de reprise : le dossier-athlète `ironapp/1` exporté par l'ancienne app (écran Coach).
// Le fichier .db partagé par l'ancienne app peut manquer ses toutes dernières écritures (SQLite les garde
// d'abord dans un fichier annexe que le partage n'emporte pas). Le dossier coach exporté juste avant,
// lui, contient les séances jointes et les séances prévues à venir : on s'en sert pour compléter, sans
// jamais écraser ce qui existe déjà.
//  - séance réalisée : même identifiant que dans l'ancienne base (internalId). Si elle existe déjà (par
//    son identifiant, ou parce que la montre l'a déjà remontée à la même heure), on ne fait que compléter
//    le ressenti et le commentaire manquants ;
//  - séance prévue : la clé `session:<n>` donne l'identifiant de l'ancienne base ; une autre clé est une
//    clé d'échange coach, retrouvée par `idempotencyKey`.
import { liveRecords } from './load';
import { newId, nowIso } from './ids';
import type { ActualDiscipline, ActualSession, AppData, Block, PlannedDiscipline, PlannedSession } from './types';
import { ACTUAL_DISCIPLINES, PLANNED_DISCIPLINES } from './types';

interface DossierActual { internalId: number | string; discipline: string; startAt: string; durationSec: number; distanceM: number | null; avgHrBpm: number | null; rpe: number | null; comment: string | null }
interface DossierPlanned { refKey: string; discipline: string; plannedDate: string; title: string | null; notes: string | null; blocks: Block[] }
export interface Dossier { schemaVersion: string; generatedAt?: string; recentActualSessions: DossierActual[]; upcomingPlannedSessions?: DossierPlanned[] }

export function isDossier(j: unknown): j is Dossier {
  const d = j as Partial<Dossier> | null;
  return !!d && typeof d === 'object' && d.schemaVersion === 'ironapp/1' && Array.isArray(d.recentActualSessions);
}

export interface DossierReport { added: number; completed: number; known: number; plannedAdded: number; plannedKnown: number; skipped: number }

/** Écart maximal entre deux débuts de séance pour les considérer comme la même activité. */
export const SAME_START_SEC = 180;

export function sameActivity(a: Pick<ActualSession, 'discipline' | 'startAt'>, discipline: string, startAt: string): boolean {
  return a.discipline === discipline && Math.abs(Date.parse(a.startAt) - Date.parse(startAt)) <= SAME_START_SEC * 1000;
}

export function importDossierData(data: AppData, dossier: Dossier): { actual: ActualSession[]; planned: PlannedSession[]; report: DossierReport } {
  const now = nowIso();
  const report: DossierReport = { added: 0, completed: 0, known: 0, plannedAdded: 0, plannedKnown: 0, skipped: 0 };
  const actual: ActualSession[] = [];
  const live = liveRecords(data.actual);
  for (const r of dossier.recentActualSessions) {
    const disc = r.discipline as ActualDiscipline;
    const start = Date.parse(r.startAt);
    if (!(ACTUAL_DISCIPLINES as readonly string[]).includes(disc) || !Number.isFinite(start) || !(r.durationSec > 0)) { report.skipped++; continue; }
    const id = String(r.internalId);
    const existing = (data.actual[id] && !data.actual[id].deleted ? data.actual[id] : null) ?? live.find((s) => sameActivity(s, disc, r.startAt)) ?? null;
    if (existing) {
      const rpe = existing.rpe ?? (r.rpe ?? null);
      const comment = existing.comment ?? (r.comment ?? null);
      if (rpe !== existing.rpe || comment !== existing.comment) { actual.push({ ...existing, rpe, comment, updatedAt: now }); report.completed++; }
      else report.known++;
      continue;
    }
    const startAt = new Date(start).toISOString();
    actual.push({
      id, updatedAt: now, sourceId: 'dossier:' + id, source: 'health', discipline: disc, rawExerciseType: null,
      startAt, endAt: new Date(start + r.durationSec * 1000).toISOString(), zoneOffsetMinutes: null,
      durationSec: Math.round(r.durationSec), distanceM: r.distanceM && r.distanceM > 0 ? r.distanceM : null,
      activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: null,
      avgHrBpm: r.avgHrBpm ?? null, maxHrBpm: null, minHrBpm: null, hrCoverageRatio: null, hrSampleCount: null,
      avgSpeedMs: r.distanceM && r.durationSec ? r.distanceM / r.durationSec : null, maxSpeedMs: null,
      hasSeries: false, edited: [], rpe: r.rpe ?? null, comment: r.comment ?? null, ingestedAt: now,
    });
    report.added++;
  }
  const planned: PlannedSession[] = [];
  for (const p of dossier.upcomingPlannedSessions ?? []) {
    if (!(PLANNED_DISCIPLINES as readonly string[]).includes(p.discipline) || !/^\d{4}-\d{2}-\d{2}$/.test(p.plannedDate) || !Array.isArray(p.blocks) || !p.blocks.length) { report.skipped++; continue; }
    const m = /^session:(\d+)$/.exec(p.refKey);
    const byId = m ? data.planned[m[1]] : undefined;
    const known = (byId && !byId.deleted) || liveRecords(data.planned).some((x) => x.idempotencyKey === p.refKey);
    if (known) { report.plannedKnown++; continue; }
    planned.push({
      id: m ? m[1] : newId(), updatedAt: now, discipline: p.discipline as PlannedDiscipline, plannedDate: p.plannedDate,
      title: p.title ?? null, notes: p.notes ?? null, origin: m ? 'manual' : 'coach', idempotencyKey: m ? null : p.refKey,
      coachExchangeId: null, blocks: p.blocks.map(normBlock), createdAt: now,
    });
    report.plannedAdded++;
  }
  return { actual, planned, report };
}

function normBlock(b: Block): Block {
  return {
    kind: b.kind, measure: b.measure ?? null, measureValue: b.measureValue ?? null, setMode: b.setMode ?? null, setCount: b.setCount ?? null,
    setWindowS: b.setWindowS ?? null, targetType: b.targetType ?? 'NONE', targetLow: b.targetLow ?? null, targetHigh: b.targetHigh ?? null,
    relativeTo: b.relativeTo ?? null, label: b.label ?? null, notes: b.notes ?? null, discipline: b.discipline ?? null,
    children: (b.children ?? []).map(normBlock),
  };
}
