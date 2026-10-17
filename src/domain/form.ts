// Forme du jour — composite sommeil / FC de repos / fraîcheur / RPE de la veille (PRD §5).
// Repris de metrics/dailyForm.ts avec deux corrections :
//  - la fraîcheur prise en compte est celle du DÉBUT de journée (fin de la veille) : avant, une séance
//    faite le matin faisait baisser la « forme du jour » du jour même, qui changeait donc dans la journée ;
//  - la référence personnelle (médiane, dispersion sur 14 jours) n'inclut plus le jour évalué lui-même,
//    qui atténuait son propre écart.
import { $t } from '../i18n';
import { addDays } from './dates';
import { median } from './hr';
import type { LoadSeries } from './load';
import { liveRecords, sessionDay } from './load';
import type { AppData } from './types';

export type FormKey = 'sleep' | 'restingHr' | 'hrv' | 'freshness' | 'previousRpe';
// Sans variabilité cardiaque (pas de capteur ou pas encore lue), les poids se renormalisent à l'identique de l'ancien calcul (0,30 / 0,25 / 0,30 / 0,15).
export const FORM_WEIGHTS: Record<FormKey, number> = { sleep: 0.24, restingHr: 0.2, hrv: 0.2, freshness: 0.24, previousRpe: 0.12 };
export const FORM_LABEL: Record<FormKey, string> = { sleep: $t("Sommeil"), restingHr: $t("FC de repos"), hrv: $t("Variabilité cardiaque"), freshness: $t("Fraîcheur"), previousRpe: $t("RPE de la veille") };
const DIRECTION: Record<FormKey, 1 | -1> = { sleep: 1, restingHr: -1, hrv: 1, freshness: 1, previousRpe: -1 };
const SPREAD_FLOOR: Record<FormKey, number> = { sleep: 1800, restingHr: 1.5, hrv: 4, freshness: 5, previousRpe: 0.8 };
export const FORM_WINDOW = 14;
export const MIN_OBSERVATIONS = 3;
export const MIN_TOTAL_WEIGHT = 0.5;

export interface FormComponent { key: FormKey; value: number; center: number; spread: number; score: number; weight: number; effectiveWeight: number }
export interface DailyForm { day: string; score: number; components: FormComponent[]; missing: FormKey[] }

export type FormStep = 'depleted' | 'strained' | 'steady' | 'ready' | 'fresh';
export const FORM_STEPS: FormStep[] = ['depleted', 'strained', 'steady', 'ready', 'fresh'];
export const FORM_STEP_LABEL: Record<FormStep, string> = { depleted: $t("Épuisé"), strained: $t("Entamé"), steady: $t("Correct"), ready: $t("Disponible"), fresh: $t("Frais") };
export function formStep(score: number): FormStep {
  return score >= 83 ? 'fresh' : score >= 65 ? 'ready' : score >= 45 ? 'steady' : score >= 25 ? 'strained' : 'depleted';
}

function sd(values: number[], center: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((t, v) => t + (v - center) ** 2, 0) / (values.length - 1));
}

export type FormInputs = Record<FormKey, Map<string, number>>;

export function formInputs(data: AppData, series: LoadSeries): FormInputs {
  const sleep = new Map<string, number>();
  for (const n of liveRecords(data.sleep)) sleep.set(n.nightDate, n.durationSec);
  const restingHr = new Map<string, number>();
  for (const r of liveRecords(data.resting)) restingHr.set(r.day, r.bpm);
  const hrv = new Map<string, number>();
  for (const r of liveRecords(data.hrv)) hrv.set(r.day, r.ms);
  const freshness = new Map<string, number>();
  for (const d of series.days) freshness.set(addDays(d.day, 1), d.freshness); // fraîcheur au réveil = fin de la veille
  if (series.firstDay) freshness.set(series.firstDay, series.seedLoad - series.seedLoad);
  const rpeByDay = new Map<string, number>();
  for (const s of liveRecords(data.actual)) {
    if (!s.rpe) continue;
    const d = sessionDay(s);
    rpeByDay.set(d, Math.max(rpeByDay.get(d) ?? 0, s.rpe));
  }
  const previousRpe = new Map<string, number>();
  for (const [d, v] of rpeByDay) previousRpe.set(addDays(d, 1), v);
  return { sleep, restingHr, hrv, freshness, previousRpe };
}

export function computeDailyForm(day: string, inputs: FormInputs): DailyForm | null {
  const components: FormComponent[] = [];
  const missing: FormKey[] = [];
  for (const key of Object.keys(FORM_WEIGHTS) as FormKey[]) {
    const s = inputs[key];
    if (!s || (key === 'hrv' && s.size === 0)) continue; // pas de capteur de variabilité cardiaque : ni manquante ni pesée
    const value = s.get(day);
    if (value === undefined) { missing.push(key); continue; }
    const win: number[] = [];
    for (let k = 1; k <= FORM_WINDOW; k++) { const v = s.get(addDays(day, -k)); if (v !== undefined) win.push(v); }
    if (win.length < MIN_OBSERVATIONS) { missing.push(key); continue; }
    const med = median(win) ?? value;
    const center = key === 'freshness' ? 0 : med;
    const spread = Math.max(sd(win, med), SPREAD_FLOOR[key]);
    const z = Math.max(-2, Math.min(2, (value - center) / spread)) * DIRECTION[key];
    components.push({ key, value, center, spread, score: Math.max(0, Math.min(100, 50 + 25 * z)), weight: FORM_WEIGHTS[key], effectiveWeight: 0 });
  }
  const total = components.reduce((t, c) => t + c.weight, 0);
  if (total < MIN_TOTAL_WEIGHT) return null;
  let score = 0;
  for (const c of components) { c.effectiveWeight = c.weight / total; score += c.score * c.effectiveWeight; }
  return { day, score, components, missing };
}

export function formHistory(inputs: FormInputs, from: string, to: string): Map<string, DailyForm> {
  const out = new Map<string, DailyForm>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const f = computeDailyForm(d, inputs);
    if (f) out.set(d, f);
  }
  return out;
}
