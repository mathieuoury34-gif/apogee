// Unités d'affichage des roulettes d'intensité (sans dépendance à l'interface, donc testables).
import type { Block, PlannedDiscipline } from '../domain/types';

type Type = Block['targetType'];

/** Valeur stockée → valeur de la roulette. */
export function toDisp(type: Type, rel: Block['relativeTo'], v: number): number {
  if (rel !== null) return Math.round(v);
  if (type === 'SPEED') return Math.round(v * 36);
  if (type === 'LOAD') return Math.round(v * 10);
  return Math.round(v);
}
/** Valeur de la roulette → valeur stockée. */
export function fromDisp(type: Type, rel: Block['relativeTo'], d: number): number {
  if (rel !== null) return d;
  if (type === 'SPEED') return d / 36;
  if (type === 'LOAD') return d / 10;
  return d;
}
/** Valeur proposée quand on choisit un type d'intensité. */
export function defaultDisp(type: Type, rel: Block['relativeTo'], d: PlannedDiscipline | 'OTHER'): number {
  if (rel !== null) return rel === 'ONE_RM' ? 70 : rel === 'HRMAX' ? 80 : 85;
  switch (type) {
    case 'ZONE': return 2;
    case 'RPE': return 6;
    case 'PACE': return d === 'SWIM' ? 105 : 300;
    case 'SPEED': return d === 'BIKE' ? 300 : 120;
    case 'POWER': return 200;
    case 'HR': return 140;
    case 'LOAD': return 200;
    default: return 0;
  }
}

