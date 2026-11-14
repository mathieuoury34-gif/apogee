// Plan de séance : la séance prévue mise à plat sur une ligne de temps (répétitions déroulées), prête à être dessinée en frise horizontale.
// Rien n'est stocké : tout se recalcule à l'affichage, avec les mêmes estimations de durée que le reste de l'app (`estimateDuration`).
import { blockSpeed, fallbackSpeed, NO_REFS, type RefValues } from './blocks';
import type { Block, BlockKind, PlannedDiscipline, PlannedSession } from './types';

export type SegDisc = Exclude<PlannedDiscipline, 'BRICK'>;

export interface TlSeg {
  key: string;
  kind: Exclude<BlockKind, 'SET'>;
  /** discipline effective du bloc (celle de la jambe pour un enchaînement) */
  disc: SegDisc;
  /** début et durée (s) sur la frise ; une durée inconnue est dessinée courte (`unknown`) */
  startS: number;
  durS: number;
  /** durée estimée (distance ÷ allure, ou allure d'endurance par défaut) plutôt que donnée */
  estimated: boolean;
  /** durée impossible à estimer : la frise lui réserve une largeur minimale */
  unknown: boolean;
  /** distance (m) donnée ou estimée */
  metres: number | null;
  /** hauteur relative de la barre (0,15–1) : repos bas, effort haut */
  level: number;
  block: Block;
  /** position dans l'arbre des blocs (pour retrouver le bloc à modifier) */
  path: number[];
  /** « 2/6 » : répétition en cours dans une série, sinon null */
  rep: { i: number; n: number; label: string | null } | null;
}
export interface Timeline { segs: TlSeg[]; totalS: number; unknown: number; truncated: boolean }

export const UNKNOWN_VIS_S = 120;
const MAX_SEGS = 400;
const KIND_LEVEL: Record<string, number> = { REST: 0.15, RECOVERY: 0.3, WARMUP: 0.4, COOLDOWN: 0.35, WORK: 0.8, TRANSITION: 0.2 };

function levelOf(b: Block): number {
  const base = KIND_LEVEL[b.kind] ?? 0.6;
  if (b.kind === 'TRANSITION') return base;
  if (b.targetType === 'ZONE' && b.targetLow !== null && b.relativeTo === null) {
    const z = b.targetHigh !== null ? (b.targetLow + b.targetHigh) / 2 : b.targetLow;
    return Math.min(1, Math.max(0.2, 0.18 + (z / 5) * 0.8));
  }
  if (b.relativeTo !== null && (b.relativeTo === 'FTP' || b.relativeTo === 'VMA' || b.relativeTo === 'CSS' || b.relativeTo === 'HRMAX') && b.targetLow !== null) {
    const v = b.targetHigh !== null ? (b.targetLow + b.targetHigh) / 2 : b.targetLow;
    return Math.min(1, Math.max(0.2, (v / 110) * 0.95));
  }
  return base;
}

export function planTimeline(p: Pick<PlannedSession, 'discipline' | 'blocks'>, refs: RefValues = NO_REFS): Timeline {
  const segs: TlSeg[] = [];
  let t = 0, unknown = 0, truncated = false;
  const first = (p.discipline === 'BRICK' ? 'BIKE' : p.discipline) as SegDisc;
  let leg: SegDisc = first;
  const walk = (blocks: Block[], d: SegDisc, path: number[], rep: TlSeg['rep']) => {
    blocks.forEach((b, i) => {
      if (segs.length >= MAX_SEGS) { truncated = true; return; }
      const here = [...path, i];
      const bd: SegDisc = b.discipline && b.discipline !== 'BRICK' ? b.discipline : d;
      if (p.discipline === 'BRICK' && b.kind !== 'TRANSITION' && b.kind !== 'SET') leg = bd;
      if (b.kind === 'SET') {
        const label = b.label;
        if (b.setMode === 'AMRAP' || b.setMode === 'EVERY') {
          const dur = b.setMode === 'AMRAP' ? b.setWindowS : b.setWindowS !== null && b.setCount !== null ? b.setWindowS * b.setCount : null;
          push(b, bd, here, dur, false, null, rep ? { ...rep } : { i: 1, n: 1, label });
          return;
        }
        const n = Math.max(1, b.setCount ?? 1);
        for (let k = 0; k < n; k++) walk(b.children, bd, here, { i: k + 1, n, label });
        return;
      }
      const dd = b.kind === 'TRANSITION' ? leg : bd;
      const m = measure(b, dd, refs);
      push(b, dd, here, m.sec, m.estimated, m.metres, rep);
    });
  };
  const push = (b: Block, disc: SegDisc, path: number[], sec: number | null, estimated: boolean, metres: number | null, rep: TlSeg['rep']) => {
    const unk = sec === null || sec <= 0;
    const dur = unk ? UNKNOWN_VIS_S : (sec as number);
    if (unk) unknown++;
    segs.push({ key: path.join('.') + '#' + segs.length, kind: b.kind as TlSeg['kind'], disc, startS: t, durS: dur, estimated, unknown: unk, metres, level: levelOf(b), block: b, path, rep });
    t += dur;
  };
  walk(p.blocks, first, [], null);
  return { segs, totalS: t, unknown, truncated };
}

function measure(b: Block, d: SegDisc, refs: RefValues): { sec: number | null; estimated: boolean; metres: number | null } {
  if (b.measure === 'TIME' && b.measureValue !== null) {
    const sp = blockSpeed(b, d, refs);
    const fb = !sp && b.kind !== 'REST' && b.kind !== 'TRANSITION' ? fallbackSpeed(d, refs) : null;
    const ms = sp?.ms ?? fb;
    return { sec: b.measureValue, estimated: false, metres: ms ? b.measureValue * ms : null };
  }
  if (b.measure === 'DISTANCE' && b.measureValue !== null) {
    const sp = blockSpeed(b, d, refs);
    if (sp) return { sec: b.measureValue / sp.ms, estimated: true, metres: b.measureValue };
    const fb = b.kind !== 'REST' ? fallbackSpeed(d, refs) : null;
    if (fb) return { sec: b.measureValue / fb, estimated: true, metres: b.measureValue };
    return { sec: null, estimated: true, metres: b.measureValue };
  }
  return { sec: null, estimated: false, metres: null };
}

/** Graduations de l'axe du temps : un pas « rond » (1, 5, 10, 15, 30 min, 1 h…) qui donne au plus `maxTicks` repères. */
export function timeTicks(totalS: number, maxTicks: number): { step: number; ticks: number[] } {
  const steps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];
  const step = steps.find((s) => totalS / s <= maxTicks) ?? 14400;
  const ticks: number[] = [];
  for (let x = 0; x <= totalS + 1e-6; x += step) ticks.push(x);
  return { step, ticks };
}

export interface BrickLegInfo { disc: SegDisc; startMin: number; minutes: number; unknown: boolean }
/** Jambes d'un enchaînement (suites de blocs de même discipline) ; les transitions séparent les jambes et comptent dans le temps. */
export function brickLegs(tl: Timeline): BrickLegInfo[] {
  const out: (BrickLegInfo & { endS: number })[] = [];
  for (const s of tl.segs) {
    if (s.kind === 'TRANSITION') continue;
    const last = out[out.length - 1];
    if (last && last.disc === s.disc && tl.segs.filter((x) => x.kind === 'TRANSITION' && x.startS >= last.endS && x.startS < s.startS).length === 0) { last.endS = s.startS + s.durS; last.unknown ||= s.unknown; }
    else out.push({ disc: s.disc, startMin: s.startS / 60, minutes: 0, unknown: s.unknown, endS: s.startS + s.durS });
  }
  return out.map((l) => ({ disc: l.disc, startMin: l.startMin, minutes: l.endS / 60 - l.startMin, unknown: l.unknown }));
}
