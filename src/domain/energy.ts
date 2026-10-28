// Calories : dépense (actives + repos) et apport (journal de repas), jour par jour. Rien n'est enregistré ici :
// la dépense vient de Health Connect (ou des séances), l'apport du journal. Les valeurs de repos sont une ESTIMATION
// quand la montre ne donne pas le total.
import { addDays, today } from './dates';
import { liveRecords, sessionDay } from './load';
import { KCAL_J } from './stats';
import type { AppData, Athlete } from './types';

/** Métabolisme de base (kcal/jour), formule de Mifflin-St Jeor. Il faut le sexe, la taille, le poids et l'âge. */
export function bmrKcal(a: Pick<Athlete, 'sex' | 'heightCm' | 'birthDate'> | null | undefined, kg: number | null, day: string): number | null {
  if (!a || !a.sex || !a.heightCm || !a.birthDate || !kg) return null;
  const age = Math.floor((Date.parse(day) - Date.parse(a.birthDate)) / (365.25 * 86400_000));
  if (!(age > 10 && age < 110)) return null;
  return 10 * kg + 6.25 * a.heightCm - 5 * age + (a.sex === 'M' ? 5 : -161);
}

export interface DayEnergy {
  day: string;
  /** Calories actives (mouvement et séances). */
  active: number | null;
  activeFrom: 'health' | 'sessions' | null;
  /** Calories de repos (passives). */
  rest: number | null;
  restFrom: 'health' | 'estimation' | null;
  /** D'où vient le partage repos / actives : réglage de Profil, dépense de base de la montre, ou simple différence des valeurs de Health Connect (peut s'écarter de Garmin Connect). */
  restHow: 'setting' | 'basal' | 'split' | 'estimation' | null;
  /** Dépense totale = repos + actives. */
  total: number | null;
  /** Valeurs brutes déposées par la montre dans Health Connect (avant tout calage), si elles existent. */
  hcRaw: { active: number | null; total: number | null } | null;
  /** Apport du journal de repas. */
  intake: number;
  meals: number;
  /** Apport − dépense (positif : surplus). Seulement si la dépense et au moins un repas sont connus. */
  balance: number | null;
}

function weightAt(data: AppData, day: string): number | null {
  let best: { day: string; kg: number } | null = null;
  for (const w of liveRecords(data.weight)) if (w.day <= day && (!best || w.day > best.day)) best = w;
  if (best) return best.kg;
  for (const w of liveRecords(data.weight)) if (!best || w.day < best.day) best = w;
  return best ? best.kg : null;
}

export function dayEnergy(data: AppData, day: string, nowMin: number = new Date().getHours() * 60 + new Date().getMinutes()): DayEnergy {
  const e = data.energy[day];
  const hc = e && !e.deleted ? e : null;
  let active = hc?.activeKcal ?? null, activeFrom: DayEnergy['activeFrom'] = active !== null ? 'health' : null;
  if (active === null) {
    let j = 0, any = false;
    for (const s of liveRecords(data.actual)) if (sessionDay(s) === day && s.activeCaloriesJ) { j += s.activeCaloriesJ; any = true; }
    if (any) { active = j / KCAL_J; activeFrom = 'sessions'; }
  }
  let rest: number | null = null, restFrom: DayEnergy['restFrom'] = null, restHow: DayEnergy['restHow'] = null;
  const ath = data.athlete.main && !data.athlete.main.deleted ? data.athlete.main : null;
  const calib = ath?.restKcal && ath.restKcal > 0 ? ath.restKcal : null;
  let totalOverride: number | null = null;
  if (calib !== null && hc?.totalKcal != null && hc.totalKcal > 0) {
    // le total de Health Connect est bon ; c'est son partage repos / actives qui diffère de Garmin Connect : on repart du repos de la montre
    // (au prorata de l'heure pour aujourd'hui, comme la montre) et les actives sont le reste
    const frac = day === today() ? Math.min(1, Math.max(0.02, nowMin / 1440)) : 1;
    rest = Math.min(hc.totalKcal, calib * frac); restFrom = 'health'; restHow = 'setting';
    active = Math.max(0, hc.totalKcal - rest); activeFrom = 'health';
    totalOverride = hc.totalKcal;
  } else if (hc?.totalKcal != null && hc.totalKcal > 0 && hc.basalKcal != null && hc.basalKcal > 0 && hc.basalKcal <= hc.totalKcal) {
    // la montre dépose aussi sa dépense de base : repos = base, actives = reste (c'est la définition de Garmin Connect)
    rest = hc.basalKcal; restFrom = 'health'; restHow = 'basal';
    active = hc.totalKcal - rest; activeFrom = 'health';
    totalOverride = hc.totalKcal;
  } else if (hc?.totalKcal != null && hc.activeKcal != null && hc.totalKcal >= hc.activeKcal) { rest = hc.totalKcal - hc.activeKcal; restFrom = 'health'; restHow = 'split'; }
  else {
    const b = bmrKcal(ath, weightAt(data, day), day);
    if (b !== null) { rest = b; restFrom = 'estimation'; restHow = 'estimation'; }
  }
  const meals = liveRecords(data.meals).filter((m) => m.day === day);
  const intake = meals.reduce((t, m) => t + m.kcal, 0);
  const total = totalOverride ?? (rest !== null ? rest + (active ?? 0) : null);
  return { day, active, activeFrom, rest, restFrom, restHow, total, hcRaw: hc ? { active: hc.activeKcal ?? null, total: hc.totalKcal ?? null } : null, intake, meals: meals.length, balance: total !== null && meals.length ? intake - total : null };
}

/** Les 7 jours de la semaine commençant le lundi `monday`. */
export function weekEnergy(data: AppData, monday: string): { days: DayEnergy[]; active: number; rest: number; intake: number; mealDays: number } {
  const days = Array.from({ length: 7 }, (_, i) => dayEnergy(data, addDays(monday, i)));
  return {
    days,
    active: days.reduce((t, d) => t + (d.active ?? 0), 0),
    rest: days.reduce((t, d) => t + (d.rest ?? 0), 0),
    intake: days.reduce((t, d) => t + d.intake, 0),
    mealDays: days.filter((d) => d.meals > 0).length,
  };
}
