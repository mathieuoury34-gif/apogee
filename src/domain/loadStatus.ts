// Lecture « à la Garmin » de la charge : charge aiguë (7 jours) avec son entonnoir optimal, rapport de charge,
// statut d'entraînement par semaine et répartition de la charge (faible aérobie / aérobie élevée / anaérobie).
// Ce sont des ESTIMATIONS d'Apogée calculées sur ta propre charge (modèle d’effort de hr.ts) : Garmin utilise d'autres données
// et d'autres seuils, les chiffres ne sont pas comparables un à un.
import { addDays, mondayOf } from './dates';
import { analyzeHr, epocRate } from './hr';
import { liveRecords, sessionDay, type DayLoad, type SessionLoad } from './load';
import { ZONE_DISCIPLINES, zoneTimes } from './zones';
import type { AppData } from './types';

/** Rapport aigu/chronique : sous 0,8 = charge basse, 0,8–1,3 = optimal, 1,3–1,5 = élevé, au-delà = très élevé. */
export const RATIO_LOW = 0.8, RATIO_OPT_HIGH = 1.3, RATIO_HIGH = 1.5;

export interface AcutePoint {
  day: string;
  /** Charge cumulée des 7 derniers jours. */
  acute: number;
  /** Charge hebdomadaire moyenne des 28 derniers jours (null avant 28 jours d'historique). */
  chronic: number | null;
  /** Entonnoir : bas et haut de la zone optimale, et seuil de la zone « élevée ». */
  lo: number | null; hi: number | null; top: number | null;
  ratio: number | null;
}

/** Série aiguë / chronique sur toute la liste de jours (consécutifs). */
export function acuteSeries(days: DayLoad[]): AcutePoint[] {
  const out: AcutePoint[] = [];
  let acute = 0, chron = 0;
  for (let i = 0; i < days.length; i++) {
    acute += days[i].load; chron += days[i].load;
    if (i >= 7) acute -= days[i - 7].load;
    if (i >= 28) chron -= days[i - 28].load;
    const chronic = i >= 27 ? chron / 4 : null;
    out.push({
      day: days[i].day, acute, chronic,
      lo: chronic === null ? null : chronic * RATIO_LOW, hi: chronic === null ? null : chronic * RATIO_OPT_HIGH, top: chronic === null ? null : chronic * RATIO_HIGH,
      ratio: chronic !== null && chronic > 0 ? acute / chronic : null,
    });
  }
  return out;
}

export type StatusKey = 'productive' | 'maintaining' | 'recovery' | 'unproductive' | 'detraining' | 'high' | 'overreaching';
export const STATUS_ORDER: StatusKey[] = ['productive', 'maintaining', 'recovery', 'unproductive', 'detraining', 'high', 'overreaching'];

/** Statut d'entraînement simplifié : le rapport de charge dit si la charge est dans la zone, la tendance de la forme de fond dit si elle porte ses fruits. */
export function statusOf(ratio: number | null, fitnessDelta: number | null): StatusKey | null {
  if (ratio === null) return null;
  const fd = fitnessDelta ?? 0;
  if (ratio > RATIO_HIGH) return 'overreaching';
  if (ratio > RATIO_OPT_HIGH) return 'high';
  if (ratio >= RATIO_LOW) return fd >= 1 ? 'productive' : fd <= -1 ? 'unproductive' : 'maintaining';
  return ratio < 0.5 && fd < -1 ? 'detraining' : 'recovery';
}

export interface WeekStatus { start: string; load: number; ratio: number | null; fitnessDelta: number | null; status: StatusKey | null; partial: boolean; /** Case d'un jour (et non d'une semaine) : `load` est alors la charge des 7 derniers jours. */ daily?: boolean }

/** Statut de chacune des `n` dernières semaines (lundi→dimanche), évalué au dernier jour de la semaine (ou à aujourd'hui pour la semaine en cours). */
export function weeklyStatus(days: DayLoad[], today: string, n: number): WeekStatus[] {
  const pts = acuteSeries(days);
  const idx = new Map(days.map((d, i) => [d.day, i]));
  const last = mondayOf(today);
  const out: WeekStatus[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const start = addDays(last, -7 * k);
    const end = addDays(start, 6);
    const partial = end >= today;
    const endDay = partial ? today : end;
    const ie = idx.get(endDay);
    let load = 0;
    for (let d = start; d <= endDay; d = addDays(d, 1)) { const i = idx.get(d); if (i !== undefined) load += days[i].load; }
    if (ie === undefined) { out.push({ start, load, ratio: null, fitnessDelta: null, status: null, partial }); continue; }
    const prev = ie >= 7 ? days[ie - 7] : null;
    const fitnessDelta = prev ? days[ie].fitness - prev.fitness : null;
    const ratio = pts[ie].ratio;
    out.push({ start, load, ratio, fitnessDelta, status: statusOf(ratio, fitnessDelta), partial });
  }
  return out;
}

/** Statut de chacun des `n` derniers jours jusqu'à `endDay` : même règle que par semaine, évaluée chaque jour (charge des 7 jours glissants, forme de fond comparée à 7 jours avant). */
export function dailyStatus(days: DayLoad[], endDay: string, n: number): WeekStatus[] {
  const pts = acuteSeries(days);
  const idx = new Map(days.map((d, i) => [d.day, i]));
  const out: WeekStatus[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const day = addDays(endDay, -k);
    const i = idx.get(day);
    if (i === undefined) { out.push({ start: day, load: 0, ratio: null, fitnessDelta: null, status: null, partial: false, daily: true }); continue; }
    const prev = i >= 7 ? days[i - 7] : null;
    const fitnessDelta = prev ? days[i].fitness - prev.fitness : null;
    out.push({ start: day, load: pts[i].acute, ratio: pts[i].ratio, fitnessDelta, status: statusOf(pts[i].ratio, fitnessDelta), partial: false, daily: true });
  }
  return out;
}

export interface LoadFocus { low: number; high: number; anaerobic: number; total: number; used: number; skipped: number }
/** Repères génériques (part de la charge) d'une semaine équilibrée. Ce n'est pas une prescription. */
export const FOCUS_REF = { low: [0.5, 0.75], high: [0.2, 0.4], anaerobic: [0.02, 0.15] } as const;

/** Poids de chaque zone dans la charge : la charge par minute du modèle d'effort (hr.ts) au centre de la zone. Une minute en zone 5 pèse ≈ 25 fois une minute en zone 1. */
export const ZONE_LOAD_WEIGHT = [0.55, 0.65, 0.75, 0.85, 0.95].map(epocRate);

/**
 * Répartition de la charge des `span` derniers jours. Endurance : la charge de chaque séance est partagée selon le temps passé dans chaque zone de FC,
 * pondéré par le poids de la zone (une minute intense pèse plus qu'une minute facile) : Z1–Z3 = faible aérobie, Z4 = aérobie élevée, Z5 = anaérobie.
 * Renforcement : sa charge compte en anaérobie (effort de force, comme dans Garmin Connect).
 */
export function loadFocus(data: AppData, loads: Map<string, SessionLoad>, hrMax: number | null, today: string, span = 28): LoadFocus {
  const out: LoadFocus = { low: 0, high: 0, anaerobic: 0, total: 0, used: 0, skipped: 0 };
  const from = addDays(today, -(span - 1));
  for (const s of liveRecords(data.actual)) {
    const day = sessionDay(s);
    if (day < from || day > today) continue;
    const load = loads.get(s.id)?.load ?? null;
    if (!(load && load > 0)) continue;
    if (s.discipline === 'STRENGTH') { out.anaerobic += load; out.total += load; out.used++; continue; }
    if (!hrMax || !ZONE_DISCIPLINES.includes(s.discipline)) continue;
    const ser = data.series[s.id];
    const hr = ser && !ser.deleted ? analyzeHr(ser.hr).clean : [];
    let e = 0, h = 0, a = 0;
    if (hr.length >= 10) {
      const z = zoneTimes(hr, hrMax);
      const w = z.map((t, i) => t * ZONE_LOAD_WEIGHT[i]);
      const tot = w.reduce((t, v) => t + v, 0);
      if (tot > 0) { e = (w[0] + w[1] + w[2]) / tot; h = w[3] / tot; a = w[4] / tot; }
    } else if (s.avgHrBpm) {
      const r = s.avgHrBpm / hrMax;
      if (r < 0.8) e = 1; else if (r < 0.9) h = 1; else a = 1;
    }
    if (e + h + a === 0) { out.skipped++; continue; }
    out.low += load * e; out.high += load * h; out.anaerobic += load * a; out.total += load; out.used++;
  }
  return out;
}
