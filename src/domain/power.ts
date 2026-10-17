// Puissance vélo : nettoyage de la série, meilleures puissances par durée, puissance normalisée, FTP estimée.
// Rien n'est enregistré : tout est recalculé depuis la série `power` de la séance (APK, capteur de puissance).
import { addDays } from './dates';
import { mean } from './hr';
import { liveRecords, sessionDay } from './load';
import type { AppData, WeightReading, ZoneReading } from './types';

type Pts = [number, number][];
const MAX_DT = 30;
export const MAX_PLAUSIBLE_W = 2500;

export function cleanPower(raw: Pts | null | undefined): Pts {
  return (raw ?? []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= MAX_PLAUSIBLE_W).sort((a, b) => a[0] - b[0]);
}

/** Agrégats stockés avec la séance (comme la FC et la vitesse). */
export function powerAggregates(power: Pts) {
  if (power.length < 10) return { avgPowerW: null, maxPowerW: null };
  const v = power.map((p) => p[1]);
  return { avgPowerW: Math.round(mean(v)!), maxPowerW: Math.round(Math.max(...v)) };
}

/** Puissance moyenne la plus haute tenue pendant `windowSec` secondes (maintien de la dernière valeur, trous de plus de 30 s plafonnés). */
export function bestPowerOver(power: Pts, windowSec: number): number | null {
  if (power.length < 10) return null;
  const t = power.map((p) => p[0]);
  const cum: number[] = [0];
  for (let i = 1; i < power.length; i++) cum.push(cum[i - 1] + power[i - 1][1] * Math.min(MAX_DT, t[i] - t[i - 1]));
  let best: number | null = null, j = 0;
  for (let i = 0; i < power.length; i++) {
    while (t[i] - t[j] > windowSec) j++;
    if (t[i] - t[j] < windowSec * 0.97) continue;
    const v = (cum[i] - cum[j]) / (t[i] - t[j]);
    if (best === null || v > best) best = v;
  }
  return best;
}

/** Puissance normalisée (Coggan) : moyenne quatrième puissance de la moyenne glissante sur 30 s. */
export function normalizedPower(power: Pts): number | null {
  if (power.length < 60) return null;
  const t0 = Math.floor(power[0][0]), t1 = Math.floor(power[power.length - 1][0]);
  const n = t1 - t0 + 1;
  if (n < 120 || n > 12 * 3600) return null;
  const grid = new Float64Array(n);
  let k = 0;
  for (let s = 0; s < n; s++) {
    const t = t0 + s;
    while (k + 1 < power.length && power[k + 1][0] <= t) k++;
    grid[s] = t - power[k][0] <= MAX_DT ? power[k][1] : 0;
  }
  const W = 30;
  let sum = 0, acc = 0, cnt = 0;
  for (let s = 0; s < n; s++) {
    acc += grid[s];
    if (s >= W) acc -= grid[s - W];
    if (s >= W - 1) { const a = acc / W; sum += a ** 4; cnt++; }
  }
  return cnt ? (sum / cnt) ** 0.25 : null;
}

export interface PowerStats { avg: number; max: number; np: number | null; variability: number | null; ifactor: number | null; tss: number | null }

/** Statistiques d'une sortie ; `ftp` (W) sert à l'indice d'intensité et au TSS indicatif. */
export function powerStats(power: Pts, durationSec: number, ftp: number | null): PowerStats | null {
  if (power.length < 10) return null;
  const a = powerAggregates(power);
  if (a.avgPowerW === null) return null;
  const np = normalizedPower(power);
  const ifactor = np !== null && ftp ? np / ftp : null;
  return {
    avg: a.avgPowerW, max: a.maxPowerW!, np,
    variability: np !== null && a.avgPowerW > 0 ? np / a.avgPowerW : null,
    ifactor,
    tss: ifactor !== null ? (durationSec / 3600) * ifactor * ifactor * 100 : null,
  };
}

// ------------------------------------------------------------------ poids pour les W/kg
/** Dernière pesée connue au plus tard le `day` (ou, à défaut, la première pesée suivante dans les 30 jours). */
export function weightAt(data: AppData, day: string): number | null {
  const all = liveRecords(data.weight).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!all.length) return null;
  let cur: WeightReading | null = null;
  for (const w of all) { if (w.day <= day) cur = w; else break; }
  if (cur) return cur.kg;
  const next = all.find((w) => w.day > day && w.day <= addDays(day, 30));
  return next ? next.kg : null;
}

// ------------------------------------------------------------------ meilleures puissances
export interface PowerSpec { label: string; sec: number; maxW: number }
export const POWER_SPECS: PowerSpec[] = [
  { label: '5 s', sec: 5, maxW: 2500 },
  { label: '1 min', sec: 60, maxW: 1500 },
  { label: '5 min', sec: 300, maxW: 800 },
  { label: '20 min', sec: 1200, maxW: 600 },
  { label: '60 min', sec: 3600, maxW: 500 },
];
export interface PowerRecord { spec: PowerSpec; watts: number; day: string; sessionId: string; perKg: number | null; previous: { watts: number; day: string } | null }

export function powerRecords(data: AppData): PowerRecord[] {
  const sessions = liveRecords(data.actual).filter((s) => s.discipline === 'BIKE' && data.series[s.id] && !data.series[s.id].deleted && data.series[s.id].power?.length);
  const out: PowerRecord[] = [];
  for (const spec of POWER_SPECS) {
    const cands: { watts: number; day: string; sessionId: string }[] = [];
    for (const s of sessions) {
      const w = bestPowerOver(cleanPower(data.series[s.id].power), spec.sec);
      if (w === null || w > spec.maxW) continue;
      cands.push({ watts: w, day: sessionDay(s), sessionId: s.id });
    }
    cands.sort((a, b) => b.watts - a.watts);
    if (!cands.length) continue;
    const best = cands[0];
    const prev = cands.filter((c) => c.day < best.day)[0];
    const kg = weightAt(data, best.day);
    out.push({ spec, ...best, perKg: kg ? best.watts / kg : null, previous: prev ? { watts: prev.watts, day: prev.day } : null });
  }
  return out;
}

// ------------------------------------------------------------------ estimation de la FTP
export interface FtpSuggestion { value: number; current: ZoneReading | null; day: string; sessionId: string; note: string }

/** FTP ≈ 95 % de la meilleure puissance moyenne sur 20 minutes des 90 derniers jours (test classique). Proposée si elle dépasse la FTP actuelle d'au moins 1 %. */
export function suggestFtp(data: AppData, current: ZoneReading | null, todayDay: string): FtpSuggestion | null {
  const since = addDays(todayDay, -90);
  let best: { w: number; day: string; id: string } | null = null;
  for (const s of liveRecords(data.actual)) {
    if (s.discipline !== 'BIKE') continue;
    const day = sessionDay(s);
    if (day < since) continue;
    const ser = data.series[s.id];
    if (!ser || ser.deleted || !ser.power?.length) continue;
    const w = bestPowerOver(cleanPower(ser.power), 1200);
    if (w !== null && w <= 600 && (!best || w > best.w)) best = { w, day, id: s.id };
  }
  if (!best) return null;
  const value = Math.round(best.w * 0.95);
  if (current && value < current.value * 1.01) return null;
  return { value, current, day: best.day, sessionId: best.id, note: '95 % de la meilleure puissance moyenne sur 20 minutes des 90 derniers jours' };
}
