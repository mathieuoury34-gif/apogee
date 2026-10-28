// Fenêtres « à la Garmin » calculées par Apogée à partir de méthodes publiées (voir science.ts) :
// Training Effect par séance, VO₂max estimée, prédictions de course, disponibilité à l'entraînement,
// réserve d'énergie, indice d'endurance et indice de côtes. Rien n'est stocké : tout est recalculé.
// Les entrées de chaque calcul sont publiées ; les échelles de lecture (0–100, niveaux) sont propres à Apogée.
import { addDays } from './dates';
import type { Derived } from './engine';
import { analyzeHr, mean, median, percentile } from './hr';
import { liveRecords, sessionDay, type SessionLoad } from './load';
import { acuteSeries } from './loadStatus';
import { bestSegment, trackDistance } from './records';
import {
  RACE_DISTANCES, aerobicEffect, anaerobicEffect, clamp, riegel, teLevel, timeOfVdot, vdotOfPerformance, vo2OfRunning, vo2maxFromSubmax, vo2maxUth,
  type RaceDistance, type TeLevel,
} from './science';
import { zoneTimes } from './zones';
import type { ActualSession, AppData, Checkin } from './types';

// ------------------------------------------------------------------ Training Effect par séance
export const TE_WINDOW_DAYS = 90;
export const TE_MIN_SESSIONS = 5;
/** Charge de référence quand l'historique est trop court (≈ une séance soutenue d'une heure). */
export const TE_DEFAULT_REF = 70;

export interface SessionEffect {
  aerobic: number; level: TeLevel;
  anaerobic: number | null; anaerobicLevel: TeLevel | null;
  refLoad: number; refIsDefault: boolean; zone5Sec: number | null;
}

const effectCache = new WeakMap<Map<string, SessionLoad>, Map<string, SessionEffect>>();

/** Training Effect de chaque séance : charge rapportée au 75ᵉ centile des séances des 90 jours qui précèdent (niveau de l'athlète). */
export function trainingEffects(data: AppData, d: Derived): Map<string, SessionEffect> {
  const hit = effectCache.get(d.loads);
  if (hit) return hit;
  const sessions = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const meas = sessions
    .map((s) => ({ s, day: sessionDay(s), l: d.loads.get(s.id) }))
    .filter((x) => x.l && x.l.load !== null && x.l.method !== 'provisional' && x.l.method !== 'pending' && x.s.durationSec >= 10 * 60);
  const out = new Map<string, SessionEffect>();
  for (const s of sessions) {
    const l = d.loads.get(s.id);
    if (!l || l.load === null) continue;
    const day = sessionDay(s), from = addDays(day, -TE_WINDOW_DAYS);
    const pool = meas.filter((x) => x.day >= from && x.day <= day && x.s.id !== s.id).map((x) => x.l!.load!);
    const p75 = pool.length >= TE_MIN_SESSIONS ? percentile(pool, 0.75) : null;
    const refLoad = Math.max(20, p75 ?? TE_DEFAULT_REF);
    const aerobic = Math.round(aerobicEffect(l.load, refLoad) * 10) / 10;
    let zone5Sec: number | null = null;
    const ser = data.series[s.id];
    const hr = ser && !ser.deleted ? analyzeHr(ser.hr).clean : [];
    if (hr.length >= 10 && d.ctx.hrMax.bpm && s.discipline !== 'STRENGTH') zone5Sec = zoneTimes(hr, d.ctx.hrMax.bpm)[4];
    const an = zone5Sec === null ? null : Math.round(anaerobicEffect(zone5Sec) * 10) / 10;
    out.set(s.id, { aerobic, level: teLevel(aerobic), anaerobic: an, anaerobicLevel: an === null ? null : teLevel(an), refLoad, refIsDefault: p75 === null, zone5Sec });
  }
  effectCache.set(d.loads, out);
  return out;
}

// ------------------------------------------------------------------ meilleurs efforts de course (pour VDOT et Riegel)
export const EFFORT_DISTANCES = [3000, 5000, 10000, 21097.5];
export const EFFORT_WINDOW_DAYS = 90;
export interface Effort { distanceM: number; timeSec: number; day: string; sessionId: string }

const effortCache = new WeakMap<object, { series: object; list: Effort[] }>();
/** Meilleur temps de chaque course sur chaque distance (mêmes garde-fous que les records), calculé une fois par jeu de données. */
function sessionEfforts(data: AppData): Effort[] {
  const hit = effortCache.get(data.actual);
  if (hit && hit.series === data.series) return hit.list;
  const list: Effort[] = [];
  for (const s of liveRecords(data.actual)) {
    if (s.discipline !== 'RUN' || !s.distanceM) continue;
    const day = sessionDay(s);
    const ser = data.series[s.id];
    const curve = ser && !ser.deleted ? ser.speed : [];
    const total = trackDistance(curve);
    const ratio = total > 0 ? s.distanceM / total : 0;
    for (const dist of EFFORT_DISTANCES) {
      if (s.distanceM < dist) continue;
      let t: number | null = null;
      if (ratio >= 0.85 && ratio <= 1.15) t = bestSegment(curve, dist, ratio);
      if (t === null && Math.abs(s.distanceM - dist) / dist <= 0.03 && s.durationSec > 0) t = s.durationSec * (dist / s.distanceM);
      if (t === null || dist / t > 7.5) continue;
      list.push({ distanceM: dist, timeSec: t, day, sessionId: s.id });
    }
  }
  effortCache.set(data.actual, { series: data.series, list });
  return list;
}

/** Meilleur temps de déplacement sur chaque distance, sur les 90 derniers jours. */
export function bestEfforts(data: AppData, todayDay: string): Effort[] {
  const from = addDays(todayDay, -EFFORT_WINDOW_DAYS);
  const best = new Map<number, Effort>();
  for (const e of sessionEfforts(data)) {
    if (e.day < from || e.day > todayDay) continue;
    const cur = best.get(e.distanceM);
    if (!cur || e.timeSec < cur.timeSec) best.set(e.distanceM, e);
  }
  return [...best.values()].sort((a, b) => a.distanceM - b.distanceM);
}

// ------------------------------------------------------------------ VO₂max
export const VO2_WINDOW_DAYS = 60;
export const VO2_MIN_SESSIONS = 3;
export const VO2_MIN_SEC = 20 * 60;
export const VO2_MAX_CLIMB = 0.02;
export const VO2_MAX_DRIFT = 0.08;

export interface Vo2Estimate {
  value: number | null;
  method: 'submax' | 'uth' | null;
  /** Courses à allure stable : FC de réserve ↔ VO₂ de réserve. */
  submax: { value: number; n: number } | null;
  /** FCmax / FCrepos (Uth). */
  uth: number | null;
  /** Meilleur effort récent converti en VDOT (borne basse : un entraînement n'est pas une course). */
  vdot: { value: number; effort: Effort } | null;
  /** Valeur recopiée de la montre dans le point hebdomadaire. */
  watch: { value: number; week: string } | null;
}

export function latestWatchVo2(data: AppData): { value: number; week: string } | null {
  const c = liveRecords(data.checkins).filter((x): x is Checkin & { vo2max: number } => x.vo2max !== null).sort((a, b) => (a.week < b.week ? 1 : -1))[0];
  return c ? { value: c.vo2max, week: c.week } : null;
}

/** Demi-vie du poids d'une sortie dans l'estimation de VO₂max : une sortie d'il y a trois semaines compte moitié moins qu'une sortie du jour. */
export const VO2_HALF_LIFE_DAYS = 21;
interface SessionVo2 { day: string; v: number }
const vo2Cache = new WeakMap<object, SessionVo2[]>();
/** VO₂max déduite de chaque sortie de course admissible (allure stable à plat, FC de réserve) ; calculée une fois par jeu de données. */
function sessionVo2(data: AppData, d: Derived): SessionVo2[] {
  const hit = vo2Cache.get(d.loads);
  if (hit) return hit;
  const out: SessionVo2[] = [];
  const hrMax = d.ctx.hrMax.bpm;
  if (hrMax) {
    for (const s of liveRecords(data.actual)) {
      if (s.discipline !== 'RUN' || s.durationSec < VO2_MIN_SEC || !s.distanceM || !s.avgHrBpm) continue;
      if (s.elevationGainM && s.elevationGainM / s.distanceM > VO2_MAX_CLIMB) continue;
      const drift = d.loads.get(s.id)?.drift;
      if (drift !== null && drift !== undefined && Math.abs(drift) > VO2_MAX_DRIFT) continue;
      const sd = sessionDay(s);
      const rest = d.ctx.resting.at(sd);
      if (rest === null) continue;
      const speed = s.avgSpeedMs && s.avgSpeedMs > 1 ? s.avgSpeedMs : s.distanceM / s.durationSec;
      const v = vo2maxFromSubmax(vo2OfRunning(speed), s.avgHrBpm, rest, hrMax);
      if (v !== null && v > 25 && v < 85) out.push({ day: sd, v });
    }
  }
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  vo2Cache.set(d.loads, out);
  return out;
}

/** VO₂max d'un jour donné : moyenne des sorties des 60 jours précédents, pondérée par leur ancienneté (les valeurs très éloignées de la médiane sont écartées). */
function vo2At(list: SessionVo2[], day: string): { value: number; n: number } | null {
  const from = addDays(day, -VO2_WINDOW_DAYS);
  const win = list.filter((x) => x.day >= from && x.day <= day);
  if (win.length < VO2_MIN_SESSIONS) return null;
  const med = median(win.map((x) => x.v))!;
  let sw = 0, sv = 0, n = 0;
  for (const x of win) {
    if (Math.abs(x.v - med) > med * 0.15) continue;
    const age = (Date.parse(day) - Date.parse(x.day)) / 86400000;
    const w = Math.pow(0.5, age / VO2_HALF_LIFE_DAYS);
    sw += w; sv += w * x.v; n++;
  }
  return sw > 0 ? { value: sv / sw, n } : null;
}

export function vo2maxEstimate(data: AppData, d: Derived, efforts: Effort[]): Vo2Estimate {
  const day = d.today;
  const hrMax = d.ctx.hrMax.bpm;
  const submax = vo2At(sessionVo2(data, d), day);
  const restNow = d.ctx.resting.at(day);
  const uth = hrMax && restNow ? vo2maxUth(hrMax, restNow) : null;
  let vdot: Vo2Estimate['vdot'] = null;
  for (const e of efforts) {
    const v = vdotOfPerformance(e.distanceM, e.timeSec);
    if (v !== null && (!vdot || v > vdot.value)) vdot = { value: v, effort: e };
  }
  const value = submax ? submax.value : uth;
  return { value, method: submax ? 'submax' : uth !== null ? 'uth' : null, submax, uth, vdot, watch: latestWatchVo2(data) };
}

/** Facteur qui ramène le temps d'un ancien effort au niveau de forme du jour : temps × (VO₂max de l'époque ÷ VO₂max actuelle), borné à ±10 %. */
export function effortAdjuster(data: AppData, d: Derived, day: string): (e: Effort) => number {
  const list = sessionVo2(data, d);
  const now = vo2At(list, day);
  return (e) => {
    const then = vo2At(list, e.day);
    return now && then ? clamp(then.value / now.value, 0.9, 1.1) : 1;
  };
}

// ------------------------------------------------------------------ prédictions de course
export interface RacePrediction {
  dist: RaceDistance;
  /** Temps prévu à partir de la VO₂max (VDOT de Daniels). */
  vdotSec: number | null;
  /** Temps prévu à partir du meilleur effort récent (loi de puissance, exposant amateur), et cet effort. */
  riegelSec: number | null; riegelFrom: Effort | null;
  /** Extrapolation lointaine (distance prédite > 4,3 fois celle de l'effort) : à lire avec prudence. */
  far: boolean;
  /** Prédiction recopiée de la montre. */
  watchSec: number | null;
}
/** Ratio maximal entre la distance prédite et celle de l'effort de départ ; au-delà de 4,3 la prédiction est une extrapolation lointaine. */
export const RIEGEL_MAX_RATIO = 8.5;
export const RIEGEL_FAR_RATIO = 4.3;
/**
 * Exposant de la loi de puissance chez un coureur amateur. Riegel (1981) donne 1,06, ajusté sur des records ; sur des coureurs amateurs, les études
 * trouvent un exposant plus élevé (Vickers et Vertosick 2016 : de l'ordre de 1,1 à 1,15) : le chrono se dégrade plus vite quand la distance s'allonge.
 */
export const AMATEUR_EXPONENT = 1.12;

export interface RacePredictionOptions {
  /** Coefficient de calage sur la montre (voir `watchCalibration`) ; null = aucun ; absent = calculé ici. */
  factor?: number | null;
  /** Ramène un ancien effort au niveau de forme du jour (voir `effortAdjuster`). */
  adjust?: (e: Effort) => number;
}

const PRED_KEYS = { '5k': 'pred5kSec', '10k': 'pred10kSec', half: 'predHalfSec', marathon: 'predMarathonSec' } as const;

/** Prédictions de ta montre (point hebdomadaire le plus récent qui en contient). */
function watchPredictions(data: AppData): { week: string | null; sec: Record<RaceDistance['key'], number | null> } {
  const last = liveRecords(data.checkins).sort((a, b) => (a.week < b.week ? 1 : -1));
  const sec = {} as Record<RaceDistance['key'], number | null>;
  let week: string | null = null;
  for (const k of Object.keys(PRED_KEYS) as RaceDistance['key'][]) {
    const c = last.find((x) => x[PRED_KEYS[k]] !== null);
    sec[k] = c ? c[PRED_KEYS[k]] : null;
    if (c && (week === null || c.week > week)) week = c.week;
  }
  return { week, sec };
}

export function racePredictions(data: AppData, vo2: Vo2Estimate, efforts: Effort[], opts: RacePredictionOptions = {}): { rows: RacePrediction[]; vdot: number | null; basis: 'estimate' | 'watch' | null; calib: { factor: number; week: string } | null } {
  const watch = watchPredictions(data);
  const vdot = vo2.value ?? vo2.watch?.value ?? null;
  const basis = vo2.value !== null ? 'estimate' : vo2.watch ? 'watch' : null;
  const adjust = opts.adjust ?? (() => 1);
  const raw = RACE_DISTANCES.map((dist) => {
    let best: { t: number; e: Effort } | null = null;
    for (const e of efforts) {
      const ratio = dist.meters / e.distanceM;
      if (ratio < 0.5 || ratio > RIEGEL_MAX_RATIO) continue;
      const t = riegel(e.timeSec * adjust(e), e.distanceM, dist.meters, AMATEUR_EXPONENT);
      if (!best || t < best.t) best = { t, e };
    }
    return { dist, best };
  });
  // Calage : rapport médian entre les prédictions de la montre et celles d'Apogée, au jour du dernier point hebdomadaire.
  let factor: number | null;
  if (opts.factor !== undefined) factor = opts.factor;
  else {
    const ratios = raw.map((r) => (r.best && watch.sec[r.dist.key] ? watch.sec[r.dist.key]! / r.best.t : null)).filter((x): x is number => x !== null);
    factor = ratios.length ? median(ratios)! : null;
  }
  const k = factor !== null && isFinite(factor) && factor > 0.6 && factor < 1.6 ? factor : null;
  const rows = raw.map(({ dist, best }): RacePrediction => ({
    dist, vdotSec: vdot === null ? null : timeOfVdot(vdot, dist.meters),
    riegelSec: best ? best.t * (k ?? 1) : null, riegelFrom: best ? best.e : null,
    far: !!best && dist.meters / best.e.distanceM > RIEGEL_FAR_RATIO, watchSec: watch.sec[dist.key],
  }));
  return { rows, vdot, basis, calib: k !== null && watch.week ? { factor: k, week: watch.week } : null };
}

// ------------------------------------------------------------------ disponibilité à l'entraînement (Training Readiness)
export type ReadinessKey = 'sleep' | 'sleepHistory' | 'restingHr' | 'acuteLoad' | 'freshness';
export const READINESS_WEIGHTS: Record<ReadinessKey, number> = { sleep: 0.25, sleepHistory: 0.1, restingHr: 0.2, acuteLoad: 0.25, freshness: 0.2 };
export type ReadinessLevel = 'prime' | 'high' | 'moderate' | 'low' | 'poor';
export const READINESS_LEVELS: ReadinessLevel[] = ['poor', 'low', 'moderate', 'high', 'prime'];
export function readinessLevel(score: number): ReadinessLevel {
  return score >= 85 ? 'prime' : score >= 70 ? 'high' : score >= 50 ? 'moderate' : score >= 30 ? 'low' : 'poor';
}
export interface ReadinessFactor { key: ReadinessKey; score: number; value: number; weight: number; effectiveWeight: number }
export interface Readiness { day: string; score: number; level: ReadinessLevel; factors: ReadinessFactor[]; missing: ReadinessKey[] }
export const SLEEP_NEED_SEC = 8 * 3600;
export const READINESS_MIN_WEIGHT = 0.45;

/** 8 h et plus = 100 ; 4 h = 0 (recommandation 7–9 h, Hirshkowitz 2015). */
export const sleepScore = (sec: number): number => clamp(((sec - 4 * 3600) / (SLEEP_NEED_SEC - 4 * 3600)) * 100, 0, 100);
/** Écart de FC de repos au-dessus de la base : chaque battement perd 12,5 points (Buchheit 2014). */
export const restingScore = (delta: number): number => (delta <= 0 ? 100 : clamp(100 - 12.5 * delta, 0, 100));
/** Rapport aigu/chronique : 100 sous 1,0, 75 à 1,3, 45 à 1,5, 0 à 2,0 (Gabbett 2016). */
export function acuteScore(r: number): number {
  if (r <= 1) return 100;
  if (r <= 1.3) return 100 - (r - 1) * (25 / 0.3);
  if (r <= 1.5) return 75 - (r - 1.3) * (30 / 0.2);
  return clamp(45 - (r - 1.5) * 90, 0, 100);
}

/** Les facteurs calculables ce jour-là, et ceux qui manquent (pour dire à l'écran ce qui manque quand le score ne peut pas être calculé). */
export function readinessFactors(data: AppData, d: Derived, day: string = d.today): { factors: ReadinessFactor[]; missing: ReadinessKey[] } {
  const factors: ReadinessFactor[] = [];
  const missing: ReadinessKey[] = [];
  const add = (key: ReadinessKey, value: number | null, score: (v: number) => number) => {
    if (value === null) { missing.push(key); return; }
    factors.push({ key, value, score: score(value), weight: READINESS_WEIGHTS[key], effectiveWeight: 0 });
  };
  const night = data.sleep[day];
  add('sleep', night && !night.deleted ? night.durationSec : null, sleepScore);
  const last3 = [0, 1, 2].map((k) => data.sleep[addDays(day, -k)]).filter((n) => n && !n.deleted).map((n) => n.durationSec);
  add('sleepHistory', last3.length >= 2 ? mean(last3) : null, sleepScore);
  const rhr = d.ctx.resting.raw.get(day);
  const base: number[] = [];
  for (let k = 1; k <= 14; k++) { const v = d.ctx.resting.raw.get(addDays(day, -k)); if (v !== undefined) base.push(v); }
  add('restingHr', rhr !== undefined && base.length >= 3 ? rhr - median(base)! : null, restingScore);
  const pts = acuteSeries(d.series.days);
  const pt = pts.find((p) => p.day === addDays(day, -1)) ?? pts[pts.length - 1];
  add('acuteLoad', pt && pt.ratio !== null ? pt.ratio : null, acuteScore);
  const fr = (day === d.today ? d.form : d.formByDay.get(day))?.components.find((c) => c.key === 'freshness');
  add('freshness', fr ? fr.value : null, () => fr!.score);
  return { factors, missing };
}

export function readiness(data: AppData, d: Derived, day: string = d.today): Readiness | null {
  const { factors, missing } = readinessFactors(data, d, day);
  const total = factors.reduce((t, f) => t + f.weight, 0);
  if (factors.length < 2 || total < READINESS_MIN_WEIGHT) return null;
  let score = 0;
  for (const f of factors) { f.effectiveWeight = f.weight / total; score += f.score * f.effectiveWeight; }
  score = Math.round(score);
  return { day, score, level: readinessLevel(score), factors, missing };
}

// ------------------------------------------------------------------ réserve d'énergie (type Body Battery, version simplifiée)
/** Recharge d'une nuit complète (8 h, FC de repos normale) et dépense d'une journée sans entraînement, en points sur 100. */
export const RESERVE_RECHARGE = 80;
export const RESERVE_BASE_DRAIN = 55;
/** Une séance à la charge de référence vide la réserve de 25 points. Constantes recalées sur la semaine Garmin du 22 au 28 octobre (réveils 90–100, creux 10–34). */
export const RESERVE_TRAIN_DRAIN = 25;
export const RESERVE_FLOOR = 5;
export interface ReservePoint { day: string; wake: number; evening: number; sleepSec: number | null; sleepAssumed: boolean; load: number }

/**
 * Modèle journalier : réveil = min(100, soir de la veille + recharge du sommeil) ; soir = réveil − dépense de base − dépense des séances.
 * Les paramètres sont propres à Apogée (Firstbeat s'appuie sur la HRV, absente ici) : c'est une lecture de tendance, pas une mesure.
 */
export function energyReserve(data: AppData, d: Derived, spanDays = 14, endDay: string = d.today): ReservePoint[] {
  const first = addDays(endDay, -(spanDays - 1) - 7);
  const ref = Math.max(20, percentile(
    liveRecords(data.actual).map((s) => d.loads.get(s.id)).filter((l): l is SessionLoad => !!l && l.load !== null && l.method !== 'provisional' && l.method !== 'pending').map((l) => l.load!), 0.75) ?? TE_DEFAULT_REF);
  const out: ReservePoint[] = [];
  let evening = 65;
  const recentSleep: number[] = [];
  for (let day = first; day <= endDay; day = addDays(day, 1)) {
    const n = data.sleep[day];
    let sec = n && !n.deleted ? n.durationSec : null;
    const assumed = sec === null;
    if (sec === null) sec = recentSleep.length ? mean(recentSleep.slice(-7))! : 7 * 3600;
    else recentSleep.push(sec);
    const rhr = d.ctx.resting.raw.get(day);
    const base: number[] = [];
    for (let k = 1; k <= 14; k++) { const v = d.ctx.resting.raw.get(addDays(day, -k)); if (v !== undefined) base.push(v); }
    const rhrFactor = rhr !== undefined && base.length >= 3 ? clamp(1 - 0.03 * Math.max(0, rhr - median(base)!), 0.6, 1) : 1;
    const recharge = RESERVE_RECHARGE * clamp(sec / SLEEP_NEED_SEC, 0, 1) * rhrFactor;
    const wake = Math.min(100, evening + recharge);
    const load = d.series.byDay.get(day)?.load ?? 0;
    evening = Math.max(RESERVE_FLOOR, wake - RESERVE_BASE_DRAIN - RESERVE_TRAIN_DRAIN * (load / ref));
    out.push({ day, wake: Math.round(wake), evening: Math.round(evening), sleepSec: assumed ? null : sec, sleepAssumed: assumed, load });
  }
  return out.slice(-spanDays);
}

// ------------------------------------------------------------------ indice d'endurance
export const ENDURANCE_WINDOW_DAYS = 28;
export const ENDURANCE_REF_HOURS_WEEK = 10;
export const ENDURANCE_REF_LONGEST_SEC = 3 * 3600;
export interface EnduranceScore { score: number; aerobic: number | null; volume: number; longest: number; vo2: number | null; weeklyHours: number; longestSec: number; partial: boolean }

const ENDURANCE_DISCIPLINES = ['RUN', 'BIKE', 'SWIM'];
/** VO₂max 30 → 0 ; 60 → 100 (échelle Apogée). Volume : 10 h/semaine = 100. Sortie la plus longue : 3 h = 100. */
export function enduranceScore(data: AppData, todayDay: string, vo2: number | null): EnduranceScore | null {
  const from = addDays(todayDay, -ENDURANCE_WINDOW_DAYS);
  const list = liveRecords(data.actual).filter((s) => ENDURANCE_DISCIPLINES.includes(s.discipline) && sessionDay(s) > from && sessionDay(s) <= todayDay);
  if (!list.length) return null;
  const weeklyHours = list.reduce((t, s) => t + s.durationSec, 0) / 3600 / (ENDURANCE_WINDOW_DAYS / 7);
  const longestSec = Math.max(...list.map((s) => s.durationSec));
  const volume = clamp((weeklyHours / ENDURANCE_REF_HOURS_WEEK) * 100, 0, 100);
  const longest = clamp((longestSec / ENDURANCE_REF_LONGEST_SEC) * 100, 0, 100);
  const aerobic = vo2 === null ? null : clamp(((vo2 - 30) / 30) * 100, 0, 100);
  const score = aerobic === null ? (volume + longest) / 2 : 0.4 * aerobic + 0.3 * volume + 0.3 * longest;
  return { score: Math.round(score), aerobic, volume: Math.round(volume), longest: Math.round(longest), vo2, weeklyHours, longestSec, partial: aerobic === null };
}

// ------------------------------------------------------------------ indice de côtes
export const HILL_WINDOW_DAYS = 28;
export const HILL_REF_GAIN_WEEK = 1200;
export const HILL_MIN_GRADE = 0.025;
export const HILL_MIN_GAIN = 100;
export const HILL_REF_VAM: Record<'RUN' | 'BIKE', number> = { RUN: 600, BIKE: 700 };
export interface HillScore {
  score: number; weeklyGain: number; volume: number;
  bestVam: number | null; vamScore: number | null;
  best: { sessionId: string; day: string; discipline: 'RUN' | 'BIKE'; vam: number; gain: number } | null;
}

/** Dénivelé positif par semaine (volume) et vitesse ascensionnelle moyenne des séances vallonnées (VAM, m/h). Échelles Apogée. */
export function hillScore(data: AppData, todayDay: string): HillScore | null {
  const from = addDays(todayDay, -HILL_WINDOW_DAYS);
  const list = liveRecords(data.actual).filter((s): s is ActualSession & { discipline: 'RUN' | 'BIKE' } => (s.discipline === 'RUN' || s.discipline === 'BIKE') && sessionDay(s) > from && sessionDay(s) <= todayDay);
  const gain = list.reduce((t, s) => t + (s.elevationGainM ?? 0), 0);
  if (!list.some((s) => s.elevationGainM)) return null;
  const weeklyGain = gain / (HILL_WINDOW_DAYS / 7);
  const volume = clamp((weeklyGain / HILL_REF_GAIN_WEEK) * 100, 0, 100);
  let best: HillScore['best'] = null, bestScore = -1;
  for (const s of list) {
    if (!s.elevationGainM || s.elevationGainM < HILL_MIN_GAIN || !s.distanceM || s.durationSec < 20 * 60) continue;
    if (s.elevationGainM / s.distanceM < HILL_MIN_GRADE) continue;
    const vam = s.elevationGainM / (s.durationSec / 3600);
    const sc = vam / HILL_REF_VAM[s.discipline];
    if (sc > bestScore) { bestScore = sc; best = { sessionId: s.id, day: sessionDay(s), discipline: s.discipline, vam, gain: s.elevationGainM }; }
  }
  const vamScore = best ? clamp(bestScore * 100, 0, 100) : null;
  const score = vamScore === null ? volume : 0.5 * volume + 0.5 * vamScore;
  return { score: Math.round(score), weeklyGain, volume: Math.round(volume), bestVam: best?.vam ?? null, vamScore: vamScore === null ? null : Math.round(vamScore), best };
}

// ------------------------------------------------------------------ courbes de capacité calculées par Apogée
export interface CapacityPoint {
  day: string;
  vo2max: number | null;
  /** Temps prévus (s) : 5 km, 10 km, semi, marathon. */
  pred: Record<RaceDistance['key'], number | null>;
}

/**
 * Une valeur par jour sur `days` jours (le dernier : aujourd'hui), chaque point recalculé avec les seules séances connues ce jour-là.
 * VO₂max : moyenne des sorties des 60 jours précédents pondérée par l'ancienneté. Prédictions : meilleurs efforts des 90 jours précédents,
 * ramenés au niveau de forme du jour par le rapport des VO₂max, puis calés sur ta montre (même coefficient sur toute la courbe).
 */
export function capacityHistory(data: AppData, d: Derived, days = 84): CapacityPoint[] {
  const out: CapacityPoint[] = [];
  const todayEfforts = bestEfforts(data, d.today);
  const nowV = vo2maxEstimate(data, d, todayEfforts);
  const calib = racePredictions(data, nowV, todayEfforts, { adjust: effortAdjuster(data, d, d.today) }).calib;
  for (let k = days - 1; k >= 0; k--) {
    const day = addDays(d.today, -k);
    const at = { ...d, today: day } as Derived;
    const efforts = bestEfforts(data, day);
    const v = vo2maxEstimate(data, at, efforts);
    const p = racePredictions(data, v, efforts, { factor: calib ? calib.factor : null, adjust: effortAdjuster(data, at, day) });
    const pred = Object.fromEntries(p.rows.map((r) => [r.dist.key, r.riegelSec])) as CapacityPoint['pred'];
    out.push({ day, vo2max: v.value, pred });
  }
  return out;
}
