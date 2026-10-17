// Respect du plan : part des séances prévues réellement faites, et part du temps prévu réalisé, par semaine
// et par mois. Seules les séances dont la date est passée (ou aujourd'hui) comptent ; une séance prévue un jour
// couvert par une interruption n'est pas comptée comme manquée.
import { estimateDuration, type RefValues } from './blocks';
import { addDays, mondayOf, monthOf } from './dates';
import type { Links } from './links';
import { liveRecords } from './load';
import type { AppData } from './types';

export interface Compliance {
  key: string;
  /** Séances prévues échues (hors interruption). */
  planned: number;
  /** Parmi elles, celles qui ont une séance réalisée rattachée. */
  done: number;
  /** Durée prévue / réalisée sur les seules séances dont la durée prévue est connue. */
  plannedSec: number;
  doneSec: number;
}

export interface ComplianceReport { weeks: Compliance[]; months: Compliance[]; last4: Compliance }

const blank = (key: string): Compliance => ({ key, planned: 0, done: 0, plannedSec: 0, doneSec: 0 });

export function planCompliance(data: AppData, links: Links, refs: RefValues, todayDay: string, nWeeks = 12, nMonths = 6): ComplianceReport {
  const firstWeek = addDays(mondayOf(todayDay), -7 * (nWeeks - 1));
  const weeks = new Map<string, Compliance>();
  const months = new Map<string, Compliance>();
  const last4 = blank('last4');
  const monthFloor = monthOf(addDays(todayDay, -31 * (nMonths - 1)));
  const ints = liveRecords(data.interruptions);
  for (const p of liveRecords(data.planned)) {
    if (p.plannedDate > todayDay) continue;
    if (ints.some((i) => i.startDate <= p.plannedDate && p.plannedDate <= i.endDate)) continue;
    const est = estimateDuration(p.blocks, p.discipline, refs);
    const known = est.certainty !== 'unknown' && est.value > 0;
    const linked = links.byPlanned.get(p.id) ?? [];
    const done = linked.length > 0;
    const doneSec = linked.reduce((t, id) => t + (data.actual[id]?.durationSec ?? 0), 0);
    const buckets: Compliance[] = [];
    const wk = mondayOf(p.plannedDate), mo = monthOf(p.plannedDate);
    if (wk >= firstWeek) { if (!weeks.has(wk)) weeks.set(wk, blank(wk)); buckets.push(weeks.get(wk)!); }
    if (mo >= monthFloor) { if (!months.has(mo)) months.set(mo, blank(mo)); buckets.push(months.get(mo)!); }
    if (p.plannedDate > addDays(todayDay, -28)) buckets.push(last4);
    for (const b of buckets) {
      b.planned++;
      if (done) b.done++;
      if (known) { b.plannedSec += est.value; b.doneSec += doneSec; }
    }
  }
  const sorted = (m: Map<string, Compliance>) => [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return { weeks: sorted(weeks), months: sorted(months), last4 };
}
