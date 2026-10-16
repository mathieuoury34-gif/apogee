// Doublons de séances réalisées : deux enregistrements qui portent le même identifiant d'origine (`sourceId`, celui de Garmin)
// sont la même séance. Cela arrive quand un appareil relit la montre avant d'avoir reçu ses données du cloud : il crée sa propre
// copie, puis les deux se retrouvent après la synchronisation. On en garde UNE, celle qui porte le plus de saisie (ressenti,
// commentaire, titre, rattachement au prévu, correction), on y recopie ce qui manque, et l'autre est supprimée.
// Le choix est déterministe : deux appareils qui nettoient chacun de leur côté aboutissent au même résultat.
import { liveRecords } from './load';
import type { ActualSession, AppData } from './types';

export interface DedupePlan {
  /** Séances à enregistrer (la gardée, complétée). */
  put: ActualSession[];
  /** Identifiants à supprimer (séance et sa série). */
  drop: string[];
  /** Correspondances ancien id → id gardé, pour les enchaînements qui référencent une séance supprimée. */
  remap: Map<string, string>;
}

const score = (a: ActualSession) =>
  (a.rpe != null ? 4 : 0) + (a.comment ? 2 : 0) + (a.title ? 2 : 0) + (a.manualPlannedId !== undefined ? 4 : 0) + (a.edited.length ? 4 : 0) + (a.hasSeries ? 1 : 0);

export function planDedupe(data: AppData): DedupePlan {
  const groups = new Map<string, ActualSession[]>();
  for (const a of liveRecords(data.actual)) {
    if (!a.sourceId) continue;
    const g = groups.get(a.sourceId);
    if (g) g.push(a); else groups.set(a.sourceId, [a]);
  }
  const plan: DedupePlan = { put: [], drop: [], remap: new Map() };
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((x, y) => score(y) - score(x) || (x.ingestedAt || '').localeCompare(y.ingestedAt || '') || x.id.localeCompare(y.id));
    const keep = g[0];
    const merged: ActualSession = { ...keep };
    let changed = false;
    for (const o of g.slice(1)) {
      if (merged.rpe == null && o.rpe != null) { merged.rpe = o.rpe; changed = true; }
      if (!merged.comment && o.comment) { merged.comment = o.comment; changed = true; }
      if (!merged.title && o.title) { merged.title = o.title; changed = true; }
      if (merged.manualPlannedId === undefined && o.manualPlannedId !== undefined) { merged.manualPlannedId = o.manualPlannedId; changed = true; }
      plan.drop.push(o.id);
      plan.remap.set(o.id, keep.id);
    }
    if (changed) plan.put.push(merged);
  }
  return plan;
}
