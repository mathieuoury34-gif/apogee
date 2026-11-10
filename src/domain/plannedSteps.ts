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

/** Écart toléré entre la durée prévue et la durée réelle (10 % ou 2 min) : au-delà, le découpage au temps n'a plus de sens. */
export function planFits(plannedSec: number, actualSec: number): boolean {
  return Math.abs(plannedSec - actualSec) <= Math.max(120, plannedSec * 0.1);
}

export function overlaySteps(p: PlannedSession, startEpoch: number, actualSec: number, speed: Series | null, hr: Series, distanceM: number | null, discipline: string): StepResult[] | null {
  if (p.discipline !== discipline) return null;
  const steps = timedSteps(p.blocks);
  if (!steps) return null;
  const total = steps.reduce((a, s) => a + s.sec, 0);
  if (!planFits(total, actualSec)) return null;
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
