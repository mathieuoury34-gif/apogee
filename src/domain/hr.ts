// Séries de fréquence cardiaque, TRIMP de Banister et dérive cardiaque — fonctions pures.
// Repris tels quels de la version Android (metrics/hrSeries.ts, trimp.ts, sessionAggregates.ts),
// avec un ajout : le TRIMP « sur FC moyenne » (formule historique de Banister) pour une séance
// saisie à la main qui ne porte qu'une FC moyenne. Il était auparavant ignoré.

export type Series = [number, number][];

export const NOMINAL_SAMPLE_SEC = 11;
export const MAX_GAP_SEC = 33;
export const MIN_PLAUSIBLE_BPM = 25;
export const MAX_PLAUSIBLE_BPM = 230;

export function cleanHr(series: Series | null | undefined): Series {
  if (!series) return [];
  const out = series.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= MIN_PLAUSIBLE_BPM && p[1] <= MAX_PLAUSIBLE_BPM);
  return out.sort((a, b) => a[0] - b[0]);
}

export interface WeightedSample { at: number; bpm: number; dtSec: number }

/** Chaque échantillon porte la durée qui le sépare du suivant, plafonnée (un trou n'est facturé à personne). */
export function weightSamples(series: Series): WeightedSample[] {
  const out: WeightedSample[] = [];
  for (let i = 0; i < series.length; i++) {
    const cur = series[i];
    const next = series[i + 1];
    const raw = next ? next[0] - cur[0] : NOMINAL_SAMPLE_SEC;
    out.push({ at: cur[0], bpm: cur[1], dtSec: Math.max(0, Math.min(raw, MAX_GAP_SEC)) });
  }
  return out;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ------------------------------------------------------------------ TRIMP
export type Sex = 'M' | 'F';
const COEF: Record<Sex, { a: number; b: number }> = { M: { a: 0.64, b: 1.92 }, F: { a: 0.86, b: 1.64 } };
export const MIN_SAMPLES_FOR_TRIMP = 10;
export const MIN_HR_RESERVE_BPM = 20;

export interface TrimpContext { hrMaxBpm: number; hrRestBpm: number; sex: Sex }

function hrr(bpm: number, c: TrimpContext): number {
  return Math.min(1, Math.max(0, (bpm - c.hrRestBpm) / (c.hrMaxBpm - c.hrRestBpm)));
}

/** TRIMP exponentiel échantillon par échantillon. `null` si la série est inexploitable. */
export function trimpFromSeries(series: Series, c: TrimpContext, durationSec: number): { value: number; coverage: number } | null {
  if (series.length < MIN_SAMPLES_FOR_TRIMP || c.hrMaxBpm - c.hrRestBpm < MIN_HR_RESERVE_BPM) return null;
  const { a, b } = COEF[c.sex];
  let value = 0, covered = 0;
  for (const s of weightSamples(series)) {
    if (!s.dtSec) continue;
    const r = hrr(s.bpm, c);
    value += (s.dtSec / 60) * r * a * Math.exp(b * r);
    covered += s.dtSec;
  }
  return { value, coverage: durationSec > 0 ? Math.min(1, covered / durationSec) : 0 };
}

/** TRIMP de Banister sur la FC moyenne (formule d'origine, 1991) : durée × HRr × a·e^(b·HRr). */
export function trimpFromAverage(avgBpm: number, durationSec: number, c: TrimpContext): number | null {
  if (!(avgBpm > 0) || !(durationSec > 0) || c.hrMaxBpm - c.hrRestBpm < MIN_HR_RESERVE_BPM) return null;
  const { a, b } = COEF[c.sex];
  const r = hrr(avgBpm, c);
  return (durationSec / 60) * r * a * Math.exp(b * r);
}

/** sRPE de Foster : RPE × minutes (échelle propre, recalée ensuite sur celle du TRIMP). */
export function srpe(rpe: number, durationSec: number): number {
  return rpe * (durationSec / 60);
}

// ------------------------------------------------------------------ dérive cardiaque
const MIN_HALF_SEC = 300;
const MIN_HALF_SAMPLES = 10;

export function hrDrift(series: Series): number | null {
  const s = weightSamples(series).filter((x) => x.dtSec > 0);
  if (s.length < MIN_HALF_SAMPLES * 2) return null;
  const mid = s[0].at + (s[s.length - 1].at - s[0].at) / 2;
  const wm = (g: WeightedSample[]) => {
    const w = g.reduce((t, x) => t + x.dtSec, 0);
    if (w < MIN_HALF_SEC || g.length < MIN_HALF_SAMPLES) return null;
    return g.reduce((t, x) => t + x.bpm * x.dtSec, 0) / w;
  };
  const a = wm(s.filter((x) => x.at < mid)), b = wm(s.filter((x) => x.at >= mid));
  if (a === null || b === null || a <= 0) return null;
  return (b - a) / a;
}

// ------------------------------------------------------------------ agrégats de séance (ingestion)
const AGG_GAP = 60;
export function aggregates(hr: Series, speed: Series, durationSec: number) {
  const hv = hr.map((p) => p[1]);
  const sv = speed.map((p) => p[1]);
  let covered = 0;
  for (let i = 1; i < hr.length; i++) {
    const g = hr[i][0] - hr[i - 1][0];
    if (g > 0 && g <= AGG_GAP) covered += g;
  }
  return {
    avgHrBpm: mean(hv),
    maxHrBpm: hv.length ? Math.round(Math.max(...hv)) : null,
    minHrBpm: hv.length ? Math.round(Math.min(...hv)) : null,
    hrCoverageRatio: hr.length > 1 && durationSec > 0 ? Math.min(1, covered / durationSec) : null,
    hrSampleCount: hr.length,
    avgSpeedMs: mean(sv),
    maxSpeedMs: sv.length ? Math.max(...sv) : null,
  };
}

/**
 * Pic « soutenu » d'une séance : plus haute médiane glissante sur 60 s. Remplace le 99ᵉ centile brut,
 * trop sensible aux décrochages du capteur optique (accrochage sur la cadence en renforcement).
 */
export function sustainedPeak(series: Series, windowSec = 60): number | null {
  if (series.length < 30) return null;
  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < series.length; i++) {
    while (series[i][0] - series[j][0] > windowSec) j++;
    if (series[i][0] - series[j][0] < windowSec * 0.75) continue;
    const m = median(series.slice(j, i + 1).map((p) => p[1]));
    if (m !== null && (best === null || m > best)) best = m;
  }
  return best;
}
