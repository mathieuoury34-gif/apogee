// Reprise des graphes Garmin Connect (pas, étages, calories, prédictions de course) mesurés à partir de captures d'écran.
// Fusion « sans rien écraser » : un jour déjà lu dans Health Connect garde ses valeurs, on ne comble que ce qui manque.
import { mondayOf, today } from './dates';
import { nowIso } from './ids';
import { emptyCheckin } from './checkin';
import type { AppData, Checkin, EnergyDay } from './types';

export const GRAPH_FORMAT = 'apogee-garmin/1';

export interface GraphEnergyDay { day: string; totalKcal?: number | null; restKcal?: number | null; steps?: number | null; floors?: number | null }
export interface GraphPrediction { day: string; pred5kSec?: number | null; pred10kSec?: number | null; predHalfSec?: number | null; predMarathonSec?: number | null }
export interface GarminGraphFile { format: typeof GRAPH_FORMAT; note?: string; energy?: GraphEnergyDay[]; predictions?: GraphPrediction[] }
export interface GraphReport { energyAdded: number; energyFilled: number; energyKept: number; checkinsAdded: number; checkinsFilled: number; checkinsKept: number }

export function isGarminGraph(j: unknown): j is GarminGraphFile {
  const f = j as Partial<GarminGraphFile> | null;
  return !!f && typeof f === 'object' && f.format === GRAPH_FORMAT;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export function mergeGarminGraph(data: AppData, file: GarminGraphFile): { energy: EnergyDay[]; checkins: Checkin[]; report: GraphReport } {
  const report: GraphReport = { energyAdded: 0, energyFilled: 0, energyKept: 0, checkinsAdded: 0, checkinsFilled: 0, checkinsKept: 0 };
  const now = nowIso(), limit = today();
  const energy: EnergyDay[] = [];
  for (const g of file.energy ?? []) {
    if (!DAY.test(g.day) || g.day > limit) continue;
    const total = num(g.totalKcal), rest = num(g.restKcal), steps = num(g.steps), floors = num(g.floors);
    const active = total !== null && rest !== null ? Math.max(0, total - rest) : null;
    const cur = data.energy[g.day] && !data.energy[g.day].deleted ? data.energy[g.day] : null;
    if (!cur) {
      if (total === null && steps === null && floors === null) continue;
      energy.push({ id: g.day, updatedAt: now, day: g.day, activeKcal: active, totalKcal: total, basalKcal: rest, steps, floors, source: 'health' });
      report.energyAdded++;
      continue;
    }
    const next: EnergyDay = { ...cur, updatedAt: now };
    let filled = false;
    const fill = <K extends 'activeKcal' | 'totalKcal' | 'basalKcal' | 'steps' | 'floors'>(k: K, v: number | null) => {
      if (v !== null && (cur[k] === null || cur[k] === undefined || cur[k] === 0)) { next[k] = v as EnergyDay[K]; filled = true; }
    };
    // les calories vont ensemble : on ne mélange pas un total lu et un repos importé
    if (cur.totalKcal === null || cur.totalKcal === undefined) { fill('totalKcal', total); fill('activeKcal', active); fill('basalKcal', rest); }
    fill('steps', steps); fill('floors', floors);
    if (filled) { energy.push(next); report.energyFilled++; } else report.energyKept++;
  }
  const checkins: Checkin[] = [];
  // une fiche par semaine : on retient le relevé le plus tardif de chaque semaine (en pratique le dimanche)
  const latest = new Map<string, { day: string; vals: Record<'pred5kSec' | 'pred10kSec' | 'predHalfSec' | 'predMarathonSec', number | null> }>();
  for (const p of file.predictions ?? []) {
    if (!DAY.test(p.day) || p.day > limit) continue;
    const vals = { pred5kSec: num(p.pred5kSec), pred10kSec: num(p.pred10kSec), predHalfSec: num(p.predHalfSec), predMarathonSec: num(p.predMarathonSec) };
    if (Object.values(vals).every((v) => v === null)) continue;
    const week = mondayOf(p.day), prev = latest.get(week);
    if (!prev || prev.day < p.day) latest.set(week, { day: p.day, vals });
  }
  for (const [week, { day, vals }] of latest) {
    const cur = data.checkins[week] && !data.checkins[week].deleted ? data.checkins[week] : null;
    if (!cur) { checkins.push({ ...emptyCheckin(week), day, ...vals, updatedAt: now }); report.checkinsAdded++; continue; }
    const next: Checkin = { ...cur, updatedAt: now };
    let filled = false;
    for (const k of Object.keys(vals) as (keyof typeof vals)[]) if (vals[k] !== null && cur[k] === null) { next[k] = vals[k]; filled = true; }
    if (filled) { checkins.push(next); report.checkinsFilled++; } else report.checkinsKept++;
  }
  return { energy, checkins, report };
}

export function graphMessage(r: GraphReport): string {
  const parts: string[] = [];
  if (r.energyAdded) parts.push(`${r.energyAdded} jour(s) de pas, étages et calories ajouté(s)`);
  if (r.energyFilled) parts.push(`${r.energyFilled} complété(s)`);
  if (r.energyKept) parts.push(`${r.energyKept} déjà lu(s) sur la montre, laissé(s) tel(s) quel(s)`);
  if (r.checkinsAdded) parts.push(`${r.checkinsAdded} point(s) de la semaine avec prédictions ajouté(s)`);
  if (r.checkinsFilled) parts.push(`${r.checkinsFilled} complété(s)`);
  return parts.join(', ');
}
