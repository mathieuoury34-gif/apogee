// Records personnels, tendance d'efficacité, enchaînements vélo → course et estimations de VMA / CSS.
// Tout vient des séries de vitesse et de FC déjà stockées ; rien n'est enregistré.
import { addDays, mondayOf } from './dates';
import { analyzeHr, median } from './hr';
import type { Links } from './links';
import { liveRecords, sessionDay } from './load';
import type { ActualSession, AppData, ZoneReading } from './types';

type Pts = [number, number][];
const MAX_DT = 30;

/** Au-delà de 30 s entre deux points, la montre était en pause (arrêt automatique) : ni distance ni temps de déplacement. */
const PAUSE_S = MAX_DT;

interface Track { cd: number[]; ct: number[] }

/** Distance et temps de déplacement cumulés point par point (trapèzes) ; `scale` recale la distance sur celle de la séance. */
function track(speed: Pts, scale = 1): Track {
  const cd = [0], ct = [0];
  for (let i = 1; i < speed.length; i++) {
    const dt = speed[i][0] - speed[i - 1][0];
    if (!(dt > 0) || dt > PAUSE_S) { cd.push(cd[i - 1]); ct.push(ct[i - 1]); continue; }
    const v = (Math.max(0, speed[i - 1][1]) + Math.max(0, speed[i][1])) / 2;
    cd.push(cd[i - 1] + v * dt * scale);
    ct.push(ct[i - 1] + dt);
  }
  return { cd, ct };
}

/** Plus court temps pour couvrir `distanceM`, départ sur un point de la courbe, arrivée interpolée entre deux points. */
function fastestFrom({ cd, ct }: Track, distanceM: number): number | null {
  const n = cd.length;
  let best: number | null = null, i = 1;
  for (let j = 0; j < n - 1; j++) {
    if (i < j + 1) i = j + 1;
    while (i < n && cd[i] - cd[j] < distanceM) i++;
    if (i >= n) break;
    const step = cd[i] - cd[i - 1];
    if (!(step > 0)) continue;
    const frac = (distanceM - (cd[i - 1] - cd[j])) / step;
    const dt = ct[i - 1] - ct[j] + frac * (ct[i] - ct[i - 1]);
    if (dt > 0 && (best === null || dt < best)) best = dt;
  }
  return best;
}

/**
 * Plus court temps de DÉPLACEMENT (arrêts exclus, comme la montre) pour couvrir `distanceM` dans une série de vitesse
 * [s, m/s] : fenêtre glissante, début et fin interpolés entre les points de la courbe.
 */
export function bestSegment(speed: Pts, distanceM: number, scale = 1): number | null {
  if (speed.length < 10) return null;
  const tr = track(speed, scale);
  const n = tr.cd.length, D = tr.cd[n - 1], T = tr.ct[n - 1];
  if (D < distanceM) return null;
  // départ sur un point, puis arrivée sur un point (série retournée) : le meilleur des deux est le vrai minimum
  const rev: Track = { cd: tr.cd.map((_, k) => D - tr.cd[n - 1 - k]), ct: tr.ct.map((_, k) => T - tr.ct[n - 1 - k]) };
  const a = fastestFrom(tr, distanceM), b = fastestFrom(rev, distanceM);
  return a === null ? b : b === null ? a : Math.min(a, b);
}

/** Distance (m) que donne la courbe de vitesse, pauses exclues. */
export function trackDistance(speed: Pts): number {
  if (speed.length < 10) return 0;
  const { cd } = track(speed);
  return cd[cd.length - 1];
}

/** Plus haute vitesse moyenne tenue pendant `windowSec` secondes (m/s). */
export function bestSpeedOver(speed: Pts, windowSec: number): number | null {
  if (speed.length < 10) return null;
  const t = speed.map((p) => p[0]);
  const cum: number[] = [0];
  for (let i = 1; i < speed.length; i++) cum.push(cum[i - 1] + Math.max(0, speed[i - 1][1]) * Math.min(MAX_DT, t[i] - t[i - 1]));
  let best: number | null = null, j = 0;
  for (let i = 0; i < speed.length; i++) {
    while (t[i] - t[j] > windowSec) j++;
    if (t[i] - t[j] < windowSec * 0.97) continue;
    const v = (cum[i] - cum[j]) / (t[i] - t[j]);
    if (best === null || v > best) best = v;
  }
  return best;
}

const sp = (data: AppData, id: string): Pts => { const s = data.series[id]; return s && !s.deleted ? s.speed : []; };

// ------------------------------------------------------------------ records
export interface RecordSpec { discipline: 'RUN' | 'BIKE' | 'SWIM'; label: string; distanceM: number; maxSpeed: number }
export const RECORD_SPECS: RecordSpec[] = [
  { discipline: 'RUN', label: '1 km', distanceM: 1000, maxSpeed: 6.7 },
  { discipline: 'RUN', label: '5 km', distanceM: 5000, maxSpeed: 6.2 },
  { discipline: 'RUN', label: '10 km', distanceM: 10000, maxSpeed: 6.0 },
  { discipline: 'RUN', label: '21,1 km', distanceM: 21097, maxSpeed: 5.8 },
  { discipline: 'BIKE', label: '20 km', distanceM: 20000, maxSpeed: 18 },
  { discipline: 'BIKE', label: '40 km', distanceM: 40000, maxSpeed: 17 },
  { discipline: 'BIKE', label: '90 km', distanceM: 90000, maxSpeed: 16 },
  { discipline: 'SWIM', label: '400 m', distanceM: 400, maxSpeed: 2.2 },
  { discipline: 'SWIM', label: '1 000 m', distanceM: 1000, maxSpeed: 2.0 },
  { discipline: 'SWIM', label: '1 900 m', distanceM: 1900, maxSpeed: 1.9 },
];

export interface PersonalRecord { spec: RecordSpec; timeSec: number; day: string; sessionId: string; basis: 'segment' | 'session'; previous: { timeSec: number; day: string } | null }

export function personalRecords(data: AppData): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  const sessions = liveRecords(data.actual);
  for (const spec of RECORD_SPECS) {
    const cands: { timeSec: number; day: string; sessionId: string; basis: 'segment' | 'session' }[] = [];
    for (const s of sessions) {
      if (s.discipline !== spec.discipline) continue;
      let t: number | null = null, basis: 'segment' | 'session' = 'segment';
      if (s.distanceM && s.distanceM >= spec.distanceM) {
        // la courbe est recalée sur la distance enregistrée de la séance (GPS contre odomètre : 1 à 3 % d'écart) ;
        // si elle en est trop éloignée (points manquants), elle n'est pas fiable pour un meilleur segment
        const curve = sp(data, s.id), total = trackDistance(curve);
        const ratio = total > 0 ? s.distanceM / total : 0;
        if (ratio >= 0.85 && ratio <= 1.15) t = bestSegment(curve, spec.distanceM, ratio);
      }
      if (t === null && s.distanceM && Math.abs(s.distanceM - spec.distanceM) / spec.distanceM <= 0.03 && s.durationSec > 0) { t = s.durationSec * (spec.distanceM / s.distanceM); basis = 'session'; }
      if (t === null || spec.distanceM / t > spec.maxSpeed) continue;
      cands.push({ timeSec: t, day: sessionDay(s), sessionId: s.id, basis });
    }
    cands.sort((a, b) => a.timeSec - b.timeSec);
    if (!cands.length) continue;
    const best = cands[0];
    // « précédent » : meilleur temps réalisé avant le record, pour montrer le gain
    const prev = cands.filter((c) => c.day < best.day)[0];
    out.push({ spec, ...best, previous: prev ? { timeSec: prev.timeSec, day: prev.day } : null });
  }
  return out;
}

// ------------------------------------------------------------------ efficacité (vitesse par battement)
export const EF_BAND: [number, number] = [0.65, 0.85];
/** Vélo : les sorties d'endurance se font souvent à une FC plus basse, et le relief est plus fréquent. */
export const EF_BAND_BIKE: [number, number] = [0.55, 0.85];
export const EF_MIN_SEC = 20 * 60;
export const EF_MAX_CLIMB = 0.02;
export const EF_MAX_CLIMB_BIKE = 0.03;

export interface EfPoint { day: string; sessionId: string; speedMs: number; avgHr: number; ef: number }
export interface EfWeek { start: string; ef: number; n: number }
export interface Efficiency {
  discipline: 'RUN' | 'BIKE';
  points: EfPoint[];
  weeks: EfWeek[];
  /** Changement (%) de l'efficacité médiane des 28 derniers jours par rapport aux 28 précédents. */
  change: number | null;
  /** Faute de mieux (trop peu de séances sur 28 jours) : dernière séance comparable contre la précédente. */
  lastVsPrevious: number | null;
  refHr: number | null;
  /** Vitesse à la FC de référence, maintenant et il y a 4 semaines (m/s). */
  speedNow: number | null; speedBefore: number | null;
  /** Pourquoi des séances sont écartées : séances de la discipline (20 min+), puis celles dont la FC convient, puis celles dont le relief convient. */
  diag: { sessions: number; withHr: number; inBand: number; flat: number };
}

export function efficiency(data: AppData, hrMax: number | null, discipline: 'RUN' | 'BIKE', todayDay: string, spanWeeks = 26): Efficiency {
  const from = addDays(mondayOf(todayDay), -7 * (spanWeeks - 1));
  const band = discipline === 'BIKE' ? EF_BAND_BIKE : EF_BAND, maxClimb = discipline === 'BIKE' ? EF_MAX_CLIMB_BIKE : EF_MAX_CLIMB;
  const points: EfPoint[] = [];
  const diag = { sessions: 0, withHr: 0, inBand: 0, flat: 0 };
  for (const s of liveRecords(data.actual)) {
    if (s.discipline !== discipline || s.durationSec < EF_MIN_SEC || !s.distanceM) continue;
    const day = sessionDay(s);
    if (day < from) continue;
    diag.sessions++;
    if (!s.avgHrBpm) continue;
    diag.withHr++;
    if (!hrMax) continue;
    const r = s.avgHrBpm / hrMax;
    if (r < band[0] || r > band[1]) continue;
    diag.inBand++;
    if (s.elevationGainM && s.elevationGainM / s.distanceM > maxClimb) continue;
    diag.flat++;
    const speedMs = s.distanceM / s.durationSec;
    points.push({ day, sessionId: s.id, speedMs, avgHr: s.avgHrBpm, ef: (speedMs * 60) / s.avgHrBpm });
  }
  points.sort((a, b) => (a.day < b.day ? -1 : 1));
  const byWeek = new Map<string, number[]>();
  for (const p of points) { const k = mondayOf(p.day); byWeek.set(k, [...(byWeek.get(k) ?? []), p.ef]); }
  const weeks = [...byWeek.entries()].sort().map(([start, v]) => ({ start, ef: median(v)!, n: v.length }));
  const recent = points.filter((p) => p.day > addDays(todayDay, -28)), before = points.filter((p) => p.day <= addDays(todayDay, -28) && p.day > addDays(todayDay, -56));
  const mr = recent.length >= 2 ? median(recent.map((p) => p.ef)) : null, mb = before.length >= 2 ? median(before.map((p) => p.ef)) : null;
  const refHr = points.length ? Math.round(median(points.map((p) => p.avgHr))!) : null;
  const n = points.length;
  return {
    discipline, points, weeks, diag,
    change: mr !== null && mb !== null ? mr / mb - 1 : null,
    lastVsPrevious: n >= 2 ? points[n - 1].ef / points[n - 2].ef - 1 : null,
    refHr,
    speedNow: mr !== null && refHr ? (mr * refHr) / 60 : null, speedBefore: mb !== null && refHr ? (mb * refHr) / 60 : null,
  };
}

// ------------------------------------------------------------------ enchaînements vélo → course
export interface BrickRow {
  day: string; bikeId: string; runId: string;
  transitionSec: number | null;
  runPace: number | null; usualPace: number | null; paceDelta: number | null;
  runHr: number | null; usualHr: number | null;
}
const MAX_TRANSITION = 45 * 60;

function brickPairs(data: AppData, links: Links): [ActualSession, ActualSession][] {
  const seen = new Set<string>();
  const pairs: [ActualSession, ActualSession][] = [];
  const add = (a?: ActualSession, b?: ActualSession) => {
    if (!a || !b || a.deleted || b.deleted) return;
    const bike = a.discipline === 'BIKE' ? a : b.discipline === 'BIKE' ? b : null;
    const run = a.discipline === 'RUN' ? a : b.discipline === 'RUN' ? b : null;
    if (!bike || !run || bike.startAt > run.startAt) return;
    const k = bike.id + run.id;
    if (!seen.has(k)) { seen.add(k); pairs.push([bike, run]); }
  };
  for (const p of liveRecords(data.bricks)) if (p.status === 'confirmed') add(data.actual[p.firstId], data.actual[p.secondId]);
  for (const [pid, aids] of links.byPlanned) {
    if (data.planned[pid]?.discipline !== 'BRICK' || aids.length < 2) continue;
    const acts = aids.map((id) => data.actual[id]).filter(Boolean);
    const bike = acts.find((a) => a.discipline === 'BIKE'), run = acts.find((a) => a.discipline === 'RUN');
    add(bike, run);
  }
  return pairs;
}

export function brickAnalysis(data: AppData, links: Links, todayDay: string): BrickRow[] {
  const runs = liveRecords(data.actual).filter((s) => s.discipline === 'RUN' && s.durationSec >= 10 * 60 && s.distanceM);
  const rows: BrickRow[] = [];
  for (const [bike, run] of brickPairs(data, links)) {
    const gap = (Date.parse(run.startAt) - Date.parse(bike.endAt)) / 1000;
    const brickIds = new Set(brickPairs(data, links).map(([, r]) => r.id));
    const day = sessionDay(run);
    const ref = runs.filter((r) => !brickIds.has(r.id) && sessionDay(r) < day && sessionDay(r) >= addDays(day, -90));
    const usualPace = median(ref.map((r) => r.durationSec / (r.distanceM! / 1000)));
    const pace = run.distanceM ? run.durationSec / (run.distanceM / 1000) : null;
    rows.push({
      day, bikeId: bike.id, runId: run.id,
      transitionSec: gap >= 0 && gap <= MAX_TRANSITION ? gap : null,
      runPace: pace, usualPace, paceDelta: pace !== null && usualPace ? pace / usualPace - 1 : null,
      runHr: run.avgHrBpm, usualHr: median(ref.filter((r) => r.avgHrBpm).map((r) => r.avgHrBpm!)),
    });
  }
  return rows.filter((r) => r.day <= todayDay).sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ------------------------------------------------------------------ estimations de VMA et de CSS
export interface ZoneSuggestion { kind: 'vma' | 'css'; value: number; current: ZoneReading | null; day: string; sessionId: string; note: string }

export function suggestZones(data: AppData, current: { vma: ZoneReading | null; css: ZoneReading | null }, todayDay: string): ZoneSuggestion[] {
  const out: ZoneSuggestion[] = [];
  const since = addDays(todayDay, -90);
  let vma: { v: number; day: string; id: string } | null = null;
  let css: { v: number; day: string; id: string } | null = null;
  for (const s of liveRecords(data.actual)) {
    const day = sessionDay(s);
    if (day < since) continue;
    if (s.discipline === 'RUN') {
      const v = bestSpeedOver(sp(data, s.id), 360);
      if (v !== null && v <= 7.5 && (!vma || v > vma.v)) vma = { v, day, id: s.id };
    } else if (s.discipline === 'SWIM') {
      const t200 = bestSegment(sp(data, s.id), 200), t400 = bestSegment(sp(data, s.id), 400);
      if (t200 !== null && t400 !== null && t400 > t200) {
        const v = 200 / (t400 - t200);
        if (v >= 0.6 && v <= 1.8 && (!css || v > css.v)) css = { v, day, id: s.id };
      }
    }
  }
  if (vma && (!current.vma || vma.v >= current.vma.value * 1.01)) out.push({ kind: 'vma', value: vma.v, current: current.vma, day: vma.day, sessionId: vma.id, note: 'meilleur effort de 6 minutes sur les 90 derniers jours' });
  if (css && (!current.css || Math.abs(css.v / current.css.value - 1) >= 0.02)) out.push({ kind: 'css', value: css.v, current: current.css, day: css.day, sessionId: css.id, note: 'meilleurs 200 m et 400 m d’une même séance (méthode de Wakayoshi)' });
  return out;
}
