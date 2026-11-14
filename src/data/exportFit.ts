// Export d'une séance prévue en entraînement structuré .FIT pour la montre (un fichier par discipline).
import type { RefValues } from '../domain/blocks';
import { encodeFit, fitFileName, toFitWorkouts } from '../domain/fit';
import type { PlannedSession } from '../domain/types';
import { native } from '../native/bridge';

/** Enregistre (web) ou partage (APK) les fichiers .FIT ; rend les avertissements (cibles non transmises, trop d'étapes). */
export async function exportWorkoutFit(p: PlannedSession, refs: RefValues): Promise<{ files: number; warnings: string[] }> {
  const list = toFitWorkouts(p, refs).filter((w) => w.steps.length > 0);
  for (const w of list) {
    const bytes = encodeFit(w);
    await native.saveFile(fitFileName(w.name, p.plannedDate), new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  }
  const warnings = list.flatMap((w) => w.warnings);
  if (list.length > 1) warnings.push(`Enchaînement : ${list.length} fichiers numérotés dans l’ordre (un par discipline) ; la montre ne lit qu’un sport par entraînement, lance-les l’un après l’autre.`);
  return { files: list.length, warnings };
}
