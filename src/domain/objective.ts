// Objectif de course : décomposition du chrono cible et confrontation aux indicateurs (repris de
// metrics/raceTargetReview.ts). Toujours AUCUN verdict de faisabilité (décision du 31/08) : l'écran
// juxtapose. Ajout factuel : l'allure requise exprimée en % de la VMA / de la CSS, ce qui rend les deux
// nombres comparables d'un coup d'œil sans rien juger.
import { latestZone } from './load';
import type { AppData, Race, ZoneReading } from './types';

export interface RequiredPace {
  discipline: 'SWIM' | 'BIKE' | 'RUN';
  allocated: number | null;
  distanceM: number | null;
  /** s/km (RUN), s/100 m (SWIM), km/h (BIKE) */
  required: number | null;
  /** vitesse requise ÷ vitesse de référence (RUN : VMA, SWIM : CSS) */
  ofReference: number | null;
  reference: ZoneReading | null;
}

export function requiredPaces(data: AppData, race: Race) {
  const one = (discipline: RequiredPace['discipline'], allocated: number | null, distanceM: number | null): RequiredPace => {
    const reference = latestZone(data, discipline === 'RUN' ? 'vma' : discipline === 'SWIM' ? 'css' : 'ftp');
    let required: number | null = null, ofReference: number | null = null;
    if (allocated && distanceM) {
      const ms = distanceM / allocated;
      if (discipline === 'RUN') required = allocated / (distanceM / 1000);
      if (discipline === 'SWIM') required = allocated / (distanceM / 100);
      if (discipline === 'BIKE') required = ms * 3.6;
      if (reference && discipline !== 'BIKE' && reference.value > 0) ofReference = ms / reference.value;
    }
    return { discipline, allocated, distanceM, required, ofReference, reference };
  };
  const parts = [race.targetSwimSeconds, race.targetBikeSeconds, race.targetRunSeconds, race.targetTransitionSeconds].filter((v): v is number => v !== null);
  return {
    swim: one('SWIM', race.targetSwimSeconds, race.swimDistanceM),
    bike: one('BIKE', race.targetBikeSeconds, race.bikeDistanceM),
    run: one('RUN', race.targetRunSeconds, race.runDistanceM),
    allocatedTotal: parts.length ? parts.reduce((a, b) => a + b, 0) : null,
  };
}
