// Tours et intervalles d'une séance, calculés par Apogée à partir de la courbe de vitesse et de la courbe de FC.
//  · tours automatiques : un tour tous les 1 km (course), 5 km (vélo) ou 100 m (natation), comme l'affichage « Tours » des montres ;
//  · intervalles : alternance d'efforts rapides et de récupérations lentes, détectée sur la vitesse lissée (méthode d'Otsu : on cherche le seuil qui sépare
//    le mieux « vite » de « lent »). On ne l'affiche que si la séance est vraiment en deux régimes (au moins 3 efforts) : une sortie régulière n'en a pas.
// Rien n'est stocké : tout se recalcule à l'ouverture du bilan.
import { distanceAt, distanceCurve, rangeStats } from './sessionStats';
import type { Series } from './hr';

export interface Segment {
  /** début et fin (secondes epoch) */
  from: number; to: number;
  sec: number;
  metres: number | null;
  /** vitesse moyenne (m/s) sur le segment */
  ms: number | null;
  avgHr: number | null; maxHr: number | null;
}
export type IntervalKind = 'warmup' | 'work' | 'rest' | 'cooldown';
export interface IntervalSeg extends Segment { kind: IntervalKind; /** rang de l'effort (1, 2, 3…) ou de la récupération */ rank: number }
export interface IntervalResult {
  segments: IntervalSeg[];
  works: IntervalSeg[];
  /** seuil de vitesse (m/s) entre « vite » et « lent » */
  thresholdMs: number;
}

function hrPoints(hr: Series) { return hr.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => ({ t: p[0], v: p[1] })).sort((a, b) => a.t - b.t); }

function describe(from: number, to: number, curve: { t: number; d: number }[] | null, hrp: { t: number; v: number }[]): Segment {
  const sec = Math.max(0, to - from);
  const metres = curve ? Math.max(0, distanceAt(curve, to) - distanceAt(curve, from)) : null;
  const h = rangeStats(hrp, from, to, 120);
  return { from, to, sec, metres, ms: metres !== null && sec > 0 ? metres / sec : null, avgHr: h ? h.avg : null, maxHr: h ? h.max : null };
}

/** Tours de longueur fixe (m). Le dernier tour, plus court, est gardé s'il fait au moins 10 % d'un tour. */
export function autoLaps(speed: Series, hr: Series, distanceM: number | null, lapM: number): Segment[] {
  const curve = distanceCurve(speed, distanceM);
  if (!curve) return [];
  const total = curve[curve.length - 1].d;
  const hrp = hrPoints(hr);
  const out: Segment[] = [];
  const timeAt = (d: number): number => {
    let lo = 0, hi = curve.length - 1;
    if (d >= curve[hi].d) return curve[hi].t;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (curve[m].d <= d) lo = m; else hi = m; }
    const a = curve[lo], b = curve[hi];
    return a.t + ((d - a.d) / (b.d - a.d || 1)) * (b.t - a.t);
  };
  let prevT = curve[0].t;
  const count = Math.ceil(total / lapM - 1e-9);
  for (let k = 1; k <= count; k++) {
    const dStart = (k - 1) * lapM, dEnd = Math.min(k * lapM, total);
    if (k > 1 && dEnd - dStart < lapM * 0.1) break;
    const t = timeAt(dEnd);
    if (t > prevT) out.push(describe(prevT, t, curve, hrp));
    prevT = t;
  }
  return out;
}

/** Seuil d'Otsu sur des valeurs (histogramme de 48 classes) : renvoie les moyennes basse et haute, le seuil et la part de variance expliquée. */
function otsu(v: number[]): { thr: number; lo: number; hi: number; explained: number; loShare: number } | null {
  if (v.length < 20) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.98)];
  if (!(top > 0.3)) return null;
  const bins = 48, w = top / bins;
  const h = new Array<number>(bins).fill(0);
  for (const x of v) h[Math.min(bins - 1, Math.floor(Math.min(x, top) / w))]++;
  const n = v.length;
  let sumAll = 0; for (let i = 0; i < bins; i++) sumAll += (i + 0.5) * w * h[i];
  const meanAll = sumAll / n;
  let varAll = 0; for (let i = 0; i < bins; i++) varAll += h[i] * ((i + 0.5) * w - meanAll) ** 2;
  varAll /= n;
  let best = -1, bestI = -1, wB = 0, sumB = 0;
  for (let i = 0; i < bins - 1; i++) {
    wB += h[i]; sumB += (i + 0.5) * w * h[i];
    const wF = n - wB;
    if (wB === 0 || wF === 0) continue;
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = (wB / n) * (wF / n) * (mB - mF) ** 2;
    if (between > best) { best = between; bestI = i; }
  }
  if (bestI < 0 || !(varAll > 0)) return null;
  let wB2 = 0, sB = 0; for (let i = 0; i <= bestI; i++) { wB2 += h[i]; sB += (i + 0.5) * w * h[i]; }
  const lo = sB / wB2, hi = (sumAll - sB) / (n - wB2);
  return { thr: (bestI + 1) * w, lo, hi, explained: best / varAll, loShare: wB2 / n };
}

export const MIN_WORK_SEC = 20;
export const MIN_REST_SEC = 10;
export const MIN_WORKS = 3;

/**
 * Détecte les efforts et récupérations d'une séance à intervalles. `null` si la vitesse ne montre pas deux régimes nets :
 * écart relatif entre « vite » et « lent » d'au moins 25 %, deux régimes qui expliquent au moins 60 % des variations, chacun présent au moins 10 % du temps, et au moins 3 efforts.
 */
export function detectIntervals(speed: Series, hr: Series, distanceM: number | null): IntervalResult | null {
  const v = speed.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 35).sort((a, b) => a[0] - b[0]);
  if (v.length < 60) return null;
  const gaps = v.slice(1).map((p, i) => p[0] - v[i][0]).sort((a, b) => a - b);
  const g = Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]));
  if (g > 15) return null;
  // rééchantillonnage régulier (pas g), les trous de plus de 30 s comptent pour une vitesse nulle (arrêt)
  const t0 = v[0][0], t1 = v[v.length - 1][0];
  const n = Math.floor((t1 - t0) / g) + 1;
  const grid: number[] = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * g;
    while (j < v.length - 2 && v[j + 1][0] <= t) j++;
    const a = v[j], b = v[j + 1];
    if (b[0] - a[0] > 30) { grid[i] = t - a[0] <= 15 ? a[1] : 0; continue; }
    grid[i] = b[0] === a[0] ? a[1] : a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  const win = Math.max(1, Math.round(15 / g)) | 1;
  const sm = grid.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - (win >> 1)); k <= Math.min(n - 1, i + (win >> 1)); k++) { s += grid[k]; c++; } return s / c; });
  const o = otsu(sm);
  if (!o || o.hi <= 0 || (o.hi - o.lo) / o.hi < 0.25 || o.explained < 0.6 || o.loShare < 0.1 || o.loShare > 0.9) return null;
  // deux régimes avec un peu d'hystérésis autour du seuil
  const margin = (o.hi - o.lo) * 0.1;
  let state = sm[0] >= o.thr;
  const lab: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (state && sm[i] < o.thr - margin) state = false;
    else if (!state && sm[i] > o.thr + margin) state = true;
    lab[i] = state;
  }
  // blocs, puis on absorbe les blocs trop courts dans leurs voisins
  type Run = { work: boolean; a: number; b: number };
  let runs: Run[] = [];
  for (let i = 0; i < n; i++) { const last = runs[runs.length - 1]; if (last && last.work === lab[i]) last.b = i; else runs.push({ work: lab[i], a: i, b: i }); }
  const lenSec = (r: Run) => (r.b - r.a + 1) * g;
  for (;;) {
    let idx = -1, worst = Infinity;
    runs.forEach((r, i) => { const need = r.work ? MIN_WORK_SEC : MIN_REST_SEC; const l = lenSec(r); if (l < need && l < worst) { worst = l; idx = i; } });
    if (idx < 0 || runs.length === 1) break;
    const r = runs[idx];
    if (idx === 0) runs[1].a = r.a; else if (idx === runs.length - 1) runs[idx - 1].b = r.b; else { runs[idx - 1].b = runs[idx + 1].b; runs.splice(idx + 1, 1); }
    runs.splice(idx === 0 ? 0 : idx, 1);
    // refusionner les voisins de même type
    const merged: Run[] = [];
    for (const x of runs) { const last = merged[merged.length - 1]; if (last && last.work === x.work) last.b = x.b; else merged.push({ ...x }); }
    runs = merged;
  }
  const nWork = runs.filter((r) => r.work).length;
  if (nWork < MIN_WORKS) return null;
  const curve = distanceCurve(speed, distanceM);
  const hrp = hrPoints(hr);
  const firstWork = runs.findIndex((r) => r.work), lastWork = runs.length - 1 - [...runs].reverse().findIndex((r) => r.work);
  const segments: IntervalSeg[] = [];
  let wi = 0, ri = 0;
  runs.forEach((r, i) => {
    const from = t0 + r.a * g, to = Math.min(t1, t0 + (r.b + 1) * g);
    const kind: IntervalKind = r.work ? 'work' : i < firstWork ? 'warmup' : i > lastWork ? 'cooldown' : 'rest';
    const rank = r.work ? ++wi : kind === 'rest' ? ++ri : 1;
    segments.push({ ...describe(from, to, curve, hrp), kind, rank });
  });
  return { segments, works: segments.filter((s) => s.kind === 'work'), thresholdMs: o.thr };
}
