// Modèle de données d’Apogée (version web + APK).
//
// Une seule source de vérité : `AppData`, gardée en mémoire, persistée sur l'appareil (IndexedDB)
// et synchronisée enregistrement par enregistrement avec Firestore quand le compte Google est relié.
// Tout ce qui se recalcule (charges, forme de fond, forme du jour, rattachements automatiques,
// statistiques) n'est JAMAIS stocké : chaque appareil le recalcule à partir des mêmes données,
// ce qui garde les écrans d'accord entre le téléphone, le PC et l'iPhone.
//
// Conventions héritées de la version Android (SPECS-TECH §2) :
//   - `*At`   : instant ISO 8601 en UTC
//   - `*Date` / `day` : jour civil local `AAAA-MM-JJ`
//   - unités SI partout (mètres, secondes, m/s) ; conversion seulement à l'affichage.

export const DISCIPLINES = ['RUN', 'BIKE', 'SWIM', 'STRENGTH'] as const;
export type CoreDiscipline = (typeof DISCIPLINES)[number];
export const PLANNED_DISCIPLINES = [...DISCIPLINES, 'BRICK'] as const;
export type PlannedDiscipline = (typeof PLANNED_DISCIPLINES)[number];
export const ACTUAL_DISCIPLINES = [...DISCIPLINES, 'OTHER'] as const;
export type ActualDiscipline = (typeof ACTUAL_DISCIPLINES)[number];
export type Discipline = PlannedDiscipline | ActualDiscipline;

// ------------------------------------------------------------------ vocabulaire des blocs (FIGÉ, format apogee/1)
export const BLOCK_KINDS = ['WARMUP', 'WORK', 'RECOVERY', 'REST', 'COOLDOWN', 'TRANSITION', 'SET'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_MEASURES = ['TIME', 'DISTANCE', 'REPS', 'OPEN'] as const;
export type BlockMeasure = (typeof BLOCK_MEASURES)[number];
export const SET_MODES = ['REPEAT', 'AMRAP', 'EVERY'] as const;
export type SetMode = (typeof SET_MODES)[number];
export const TARGET_TYPES = ['NONE', 'ZONE', 'PACE', 'SPEED', 'POWER', 'HR', 'LOAD', 'RPE'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const RELATIVE_REFS = ['FTP', 'VMA', 'CSS', 'HRMAX', 'ONE_RM'] as const;
export type RelativeRef = (typeof RELATIVE_REFS)[number];

export interface Block {
  kind: BlockKind;
  measure: BlockMeasure | null;
  measureValue: number | null;
  setMode: SetMode | null;
  setCount: number | null;
  setWindowS: number | null;
  targetType: TargetType;
  targetLow: number | null;
  targetHigh: number | null;
  relativeTo: RelativeRef | null;
  label: string | null;
  notes: string | null;
  discipline: PlannedDiscipline | null;
  children: Block[];
}

// ------------------------------------------------------------------ enregistrements synchronisés
export interface Rec {
  id: string;
  updatedAt: string;
  /** Pierre tombale : l'enregistrement est supprimé, mais la suppression doit se propager. */
  deleted?: boolean;
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface InjuryEntry { id: string; label: string; date: string | null; notes: string | null; resolved: boolean }

export interface Athlete extends Rec {
  displayName: string | null;
  birthDate: string | null;
  sex: 'M' | 'F' | null;
  /** Taille en cm : sert à estimer la dépense de repos (formule de Mifflin-St Jeor). */
  heightCm?: number | null;
  /** Calories de repos par jour affichées par la montre (Garmin Connect) : sert à partager le total de Health Connect entre repos et actives. */
  restKcal?: number | null;
  availability: Weekday[];
  equipment: string[];
  injuries: InjuryEntry[];
}

export interface Race extends Rec {
  name: string;
  raceDate: string;
  swimDistanceM: number | null;
  bikeDistanceM: number | null;
  runDistanceM: number | null;
  targetTotalSeconds: number | null;
  targetSwimSeconds: number | null;
  targetBikeSeconds: number | null;
  targetRunSeconds: number | null;
  targetTransitionSeconds: number | null;
  targetRevisedAt: string | null;
  notes: string | null;
}

export const ZONE_KINDS = ['vma', 'ftp', 'css', 'hr_max'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];
export const ZONE_SOURCES = ['test', 'estimation', 'manual'] as const;
export type ZoneSource = (typeof ZONE_SOURCES)[number];

/** Relevé d'indicateur, historisé, jamais écrasé. Valeur en SI : m/s (VMA, CSS), W (FTP), bpm. */
export interface ZoneReading extends Rec {
  kind: ZoneKind;
  value: number;
  measuredAt: string;
  source: ZoneSource;
  notes: string | null;
}

export interface TrainingPhase extends Rec {
  label: string;
  phase: string | null;
  startDate: string;
  endDate: string;
  intent: string | null;
  objective: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  coachExchangeId: string | null;
}

export interface PlannedSession extends Rec {
  discipline: PlannedDiscipline;
  plannedDate: string;
  title: string | null;
  notes: string | null;
  origin: 'manual' | 'coach';
  idempotencyKey: string | null;
  coachExchangeId: string | null;
  blocks: Block[];
  createdAt: string;
  /** Instant de la dernière modification faite par l'athlète (éditeur, déplacement) ; remis à null quand le coach réécrit la séance. */
  editedAt?: string | null;
}

/** Champs d'une séance réalisée qu'une édition manuelle peut écraser (leur assise passe à « saisie »). */
export type EditableField = 'date' | 'discipline' | 'durationSec' | 'distanceM' | 'avgHrBpm' | 'elevationGainM';

export interface ActualSession extends Rec {
  /** Identifiant d'origine : `clientRecordId` Garmin (Health Connect) ou `manual:<empreinte>`. Immuable. */
  sourceId: string;
  source: 'health' | 'manual';
  discipline: ActualDiscipline;
  /** Pour « Autre » : activité précise (randonnée, kayak…), purement visuelle. */
  subSport?: string | null;
  /** Titre donné à la main (« GR20 · étape 3 », « Sortie avec Paul »). Remplace le nom de l'activité à l'affichage. */
  title?: string | null;
  /** Type d'exercice Health Connect d'origine ('manual' pour une saisie). */
  rawExerciseType: string | null;
  startAt: string;
  endAt: string;
  zoneOffsetMinutes: number | null;
  durationSec: number;
  distanceM: number | null;
  activeCaloriesJ: number | null;
  totalCaloriesJ: number | null;
  elevationGainM: number | null;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  minHrBpm: number | null;
  hrCoverageRatio: number | null;
  hrSampleCount: number | null;
  avgSpeedMs: number | null;
  maxSpeedMs: number | null;
  /** Une série brute existe dans la collection `series` (même id). */
  hasSeries: boolean;
  /** Champs corrigés à la main (édition d'une séance Health Connect). */
  edited: EditableField[];
  /** Ressenti saisi après séance. */
  rpe: number | null;
  comment: string | null;
  /**
   * Rattachement MANUEL au prévu. `undefined` = automatique (calculé), `null` = « n'était pas prévue »,
   * sinon l'id de la séance prévue choisie à la main.
   */
  manualPlannedId?: string | null;
  ingestedAt: string;
}

/** Séries brutes d'une séance : `[epoch s, valeur]`. Stockées à part (≈ 5 Ko par séance). */
export interface SessionSeries extends Rec {
  hr: [number, number][];
  speed: [number, number][];
}

export interface BrickPair extends Rec {
  firstId: string;
  secondId: string;
  day: string;
  status: 'confirmed' | 'declined';
}

export const INTERRUPTION_REASONS = ['injury', 'travel', 'external_load', 'other'] as const;
export type InterruptionReason = (typeof INTERRUPTION_REASONS)[number];

export interface Interruption extends Rec {
  label: string;
  startDate: string;
  endDate: string;
  reason: InterruptionReason;
  dailyLoadOverride: number | null;
  suspendsReminders: boolean;
  notes: string | null;
}

/** Nuit, indexée par jour de réveil (id = nightDate). */
export interface SleepNight extends Rec {
  nightDate: string;
  startAt: string;
  endAt: string;
  zoneOffsetMinutes: number | null;
  /** Temps endormi quand Health Connect donne les étapes du sommeil (éveils exclus, comme Garmin) ; sinon temps passé au lit. */
  durationSec: number;
  /** `true` : `durationSec` est le temps endormi (étapes connues). Absent : temps passé au lit, éveils compris. */
  fromStages?: boolean;
  /** `true` : nuit validée ou corrigée à la main (début et fin) ; la synchronisation Health Connect ne l'écrase plus. */
  edited?: boolean;
  sourceId: string | null;
}

/** FC de repos du jour (id = day). */
export interface RestingHr extends Rec {
  day: string;
  bpm: number;
}

/** Pesée du jour (id = day), kg. Venue de Health Connect ou saisie à la main (la saisie l'emporte). */
export interface WeightReading extends Rec {
  day: string;
  kg: number;
  source: 'health' | 'manual';
}

export interface PreviewItem { entity: 'session' | 'phase'; idempotencyKey: string; label: string; issueCodes: string[]; /** précision lisible (ex. blocs en conflit) */ detail?: string }

export interface CoachExchange extends Rec {
  direction: 'export' | 'import';
  schemaVersion: string;
  occurredAt: string;
  status: 'applied' | 'rejected' | 'cancelled';
  operationCount: number;
  payloadHash: string | null;
  planValidUntil: string | null;
  /** Détail : séances jointes (export) ou opérations par catégorie (import). */
  exportSessions?: { discipline: string; day: string }[];
  importSummary?: { created: PreviewItem[]; updated: PreviewItem[]; deleted: PreviewItem[]; rejected: PreviewItem[]; noop: PreviewItem[]; malformedCount: number };
  error: string | null;
}

/** Séance (favorite) ou semaine type réutilisable : copiée dans le calendrier avec de nouveaux identifiants. */
export interface TemplateItem { offset: number; discipline: PlannedDiscipline; title: string | null; notes: string | null; blocks: Block[] }
export interface SessionTemplate extends Rec {
  name: string;
  kind: 'session' | 'week';
  /** Séance favorite : un seul élément (offset 0). Semaine type : offset 0 = lundi … 6 = dimanche. */
  items: TemplateItem[];
  createdAt: string;
}

/** Activité du jour (id = day), lue dans Health Connect : calories actives et totales (repos compris), pas et étages. */
export interface EnergyDay extends Rec {
  day: string;
  activeKcal: number | null;
  totalKcal: number | null;
  /** Dépense de base du jour (calories de repos) déposée par la montre, si elle la dépose. */
  basalKcal?: number | null;
  /** Pas et étages montés du jour (Health Connect), si la montre les dépose. */
  steps?: number | null;
  floors?: number | null;
  source: 'health';
}

/** Repas du journal : une ligne simple (libellé facultatif + kcal), sans base d'aliments. */
export interface Meal extends Rec {
  day: string;
  label: string | null;
  kcal: number;
}

/** Valeurs physiologiques du jour lues dans Health Connect, quand la montre les y dépose (id = day). */
export interface Vitals extends Rec {
  day: string;
  vo2max: number | null;
  hrvMs: number | null;
}

export type HrvStatus = 'poor' | 'low' | 'unbalanced' | 'balanced';
/** Point hebdomadaire saisi (ou pré-rempli depuis Health Connect) : capacités et ressenti (id = lundi de la semaine). */
export interface Checkin extends Rec {
  week: string;
  vo2max: number | null;
  /** Seuil de lactate : FC (bpm) et allure (s/km). */
  lthrBpm: number | null;
  lthPaceSecKm: number | null;
  hrvMs: number | null;
  hrvStatus: HrvStatus | null;
  /** Ressenti de la semaine, de 1 (très mauvais) à 5 (très bon). */
  sleepFelt: number | null;
  recoveryFelt: number | null;
  /** Prédictions de course affichées par la montre (secondes). */
  pred5kSec: number | null;
  pred10kSec: number | null;
  predHalfSec: number | null;
  predMarathonSec: number | null;
  note: string | null;
}

/** Collections synchronisées (une collection Firestore chacune). */
export interface Collections {
  athlete: Athlete;
  race: Race;
  zones: ZoneReading;
  phases: TrainingPhase;
  planned: PlannedSession;
  actual: ActualSession;
  series: SessionSeries;
  bricks: BrickPair;
  interruptions: Interruption;
  sleep: SleepNight;
  resting: RestingHr;
  weight: WeightReading;
  exchanges: CoachExchange;
  templates: SessionTemplate;
  energy: EnergyDay;
  meals: Meal;
  vitals: Vitals;
  checkins: Checkin;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ['athlete', 'race', 'zones', 'phases', 'planned', 'actual', 'series', 'bricks', 'interruptions', 'sleep', 'resting', 'weight', 'exchanges', 'templates', 'energy', 'meals', 'vitals', 'checkins'];

export type AppData = { [K in CollectionName]: Record<string, Collections[K]> } & { updatedAt: string };

/** Réglages de calcul, propres à l'appareil. */
export interface CalcSettings {
  /** Charge provisoire pour une séance sans FC ni RPE (estimée sur tes habitudes) plutôt qu'un zéro. */
  provisionalLoad: boolean;
}
