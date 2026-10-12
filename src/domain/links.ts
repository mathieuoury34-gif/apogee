// Rattachement prévu ↔ réalisé (repris de planning/sessionLinks.ts).
// Le rattachement AUTOMATIQUE n'est plus stocké : il se recalcule à chaque changement, sur toutes les
// données, à l'identique sur chaque appareil. Seul le choix MANUEL est enregistré (sur la séance réalisée).
// Amélioration : une séance faite la veille ou le lendemain du prévu (séance déplacée) se rattache aussi,
// avec une confiance plus faible, quand aucun candidat n'existe le jour même.
import { estimateDuration, type RefValues } from './blocks';
import { addDays } from './dates';
import { liveRecords, sessionDay } from './load';
import type { ActualSession, AppData, CoreDiscipline, PlannedSession } from './types';
import { DISCIPLINES } from './types';

const BASE = 0.6;
const SHIFTED_BASE = 0.42;
const DURATION_WEIGHT = 0.4;
const AMBIGUITY = 0.08;
export const MANUAL_LINK_WINDOW = 3;

const asCore = (d: string): CoreDiscipline | null => ((DISCIPLINES as readonly string[]).includes(d) ? (d as CoreDiscipline) : null);

interface Slot { plannedId: string; index: number; discipline: CoreDiscipline; day: string; expected: number | null }

function slotsFor(p: PlannedSession, refs: RefValues): Slot[] {
  const core = asCore(p.discipline);
  if (core) {
    const e = estimateDuration(p.blocks, p.discipline, refs);
    return [{ plannedId: p.id, index: 0, discipline: core, day: p.plannedDate, expected: e.certainty === 'unknown' ? null : e.value }];
  }
  const order: CoreDiscipline[] = [];
  const by = new Map<CoreDiscipline, typeof p.blocks>();
  for (const b of p.blocks) {
    const c = b.discipline ? asCore(b.discipline) : null;
    if (!c) continue;
    if (!by.has(c)) { order.push(c); by.set(c, []); }
    by.get(c)!.push(b);
  }
  if (!order.length) return (['BIKE', 'RUN'] as CoreDiscipline[]).map((discipline, index) => ({ plannedId: p.id, index, discipline, day: p.plannedDate, expected: null }));
  return order.map((discipline, index) => {
    const e = estimateDuration(by.get(discipline)!, discipline, refs);
    return { plannedId: p.id, index, discipline, day: p.plannedDate, expected: e.certainty === 'unknown' ? null : e.value };
  });
}

interface Cand { slot: string; plannedId: string; actualId: string; score: number }

function agreement(expected: number, actual: number) {
  const m = Math.max(expected, actual);
  return m > 0 ? Math.max(0, 1 - Math.abs(expected - actual) / m) : 0;
}

function greedy(cands: Cand[], takenSlots: Set<string>, takenActuals: Set<string>, out: Map<string, { plannedId: string; confidence: number }>) {
  cands.sort((a, b) => b.score - a.score || (a.plannedId < b.plannedId ? -1 : 1) || (a.actualId < b.actualId ? -1 : 1));
  const frozenS = new Set<string>(), frozenA = new Set<string>();
  for (const c of cands) {
    if (takenSlots.has(c.slot) || takenActuals.has(c.actualId) || frozenS.has(c.slot) || frozenA.has(c.actualId)) continue;
    let alt: number | null = null;
    for (const o of cands) {
      if (o === c || (o.slot !== c.slot && o.actualId !== c.actualId)) continue;
      if (takenSlots.has(o.slot) || takenActuals.has(o.actualId)) continue;
      if (alt === null || o.score > alt) alt = o.score;
    }
    if (alt !== null && c.score - alt < AMBIGUITY) { frozenS.add(c.slot); frozenA.add(c.actualId); continue; }
    takenSlots.add(c.slot);
    takenActuals.add(c.actualId);
    out.set(c.actualId, { plannedId: c.plannedId, confidence: Math.round(c.score * 1000) / 1000 });
  }
}

export interface LinkInfo { plannedId: string | null; type: 'auto' | 'manual' | 'none'; confidence: number | null }
export interface Links {
  /** Rattachement de chaque séance réalisée (absent = aucun). */
  byActual: Map<string, LinkInfo>;
  /** Séances réalisées rattachées à chaque prévu. */
  byPlanned: Map<string, string[]>;
}

export function computeLinks(data: AppData, refs: RefValues): Links {
  const planned = liveRecords(data.planned);
  const actual = liveRecords(data.actual);
  const byActual = new Map<string, LinkInfo>();
  const manualPlanned = new Set<string>();
  const free: ActualSession[] = [];
  for (const a of actual) {
    if (a.manualPlannedId === undefined) { free.push(a); continue; }
    if (a.manualPlannedId === null) byActual.set(a.id, { plannedId: null, type: 'none', confidence: null });
    else if (data.planned[a.manualPlannedId] && !data.planned[a.manualPlannedId].deleted) {
      byActual.set(a.id, { plannedId: a.manualPlannedId, type: 'manual', confidence: null });
      manualPlanned.add(a.manualPlannedId);
    } else free.push(a); // le prévu choisi a disparu : retour à l'automatique
  }
  const slots = planned.filter((p) => !manualPlanned.has(p.id)).flatMap((p) => slotsFor(p, refs));
  const actualsByDay = new Map<string, ActualSession[]>();
  for (const a of free) {
    const d = sessionDay(a);
    if (!actualsByDay.has(d)) actualsByDay.set(d, []);
    actualsByDay.get(d)!.push(a);
  }
  const auto = new Map<string, { plannedId: string; confidence: number }>();
  const takenS = new Set<string>(), takenA = new Set<string>();
  const pass = (shift: number[], base: number) => {
    const cands: Cand[] = [];
    for (const s of slots) {
      const key = s.plannedId + '#' + s.index;
      if (takenS.has(key)) continue;
      for (const k of shift) {
        for (const a of actualsByDay.get(addDays(s.day, k)) ?? []) {
          if (takenA.has(a.id) || asCore(a.discipline) !== s.discipline) continue;
          const score = s.expected === null || a.durationSec <= 0 ? base : base + DURATION_WEIGHT * agreement(s.expected, a.durationSec);
          cands.push({ slot: key, plannedId: s.plannedId, actualId: a.id, score });
        }
      }
    }
    greedy(cands, takenS, takenA, auto);
  };
  pass([0], BASE);
  pass([-1, 1], SHIFTED_BASE);
  for (const [aid, l] of auto) byActual.set(aid, { plannedId: l.plannedId, type: 'auto', confidence: l.confidence });
  const byPlanned = new Map<string, string[]>();
  for (const [aid, l] of byActual) {
    if (!l.plannedId) continue;
    if (!byPlanned.has(l.plannedId)) byPlanned.set(l.plannedId, []);
    byPlanned.get(l.plannedId)!.push(aid);
  }
  return { byActual, byPlanned };
}

/** Prévus proposés au rattachement manuel : ± 3 jours. */
export function linkCandidates(data: AppData, links: Links, actual: ActualSession): { planned: PlannedSession; taken: boolean }[] {
  const day = sessionDay(actual);
  return liveRecords(data.planned)
    .filter((p) => p.plannedDate >= addDays(day, -MANUAL_LINK_WINDOW) && p.plannedDate <= addDays(day, MANUAL_LINK_WINDOW))
    .sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1))
    .map((p) => ({ planned: p, taken: (links.byPlanned.get(p.id) ?? []).some((id) => id !== actual.id) }));
}

// ------------------------------------------------------------------ BRICK spontané (table brick_pair)
const BRICK_DISC: string[] = ['RUN', 'BIKE', 'SWIM'];

export function pairedIds(data: AppData): Set<string> {
  const s = new Set<string>();
  for (const p of liveRecords(data.bricks)) { s.add(p.firstId); s.add(p.secondId); }
  return s;
}

export function findBrickSibling(data: AppData, actual: ActualSession, links?: Links): ActualSession | null {
  if (!BRICK_DISC.includes(actual.discipline)) return null;
  const paired = pairedIds(data);
  if (paired.has(actual.id)) return null;
  const day = sessionDay(actual);
  const sib = liveRecords(data.actual).find((o) => o.id !== actual.id && sessionDay(o) === day && o.discipline !== actual.discipline && BRICK_DISC.includes(o.discipline) && !paired.has(o.id)) ?? null;
  // déjà un enchaînement par le plan : les deux séances sont rattachées au même BRICK prévu, rien à proposer
  const pa = links?.byActual.get(actual.id)?.plannedId, pb = sib ? links?.byActual.get(sib.id)?.plannedId : null;
  if (sib && pa && pa === pb && data.planned[pa]?.discipline === 'BRICK') return null;
  return sib;
}
