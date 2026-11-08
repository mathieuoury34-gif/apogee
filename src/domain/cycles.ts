// Cycles de charge : sous-catégories d'un bloc de périodisation (une période de MONTÉE de la charge ou de DESCENTE,
// la semaine de décharge). Les cycles sont rangés dans le bloc (`TrainingPhase.cycles`), datés, sans chevauchement.
// Couleurs (pastel, teintées sur le fond de l'appli) : montée = dégradé bleu → violet selon le rang dans la série de
// montées (1re = bleu, dernière = violet) ; descente = vert clair.
import { addDays, daysBetween } from './dates';
import { $t } from '../i18n';
import type { PhaseCycle, TrainingPhase } from './types';

export const CYCLE_KINDS = ['up', 'down'] as const;
export type CycleIssueCode = 'CYCLE_DATES_INVERTED' | 'CYCLE_OUTSIDE_PHASE' | 'CYCLE_OVERLAP';
export const CYCLE_ISSUE_TEXT: Record<CycleIssueCode, string> = {
  CYCLE_DATES_INVERTED: $t("Un cycle a sa date de fin avant sa date de début."),
  CYCLE_OUTSIDE_PHASE: $t("Un cycle sort des dates du bloc."),
  CYCLE_OVERLAP: $t("Deux cycles se chevauchent."),
};

const byStart = (a: PhaseCycle, b: PhaseCycle) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);

/** Problèmes d'une liste de cycles dans un bloc (codes sans doublon). */
export function validateCycles(cycles: PhaseCycle[] | null | undefined, phaseStart: string, phaseEnd: string): CycleIssueCode[] {
  const out = new Set<CycleIssueCode>();
  const list = [...(cycles ?? [])].sort(byStart);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.endDate < c.startDate) out.add('CYCLE_DATES_INVERTED');
    if (c.startDate < phaseStart || c.endDate > phaseEnd) out.add('CYCLE_OUTSIDE_PHASE');
    if (i > 0 && c.startDate <= list[i - 1].endDate) out.add('CYCLE_OVERLAP');
  }
  return [...out];
}

/** Teinte pastel d'un cycle. `rank` = rang (0…) parmi les montées consécutives, `count` = nombre de montées de la série. */
export function cycleColor(kind: PhaseCycle['kind'], rank = 0, count = 1): string {
  if (kind === 'down') return 'hsl(140 52% 62%)';
  const t = count > 1 ? Math.min(1, Math.max(0, rank / (count - 1))) : 0;
  return `hsl(${Math.round(212 + t * 64)} 68% 62%)`;
}

export interface CycleInfo {
  cycle: PhaseCycle;
  /** Rang dans la série de montées (1…) ; 0 pour une descente. */
  rank: number;
  /** Nombre de montées de la série (0 pour une descente). */
  count: number;
  color: string;
  /** « Montée 2/3 », « Descente » ou le nom donné au cycle. */
  text: string;
}

/** Cycles d'un bloc, triés, avec leur rang dans la série de montées (une descente interrompt la série). */
export function cycleInfos(cycles: PhaseCycle[] | null | undefined): CycleInfo[] {
  const list = [...(cycles ?? [])].sort(byStart);
  const out: CycleInfo[] = [];
  let i = 0;
  while (i < list.length) {
    if (list[i].kind === 'down') {
      out.push({ cycle: list[i], rank: 0, count: 0, color: cycleColor('down'), text: list[i].label?.trim() || $t("Descente") });
      i++; continue;
    }
    let j = i;
    while (j < list.length && list[j].kind === 'up') j++;
    const n = j - i;
    for (let k = i; k < j; k++) out.push({ cycle: list[k], rank: k - i + 1, count: n, color: cycleColor('up', k - i, n), text: list[k].label?.trim() || $t("Montée") + ' ' + (k - i + 1) + '/' + n });
    i = j;
  }
  return out;
}

/** Cycle en vigueur un jour donné (et le bloc qui le contient), sinon null. */
export function cycleAt(phases: TrainingPhase[], day: string): { phase: TrainingPhase; info: CycleInfo } | null {
  for (const p of phases) {
    if (p.startDate > day || day > p.endDate || !p.cycles?.length) continue;
    const info = cycleInfos(p.cycles).find((x) => x.cycle.startDate <= day && day <= x.cycle.endDate);
    if (info) return { phase: p, info };
  }
  return null;
}

/** Cycles semaine par semaine depuis le début du bloc : `up` semaines de montée puis 1 de descente, en boucle (la dernière est tronquée à la fin du bloc). */
export function weeklyCycles(start: string, end: string, up: number): PhaseCycle[] {
  const out: PhaseCycle[] = [];
  const n = Math.max(1, Math.round(up));
  for (let w = 0; addDays(start, w * 7) <= end; w++) {
    const s = addDays(start, w * 7);
    const e = addDays(s, 6) > end ? end : addDays(s, 6);
    out.push({ kind: w % (n + 1) === n ? 'down' : 'up', startDate: s, endDate: e, label: null });
  }
  return out;
}

/** Texte court pour le coach / les listes : « 07/10 → 13/10 montée ». */
export const cycleLength = (c: PhaseCycle) => daysBetween(c.startDate, c.endDate) + 1;
