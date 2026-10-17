// Bilan de semaine : volume par discipline (prévu / réalisé), séances, charge et tendance.
// Sert l'écran « Analyse » et un texte prêt à coller dans la conversation avec le coach.
import { estimateDuration } from './blocks';
import type { Derived } from './engine';
import { addDays, mondayOf } from './dates';
import { liveRecords, sessionDay } from './load';
import type { AppData } from './types';

export interface WeekDiscipline { key: string; plannedSec: number; doneSec: number; sessions: number }
export interface WeekSummary {
  start: string; end: string; partial: boolean;
  disciplines: WeekDiscipline[];
  plannedSessions: number; doneSessions: number;
  load: number; previousLoad: number | null;
  fitness: number | null; fitnessDelta: number | null; freshness: number | null; acwr: number | null;
  interruption: string | null;
}

const ORDER = ['SWIM', 'BIKE', 'RUN', 'STRENGTH', 'OTHER'];

export function weekSummary(data: AppData, d: Derived, start: string): WeekSummary {
  const end = addDays(start, 6);
  const last = end < d.today ? end : d.today;
  const by = new Map<string, WeekDiscipline>();
  const row = (k: string) => { let r = by.get(k); if (!r) by.set(k, (r = { key: k, plannedSec: 0, doneSec: 0, sessions: 0 })); return r; };
  let plannedSessions = 0, doneSessions = 0;
  for (const p of liveRecords(data.planned)) {
    if (p.plannedDate < start || p.plannedDate > end) continue;
    plannedSessions++;
    if (d.links.byPlanned.has(p.id)) doneSessions++;
    const parts = p.discipline === 'BRICK'
      ? [...new Set(p.blocks.map((b) => b.discipline).filter((x): x is NonNullable<typeof x> => !!x))].map((x) => ({ k: x as string, blocks: p.blocks.filter((b) => b.discipline === x), disc: x }))
      : [{ k: p.discipline as string, blocks: p.blocks, disc: p.discipline }];
    for (const part of parts) {
      const e = estimateDuration(part.blocks, part.disc, d.refs);
      if (e.certainty !== 'unknown') row(part.k).plannedSec += e.value;
    }
  }
  for (const s of liveRecords(data.actual)) {
    const day = sessionDay(s);
    if (day < start || day > end) continue;
    const r = row(s.discipline);
    r.doneSec += s.durationSec; r.sessions++;
  }
  const loadOf = (from: string) => { let t = 0; for (let k = 0; k < 7; k++) t += d.series.byDay.get(addDays(from, k))?.load ?? 0; return t; };
  const lastRow = d.series.byDay.get(last);
  const prev = d.series.byDay.get(addDays(start, -1));
  const prevStart = addDays(start, -7);
  const hasPrev = d.series.firstDay !== null && d.series.firstDay <= prevStart;
  const inter = liveRecords(data.interruptions).find((i) => i.startDate <= end && i.endDate >= start);
  const acwr = (() => {
    if (!lastRow || d.series.days.length < 28) return null;
    let a = 0, c = 0;
    for (let k = 0; k < 28; k++) { const l = d.series.byDay.get(addDays(last, -k))?.load ?? 0; c += l; if (k < 7) a += l; }
    return c > 0 ? a / (c / 4) : null;
  })();
  return {
    start, end, partial: end > d.today,
    disciplines: [...by.values()].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)).filter((r) => r.plannedSec || r.doneSec),
    plannedSessions, doneSessions,
    load: loadOf(start), previousLoad: hasPrev ? loadOf(prevStart) : null,
    fitness: lastRow?.fitness ?? null, fitnessDelta: lastRow && prev ? lastRow.fitness - prev.fitness : null,
    freshness: lastRow?.freshness ?? null, acwr,
    interruption: inter?.label ?? null,
  };
}

export const thisWeek = (d: Derived) => mondayOf(d.today);
