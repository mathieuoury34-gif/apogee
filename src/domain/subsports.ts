// Activités rangées sous « Autre » : rien ne change dans les calculs, c'est uniquement un repère visuel
// (icône et nom à la place du pictogramme générique). Les types Health Connect connus sont reconnus à la lecture de la montre.
import { $t } from '../i18n';

export interface SubSport { id: string; icon: string; label: string }

export const SUB_SPORTS: SubSport[] = [
  { id: 'hike', icon: 'hike', label: $t("Randonnée") },
  { id: 'walk', icon: 'walk', label: $t("Marche") },
  { id: 'kayak', icon: 'kayak', label: $t("Kayak") },
  { id: 'climb', icon: 'climb', label: $t("Escalade") },
  { id: 'ski', icon: 'ski', label: $t("Ski") },
  { id: 'row', icon: 'row', label: $t("Aviron") },
  { id: 'yoga', icon: 'yoga', label: $t("Yoga") },
  { id: 'racket', icon: 'racket', label: $t("Tennis / padel") },
  { id: 'ball', icon: 'ball', label: $t("Sport collectif") },
];

export const subSportOf = (id: string | null | undefined): SubSport | null => SUB_SPORTS.find((x) => x.id === id) ?? null;

/** Types d'exercice Health Connect → activité « Autre » reconnue. */
export const EXERCISE_TO_SUBSPORT: Record<number, string> = { 37: 'hike', 79: 'walk', 53: 'row', 61: 'ski', 83: 'yoga', 68: 'climb' };
