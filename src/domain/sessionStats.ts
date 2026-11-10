// Détails d'une séance « à la Garmin », calculés par Apogée avec les seules données que l'on stocke : courbe de FC et courbe de vitesse.
// Rien n'est enregistré : tout se recalcule à l'ouverture du bilan (FC max et FC de repos du jour de la séance, méthode de Karvonen).
import { mean, reserveFraction, restOrRef, weightSamples, type Series } from './hr';
import { ZONE_LOAD_WEIGHT } from './loadStatus';
import { zoneRanges, zoneTimes, type ZoneSeconds } from './zones';

// ------------------------------------------------------------------ minutes d'intensité
/** Seuils de la FC de réserve (ACSM) : modérée de 40 à 59 %, soutenue à partir de 60 %. */
export const INTENSITY_MODERATE = 0.4;
export const INTENSITY_VIGOROUS = 0.6;
export interface IntensityMinutes { moderate: number; vigorous: number; /** modérées + 2 × soutenues, comme sur les montres */ total: number }

export function intensityMinutes(hr: Series, hrMax: number, hrRest: number | null): IntensityMinutes {
  let mod = 0, vig = 0;
  for (const s of weightSamples(hr)) {
    const f = reserveFraction(s.bpm, hrMax, hrRest);
    if (f >= INTENSITY_VIGOROUS) vig += s.dtSec; else if (f >= INTENSITY_MODERATE) mod += s.dtSec;
  }
  const moderate = Math.round(mod / 60), vigorous = Math.round(vig / 60);
  return { moderate, vigorous, total: moderate + 2 * vigorous };
}

// ------------------------------------------------------------------ bénéfice principal
export type BenefitKey = 'recovery' | 'base' | 'tempo' | 'threshold' | 'vo2' | 'anaerobic';
/**
 * Bénéfice principal de la séance (même vocabulaire que les montres, mais règle d'Apogée) : on regarde où se concentre la charge
 * (chaque zone pèse selon la charge par minute du modèle d'effort), puis le niveau d'effet aérobie.
 */
export function primaryBenefit(zones: ZoneSeconds, aerobic: number | null, anaerobic: number | null): BenefitKey | null {
  const w = zones.map((t, i) => t * ZONE_LOAD_WEIGHT[i]);
  const tot = w.reduce((a, b) => a + b, 0);
  if (!(tot > 0) || aerobic === null) return null;
  if (anaerobic !== null && anaerobic >= 2) return 'anaerobic';
  if (w[4] / tot >= 0.4) return 'vo2';
  if ((w[3] + w[4]) / tot >= 0.4) return 'threshold';
  if ((w[2] + w[3] + w[4]) / tot >= 0.5) return 'tempo';
  return aerobic < 2.5 ? 'recovery' : 'base';
}

// ------------------------------------------------------------------ vitesse
export interface SpeedStats {
  /** Vitesse maximale lissée (médiane de 3 mesures : écarte les pointes parasites du GPS), m/s. */
  maxMs: number | null;
  /** Temps réellement en mouvement (vitesse ≥ 0,5 m/s), s ; `null` si la courbe est trop espacée. */
  movingSec: number | null;
  avgMovingMs: number | null;
}
const MOVING_MS = 0.5;
const MOVING_GAP = 30;
export function speedStats(speed: Series, distanceM: number | null, durationSec: number): SpeedStats {
  const v = speed.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 35);
  if (v.length < 20) return { maxMs: null, movingSec: null, avgMovingMs: null };
  let maxMs = 0;
  for (let i = 1; i < v.length - 1; i++) {
    const m = [v[i - 1][1], v[i][1], v[i + 1][1]].sort((a, b) => a - b)[1];
    if (m > maxMs) maxMs = m;
  }
  const gaps = v.slice(1).map((p, i) => p[0] - v[i][0]).sort((a, b) => a - b);
  const medGap = gaps[Math.floor(gaps.length / 2)];
  let movingSec: number | null = null;
  if (medGap <= 20) {
    let t = 0;
    for (let i = 0; i < v.length; i++) {
      const dt = Math.min(MOVING_GAP, i < v.length - 1 ? v[i + 1][0] - v[i][0] : medGap);
      if (v[i][1] >= MOVING_MS && dt > 0) t += dt;
    }
    movingSec = Math.min(durationSec, Math.round(t));
  }
  return { maxMs: maxMs || null, movingSec, avgMovingMs: movingSec && distanceM ? distanceM / movingSec : null };
}

/** Distance cumulée (m) à chaque instant de la courbe de vitesse, recalée sur la distance totale de la séance. `null` si la courbe est trop pauvre. */
export function distanceCurve(speed: Series, distanceM: number | null): { t: number; d: number }[] | null {
  const v = speed.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 35).sort((a, b) => a[0] - b[0]);
  if (v.length < 20) return null;
  const out: { t: number; d: number }[] = [{ t: v[0][0], d: 0 }];
  let d = 0;
  for (let i = 1; i < v.length; i++) {
    const dt = Math.min(MOVING_GAP, v[i][0] - v[i - 1][0]);
    d += v[i - 1][1] * Math.max(0, dt);
    out.push({ t: v[i][0], d });
  }
  const k = distanceM && d > 0 ? distanceM / d : 1;
  return out.map((p) => ({ t: p.t, d: p.d * k }));
}

/** Distance (m) à l'instant `t` par interpolation de la courbe cumulée. */
export function distanceAt(curve: { t: number; d: number }[], t: number): number {
  if (t <= curve[0].t) return 0;
  const last = curve[curve.length - 1];
  if (t >= last.t) return last.d;
  let lo = 0, hi = curve.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (curve[m].t <= t) lo = m; else hi = m; }
  const a = curve[lo], b = curve[hi];
  return a.d + ((t - a.t) / (b.t - a.t || 1)) * (b.d - a.d);
}

// ------------------------------------------------------------------ résumé d'une plage (sélection sur le graphique)
export interface RangeStats { avg: number; min: number; max: number; seconds: number }
/** Moyenne pondérée par la durée de chaque mesure (une mesure vaut jusqu'à la suivante, au plus `cap` secondes). `null` s'il n'y a rien dans la plage. */
export function rangeStats(pts: { t: number; v: number }[], from: number, to: number, cap: number): RangeStats | null {
  let sum = 0, w = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.t < from || p.t > to) continue;
    const next = pts[i + 1];
    const dt = Math.min(cap, next ? Math.min(next.t, to) - p.t : 1);
    if (dt <= 0) continue;
    sum += p.v * dt; w += dt;
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  return w > 0 ? { avg: sum / w, min, max, seconds: w } : null;
}

// ------------------------------------------------------------------ analyse complète d'une séance
export interface HrAnalysisView {
  hrMax: number; hrRest: number; restKnown: boolean;
  zones: ZoneSeconds; ranges: { lo: number; hi: number }[];
  intensity: IntensityMinutes;
  avg: number | null;
}
export function hrView(hr: Series, hrMax: number, restMeasured: number | null): HrAnalysisView | null {
  if (hr.length < 10 || !(hrMax > 100)) return null;
  return {
    hrMax, hrRest: restOrRef(hrMax, restMeasured), restKnown: restMeasured !== null && restOrRef(hrMax, restMeasured) === restMeasured,
    zones: zoneTimes(hr, hrMax, restMeasured), ranges: zoneRanges(hrMax, restMeasured),
    intensity: intensityMinutes(hr, hrMax, restMeasured), avg: mean(hr.map((p) => p[1])),
  };
}

/** Un tronçon d'une séance (tour de la montre…) : bornes en secondes epoch, durée, distance, vitesse moyenne et FC. */
export interface Segment {
  from: number; to: number; sec: number;
  metres: number | null; ms: number | null;
  avgHr: number | null; maxHr: number | null;
}
