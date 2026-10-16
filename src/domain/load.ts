// Charge d'entraînement : FC max, FC de repos, charge par séance, charge quotidienne, modèle de Banister.
//
// Différences avec la version Android (voir ANALYSE.md) :
//  - sRPE recalé sur l'échelle du TRIMP. Avant, une séance notée RPE 6 pendant 60 min valait 360
//    « unités » quand un footing équivalent mesuré au cardio en valait ~80 : toutes les séances saisies
//    à la main (août entier) gonflaient la courbe d'un facteur 3 à 5. Le coefficient est appris sur tes
//    propres séances qui ont À LA FOIS une série cardio et un RPE (médiane, 5 paires minimum), 0,30 sinon.
//  - une séance saisie avec une FC moyenne a désormais une charge (TRIMP sur FC moyenne, estimé).
//  - une séance sans FC ni RPE peut recevoir une charge PROVISOIRE (tes habitudes × durée) au lieu
//    d'un zéro qui la faisait passer pour un jour de repos (réglable dans Paramètres).
//  - la FC max saisie (test ou manuelle) n'est plus écrasée par l'estimation de Tanaka ; seul un pic
//    réellement observé et SOUTENU (60 s) en course ou à vélo peut la relever.
import { $t } from '../i18n';
import type { ActualSession, AppData, CalcSettings, ZoneKind, ZoneReading, ZoneSource } from './types';
import { addDays, ageAt, daysBetween, localDay } from './dates';
import { cleanHr, hrDrift, median, srpe, sustainedPeak, trimpFromAverage, trimpFromSeries, type Sex, type TrimpContext } from './hr';

export type LoadMethod = 'trimp' | 'trimp_avg' | 'srpe' | 'provisional' | 'pending';
export type Assise = 'measured' | 'estimated' | 'entered' | 'none';

export const METHOD_LABEL: Record<LoadMethod, string> = {
  trimp: $t("mesurée sur la fréquence cardiaque"),
  trimp_avg: $t("estimée sur la FC moyenne"),
  srpe: $t("estimée depuis ton ressenti"),
  provisional: $t("provisoire, en attente de ton ressenti"),
  pending: $t("en attente de ton ressenti"),
};

export interface SessionLoad { load: number | null; method: LoadMethod; drift: number | null; assise: Assise }

// ------------------------------------------------------------------ indicateurs de référence
export function liveRecords<T extends { deleted?: boolean }>(rec: Record<string, T>): T[] {
  return Object.values(rec).filter((r) => !r.deleted);
}

export function zoneHistory(data: AppData, kind: ZoneKind): ZoneReading[] {
  return liveRecords(data.zones).filter((z) => z.kind === kind).sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : a.measuredAt > b.measuredAt ? -1 : a.id < b.id ? 1 : -1));
}

export function latestZone(data: AppData, kind: ZoneKind): ZoneReading | null {
  return zoneHistory(data, kind)[0] ?? null;
}

export const HR_MAX_CEILING = 210;
export const HR_MAX_BUMP = 2;

export interface HrMaxInfo {
  bpm: number | null;
  /** D'où vient la valeur retenue. */
  origin: ZoneSource | 'observed' | 'tanaka' | null;
  tanaka: number | null;
  observed: number | null;
  declared: ZoneReading | null;
}

export function resolveHrMax(data: AppData, now: Date = new Date()): HrMaxInfo {
  const athlete = data.athlete.main;
  const tanaka = athlete?.birthDate ? Math.round((208 - 0.7 * ageAt(athlete.birthDate, now)) * 10) / 10 : null;
  let observed: number | null = null;
  for (const s of liveRecords(data.actual)) {
    if (s.discipline !== 'RUN' && s.discipline !== 'BIKE') continue;
    const ser = data.series[s.id];
    if (!ser || ser.deleted) continue;
    const p = sustainedPeak(cleanHr(ser.hr));
    if (p !== null && p <= HR_MAX_CEILING && (observed === null || p > observed)) observed = p;
  }
  const declared = latestZone(data, 'hr_max');
  if (declared) {
    if (observed !== null && observed >= declared.value + HR_MAX_BUMP) return { bpm: observed, origin: 'observed', tanaka, observed, declared };
    return { bpm: declared.value, origin: declared.source, tanaka, observed, declared };
  }
  const cands = [tanaka, observed].filter((v): v is number => v !== null);
  if (!cands.length) return { bpm: null, origin: null, tanaka, observed, declared };
  const bpm = Math.min(HR_MAX_CEILING, Math.max(...cands));
  return { bpm, origin: observed !== null && observed >= (tanaka ?? 0) ? 'observed' : 'tanaka', tanaka, observed, declared };
}

// ------------------------------------------------------------------ FC de repos (médiane glissante 14 j)
export const RESTING_WINDOW = 14;
export interface RestingBaseline { at(day: string): number | null; raw: Map<string, number> }

export function restingBaseline(data: AppData): RestingBaseline {
  const raw = new Map<string, number>();
  for (const r of liveRecords(data.resting)) raw.set(r.day, r.bpm);
  const global = median([...raw.values()]);
  return {
    raw,
    at(day) {
      const w: number[] = [];
      for (let k = 0; k < RESTING_WINDOW; k++) { const v = raw.get(addDays(day, -k)); if (v !== undefined) w.push(v); }
      return median(w) ?? global;
    },
  };
}

// ------------------------------------------------------------------ charge par séance
export const DEFAULT_SRPE_FACTOR = 0.3;
export const MIN_CALIBRATION_PAIRS = 5;

export function sessionDay(s: Pick<ActualSession, 'startAt' | 'zoneOffsetMinutes'>): string {
  return localDay(s.startAt, s.zoneOffsetMinutes);
}

export interface LoadContext {
  hrMax: HrMaxInfo;
  sex: Sex;
  sexDeclared: boolean;
  srpeFactor: number;
  srpeCalibrationPairs: number;
  resting: RestingBaseline;
}

export function computeSessionLoads(data: AppData, settings: CalcSettings, now: Date = new Date()): { loads: Map<string, SessionLoad>; ctx: LoadContext } {
  const hrMax = resolveHrMax(data, now);
  const athlete = data.athlete.main;
  const sex: Sex = athlete?.sex ?? 'M';
  const resting = restingBaseline(data);
  const sessions = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const loads = new Map<string, SessionLoad>();
  const ctxFor = (day: string): TrimpContext | null => {
    const rest = resting.at(day);
    return hrMax.bpm !== null && rest !== null ? { hrMaxBpm: hrMax.bpm, hrRestBpm: rest, sex } : null;
  };

  // 1. TRIMP (série) et TRIMP (FC moyenne)
  const pending: ActualSession[] = [];
  const ratios: number[] = [];
  for (const s of sessions) {
    const day = sessionDay(s);
    const c = ctxFor(day);
    const ser = data.series[s.id];
    const hr = ser && !ser.deleted ? cleanHr(ser.hr) : [];
    const drift = hr.length ? hrDrift(hr) : null;
    let res: SessionLoad | null = null;
    if (c && hr.length) {
      const t = trimpFromSeries(hr, c, s.durationSec);
      if (t) res = { load: t.value, method: 'trimp', drift, assise: 'measured' };
    }
    if (res && s.rpe) ratios.push(res.load! / srpe(s.rpe, s.durationSec));
    if (!res && c && s.avgHrBpm) {
      const t = trimpFromAverage(s.avgHrBpm, s.durationSec, c);
      if (t !== null) res = { load: t, method: 'trimp_avg', drift, assise: 'estimated' };
    }
    if (res) loads.set(s.id, res);
    else pending.push(s);
  }

  // 2. sRPE recalé
  const fitted = ratios.length >= MIN_CALIBRATION_PAIRS ? median(ratios) : null;
  const srpeFactor = fitted !== null ? Math.min(0.6, Math.max(0.12, fitted)) : DEFAULT_SRPE_FACTOR;
  const still: ActualSession[] = [];
  for (const s of pending) {
    if (s.rpe) loads.set(s.id, { load: srpe(s.rpe, s.durationSec) * srpeFactor, method: 'srpe', drift: null, assise: 'estimated' });
    else still.push(s);
  }

  // 3. Provisoire : charge par minute habituelle de la discipline (90 derniers jours), sinon toutes disciplines
  //    (jamais pour « Autre » : une randonnée de 10 h n'a rien à voir avec la charge par minute d'un footing).
  //    Pas de provisoire un jour couvert par une interruption à charge forfaitaire : le forfait fait foi.
  const forfaitDays = liveRecords(data.interruptions).filter((i) => i.dailyLoadOverride !== null);
  for (const s of still) {
    let load: number | null = null;
    const sd = sessionDay(s);
    const covered = forfaitDays.some((i) => i.startDate <= sd && sd <= i.endDate);
    if (settings.provisionalLoad && s.durationSec > 0 && !covered) {
      const day = sd;
      const from = addDays(day, -90);
      const rate = (filter: (x: ActualSession) => boolean) => median(sessions.filter((x) => {
        const l = loads.get(x.id);
        if (!l || l.load === null || l.method === 'provisional' || x.durationSec <= 0) return false;
        const d = sessionDay(x);
        return d >= from && d <= day && filter(x);
      }).map((x) => loads.get(x.id)!.load! / (x.durationSec / 60)));
      const r = rate((x) => x.discipline === s.discipline) ?? (s.discipline === 'OTHER' ? null : rate(() => true));
      if (r !== null) load = r * (s.durationSec / 60);
    }
    loads.set(s.id, load === null ? { load: null, method: 'pending', drift: null, assise: 'none' } : { load, method: 'provisional', drift: null, assise: 'estimated' });
  }

  return { loads, ctx: { hrMax, sex, sexDeclared: !!athlete?.sex, srpeFactor, srpeCalibrationPairs: ratios.length, resting } };
}

// ------------------------------------------------------------------ Banister (forme normalisée, amorçage « steady »)
export const FITNESS_TAU = 42;
export const FATIGUE_TAU = 7;
export const SEED_WINDOW = 14;
export const PRIMING_DAYS = FITNESS_TAU;

export interface DayLoad {
  day: string;
  load: number;
  /** Une partie de la charge du jour est estimée (sRPE, FC moyenne, provisoire, forfait d'interruption). */
  estimated: boolean;
  interruptionFill: boolean;
  fitness: number;
  fatigue: number;
  freshness: number;
}

export interface LoadSeries {
  days: DayLoad[];
  byDay: Map<string, DayLoad>;
  firstDay: string | null;
  isPriming: boolean;
  primingEndsOn: string | null;
  seedLoad: number;
}

export function buildLoadSeries(data: AppData, loads: Map<string, SessionLoad>, todayDay: string): LoadSeries {
  const sum = new Map<string, { load: number; est: boolean }>();
  for (const s of liveRecords(data.actual)) {
    const d = sessionDay(s);
    const l = loads.get(s.id);
    const cur = sum.get(d) ?? { load: 0, est: false };
    if (l && l.load !== null) { cur.load += l.load; cur.est ||= l.assise !== 'measured'; }
    sum.set(d, cur);
  }
  const ints = liveRecords(data.interruptions);
  let first: string | null = [...sum.keys()].sort()[0] ?? null;
  for (const i of ints) if (i.dailyLoadOverride !== null && (first === null || i.startDate < first)) first = i.startDate;
  if (first === null || first > todayDay) return { days: [], byDay: new Map(), firstDay: null, isPriming: true, primingEndsOn: null, seedLoad: 0 };

  const raw: { day: string; load: number; est: boolean; fill: boolean }[] = [];
  for (let d = first; d <= todayDay; d = addDays(d, 1)) {
    const v = sum.get(d) ?? { load: 0, est: false };
    let load = v.load, est = v.est, fill = false;
    if (load === 0) {
      const cov = ints.find((i) => i.dailyLoadOverride !== null && i.startDate <= d && i.endDate >= d);
      if (cov) { load = cov.dailyLoadOverride!; est = true; fill = true; }
    }
    raw.push({ day: d, load, est, fill });
  }
  const seedWin = raw.slice(0, SEED_WINDOW);
  const seed = seedWin.reduce((t, p) => t + p.load, 0) / seedWin.length;
  const kf = Math.exp(-1 / FITNESS_TAU), ka = Math.exp(-1 / FATIGUE_TAU);
  let fit = seed, fat = seed;
  const days: DayLoad[] = raw.map((p) => {
    fit = fit * kf + p.load * (1 - kf);
    fat = fat * ka + p.load * (1 - ka);
    return { day: p.day, load: p.load, estimated: p.est, interruptionFill: p.fill, fitness: fit, fatigue: fat, freshness: fit - fat };
  });
  const count = daysBetween(first, todayDay) + 1;
  return { days, byDay: new Map(days.map((d) => [d.day, d])), firstDay: first, isPriming: count < PRIMING_DAYS, primingEndsOn: addDays(first, PRIMING_DAYS - 1), seedLoad: seed };
}

/** Constat du coach : valeurs du jour, variation sur 7 jours, ratio aigu/chronique (7 j ÷ moyenne hebdo 28 j). */
export interface CoachConstat {
  asOf: string | null;
  fitness: number | null; fitnessDelta: number | null;
  fatigue: number | null; fatigueDelta: number | null;
  freshness: number | null; freshnessDelta: number | null;
  acuteChronicRatio: number | null;
  /** Charge cumulée des 7 derniers jours, et charge hebdomadaire moyenne des 28 derniers (numérateur et dénominateur du rapport). */
  acuteLoad: number | null; chronicWeeklyLoad: number | null;
  /** Le jour le plus chargé des 28 derniers jours et sa part du total (pour repérer une journée exceptionnelle qui fausse le rapport). */
  heaviestDay: { day: string; load: number; share: number } | null;
  /** Variation de la forme de fond sur 7 jours (rampe). */
  rampPerWeek: number | null;
}

export function coachConstat(series: LoadSeries, todayDay: string): CoachConstat {
  const latest = series.byDay.get(todayDay) ?? series.days[series.days.length - 1];
  if (!latest) return { asOf: null, fitness: null, fitnessDelta: null, fatigue: null, fatigueDelta: null, freshness: null, freshnessDelta: null, acuteChronicRatio: null, acuteLoad: null, chronicWeeklyLoad: null, heaviestDay: null, rampPerWeek: null };
  const prev = series.byDay.get(addDays(latest.day, -7));
  const d = (a: number, b?: number) => (b === undefined ? null : a - b);
  let acute = 0, chronic = 0, n = 0;
  let heavy: { day: string; load: number } | null = null;
  for (let k = 0; k < 28; k++) {
    const p = series.byDay.get(addDays(latest.day, -k));
    if (!p) continue;
    n++;
    chronic += p.load;
    if (k < 7) acute += p.load;
    if (!heavy || p.load > heavy.load) heavy = { day: p.day, load: p.load };
  }
  const weekly = chronic / 4;
  return {
    asOf: latest.day,
    fitness: latest.fitness, fitnessDelta: d(latest.fitness, prev?.fitness),
    fatigue: latest.fatigue, fatigueDelta: d(latest.fatigue, prev?.fatigue),
    freshness: latest.freshness, freshnessDelta: d(latest.freshness, prev?.freshness),
    acuteChronicRatio: n >= 28 && weekly > 0 ? acute / weekly : null,
    acuteLoad: n >= 28 ? acute : null, chronicWeeklyLoad: n >= 28 ? weekly : null,
    heaviestDay: heavy && chronic > 0 ? { day: heavy.day, load: heavy.load, share: heavy.load / chronic } : null,
    rampPerWeek: d(latest.fitness, prev?.fitness),
  };
}
