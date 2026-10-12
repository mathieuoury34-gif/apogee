// Toutes les écritures de l'interface passent par ici : un seul endroit pour l'horodatage, la propagation
// cloud et l'« Annuler » des toasts (comme PEAnalyze).
import { newId, nowIso } from '../domain/ids';
import { buildManualSession, existingSourceIds, manualSourceId, type ManualInput } from '../domain/manual';
import { liveRecords, sessionDay } from '../domain/load';
import type { ActualSession, AppData, Athlete, CollectionName, Collections, EditableField, Interruption, PlannedSession, Race, TrainingPhase, ZoneReading } from '../domain/types';
import { COLLECTIONS } from '../domain/types';
import { applyPreview, type CoachPlan, type Preview } from '../domain/coach';
import { commit, getData } from './store';

type Snapshot = { coll: CollectionName; id: string; rec: unknown }[];

function snapshot(keys: [CollectionName, string][]): Snapshot {
  const d = getData();
  return keys.map(([coll, id]) => ({ coll, id, rec: (d[coll] as Record<string, unknown>)[id] }));
}
/** Remet les enregistrements dans l'état photographié (avec un horodatage neuf, pour que l'annulation se propage). */
export function restore(s: Snapshot): void {
  commit((tx) => {
    for (const x of s) {
      if (x.rec && !(x.rec as { deleted?: boolean }).deleted) tx.put(x.coll, x.rec as never);
      else tx.remove(x.coll, x.id);
    }
  });
}

// ------------------------------------------------------------------ séances prévues
export function savePlanned(p: PlannedSession): Snapshot {
  const s = snapshot([['planned', p.id]]);
  commit((tx) => tx.put('planned', p));
  return s;
}
export function deletePlanned(id: string): Snapshot {
  const s = snapshot([['planned', id]]);
  commit((tx) => tx.remove('planned', id));
  return s;
}
export function duplicatePlanned(id: string, date: string): PlannedSession | null {
  const src = getData().planned[id];
  if (!src || src.deleted) return null;
  const now = nowIso();
  const copy: PlannedSession = { ...structuredClone(src), id: newId(), plannedDate: date, origin: 'manual', idempotencyKey: null, coachExchangeId: null, createdAt: now, updatedAt: now };
  commit((tx) => tx.put('planned', copy));
  return copy;
}
export function movePlanned(id: string, date: string): Snapshot {
  const src = getData().planned[id];
  const s = snapshot([['planned', id]]);
  if (src && !src.deleted) commit((tx) => tx.put('planned', { ...src, plannedDate: date }));
  return s;
}
export function addPlannedBulk(list: PlannedSession[]): void {
  commit((tx) => list.forEach((p) => tx.put('planned', p)));
}

// ------------------------------------------------------------------ séances réalisées
export function addManualSessions(inputs: ManualInput[]): { inserted: ActualSession[]; duplicates: number } {
  const known = existingSourceIds(getData());
  const inserted: ActualSession[] = [];
  let duplicates = 0;
  for (const i of inputs) {
    const sid = manualSourceId(i);
    if (known.has(sid)) { duplicates++; continue; }
    known.add(sid);
    inserted.push(buildManualSession(i));
  }
  if (inserted.length) commit((tx) => inserted.forEach((s) => tx.put('actual', s)));
  return { inserted, duplicates };
}

/** Édition : l'identité de la séance ne change jamais ; les champs touchés passent en assise « saisie ». */
export function editActual(id: string, input: ManualInput): Snapshot {
  const cur = getData().actual[id];
  const s = snapshot([['actual', id]]);
  if (!cur || cur.deleted) return s;
  const edited = new Set<EditableField>(cur.edited);
  const durationSec = Math.round(input.durationMin * 60);
  const distanceM = input.distanceKm === null ? null : input.distanceKm * 1000;
  const next: ActualSession = { ...cur, rpe: input.rpe, comment: input.comment ?? cur.comment };
  const day = sessionDay(cur);
  if (input.date !== day) {
    edited.add('date');
    const shift = Date.parse(input.date + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z');
    next.startAt = new Date(Date.parse(cur.startAt) + shift).toISOString();
  }
  if (input.discipline !== cur.discipline) { edited.add('discipline'); next.discipline = input.discipline; }
  if (durationSec !== cur.durationSec) { edited.add('durationSec'); next.durationSec = durationSec; }
  if ((distanceM ?? null) !== (cur.distanceM ?? null) && !(distanceM && cur.distanceM && Math.abs(distanceM - cur.distanceM) < 1)) { edited.add('distanceM'); next.distanceM = distanceM; }
  if ((input.avgHrBpm ?? null) !== (cur.avgHrBpm === null ? null : Math.round(cur.avgHrBpm))) { edited.add('avgHrBpm'); next.avgHrBpm = input.avgHrBpm; }
  next.endAt = new Date(Date.parse(next.startAt) + next.durationSec * 1000).toISOString();
  next.avgSpeedMs = next.distanceM && next.durationSec ? next.distanceM / next.durationSec : null;
  next.edited = cur.source === 'manual' ? [] : [...edited];
  commit((tx) => tx.put('actual', next));
  return s;
}

export function deleteActual(id: string): Snapshot {
  const d = getData();
  const pairs = liveRecords(d.bricks).filter((b) => b.firstId === id || b.secondId === id).map((b) => ['bricks', b.id] as [CollectionName, string]);
  const s = snapshot([['actual', id], ['series', id], ...pairs]);
  commit((tx) => { tx.remove('actual', id); tx.remove('series', id); pairs.forEach(([c, x]) => tx.remove(c, x)); });
  return s;
}

export function setFeedback(id: string, rpe: number | null, comment: string | null): void {
  const cur = getData().actual[id];
  if (!cur || cur.deleted) return;
  commit((tx) => tx.put('actual', { ...cur, rpe, comment: comment && comment.trim() ? comment.trim() : null }));
}

/** `undefined` = revenir à l'automatique, `null` = « n'était pas prévue », sinon id du prévu. */
export function setManualLink(id: string, plannedId: string | null | undefined): void {
  const cur = getData().actual[id];
  if (!cur || cur.deleted) return;
  const next: ActualSession = { ...cur };
  if (plannedId === undefined) delete next.manualPlannedId; else next.manualPlannedId = plannedId;
  commit((tx) => tx.put('actual', next));
}

export function brickDecision(a: ActualSession, b: ActualSession, status: 'confirmed' | 'declined'): void {
  const [first, second] = a.startAt <= b.startAt ? [a, b] : [b, a];
  commit((tx) => tx.put('bricks', { id: newId(), updatedAt: '', firstId: first.id, secondId: second.id, day: sessionDay(first), status }));
}

// ------------------------------------------------------------------ profil, course, zones
export function saveAthlete(a: Omit<Athlete, 'id' | 'updatedAt'>): void {
  commit((tx) => tx.put('athlete', { ...a, id: 'main', updatedAt: '' }));
}
export function saveRace(r: Omit<Race, 'id' | 'updatedAt' | 'targetRevisedAt'>): void {
  const cur = getData().race.main;
  const revised = cur && !cur.deleted && cur.targetTotalSeconds === r.targetTotalSeconds ? cur.targetRevisedAt : r.targetTotalSeconds !== null ? nowIso() : cur?.targetRevisedAt ?? null;
  commit((tx) => tx.put('race', { ...r, id: 'main', updatedAt: '', targetRevisedAt: revised }));
}
export function addZone(z: Omit<ZoneReading, 'id' | 'updatedAt'>): void {
  commit((tx) => tx.put('zones', { ...z, id: newId(), updatedAt: '' }));
}
export function deleteZone(id: string): Snapshot {
  const s = snapshot([['zones', id]]);
  commit((tx) => tx.remove('zones', id));
  return s;
}

// ------------------------------------------------------------------ périodisation, interruptions
export function savePhase(p: TrainingPhase): void { commit((tx) => tx.put('phases', p)); }
export function deletePhase(id: string): Snapshot { const s = snapshot([['phases', id]]); commit((tx) => tx.remove('phases', id)); return s; }
export function saveInterruption(i: Interruption): void { commit((tx) => tx.put('interruptions', i)); }
export function deleteInterruption(id: string): Snapshot { const s = snapshot([['interruptions', id]]); commit((tx) => tx.remove('interruptions', id)); return s; }

// ------------------------------------------------------------------ coach
export function applyCoach(pv: Preview, plan: CoachPlan, hash: string): void {
  const { mutations } = applyPreview(getData(), pv, plan, hash);
  commit((tx) => {
    mutations.puts.forEach((p) => tx.put(p.coll, p.rec as never));
    mutations.deletes.forEach((x) => tx.remove(x.coll, x.id));
  });
}
export function logExport(sessions: ActualSession[]): void {
  const now = nowIso();
  commit((tx) => tx.put('exchanges', { id: newId(), updatedAt: '', direction: 'export', schemaVersion: 'ironapp/1', occurredAt: now, status: 'applied', operationCount: sessions.length, payloadHash: null, planValidUntil: null, exportSessions: sessions.map((s) => ({ discipline: s.discipline, day: sessionDay(s) })), error: null }));
}

/** Efface tout (pierres tombales : l'effacement se propage aux autres appareils connectés). */
export function deleteEverything(): number {
  const d = getData();
  let n = 0;
  commit((tx) => { for (const c of COLLECTIONS) for (const id of Object.keys(d[c])) { tx.remove(c, id); n++; } });
  return n;
}

export function blank<K extends CollectionName>(_c: K, rec: Omit<Collections[K], 'id' | 'updatedAt'>): Collections[K] {
  return { ...rec, id: newId(), updatedAt: '' } as Collections[K];
}

export type { AppData };
