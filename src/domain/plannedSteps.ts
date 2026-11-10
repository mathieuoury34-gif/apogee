// Étapes minutées d'une séance prévue, superposées au compte rendu : quand la séance réalisée est rattachée à un prévu dont toutes les étapes sont
// au temps (échauffement 10 min, 6 × (2 min vite + 90 s récup), retour au calme…), on découpe la courbe réelle suivant ces étapes et on en tire
// durée, distance, allure et FC de chacune. Si une étape est à la distance, aux répétitions ou ouverte, on n'affiche rien (pas de devinette).
// Rien n'est stocké : tout se recalcule à l'ouverture du bilan.
import { distanceAt, distanceCurve, rangeStats } from './sessionStats';
import type { Series } from './hr';
import type { Block, BlockKind, PlannedSession } from './types';

export interface FlatStep { kind: BlockKind; sec: number; block: Block }

const MAX_STEPS = 80;

/** Étapes à plat (répétitions déroulées) ; `null` dès qu'une étape n'est pas minutée. */
export function timedSteps(blocks: Block[]): FlatStep[] | null {
  const out: FlatStep[] = [];
  const walk = (bs: Block[]): boolean => {
    for (const b of bs) {
      if (b.kind === 'SET') {
        if (b.setMode !== 'REPEAT' || !b.setCount || b.setCount < 1 || !b.children.length) return false;
        for (let i = 0; i < b.setCount; i++) if (!walk(b.children)) return false;
      } else {
        if (b.measure !== 'TIME' || !b.measureValue || b.measureValue <= 0) return false;
        out.push({ kind: b.kind, sec: b.measureValue, block: b });
      }
      if (out.length > MAX_STEPS) return false;
    }
    return true;
  };
  return walk(blocks) && out.length >= 2 ? out : null;
}

export interface StepResult extends FlatStep {
  /** rang parmi les étapes de même nature (Effort 1, 2, 3…) */
  rank: number;
  from: number; to: number;
  metres: number | null; ms: number | null;
  avgHr: number | null; maxHr: number | null;
}

/** Modification faite à la main sur une séance réalisée : ordre des étapes (`i` = rang de l'étape dans le prévu) et durée de chacune (0 = étape retirée). */
export interface StepEdit { i: number; sec: number }

/** Une modification n'est valable que si elle colle encore au prévu rattaché (même nombre d'étapes, pas de doublon) ; sinon on revient au prévu. */
export function validEdit(flat: FlatStep[], edit: StepEdit[] | null | undefined): edit is StepEdit[] {
  return !!edit && edit.length === flat.length && new Set(edit.map((e) => e.i)).size === flat.length && !edit.some((e) => !(e.i >= 0 && e.i < flat.length) || !(e.sec >= 0));
}
export function applyEdit(flat: FlatStep[], edit: StepEdit[] | null | undefined): FlatStep[] {
  if (!validEdit(flat, edit)) return flat;
  return edit.filter((e) => e.sec > 0).map((e) => ({ ...flat[e.i], sec: e.sec }));
}

/**
 * Superpose les étapes du prévu à la courbe réelle, à partir du début de la séance. Pas de tolérance sur la durée : si la séance dure plus que le prévu, toutes
 * les étapes prévues sont données (le reste n'est pas découpé) ; si elle est plus courte, les étapes qui commencent après la fin sont écartées et la dernière
 * est tronquée (l'athlète peut alors corriger durées et ordre : `edit`).
 */
export function overlaySteps(p: PlannedSession, startEpoch: number, actualSec: number, speed: Series | null, hr: Series, distanceM: number | null, discipline: string, edit?: StepEdit[] | null): StepResult[] | null {
  if (p.discipline !== discipline) return null;
  const flat = timedSteps(p.blocks);
  if (!flat) return null;
  const steps = applyEdit(flat, edit);
  const curve = speed && discipline !== 'STRENGTH' ? distanceCurve(speed, distanceM) : null;
  const hrp = hr.filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1])).map((x) => ({ t: x[0], v: x[1] })).sort((a, b) => a.t - b.t);
  if (!curve && hrp.length < 10) return null;
  const end = startEpoch + actualSec;
  const rank: Partial<Record<BlockKind, number>> = {};
  let t = startEpoch;
  const out: StepResult[] = [];
  for (const s of steps) {
    const from = t, to = Math.min(end, t + s.sec);
    t += s.sec;
    if (to - from < 1) continue;
    const r = (rank[s.kind] = (rank[s.kind] ?? 0) + 1);
    const metres = curve ? Math.max(0, distanceAt(curve, to) - distanceAt(curve, from)) : null;
    const h = rangeStats(hrp, from, to, 120);
    out.push({ ...s, rank: r, from, to, metres, ms: metres !== null ? metres / (to - from) : null, avgHr: h ? h.avg : null, maxHr: h ? h.max : null });
  }
  return out.length >= 2 ? out : null;
}
