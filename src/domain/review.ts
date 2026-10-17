// Bilan de séance et alertes (repris de metrics/sessionReview.ts et trainingAlerts.ts).
// Changements : le « rapport aux habitudes » compare désormais à la médiane des 8 dernières semaines
// de la même discipline (avant : tout l'historique, toutes méthodes de charge confondues) ;
// l'alerte de hausse de charge rapide (LOAD_RAMP), déclarée mais jamais produite, existe enfin.
import { $t } from '../i18n';
import { estimateDistance, estimateDuration, hasSet, type Certainty, type RefValues } from './blocks';
import { addDays } from './dates';
import { median } from './hr';
import type { CoachConstat, SessionLoad } from './load';
import { liveRecords, sessionDay } from './load';
import type { Links } from './links';
import type { ActualSession, AppData, PlannedSession } from './types';

export const PLAN_TOLERANCE = 0.1;
export const PLAN_GAP_ALERT = 0.25;
const HABIT_HIGH = 1.15, HABIT_LOW = 0.85;
const DRIFT_MIN_SEC = 20 * 60;
export const DRIFT_ALERT = 0.08;
export const RPE_HIGH = 8;

export type Verdict = 'onPlan' | 'shorter' | 'longer' | 'above' | 'typical' | 'below' | 'pending';
export const VERDICT_TEXT: Record<Verdict, string> = {
  onPlan: $t("Conforme à ce qui était prévu"),
  shorter: $t("Plus courte que ce qui était prévu"),
  longer: $t("Plus longue que ce qui était prévu"),
  above: $t("Plus chargée que tes séances habituelles"),
  typical: $t("Charge conforme à tes séances habituelles"),
  below: $t("Plus légère que tes séances habituelles"),
  pending: $t("Charge en attente de ton ressenti"),
};

export interface PlanComparison {
  planned: PlannedSession;
  expectedDuration: number | null; durationCertainty: Certainty;
  expectedDistance: number | null; distanceCertainty: Certainty;
  usedRefs: boolean;
  structured: boolean;
  axis: 'duration' | 'distance' | null;
  ratio: number | null;
  durationDelta: number | null;
  distanceDelta: number | null;
  /** Comparaison limitée à la partie de l'enchaînement qui correspond à la discipline réalisée. */
  part: boolean;
}

/** Blocs du prévu qui concernent la séance réalisée : pour un BRICK, seulement la partie de sa discipline
 *  (avant, la course d'un enchaînement était comparée à la durée totale vélo + course : « plus courte que prévu »). */
export function blocksFor(planned: PlannedSession, discipline: string | undefined) {
  if (planned.discipline !== 'BRICK' || !discipline) return { blocks: planned.blocks, discipline: planned.discipline };
  const part = planned.blocks.filter((b) => b.discipline === discipline);
  return part.length ? { blocks: part, discipline: discipline as PlannedSession['discipline'] } : { blocks: planned.blocks, discipline: planned.discipline };
}

export function comparePlan(planned: PlannedSession, actual: Pick<ActualSession, 'durationSec' | 'distanceM'> & { discipline?: string }, refs: RefValues): PlanComparison {
  const part = blocksFor(planned, actual.discipline);
  const dur = estimateDuration(part.blocks, part.discipline, refs);
  const dist = estimateDistance(part.blocks, part.discipline, refs);
  const ed = dur.certainty === 'unknown' ? null : dur.value;
  const em = dist.certainty === 'unknown' ? null : dist.value;
  const hasDist = actual.distanceM !== null && actual.distanceM > 0;
  let axis: PlanComparison['axis'] = null;
  if (dur.certainty === 'exact') axis = 'duration';
  else if (hasDist && dist.certainty === 'exact') axis = 'distance';
  else if (dur.certainty === 'partial') axis = 'duration';
  else if (hasDist && dist.certainty !== 'unknown') axis = 'distance';
  let ratio: number | null = null;
  if (axis === 'duration' && ed) ratio = actual.durationSec / ed;
  if (axis === 'distance' && em && actual.distanceM) ratio = actual.distanceM / em;
  return {
    planned, expectedDuration: ed, durationCertainty: dur.certainty, expectedDistance: em, distanceCertainty: dist.certainty,
    usedRefs: dur.usedRefs || dist.usedRefs, structured: hasSet(part.blocks), axis, ratio, part: part.blocks.length !== planned.blocks.length,
    durationDelta: ed === null ? null : actual.durationSec - ed,
    distanceDelta: em === null || actual.distanceM === null ? null : actual.distanceM - em,
  };
}

export function habitRatio(data: AppData, loads: Map<string, SessionLoad>, s: ActualSession): number | null {
  const l = loads.get(s.id);
  if (!l || l.load === null) return null;
  const day = sessionDay(s), from = addDays(day, -56);
  const ref = median(liveRecords(data.actual).filter((x) => {
    if (x.id === s.id || x.discipline !== s.discipline) return false;
    const d = sessionDay(x);
    const xl = loads.get(x.id);
    return d >= from && d <= day && !!xl && xl.load !== null && xl.method !== 'provisional';
  }).map((x) => loads.get(x.id)!.load!));
  return ref && ref > 0 ? l.load / ref : null;
}

export function verdictFor(planRatio: number | null, habit: number | null): { verdict: Verdict; basis: 'plan' | 'habits' | 'none' } {
  if (planRatio !== null) {
    if (Math.abs(planRatio - 1) <= PLAN_TOLERANCE) return { verdict: 'onPlan', basis: 'plan' };
    return { verdict: planRatio < 1 ? 'shorter' : 'longer', basis: 'plan' };
  }
  if (habit !== null) return { verdict: habit > HABIT_HIGH ? 'above' : habit < HABIT_LOW ? 'below' : 'typical', basis: 'habits' };
  return { verdict: 'pending', basis: 'none' };
}

export type DriftReason = 'continuous' | 'noValue' | 'tooShort' | 'structured' | 'unknownStructure';
export const DRIFT_REASON_TEXT: Record<DriftReason, string> = {
  noValue: $t("Pas de série de fréquence cardiaque exploitable pour cette séance."),
  tooShort: $t("Séance trop courte pour qu’une dérive veuille dire quelque chose."),
  structured: $t("Le plan rattaché contient une série (fractionné) : la dérive reflète la structure de la séance, pas l’effort continu."),
  unknownStructure: $t("Aucun plan rattaché : impossible de savoir si l’effort était continu ou fractionné."),
  continuous: $t("Effort continu, dérive interprétable."),
};

export function readDrift(drift: number | null, durationSec: number, plan: PlanComparison | null): { value: number | null; interpretable: boolean; reason: DriftReason } {
  if (drift === null) return { value: null, interpretable: false, reason: 'noValue' };
  if (durationSec < DRIFT_MIN_SEC) return { value: drift, interpretable: false, reason: 'tooShort' };
  if (!plan) return { value: drift, interpretable: false, reason: 'unknownStructure' };
  if (plan.structured) return { value: drift, interpretable: false, reason: 'structured' };
  return { value: drift, interpretable: true, reason: 'continuous' };
}

export interface SessionReview {
  plan: PlanComparison | null;
  habit: number | null;
  verdict: Verdict;
  basis: 'plan' | 'habits' | 'none';
  drift: ReturnType<typeof readDrift>;
  alerts: { code: 'HR_DRIFT_HIGH' | 'PLAN_GAP'; value: number }[];
}

export function reviewSession(data: AppData, loads: Map<string, SessionLoad>, links: Links, refs: RefValues, s: ActualSession): SessionReview {
  const link = links.byActual.get(s.id);
  const planned = link?.plannedId ? data.planned[link.plannedId] : undefined;
  const plan = planned && !planned.deleted ? comparePlan(planned, s, refs) : null;
  const habit = habitRatio(data, loads, s);
  const { verdict, basis } = verdictFor(plan?.ratio ?? null, habit);
  const drift = readDrift(loads.get(s.id)?.drift ?? null, s.durationSec, plan);
  const alerts: SessionReview['alerts'] = [];
  if (drift.interpretable && drift.value !== null && drift.value > DRIFT_ALERT) alerts.push({ code: 'HR_DRIFT_HIGH', value: drift.value });
  if (plan?.ratio != null && Math.abs(plan.ratio - 1) > PLAN_GAP_ALERT) alerts.push({ code: 'PLAN_GAP', value: plan.ratio });
  return { plan, habit, verdict, basis, drift, alerts };
}

// ------------------------------------------------------------------ alertes de période (accueil)
export type TrainingAlertCode = 'MISSED_SESSIONS' | 'RPE_HIGH_STREAK' | 'LOAD_RAMP' | 'PENDING_RPE' | 'INJURY_LOAD';
export interface TrainingAlert { code: TrainingAlertCode; count: number; value?: number }

export function suspendedDays(data: AppData, from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const i of liveRecords(data.interruptions)) {
    if (!i.suspendsReminders || i.endDate < from || i.startDate > to) continue;
    for (let d = i.startDate < from ? from : i.startDate; d <= (i.endDate > to ? to : i.endDate); d = addDays(d, 1)) out.add(d);
  }
  return out;
}

/** Une blessure déclarée « active » dans le profil, pendant que la charge récente monte (rapport aigu/chronique ≥ 1,3 ou semaine ≥ 25 % au-dessus de la précédente). */
export const INJURY_RATIO = 1.3;
export const INJURY_WEEK_RISE = 0.25;

export function trainingAlerts(data: AppData, links: Links, loads: Map<string, SessionLoad>, constat: CoachConstat, todayDay: string, series?: { byDay: Map<string, { load: number }> }): TrainingAlert[] {
  const out: TrainingAlert[] = [];
  const active = (data.athlete.main?.injuries ?? []).filter((i) => !i.resolved);
  if (active.length) {
    const week = (from: number) => { let t = 0; for (let k = from; k < from + 7; k++) t += series?.byDay.get(addDays(todayDay, -k))?.load ?? 0; return t; };
    const a = week(0), b = week(7);
    const rising = (constat.acuteChronicRatio !== null && constat.acuteChronicRatio >= INJURY_RATIO) || (b > 0 && a / b - 1 >= INJURY_WEEK_RISE);
    if (rising) out.push({ code: 'INJURY_LOAD', count: active.length, value: constat.acuteChronicRatio ?? (b > 0 ? a / b : undefined) });
  }
  const from = addDays(todayDay, -7), to = addDays(todayDay, -1);
  const susp = suspendedDays(data, from, to);
  const missed = liveRecords(data.planned).filter((p) => p.plannedDate >= from && p.plannedDate <= to && !links.byPlanned.has(p.id) && !susp.has(p.plannedDate)).length;
  if (missed) out.push({ code: 'MISSED_SESSIONS', count: missed });
  const withRpe = liveRecords(data.actual).filter((s) => s.rpe !== null).sort((a, b) => (a.startAt < b.startAt ? 1 : -1)).slice(0, 3);
  if (withRpe.length === 3 && withRpe.every((s) => (s.rpe ?? 0) >= RPE_HIGH)) out.push({ code: 'RPE_HIGH_STREAK', count: 3 });
  if (constat.acuteChronicRatio !== null && constat.acuteChronicRatio > 1.5) out.push({ code: 'LOAD_RAMP', count: 0, value: constat.acuteChronicRatio });
  const pend = liveRecords(data.actual).filter((s) => {
    const l = loads.get(s.id);
    return (l?.method === 'pending' || l?.method === 'provisional') && sessionDay(s) >= addDays(todayDay, -14);
  }).length;
  if (pend) out.push({ code: 'PENDING_RPE', count: pend });
  return out;
}

export const ALERT_TEXT: Record<TrainingAlertCode, (a: TrainingAlert) => string> = {
  MISSED_SESSIONS: (a) => (a.count > 1 ? $t("{0} séances prévues non réalisées sur les 7 derniers jours.", { 0: a.count }) : $t("1 séance prévue non réalisée sur les 7 derniers jours.")),
  RPE_HIGH_STREAK: () => $t("3 séances de suite à ressenti élevé (RPE 8 ou plus)."),
  LOAD_RAMP: (a) => $t("Hausse de charge rapide : ratio aigu/chronique à {0} (au-delà de 1,5).", { 0: (a.value ?? 0).toFixed(2).replace('.', $t(",")) }),
  INJURY_LOAD: (a) => (a.count > 1 ? $t("{0} blessures actives et une charge récente qui monte : prudence sur les prochaines séances.", { 0: a.count }) : $t("Une blessure active et une charge récente qui monte : prudence sur les prochaines séances.")),
  PENDING_RPE: (a) => (a.count > 1 ? $t("{0} séances récentes attendent ton ressenti pour une charge fiable.", { 0: a.count }) : $t("1 séance récente attend ton ressenti pour une charge fiable.")),
};
