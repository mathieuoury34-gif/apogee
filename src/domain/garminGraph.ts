// Reprise des graphes Garmin Connect (pas, étages, calories, prédictions de course) mesurés à partir de captures d'écran.
// Fusion « sans rien écraser » : un jour déjà lu dans Health Connect garde ses valeurs, on ne comble que ce qui manque.
import { mondayOf, today } from './dates';
import { nowIso } from './ids';
import { emptyCheckin } from './checkin';
import { dayEnergy } from './energy';
import type { AppData, Checkin, EnergyDay, EnergyPart, SleepNight } from './types';

export const GRAPH_FORMAT = 'apogee-garmin/1';
/** Version « correctif » : les valeurs de Garmin Connect remplacent celles de Health Connect quand elles divergent nettement (et ne sont plus écrasées ensuite). */
export const GRAPH_FORMAT_V2 = 'apogee-garmin/2';

export interface GraphEnergyDay { day: string; totalKcal?: number | null; restKcal?: number | null; steps?: number | null; floors?: number | null }
/** Un relevé de la montre un jour donné : VO₂max (1 décimale), seuil de lactate, prédictions de course (secondes). */
export interface GraphPrediction { day: string; vo2max?: number | null; lthrBpm?: number | null; lthPaceSecKm?: number | null; pred5kSec?: number | null; pred10kSec?: number | null; predHalfSec?: number | null; predMarathonSec?: number | null }
/** Une nuit de Garmin Connect : jour du réveil et durée réellement endormie. */
export interface GraphSleep { night: string; durationMin: number }
export interface GarminGraphFile { format: typeof GRAPH_FORMAT | typeof GRAPH_FORMAT_V2; note?: string; energy?: GraphEnergyDay[]; sleep?: GraphSleep[]; predictions?: GraphPrediction[] }
export interface GraphReport { energyAdded: number; energyFilled: number; energyKept: number; checkinsAdded: number; checkinsFilled: number; checkinsKept: number }

export function isGarminGraph(j: unknown): j is GarminGraphFile {
  const f = j as Partial<GarminGraphFile> | null;
  return !!f && typeof f === 'object' && (f.format === GRAPH_FORMAT || f.format === GRAPH_FORMAT_V2);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const vo2 = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 15 && v <= 90 ? Math.round(v * 10) / 10 : null);

// ------------------------------------------------------------------ relevés hebdomadaires de la montre (VO₂max, seuil, prédictions)
const READING_KEYS = ['vo2max', 'lthrBpm', 'lthPaceSecKm', 'pred5kSec', 'pred10kSec', 'predHalfSec', 'predMarathonSec'] as const;
type ReadingKey = (typeof READING_KEYS)[number];

/**
 * Un point par semaine : pour chaque valeur, le relevé le plus tardif de la semaine (en pratique le dimanche, ou le jour le plus récent de la semaine en cours).
 * `fill` ne comble que ce qui manque ; `replace` remplace les valeurs de l'appli quand elles diffèrent de celles de Garmin (la montre fait foi).
 */
function mergeReadings(data: AppData, rows: GraphPrediction[] | undefined, mode: 'fill' | 'replace'): { checkins: Checkin[]; added: number; filled: number; kept: number } {
  const now = nowIso(), limit = today();
  const weeks = new Map<string, { day: string; vals: Partial<Record<ReadingKey, { v: number; day: string }>> }>();
  for (const p of rows ?? []) {
    if (!DAY.test(p.day) || p.day > limit) continue;
    const got: Record<ReadingKey, number | null> = { vo2max: vo2(p.vo2max), lthrBpm: num(p.lthrBpm), lthPaceSecKm: num(p.lthPaceSecKm), pred5kSec: num(p.pred5kSec), pred10kSec: num(p.pred10kSec), predHalfSec: num(p.predHalfSec), predMarathonSec: num(p.predMarathonSec) };
    const week = mondayOf(p.day);
    for (const k of READING_KEYS) {
      const v = got[k];
      if (v === null) continue;
      const w = weeks.get(week) ?? { day: p.day, vals: {} };
      const prev = w.vals[k];
      if (!prev || prev.day < p.day) w.vals[k] = { v, day: p.day };
      if (w.day < p.day) w.day = p.day;
      weeks.set(week, w);
    }
  }
  const checkins: Checkin[] = [];
  let added = 0, filled = 0, kept = 0;
  for (const [week, { day, vals }] of weeks) {
    const cur = data.checkins[week] && !data.checkins[week].deleted ? data.checkins[week] : null;
    if (!cur) {
      const fresh: Checkin = { ...emptyCheckin(week), day, updatedAt: now };
      for (const k of READING_KEYS) { const r = vals[k]; if (r) fresh[k] = r.v; }
      checkins.push(fresh); added++; continue;
    }
    const next: Checkin = { ...cur, updatedAt: now };
    let changed = false;
    for (const k of READING_KEYS) {
      const r = vals[k];
      if (!r) continue;
      if (cur[k] === null || cur[k] === undefined) { next[k] = r.v; changed = true; }
      else if (mode === 'replace' && cur[k] !== r.v) { next[k] = r.v; changed = true; }
    }
    if (changed) { if (mode === 'replace' || !cur.day) next.day = day; checkins.push(next); filled++; } else kept++;
  }
  return { checkins, added, filled, kept };
}

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
  const { checkins, added, filled, kept } = mergeReadings(data, file.predictions, 'fill');
  report.checkinsAdded = added; report.checkinsFilled = filled; report.checkinsKept = kept;
  return { energy, checkins, report };
}

export function graphMessage(r: GraphReport): string {
  const parts: string[] = [];
  if (r.energyAdded) parts.push(`${r.energyAdded} jour(s) de pas, étages et calories ajouté(s)`);
  if (r.energyFilled) parts.push(`${r.energyFilled} complété(s)`);
  if (r.energyKept) parts.push(`${r.energyKept} déjà lu(s) sur la montre, laissé(s) tel(s) quel(s)`);
  if (r.checkinsAdded) parts.push(`${r.checkinsAdded} point(s) de la semaine (seuil, prédictions) ajouté(s)`);
  if (r.checkinsFilled) parts.push(`${r.checkinsFilled} complété(s)`);
  return parts.join(', ');
}


// ------------------------------------------------------------------ version correctif (apogee-garmin/2)
export interface CorrectionReport {
  kcalFixed: number; stepsFixed: number; floorsFixed: number; daysAdded: number;
  sleepFixed: number; sleepAdded: number; kept: number; handKept: number;
  /** Points hebdomadaires créés / dont des valeurs ont été remplacées par celles de Garmin. */
  checkinsAdded: number; checkinsFixed: number;
}
/** Écarts jugés nets (le relevé sur graphique est exact à environ 1 %). */
export const FIX_KCAL_TOTAL = 0.03, FIX_KCAL_MIN = 60, FIX_KCAL_ACTIVE = 60, FIX_STEPS_RATIO = 0.04, FIX_STEPS_MIN = 400, FIX_FLOORS = 2, FIX_SLEEP_MIN = 10;

export function correctFromGarmin(data: AppData, file: GarminGraphFile, offsetMin: number = -new Date().getTimezoneOffset()): { energy: EnergyDay[]; sleep: SleepNight[]; checkins: Checkin[]; report: CorrectionReport } {
  const report: CorrectionReport = { kcalFixed: 0, stepsFixed: 0, floorsFixed: 0, daysAdded: 0, sleepFixed: 0, sleepAdded: 0, kept: 0, handKept: 0, checkinsAdded: 0, checkinsFixed: 0 };
  const now = nowIso(), limit = today();
  const energy: EnergyDay[] = [];
  for (const g of file.energy ?? []) {
    if (!DAY.test(g.day) || g.day > limit) continue;
    const total = num(g.totalKcal), rest = num(g.restKcal), steps = num(g.steps), floors = num(g.floors);
    const live = data.energy[g.day] && !data.energy[g.day].deleted ? data.energy[g.day] : null;
    const next: EnergyDay = live ? { ...live, updatedAt: now } : { id: g.day, updatedAt: now, day: g.day, activeKcal: null, totalKcal: null, source: 'health' };
    const edited = new Set<EnergyPart>(live?.edited ?? []);
    let changed = false, hand = false;
    if (total !== null && rest !== null && total > 0) {
      const active = Math.max(0, total - rest);
      if (edited.has('kcal')) hand = true;
      else {
        const cur = dayEnergy(data, g.day, 1440);
        if (cur.total === null || Math.abs(cur.total - total) > Math.max(FIX_KCAL_MIN, FIX_KCAL_TOTAL * total) || cur.active === null || Math.abs(cur.active - active) > FIX_KCAL_ACTIVE) {
          next.totalKcal = total; next.activeKcal = active; next.basalKcal = rest; edited.add('kcal'); report.kcalFixed++; changed = true;
        }
      }
    }
    if (steps !== null && steps > 0) {
      if (edited.has('steps')) hand = true;
      else if (!live?.steps || Math.abs(live.steps - steps) > Math.max(FIX_STEPS_MIN, FIX_STEPS_RATIO * steps)) { next.steps = steps; edited.add('steps'); report.stepsFixed++; changed = true; }
    }
    if (floors !== null && floors > 0) {
      if (edited.has('floors')) hand = true;
      else if (!live?.floors || Math.abs(live.floors - floors) >= FIX_FLOORS) { next.floors = floors; edited.add('floors'); report.floorsFixed++; changed = true; }
    }
    if (changed) { next.edited = [...edited]; energy.push(next); if (!live) report.daysAdded++; }
    else if (hand) report.handKept++;
    else report.kept++;
  }
  const sleep: SleepNight[] = [];
  for (const n of file.sleep ?? []) {
    if (!DAY.test(n.night) || n.night > limit || !(n.durationMin >= 30 && n.durationMin <= 1000)) continue;
    const durationSec = Math.round(n.durationMin) * 60;
    const live = data.sleep[n.night] && !data.sleep[n.night].deleted ? data.sleep[n.night] : null;
    if (live?.edited) { report.handKept++; continue; }
    if (live && Math.abs(live.durationSec - durationSec) < FIX_SLEEP_MIN * 60) { report.kept++; continue; }
    // on garde l'heure du lever de la montre ; le coucher est déduit de la durée de Garmin Connect
    const endMs = live ? Date.parse(live.endAt) : Date.parse(n.night + 'T07:00:00Z') - offsetMin * 60_000;
    sleep.push({ id: n.night, updatedAt: now, nightDate: n.night, startAt: new Date(endMs - durationSec * 1000).toISOString(), endAt: new Date(endMs).toISOString(), zoneOffsetMinutes: live?.zoneOffsetMinutes ?? offsetMin, durationSec, fromStages: true, edited: true, sourceId: 'garmin-graph' });
    if (live) report.sleepFixed++; else report.sleepAdded++;
  }
  // VO₂max, seuil et prédictions : la montre fait foi, ses valeurs remplacent celles de l'appli quand elles diffèrent
  const m = mergeReadings(data, file.predictions, 'replace');
  report.checkinsAdded = m.added; report.checkinsFixed = m.filled;
  return { energy, sleep, checkins: m.checkins, report };
}

export function correctionMessage(r: CorrectionReport): string {
  const parts: string[] = [];
  if (r.kcalFixed) parts.push(`${r.kcalFixed} jour(s) de calories corrigé(s)`);
  if (r.stepsFixed) parts.push(`${r.stepsFixed} de pas`);
  if (r.floorsFixed) parts.push(`${r.floorsFixed} d’étages`);
  if (r.sleepFixed) parts.push(`${r.sleepFixed} nuit(s) corrigée(s)`);
  if (r.sleepAdded) parts.push(`${r.sleepAdded} nuit(s) ajoutée(s) (lever à 7 h par défaut)`);
  if (r.checkinsAdded) parts.push(`${r.checkinsAdded} point(s) de la semaine ajouté(s) (VO₂max, prédictions)`);
  if (r.checkinsFixed) parts.push(`${r.checkinsFixed} point(s) de la semaine mis à jour d’après Garmin`);
  if (r.kept) parts.push(`${r.kept} valeur(s) déjà conformes`);
  if (r.handKept) parts.push(`${r.handKept} saisie(s) à la main conservée(s)`);
  return parts.join(', ');
}
