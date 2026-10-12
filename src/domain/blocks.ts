// Séances planifiées : blocs, estimation durée/distance, validation (repris de planning/plannedSessions.ts).
// Deux améliorations par rapport à la version Android :
//  1. une allure ou une vitesse en FOURCHETTE est estimée au milieu de la fourchette (avant : borne basse,
//     c.-à-d. l'allure la plus rapide → durée systématiquement sous-estimée) ;
//  2. une cible RELATIVE (% VMA, % CSS) est résolue avec le dernier relevé connu pour estimer durée et
//     distance — le total devient alors « estimé » plutôt que « inconnu ». Le bloc lui-même reste écrit
//     en pourcentage (format d'échange inchangé).
import { $t } from '../i18n';
import type { Block, BlockKind, PlannedDiscipline, PlannedSession } from './types';

export interface RefValues {
  /** m/s */
  vma: number | null;
  /** m/s (vitesse à la CSS) */
  css: number | null;
  ftp: number | null;
  hrMax: number | null;
}
export const NO_REFS: RefValues = { vma: null, css: null, ftp: null, hrMax: null };

export function newBlock(kind: BlockKind = 'WORK'): Block {
  const isSet = kind === 'SET';
  return {
    kind, measure: isSet ? null : 'TIME', measureValue: isSet ? null : kind === 'WARMUP' || kind === 'COOLDOWN' ? 600 : null,
    setMode: isSet ? 'REPEAT' : null, setCount: isSet ? 4 : null, setWindowS: null,
    targetType: 'NONE', targetLow: null, targetHigh: null, relativeTo: null,
    label: null, notes: null, discipline: null, children: isSet ? [newBlock('WORK'), { ...newBlock('RECOVERY'), measureValue: 90 }] : [],
  };
}

export type Certainty = 'exact' | 'partial' | 'unknown';
export interface Estimate { value: number; certainty: Certainty; untimed: number; usedRefs: boolean; /** blocs sans cible, estimés à l'allure d'endurance (70 % VMA, 90 % CSS) */ approx: number }

/** Allure d'endurance par défaut, quand un bloc n'a pas de cible : 70 % de la VMA, 90 % de la vitesse CSS. */
export function fallbackSpeed(d: PlannedDiscipline | null, refs: RefValues): number | null {
  if (d === 'RUN' && refs.vma) return refs.vma * 0.7;
  if (d === 'SWIM' && refs.css) return refs.css * 0.9;
  return null;
}

const paceUnit = (d: PlannedDiscipline | null) => (d === 'SWIM' ? 100 : 1000);

/** Vitesse (m/s) tirée de la cible d'un bloc, ou null. */
export function blockSpeed(b: Block, d: PlannedDiscipline | null, refs: RefValues): { ms: number; viaRef: boolean } | null {
  if (b.targetLow === null || b.targetLow <= 0) return null;
  const mid = b.targetHigh !== null && b.targetHigh > 0 ? (b.targetLow + b.targetHigh) / 2 : b.targetLow;
  if (b.relativeTo === null) {
    if (b.targetType === 'PACE') return { ms: paceUnit(d) / mid, viaRef: false };
    if (b.targetType === 'SPEED') return { ms: mid, viaRef: false };
    return null;
  }
  // % de la VITESSE de référence (convention du 09/09, y compris pour la CSS)
  if (b.targetType !== 'PACE' && b.targetType !== 'SPEED' && b.targetType !== 'NONE') return null;
  const ref = b.relativeTo === 'VMA' ? refs.vma : b.relativeTo === 'CSS' ? refs.css : null;
  return ref ? { ms: (ref * mid) / 100, viaRef: true } : null;
}

export function estimateDuration(blocks: Block[], d: PlannedDiscipline | null, refs: RefValues = NO_REFS): Estimate {
  let s = 0, untimed = 0, used = false, approx = 0;
  for (const b of blocks) {
    const bd = b.discipline ?? d;
    if (b.kind === 'SET') {
      if (b.setMode === 'AMRAP') { if (b.setWindowS !== null) s += b.setWindowS; else untimed++; continue; }
      if (b.setMode === 'EVERY') { if (b.setWindowS !== null && b.setCount !== null) s += b.setWindowS * b.setCount; else untimed++; continue; }
      const inner = estimateDuration(b.children, bd, refs);
      const n = b.setCount ?? 1;
      s += inner.value * n; untimed += inner.untimed * n; approx += inner.approx * n; used ||= inner.usedRefs;
      continue;
    }
    if (b.measure === 'TIME' && b.measureValue !== null) { s += b.measureValue; continue; }
    if (b.measure === 'DISTANCE' && b.measureValue !== null) {
      const sp = blockSpeed(b, bd, refs);
      if (sp) { s += b.measureValue / sp.ms; used ||= sp.viaRef; continue; }
      const fb = b.kind !== 'REST' ? fallbackSpeed(bd, refs) : null;
      if (fb) { s += b.measureValue / fb; approx++; used = true; continue; }
    }
    untimed++;
  }
  return { value: s, certainty: untimed === 0 && approx === 0 ? 'exact' : s > 0 ? 'partial' : 'unknown', untimed, usedRefs: used, approx };
}

export function estimateDistance(blocks: Block[], d: PlannedDiscipline | null, refs: RefValues = NO_REFS): Estimate {
  let m = 0, untimed = 0, used = false, approx = 0;
  for (const b of blocks) {
    const bd = b.discipline ?? d;
    if (b.kind === 'SET') {
      if (b.setMode === 'AMRAP') { untimed++; continue; }
      const inner = estimateDistance(b.children, bd, refs);
      const n = b.setCount ?? 1;
      m += inner.value * n; untimed += inner.untimed * n; approx += inner.approx * n; used ||= inner.usedRefs;
      continue;
    }
    if (b.measure === 'DISTANCE' && b.measureValue !== null) { m += b.measureValue; continue; }
    if (b.measure === 'TIME' && b.measureValue !== null) {
      const sp = blockSpeed(b, bd, refs);
      if (sp) { m += b.measureValue * sp.ms; used ||= sp.viaRef; continue; }
      const fb = b.kind !== 'REST' && b.kind !== 'TRANSITION' ? fallbackSpeed(bd, refs) : null;
      if (fb) { m += b.measureValue * fb; approx++; used = true; continue; }
    }
    // Repos, renforcement, éducatifs : aucune distance attendue, ça ne rend pas le total incertain
    if (b.kind === 'REST' || b.kind === 'TRANSITION' || bd === 'STRENGTH' || b.measure === 'REPS') continue;
    untimed++;
  }
  return { value: m, certainty: untimed === 0 && approx === 0 ? (m > 0 ? 'exact' : 'unknown') : m > 0 ? 'partial' : 'unknown', untimed, usedRefs: used, approx };
}

export function hasSet(blocks: Block[]): boolean {
  return blocks.some((b) => b.kind === 'SET');
}

// ------------------------------------------------------------------ validation (codes inchangés, réutilisés par l'import coach)
export type DraftIssueCode =
  | 'EMPTY_SESSION' | 'SET_WITHOUT_CHILDREN' | 'SET_WITHOUT_MODE' | 'SET_MISSING_COUNT' | 'SET_MISSING_WINDOW'
  | 'MEASURE_MISSING' | 'MEASURE_VALUE_MISSING' | 'TARGET_VALUE_MISSING' | 'TARGET_RANGE_INVERTED'
  | 'DISCIPLINE_OVERRIDE_OUTSIDE_BRICK' | 'TRANSITION_OUTSIDE_BRICK' | 'DATE_INVALID';
export interface DraftIssue { code: DraftIssueCode; path: number[] }

export const ISSUE_TEXT: Record<DraftIssueCode, string> = {
  EMPTY_SESSION: $t("La séance ne contient aucun bloc."),
  SET_WITHOUT_CHILDREN: $t("Une série vide ne répète rien."),
  SET_WITHOUT_MODE: $t("Le mode de la série n’est pas choisi."),
  SET_MISSING_COUNT: $t("Le nombre de répétitions manque."),
  SET_MISSING_WINDOW: $t("La fenêtre de temps manque."),
  MEASURE_MISSING: $t("Rien ne dit ce qui termine ce bloc."),
  MEASURE_VALUE_MISSING: $t("La valeur de la mesure manque."),
  TARGET_VALUE_MISSING: $t("Une cible est choisie mais sans valeur."),
  TARGET_RANGE_INVERTED: $t("La borne haute est inférieure à la borne basse."),
  DISCIPLINE_OVERRIDE_OUTSIDE_BRICK: $t("Une discipline de bloc n’a de sens que dans un enchaînement."),
  TRANSITION_OUTSIDE_BRICK: $t("Une transition n’a de sens que dans un enchaînement."),
  DATE_INVALID: $t("La date est invalide."),
};

function validateBlock(b: Block, path: number[], brick: boolean, out: DraftIssue[]) {
  const push = (code: DraftIssueCode) => out.push({ code, path });
  if (b.kind === 'SET') {
    if (!b.children.length) push('SET_WITHOUT_CHILDREN');
    if (b.setMode === null) push('SET_WITHOUT_MODE');
    if ((b.setMode === 'REPEAT' || b.setMode === 'EVERY') && b.setCount === null) push('SET_MISSING_COUNT');
    if ((b.setMode === 'AMRAP' || b.setMode === 'EVERY') && b.setWindowS === null) push('SET_MISSING_WINDOW');
  } else {
    if (b.measure === null) push('MEASURE_MISSING');
    else if (b.measure !== 'OPEN' && b.measureValue === null) push('MEASURE_VALUE_MISSING');
  }
  if (b.targetType !== 'NONE' && b.targetLow === null) push('TARGET_VALUE_MISSING');
  if (b.targetLow !== null && b.targetHigh !== null && b.targetHigh < b.targetLow) push('TARGET_RANGE_INVERTED');
  if (!brick && b.discipline !== null) push('DISCIPLINE_OVERRIDE_OUTSIDE_BRICK');
  if (!brick && b.kind === 'TRANSITION') push('TRANSITION_OUTSIDE_BRICK');
  b.children.forEach((c, i) => validateBlock(c, [...path, i], brick, out));
}

export function validateSession(s: Pick<PlannedSession, 'discipline' | 'plannedDate' | 'blocks'>): DraftIssue[] {
  const out: DraftIssue[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.plannedDate)) out.push({ code: 'DATE_INVALID', path: [] });
  if (!s.blocks.length) out.push({ code: 'EMPTY_SESSION', path: [] });
  s.blocks.forEach((b, i) => validateBlock(b, [i], s.discipline === 'BRICK', out));
  return out;
}

/** Disciplines effectivement couvertes par un BRICK (via les surcharges de blocs). */
export function brickDisciplines(blocks: Block[]): PlannedDiscipline[] {
  const out: PlannedDiscipline[] = [];
  const walk = (bs: Block[]) => bs.forEach((b) => { if (b.discipline && b.discipline !== 'BRICK' && !out.includes(b.discipline)) out.push(b.discipline); walk(b.children); });
  walk(blocks);
  return out.length ? out : ['BIKE', 'RUN'];
}
