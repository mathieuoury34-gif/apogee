// Statistiques par discipline (repris de metrics/disciplineStats.ts) et volumes hebdomadaires.
import { addDays, daysBetween, mondayOf } from './dates';
import type { Links } from './links';
import type { SessionLoad } from './load';
import { latestZone, liveRecords, sessionDay, zoneHistory } from './load';
import type { ActualSession, AppData, CoreDiscipline, PlannedDiscipline, ZoneKind, ZoneReading } from './types';
import { DISCIPLINES } from './types';

export const KCAL_J = 4184;
export const WEEK_BARS = 12;
export const MIN_PACE_SEC = 20 * 60;
export const REFERENCE_OF: Record<PlannedDiscipline, ZoneKind | null> = { RUN: 'vma', BIKE: 'ftp', SWIM: 'css', STRENGTH: null, BRICK: null };
export const perHundred = (d: string) => d === 'SWIM';

export interface WeekBar { start: string; seconds: number; sessions: number; metres: number }
export interface DisciplineStats {
  discipline: PlannedDiscipline;
  sessions: ActualSession[];
  totals: { sessions: number; seconds: number; metres: number; elevation: number; activeKcal: number };
  avgPaceSec: number | null;
  bestPaceSec: number | null;
  avgHr: number | null;
  longestMetres: number | null;
  longestSeconds: number | null;
  weekLoad: number | null;
  weeks: WeekBar[];
  reference: ZoneReading | null;
  referenceHistory: ZoneReading[];
}

export function paceOf(s: Pick<ActualSession, 'durationSec' | 'distanceM' | 'discipline'>): number | null {
  if (!s.distanceM || s.distanceM <= 0 || s.durationSec <= 0) return null;
  if (s.discipline === 'STRENGTH') return null; // une distance de renforcement est un artefact de la montre
  return s.durationSec / (perHundred(s.discipline) ? s.distanceM / 100 : s.distanceM / 1000);
}

export function disciplineStats(data: AppData, loads: Map<string, SessionLoad>, discipline: PlannedDiscipline, todayDay: string, links?: Links): DisciplineStats {
  const weekStart = mondayOf(todayDay);
  const firstMonday = addDays(weekStart, -7 * (WEEK_BARS - 1));
  const weeks: WeekBar[] = Array.from({ length: WEEK_BARS }, (_, i) => ({ start: addDays(firstMonday, 7 * i), seconds: 0, sessions: 0, metres: 0 }));
  let sessions: ActualSession[];
  // enchaînement : les séances d'un même enchaînement forment UN groupe (un enchaînement = une séance « Enchaînement », pas deux)
  const groupOf = new Map<string, number>();
  let groupCount = 0;
  if (discipline === 'BRICK') {
    const groups: string[][] = [];
    for (const p of liveRecords(data.bricks)) if (p.status === 'confirmed') groups.push([p.firstId, p.secondId]);
    // séances rattachées à un enchaînement PRÉVU : c'est un BRICK sans avoir à le confirmer
    if (links) for (const [pid, aids] of links.byPlanned) if (data.planned[pid]?.discipline === 'BRICK' && aids.length > 1) groups.push([...aids]);
    // groupes qui partagent une séance : un seul enchaînement
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r) as string; return r; };
    for (const g of groups) for (const id of g) { if (!parent.has(id)) parent.set(id, id); parent.set(find(id), find(g[0])); }
    const live = new Set(liveRecords(data.actual).map((x) => x.id));
    const roots = new Map<string, number>();
    for (const id of parent.keys()) { if (!live.has(id)) continue; const r = find(id); if (!roots.has(r)) roots.set(r, roots.size); groupOf.set(id, roots.get(r) as number); }
    groupCount = roots.size;
    sessions = liveRecords(data.actual).filter((s) => groupOf.has(s.id));
  } else sessions = liveRecords(data.actual).filter((s) => s.discipline === discipline);
  sessions.sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  const totals = { sessions: discipline === 'BRICK' ? groupCount : sessions.length, seconds: 0, metres: 0, elevation: 0, activeKcal: 0 };
  let pacedSec = 0, pacedM = 0, hrSec = 0, hrW = 0, weekLoad: number | null = null;
  let best: number | null = null, longM: number | null = null, longS: number | null = null;
  const groupSec = new Map<number, number>(), groupSeen = new Set<number>();
  for (const s of sessions) {
    const day = sessionDay(s);
    totals.seconds += s.durationSec;
    if (s.distanceM) totals.metres += s.distanceM;
    if (s.elevationGainM) totals.elevation += s.elevationGainM;
    if (s.activeCaloriesJ) totals.activeKcal += s.activeCaloriesJ / KCAL_J;
    const pace = discipline === 'BRICK' ? null : paceOf(s);
    if (pace !== null && s.distanceM) {
      pacedSec += s.durationSec; pacedM += s.distanceM;
      if (s.durationSec >= MIN_PACE_SEC && (best === null || pace < best)) best = pace;
      if (longM === null || s.distanceM > longM) longM = s.distanceM;
    }
    const gid = groupOf.get(s.id);
    const secs = gid === undefined ? s.durationSec : (groupSec.set(gid, (groupSec.get(gid) ?? 0) + s.durationSec), groupSec.get(gid) as number);
    if (longS === null || secs > longS) longS = secs;
    if (s.avgHrBpm) { hrSec += s.durationSec; hrW += s.avgHrBpm * s.durationSec; }
    const l = loads.get(s.id);
    if (l?.load != null && day >= weekStart) weekLoad = (weekLoad ?? 0) + l.load;
    const bar = weeks.find((w) => w.start === mondayOf(day));
    if (bar) { bar.seconds += s.durationSec; if (gid === undefined || !groupSeen.has(gid)) bar.sessions++; bar.metres += s.distanceM ?? 0; }
    if (gid !== undefined) groupSeen.add(gid);
  }
  const units = perHundred(discipline) ? pacedM / 100 : pacedM / 1000;
  const refKind = REFERENCE_OF[discipline];
  return {
    discipline, sessions, totals,
    avgPaceSec: discipline !== 'BRICK' && units > 0 ? pacedSec / units : null,
    bestPaceSec: best, avgHr: hrSec ? hrW / hrSec : null,
    longestMetres: discipline === 'BRICK' ? null : longM, longestSeconds: longS,
    weekLoad, weeks,
    reference: refKind ? latestZone(data, refKind) : null,
    referenceHistory: refKind ? zoneHistory(data, refKind) : [],
  };
}

export interface Overview { firstDay: string | null; weeks: number; sessions: number; seconds: number; metres: number; elevation: number; activeKcal: number }
export function overview(data: AppData, todayDay: string): Overview {
  const rows = liveRecords(data.actual).filter((s) => s.discipline !== 'OTHER');
  if (!rows.length) return { firstDay: null, weeks: 0, sessions: 0, seconds: 0, metres: 0, elevation: 0, activeKcal: 0 };
  let first = '9999', seconds = 0, metres = 0, elevation = 0, activeJ = 0;
  for (const s of rows) { const d = sessionDay(s); if (d < first) first = d; seconds += s.durationSec; metres += s.distanceM ?? 0; elevation += s.elevationGainM ?? 0; activeJ += s.activeCaloriesJ ?? 0; }
  return { firstDay: first, weeks: Math.max(1, Math.ceil((daysBetween(first, todayDay) + 1) / 7)), sessions: rows.length, seconds, metres, elevation, activeKcal: activeJ / KCAL_J };
}

/** Volume (secondes) par semaine et par discipline, pour les N dernières semaines. */
export function weeklyVolume(data: AppData, todayDay: string, n: number, fromDay?: string): { start: string; byDiscipline: Record<string, number>; total: number }[] {
  const last = mondayOf(todayDay);
  const out = Array.from({ length: n }, (_, i) => ({ start: addDays(last, -7 * (n - 1 - i)), byDiscipline: {} as Record<string, number>, total: 0 }));
  const idx = new Map(out.map((w, i) => [w.start, i]));
  for (const s of liveRecords(data.actual)) {
    const day = sessionDay(s);
    if (fromDay && (day < fromDay || day > todayDay)) continue;
    const i = idx.get(mondayOf(day));
    if (i === undefined) continue;
    out[i].byDiscipline[s.discipline] = (out[i].byDiscipline[s.discipline] ?? 0) + s.durationSec;
    out[i].total += s.durationSec;
  }
  return out;
}

/** Temps et distance par discipline sur une période (jours inclus). La distance du renforcement est un artefact de la montre : elle n'est jamais comptée. */
export function periodTotals(data: AppData, fromDay: string, toDay: string): { seconds: Record<string, number>; metres: Record<string, number> } {
  const seconds: Record<string, number> = {}, metres: Record<string, number> = {};
  for (const s of liveRecords(data.actual)) {
    const day = sessionDay(s);
    if (day < fromDay || day > toDay) continue;
    seconds[s.discipline] = (seconds[s.discipline] ?? 0) + s.durationSec;
    if (s.discipline !== 'STRENGTH' && s.distanceM && s.distanceM > 0) metres[s.discipline] = (metres[s.discipline] ?? 0) + s.distanceM;
  }
  return { seconds, metres };
}

export const CORE: CoreDiscipline[] = [...DISCIPLINES];
