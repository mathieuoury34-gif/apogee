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

// ------------------------------------------------------------------ charge d'effort à saturation (modèle d'EPOC)
// La charge d'une séance suit l'EPOC (consommation d'oxygène en excès après l'effort) : elle se construit vite avec l'intensité, puis
// SATURE avec la durée (une sortie de 2 h 15 facile ne pèse pas trois fois une heure : le corps ne s'endette pas indéfiniment). C'est le principe
// publié de Banister (1991, réponse impulsionnelle) et de Firstbeat (EPOC) ; les valeurs numériques sont ajustées par Apogée sur quatre séances de
// référence de ta montre Garmin (course, vélo, natation, renforcement : écart de 2 % au plus sur ces quatre). Ce n'est pas la formule de Garmin.
//   taux(x) = EPOC_GAIN · max(0, x − EPOC_ONSET)^EPOC_EXP   (x = FC ÷ FC max ; unités de charge par minute)
//   E(t) : tend vers taux · τ avec la constante de temps EPOC_TAU_MIN ; la charge de la séance est le pic de E.
export const EPOC_TAU_MIN = 44.7;
export const EPOC_ONSET = 0.5;
export const EPOC_EXP = 1.5;
export const EPOC_GAIN = 24.8;

/** Charge par minute à l'intensité `x` (fraction de la FC max). Nulle sous la moitié de la FC max. */
export function epocRate(x: number): number {
  return x <= EPOC_ONSET ? 0 : EPOC_GAIN * Math.pow(Math.min(x, 1.05) - EPOC_ONSET, EPOC_EXP);
}

/** Charge d'une séance depuis sa courbe cardiaque. `null` si la série est inexploitable. */
export function epocFromSeries(series: Series, hrMaxBpm: number, durationSec: number): { value: number; coverage: number } | null {
  if (series.length < MIN_SAMPLES_FOR_TRIMP || !(hrMaxBpm > 100)) return null;
  let e = 0, peak = 0, covered = 0, weighted = 0;
  for (const s of weightSamples(series)) {
    if (!s.dtSec) continue;
    const rate = epocRate(s.bpm / hrMaxBpm);
    const k = 1 - Math.exp(-s.dtSec / 60 / EPOC_TAU_MIN);
    e += (rate * EPOC_TAU_MIN - e) * k;
    if (e > peak) peak = e;
    covered += s.dtSec; weighted += rate * s.dtSec;
  }
  // trous du capteur : le temps manquant est supposé à l'intensité moyenne du reste de la séance
  const missing = durationSec - covered;
  if (missing > 60 && covered > 0) {
    const target = (weighted / covered) * EPOC_TAU_MIN;
    e += (target - e) * (1 - Math.exp(-missing / 60 / EPOC_TAU_MIN));
    if (e > peak) peak = e;
  }
  return { value: peak, coverage: durationSec > 0 ? Math.min(1, covered / durationSec) : 0 };
}

/** Charge d'une séance depuis sa FC moyenne seulement (estimation : une moyenne lisse les pics, la charge est un peu sous-estimée). */
export function epocFromAverage(avgBpm: number, durationSec: number, hrMaxBpm: number): number | null {
  if (!(avgBpm > 0) || !(durationSec > 0) || !(hrMaxBpm > 100)) return null;
  return epocRate(avgBpm / hrMaxBpm) * EPOC_TAU_MIN * (1 - Math.exp(-durationSec / 60 / EPOC_TAU_MIN));
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
  const buf = new Float64Array(series.length);
  for (let i = 0; i < series.length; i++) {
    while (series[i][0] - series[j][0] > windowSec) j++;
    if (series[i][0] - series[j][0] < windowSec * 0.75) continue;
    const n = i - j + 1;
    for (let k = 0; k < n; k++) buf[k] = series[j + k][1];
    const w = buf.subarray(0, n).sort();
    const m = n % 2 ? w[(n - 1) / 2] : (w[n / 2 - 1] + w[n / 2]) / 2;
    if (best === null || m > best) best = m;
  }
  return best;
}

// ------------------------------------------------------------------ cache par série
// Le nettoyage, le pic soutenu et la dérive d'une série ne dépendent que de ses points : on les calcule une
// seule fois par tableau (les enregistrements ne sont jamais modifiés en place, une modification crée un
// nouveau tableau). Avant, chaque enregistrement relançait ces calculs pour toutes les séances (≈ 100 ms
// pour 117 séances, bien davantage sur un téléphone).
export interface HrAnalysis { clean: Series; peak: number | null; drift: number | null }
const hrCache = new WeakMap<object, HrAnalysis>();

export function analyzeHr(raw: Series | null | undefined): HrAnalysis {
  if (!raw) return { clean: [], peak: null, drift: null };
  const hit = hrCache.get(raw);
  if (hit) return hit;
  const clean = cleanHr(raw);
  const res: HrAnalysis = { clean, peak: sustainedPeak(clean), drift: clean.length ? hrDrift(clean) : null };
  hrCache.set(raw, res);
  return res;
}
