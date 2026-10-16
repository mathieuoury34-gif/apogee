// Activités rangées sous « Autre » : rien ne change dans les calculs, c'est uniquement un repère visuel
// (pictogramme et nom à la place du pictogramme générique). Les types Health Connect connus sont reconnus à la lecture de la montre ;
// pour les autres, on choisit le pictogramme à la main (appui long sur la séance). Les pictogrammes sont dessinés dans ui/sport-icons.ts.
import { $t } from '../i18n';

export interface SubSport { id: string; icon: string; label: string; group: string }

export const SPORT_GROUPS: { id: string; label: string }[] = [
  { id: 'water', label: $t("Eau") },
  { id: 'nature', label: $t("Nature et montagne") },
  { id: 'snow', label: $t("Neige et glace") },
  { id: 'wheels', label: $t("Roues") },
  { id: 'body', label: $t("Corps et fitness") },
  { id: 'ball', label: $t("Balles et raquettes") },
  { id: 'misc', label: $t("Autres") },
];

const S = (id: string, group: string, label: string): SubSport => ({ id, icon: id, label, group });

export const SUB_SPORTS: SubSport[] = [
  S('sail', 'water', $t("Voile")), S('windsurf', 'water', $t("Planche à voile")), S('kite', 'water', $t("Kitesurf")), S('surf', 'water', $t("Surf")),
  S('sup', 'water', $t("Paddle")), S('kayak', 'water', $t("Kayak")), S('row', 'water', $t("Aviron")), S('dive', 'water', $t("Plongée")), S('polo', 'water', $t("Water-polo")),
  S('hike', 'nature', $t("Randonnée")), S('walk', 'nature', $t("Marche")), S('nordic', 'nature', $t("Marche nordique")), S('alpine', 'nature', $t("Alpinisme")),
  S('climb', 'nature', $t("Escalade")), S('orient', 'nature', $t("Course d’orientation")), S('horse', 'nature', $t("Équitation")),
  S('ski', 'snow', $t("Ski")), S('xcski', 'snow', $t("Ski de fond")), S('snowboard', 'snow', $t("Snowboard")), S('snowshoe', 'snow', $t("Raquettes")),
  S('iceskate', 'snow', $t("Patinage")), S('hockey', 'snow', $t("Hockey")),
  S('roller', 'wheels', $t("Roller")), S('skateboard', 'wheels', $t("Skateboard")), S('scooter', 'wheels', $t("Trottinette")), S('bmx', 'wheels', $t("BMX")),
  S('parkour', 'body', $t("Parkour")), S('dance', 'body', $t("Danse")), S('rope', 'body', $t("Corde à sauter")), S('yoga', 'body', $t("Yoga")),
  S('pilates', 'body', $t("Pilates")), S('stretch', 'body', $t("Étirements")), S('barbell', 'body', $t("Haltérophilie / CrossFit")), S('boxing', 'body', $t("Boxe")),
  S('martial', 'body', $t("Arts martiaux")), S('gymnastics', 'body', $t("Gymnastique")), S('stairs', 'body', $t("Escaliers")),
  S('football', 'ball', $t("Football")), S('basket', 'ball', $t("Basket")), S('volley', 'ball', $t("Volley")), S('rugby', 'ball', $t("Rugby")),
  S('ball', 'ball', $t("Sport collectif")), S('racket', 'ball', $t("Tennis / padel")), S('pingpong', 'ball', $t("Tennis de table")),
  S('badminton', 'ball', $t("Badminton")), S('golf', 'ball', $t("Golf")), S('baseball', 'ball', $t("Baseball")),
  S('fencing', 'misc', $t("Escrime")), S('archery', 'misc', $t("Tir à l’arc")), S('bowling', 'misc', $t("Bowling")),
];

export const subSportOf = (id: string | null | undefined): SubSport | null => SUB_SPORTS.find((x) => x.id === id) ?? null;

/** Types d'exercice Health Connect → activité « Autre » reconnue. */
export const EXERCISE_TO_SUBSPORT: Record<number, string> = { 37: 'hike', 79: 'walk', 53: 'row', 61: 'ski', 83: 'yoga', 68: 'climb' };
