// Prévisionnel de charge : projette la forme de fond, la fatigue, la fraîcheur et le rapport aigu/chronique
// sur les jours à venir, à partir des séances PRÉVUES non encore réalisées.
//
// Méthode (affichée dans l'écran) : charge d'une séance prévue = durée estimée des blocs × charge par minute
// HABITUELLE de la discipline (médiane des 90 derniers jours, comme la charge provisoire). L'intensité
// prévue n'est pas modélisée : une séance de seuil et un footing de même durée valent la même chose. C'est
// une projection pour comparer des semaines entre elles et négocier un plan, pas une prédiction de forme.
import { estimateDuration, type RefValues } from './blocks';
import { addDays, daysBetween, mondayOf } from './dates';
import { median } from './hr';
import type { Links } from './links';
import { FATIGUE_TAU, FITNESS_TAU, liveRecords, sessionDay, type LoadSeries, type SessionLoad } from './load';
import type { AppData, PlannedSession } from './types';

export const MAX_FORECAST_DAYS = 200;

export interface ForecastDay { day: string; load: number; projected: boolean; fitness: number; fatigue: number; freshness: number; acwr: number | null }
export interface ForecastWeek { start: string; load: number; plannedSessions: number; endFitness: number; endFreshness: number; endAcwr: number | null }
export interface Forecast {
  /** Dernier jour réel + jours projetés. */
  days: ForecastDay[];
  weeks: ForecastWeek[];
  /** Séances prévues dont la charge n'a pas pu être estimée (durée ou habitude inconnue). */
  skipped: number;
  lastPlanned: string | null;
}

function ratePerMinute(data: AppData, loads: Map<string, SessionLoad>, discipline: string | null, today: string): number | null {
  const from = addDays(today, -90);
  const rates = (filter: (d: string) => boolean) => liveRecords(data.actual)
    .filter((s) => {
      const l = loads.get(s.id);
      const d = sessionDay(s);
      return l && l.load !== null && l.method !== 'provisional' && s.durationSec > 0 && d >= from && d <= today && filter(s.discipline);
    })
    .map((s) => loads.get(s.id)!.load! / (s.durationSec / 60));
  return (discipline ? median(rates((d) => d === discipline)) : null) ?? median(rates((d) => d !== 'OTHER'));
}

/** Charge estimée d'une séance prévue, ou null si non estimable. */
export function plannedLoad(p: PlannedSession, data: AppData, loads: Map<string, SessionLoad>, refs: RefValues, today: string): number | null {
  const parts = p.discipline === 'BRICK'
    ? [...new Set(p.blocks.map((b) => b.discipline).filter((d): d is NonNullable<typeof d> => !!d))].map((d) => ({ d, blocks: p.blocks.filter((b) => b.discipline === d) }))
    : [{ d: p.discipline, blocks: p.blocks }];
  if (!parts.length) return null;
  let total = 0;
  for (const part of parts) {
    const e = estimateDuration(part.blocks, part.d, refs);
    if (e.certainty === 'unknown' || !(e.value > 0)) return null;
    const rate = ratePerMinute(data, loads, part.d, today);
    if (rate === null) return null;
    total += rate * (e.value / 60);
  }
  return total;
}

export function forecastLoad(data: AppData, series: LoadSeries, loads: Map<string, SessionLoad>, links: Links, refs: RefValues, today: string, horizonDays: number | 'plan'): Forecast {
  const planned = liveRecords(data.planned).filter((p) => p.plannedDate >= today && !links.byPlanned.has(p.id));
  const lastPlanned = planned.reduce<string | null>((m, p) => (m === null || p.plannedDate > m ? p.plannedDate : m), null);
  const todayRow = series.byDay.get(today) ?? series.days[series.days.length - 1];
  if (!todayRow) return { days: [], weeks: [], skipped: 0, lastPlanned };
  const horizon = horizonDays === 'plan' ? Math.min(MAX_FORECAST_DAYS, lastPlanned ? Math.max(7, daysBetween(today, lastPlanned) + 1) : 14) : horizonDays;
  const end = addDays(today, horizon);

  const byDay = new Map<string, number>();
  let skipped = 0;
  for (const p of planned) {
    if (p.plannedDate > end) continue;
    const l = plannedLoad(p, data, loads, refs, today);
    if (l === null) { skipped++; continue; }
    byDay.set(p.plannedDate, (byDay.get(p.plannedDate) ?? 0) + l);
  }
  const ints = liveRecords(data.interruptions).filter((i) => i.dailyLoadOverride !== null);

  const kf = Math.exp(-1 / FITNESS_TAU), ka = Math.exp(-1 / FATIGUE_TAU);
  // fenêtre glissante des 28 dernières charges (réelles puis projetées)
  const window: number[] = [];
  for (let k = 27; k >= 0; k--) window.push(series.byDay.get(addDays(today, -k))?.load ?? 0);
  const days: ForecastDay[] = [];
  const acwrOf = (w: number[]) => { const chronic = w.reduce((t, x) => t + x, 0) / 4; return series.days.length >= 28 && chronic > 0 ? w.slice(-7).reduce((t, x) => t + x, 0) / chronic : null; };
  // jour courant : réel + séances prévues non faites
  let fit = todayRow.fitness, fat = todayRow.fatigue;
  const todayExtra = byDay.get(today) ?? 0;
  if (todayExtra > 0) {
    // la charge réelle du jour est déjà dans fit/fat : on y ajoute seulement la part prévue restante
    fit = fit + todayExtra * (1 - kf);
    fat = fat + todayExtra * (1 - ka);
    window[window.length - 1] += todayExtra;
  }
  days.push({ day: today, load: window[window.length - 1], projected: todayExtra > 0, fitness: fit, fatigue: fat, freshness: fit - fat, acwr: acwrOf(window) });
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) {
    let load = byDay.get(d) ?? 0;
    if (load === 0) { const cov = ints.find((i) => i.startDate <= d && d <= i.endDate); if (cov) load = cov.dailyLoadOverride!; }
    fit = fit * kf + load * (1 - kf);
    fat = fat * ka + load * (1 - ka);
    window.push(load); window.shift();
    days.push({ day: d, load, projected: true, fitness: fit, fatigue: fat, freshness: fit - fat, acwr: acwrOf(window) });
  }

  const weeks = new Map<string, ForecastWeek>();
  for (const f of days) {
    const wk = mondayOf(f.day);
    let before = 0;
    if (!weeks.has(wk)) for (let d = wk; d < f.day; d = addDays(d, 1)) before += series.byDay.get(d)?.load ?? 0;
    const cur = weeks.get(wk) ?? { start: wk, load: before, plannedSessions: 0, endFitness: f.fitness, endFreshness: f.freshness, endAcwr: f.acwr };
    cur.load += f.load; cur.endFitness = f.fitness; cur.endFreshness = f.freshness; cur.endAcwr = f.acwr;
    weeks.set(wk, cur);
  }
  for (const p of planned) { const w = weeks.get(mondayOf(p.plannedDate)); if (w && p.plannedDate <= end) w.plannedSessions++; }
  return { days, weeks: [...weeks.values()], skipped, lastPlanned };
}
