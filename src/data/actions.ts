// Toutes les écritures de l'interface passent par ici : un seul endroit pour l'horodatage, la propagation
// cloud et l'« Annuler » des toasts (comme PEAnalyze).
import { addDays, daysBetween, mondayOf } from '../domain/dates';
import { newId, nowIso } from '../domain/ids';
import { buildManualSession, existingSourceIds, manualSourceId, type ManualInput } from '../domain/manual';
import { liveRecords, sessionDay } from '../domain/load';
import { planDedupe } from '../domain/dedupe';
import type { SessionTemplate, ActualSession, AppData, Athlete, CollectionName, Collections, EditableField, Interruption, PlannedSession, Race, TrainingPhase, ZoneReading } from '../domain/types';
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
  if (src && !src.deleted) commit((tx) => tx.put('planned', { ...src, plannedDate: date, editedAt: src.origin === 'coach' ? nowIso() : src.editedAt ?? null }));
  return s;
}
/** Copie toutes les séances prévues d'une semaine vers une autre (nouveaux identifiants, origine « manuelle »). */
export function copyWeek(srcMonday: string, dstMonday: string): { snap: Snapshot; count: number } {
  const d = getData();
  const src = Object.values(d.planned).filter((p) => !p.deleted && p.plannedDate >= srcMonday && p.plannedDate <= addDays(srcMonday, 6));
  const now = nowIso();
  const copies = src.map((p) => ({ ...structuredClone(p), id: newId(), plannedDate: addDays(dstMonday, daysBetween(srcMonday, p.plannedDate)), origin: 'manual' as const, idempotencyKey: null, coachExchangeId: null, createdAt: now, updatedAt: now, editedAt: null }));
  const snap = snapshot(copies.map((c) => ['planned', c.id] as [CollectionName, string]));
  commit((tx) => copies.forEach((c) => tx.put('planned', c)));
  return { snap, count: copies.length };
}

export function weekPlanned(monday: string): PlannedSession[] {
  return Object.values(getData().planned).filter((p) => !p.deleted && p.plannedDate >= monday && p.plannedDate <= addDays(monday, 6));
}

// ------------------------------------------------------------------ séances favorites et semaines types
export function saveTemplate(t: { name: string; kind: 'session' | 'week'; items: SessionTemplate['items'] }): SessionTemplate {
  const now = nowIso();
  const rec: SessionTemplate = { id: newId(), updatedAt: now, createdAt: now, name: t.name.trim(), kind: t.kind, items: structuredClone(t.items) };
  commit((tx) => tx.put('templates', rec));
  return rec;
}
export function templateFromWeek(name: string, monday: string): SessionTemplate | null {
  const list = weekPlanned(monday);
  if (!list.length) return null;
  return saveTemplate({ name, kind: 'week', items: list.map((p) => ({ offset: daysBetween(monday, p.plannedDate), discipline: p.discipline, title: p.title, notes: p.notes, blocks: p.blocks })) });
}
export function templateFromSession(id: string, name?: string): SessionTemplate | null {
  const p = getData().planned[id];
  if (!p || p.deleted) return null;
  return saveTemplate({ name: name?.trim() || p.title || p.discipline, kind: 'session', items: [{ offset: 0, discipline: p.discipline, title: p.title, notes: p.notes, blocks: p.blocks }] });
}
export function deleteTemplate(id: string): Snapshot {
  const s = snapshot([['templates', id]]);
  commit((tx) => tx.remove('templates', id));
  return s;
}
/** Ajoute au calendrier les séances d'un modèle : `date` est le jour (séance favorite) ou le lundi (semaine type). */
export function applyTemplate(t: SessionTemplate, date: string): { snap: Snapshot; count: number } {
  const now = nowIso();
  const base = t.kind === 'week' ? mondayOf(date) : date;
  const copies: PlannedSession[] = t.items.map((it) => ({ id: newId(), updatedAt: now, createdAt: now, discipline: it.discipline, plannedDate: addDays(base, it.offset), title: it.title, notes: it.notes, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: structuredClone(it.blocks) }));
  const snap = snapshot(copies.map((c) => ['planned', c.id] as [CollectionName, string]));
  commit((tx) => copies.forEach((c) => tx.put('planned', c)));
  return { snap, count: copies.length };
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
  const next: ActualSession = { ...cur, rpe: input.rpe, comment: input.comment ?? cur.comment, subSport: input.discipline === 'OTHER' ? (input.subSport !== undefined ? input.subSport : cur.subSport ?? null) : null, title: input.title !== undefined ? input.title?.trim() || null : cur.title ?? null };
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

/** Donne (ou retire, avec une chaîne vide) un titre à une séance réalisée, et — pour « Autre » — choisit son pictogramme. N'altère aucune mesure. */
export function setActualLook(id: string, look: { title: string; subSport?: string | null }): Snapshot {
  const cur = getData().actual[id];
  const s = snapshot([['actual', id]]);
  if (cur && !cur.deleted) {
    const next: ActualSession = { ...cur, title: look.title.trim() || null };
    if (look.subSport !== undefined && cur.discipline === 'OTHER') next.subSport = look.subSport;
    commit((tx) => tx.put('actual', next));
  }
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
  commit((tx) => tx.put('exchanges', { id: newId(), updatedAt: '', direction: 'export', schemaVersion: 'apogee/1', occurredAt: now, status: 'applied', operationCount: sessions.length, payloadHash: null, planValidUntil: null, exportSessions: sessions.map((s) => ({ discipline: s.discipline, day: sessionDay(s) })), error: null }));
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

/**
 * Fusionne les séances réalisées en double (même identifiant Garmin) : voir domain/dedupe.ts.
 * Rend le nombre de doublons supprimés. Sans doublon, ne touche à rien.
 */
export function mergeDuplicateActuals(): number {
  const d = getData();
  const plan = planDedupe(d);
  if (!plan.drop.length) return 0;
  commit((tx) => {
    plan.put.forEach((a) => tx.put('actual', a));
    for (const id of plan.drop) { tx.remove('actual', id); tx.remove('series', id); }
    for (const b of liveRecords(d.bricks)) {
      const first = plan.remap.get(b.firstId) ?? b.firstId, second = plan.remap.get(b.secondId) ?? b.secondId;
      if (first !== b.firstId || second !== b.secondId) tx.put('bricks', { ...b, firstId: first, secondId: second });
    }
  });
  return plan.drop.length;
}
