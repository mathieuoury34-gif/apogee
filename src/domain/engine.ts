// Calculs dérivés, recalculés en une passe à chaque changement de données (quelques millisecondes pour
// une saison entière). Remplace la chaîne `runMorningSync` de la version Android : plus de cache à
// reconstruire, plus d'oubli possible d'une étape (le bug du RPE qui ne relançait rien, T4).
import type { RefValues, RefsAt } from './blocks';
import { addDays, today } from './dates';
import { computeDailyForm, formHistory, formInputs, type DailyForm, type FormInputs } from './form';
import { computeLinks, type Links } from './links';
import { buildLoadSeries, coachConstat, computeSessionLoads, latestZone, zoneAt, type CoachConstat, type LoadContext, type LoadSeries, type SessionLoad } from './load';
import { trainingAlerts, type TrainingAlert } from './review';
import type { AppData, CalcSettings } from './types';

export interface Derived {
  today: string;
  /** Références d'aujourd'hui (affichage et saisie). */
  refs: RefValues;
  /** Références en vigueur à une date : à utiliser pour toute séance prévue ou passée. */
  refsAt: RefsAt;
  loads: Map<string, SessionLoad>;
  ctx: LoadContext;
  series: LoadSeries;
  formInputs: FormInputs;
  /** Forme du jour (aujourd'hui) ; null si pas assez de données. */
  form: DailyForm | null;
  /** Dernière forme calculable (si celle du jour ne l'est pas). */
  lastForm: DailyForm | null;
  formByDay: Map<string, DailyForm>;
  links: Links;
  constat: CoachConstat;
  alerts: TrainingAlert[];
}

/** Références (VMA, CSS, FTP, FC max) en vigueur un jour donné : chaque séance prévue garde celles de sa date. */
export function refsAtFn(data: AppData, hrMaxAt: (day: string) => number | null): RefsAt {
  return (day) => ({
    vma: zoneAt(data, 'vma', day)?.value ?? null,
    css: zoneAt(data, 'css', day)?.value ?? null,
    ftp: zoneAt(data, 'ftp', day)?.value ?? null,
    hrMax: hrMaxAt(day),
  });
}

export function refsOf(data: AppData, hrMax: number | null): RefValues {
  return {
    vma: latestZone(data, 'vma')?.value ?? null,
    css: latestZone(data, 'css')?.value ?? null,
    ftp: latestZone(data, 'ftp')?.value ?? null,
    hrMax,
  };
}

export function derive(data: AppData, settings: CalcSettings, now: Date = new Date()): Derived {
  const day = today(now);
  const { loads, ctx } = computeSessionLoads(data, settings, now);
  const series = buildLoadSeries(data, loads, day);
  const inputs = formInputs(data, series);
  const from = series.firstDay ? addDays(day, -120) : day;
  const formByDay = formHistory(inputs, from < (series.firstDay ?? day) ? (series.firstDay ?? day) : from, day);
  const form = computeDailyForm(day, inputs);
  let lastForm = form;
  if (!lastForm) {
    for (let d = addDays(day, -1); d >= addDays(day, -7); d = addDays(d, -1)) { const f = formByDay.get(d); if (f) { lastForm = f; break; } }
  }
  const refs = refsOf(data, ctx.hrMax.bpm);
  const refsAt = refsAtFn(data, ctx.hrMaxAt);
  const links = computeLinks(data, refsAt);
  const constat = coachConstat(series, day);
  const alerts = trainingAlerts(data, links, loads, constat, day, series);
  return { today: day, refs, refsAt, loads, ctx, series, formInputs: inputs, form, lastForm, formByDay, links, constat, alerts };
}
