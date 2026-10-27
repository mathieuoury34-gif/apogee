// Formules publiées en science du sport, sans accès aux données (fonctions pures, testables).
// Les écrans « Capacités » et « Santé » les appliquent à tes séances ; chaque résultat est affiché comme une
// ESTIMATION d'Apogée : ce ne sont pas les indices propriétaires de Garmin (Firstbeat), les chiffres ne sont pas
// comparables un à un.
//
// Références :
//  - Banister E.W. (1991). Modeling elite athletic performance. In Physiological Testing of Elite Athletes (TRIMP, EPOC).
//  - Rowlands D.S. et al. / Firstbeat Technologies (2014). Training Effect : l'effet d'une séance se lit sur l'EPOC, ramené au niveau de l'athlète, échelle 0–5.
//  - Daniels J., Gilbert J. (1979). Oxygen power. Équations du coût en oxygène et de la fraction de VO₂max soutenue selon la durée (VDOT).
//  - Riegel P.S. (1981). Athletic records and human endurance. American Scientist 69(3):285-290 (T₂ = T₁ × (D₂/D₁)^1,06).
//  - ACSM (Guidelines for Exercise Testing and Prescription) : coût en oxygène de la course, VO₂ = 0,2 v + 0,9 v pente + 3,5 (v en m/min).
//  - Swain D.P., Leutholtz B.C. (1997). Heart rate reserve is equivalent to %VO₂ reserve, not to %VO₂max. Med Sci Sports Exerc 29(3):410-414.
//  - Uth N. et al. (2004). Estimation of VO₂max from the ratio between HRmax and HRrest. Eur J Appl Physiol 91:111-115 (15,3 × FCmax / FCrepos).
//  - Hirshkowitz M. et al. (2015). National Sleep Foundation sleep time duration recommendations (7–9 h chez l'adulte).
//  - Gabbett T.J. (2016). The training–injury prevention paradox. Br J Sports Med 50:273-280 (rapport charge aiguë / chronique).
//  - Buchheit M. (2014). Monitoring training status with HR measures. Front Physiol 5:73 (FC de repos et fatigue).
//  - Joyner M.J., Coyle E.F. (2008). Endurance exercise performance: the physiology of champions. J Physiol 586:35-44.
//  - Maunder E. et al. (2021). The importance of 'durability' in the physiological profiling of endurance athletes. Sports Med 51:1619-1628.

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ course : coût en oxygène, VDOT (Daniels & Gilbert)
/** Coût en oxygène (ml/kg/min) d'une course à `speedMs` (m/s) sur une pente moyenne `grade` (0,02 = 2 %). Équation ACSM. */
export function vo2OfRunning(speedMs: number, grade = 0): number {
  const v = speedMs * 60;
  return 0.2 * v + 0.9 * v * grade + 3.5;
}

/** Fraction de VO₂max soutenable pendant `minutes` (Daniels & Gilbert) : ≈ 1 à 4 min, ≈ 0,8 vers 3 h. */
export function sustainedFraction(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/** VDOT (« VO₂max effective ») d'une performance : distance (m) en `timeSec` secondes, sur le plat. Valable de ≈ 4 min à 4 h. */
export function vdotOfPerformance(distanceM: number, timeSec: number): number | null {
  if (!(distanceM > 0) || !(timeSec > 0)) return null;
  const minutes = timeSec / 60;
  if (minutes < 3.5 || minutes > 270) return null;
  const v = distanceM / minutes; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  return vo2 / sustainedFraction(minutes);
}

/** Temps prévu (s) pour `distanceM` à un VDOT donné : la fonction décroît avec le temps, recherche par dichotomie. */
export function timeOfVdot(vdot: number, distanceM: number): number | null {
  if (!(vdot > 0) || !(distanceM > 0)) return null;
  let lo = 3.5 * 60, hi = 270 * 60;
  const f = (t: number) => vdotOfPerformance(distanceM, t)!;
  if (f(lo) < vdot || f(hi) > vdot) return null; // hors du domaine de validité
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const RIEGEL_EXPONENT = 1.06;
export function riegel(timeSec: number, fromM: number, toM: number, exponent = RIEGEL_EXPONENT): number {
  return timeSec * Math.pow(toM / fromM, exponent);
}

export interface RaceDistance { key: '5k' | '10k' | 'half' | 'marathon'; label: string; meters: number }
export const RACE_DISTANCES: RaceDistance[] = [
  { key: '5k', label: '5 km', meters: 5000 },
  { key: '10k', label: '10 km', meters: 10000 },
  { key: 'half', label: '21,1 km', meters: 21097.5 },
  { key: 'marathon', label: '42,2 km', meters: 42195 },
];

// ------------------------------------------------------------------ VO₂max
/** Uth et al. (2004) : VO₂max ≈ 15,3 × FCmax / FCrepos (ml/kg/min). Erreur typique de l'ordre de 10 %. */
export function vo2maxUth(hrMax: number, hrRest: number): number | null {
  if (!(hrMax > 0) || !(hrRest > 25) || hrRest >= hrMax) return null;
  return 15.3 * (hrMax / hrRest);
}

/**
 * Séance à allure stable : le %FC de réserve vaut le % de la réserve de VO₂ (Swain & Leutholtz 1997), donc
 * VO₂max = 3,5 + (VO₂ − 3,5) / %FCR. Retourne null si l'intensité est trop basse ou trop haute pour que la relation tienne.
 */
export function vo2maxFromSubmax(vo2: number, hr: number, hrRest: number, hrMax: number): number | null {
  if (!(hrMax > hrRest + 20)) return null;
  const pct = (hr - hrRest) / (hrMax - hrRest);
  if (pct < 0.6 || pct > 0.98) return null;
  return 3.5 + (vo2 - 3.5) / pct;
}

// ------------------------------------------------------------------ Training Effect (0–5)
export type TeLevel = 'none' | 'minor' | 'maintain' | 'improve' | 'high' | 'over';
export const TE_LEVELS: TeLevel[] = ['none', 'minor', 'maintain', 'improve', 'high', 'over'];
export function teLevel(te: number): TeLevel {
  return te >= 4.8 ? 'over' : te >= 4 ? 'high' : te >= 3 ? 'improve' : te >= 2 ? 'maintain' : te >= 1 ? 'minor' : 'none';
}
/** Pente de la courbe : une séance à la charge de référence (celle d'une séance « solide » du moment) donne ≈ 3,3. */
export const TE_RATE = 1.1;
/** Effet aérobie d'une séance : charge (TRIMP, proxy de l'EPOC) rapportée à la charge de référence de l'athlète, courbe saturante vers 5. */
export function aerobicEffect(load: number, refLoad: number): number {
  if (!(load > 0) || !(refLoad > 0)) return 0;
  return 5 * (1 - Math.exp(-TE_RATE * (load / refLoad)));
}
/** Effet anaérobie : temps passé à ≥ 90 % de la FC max (zone 5). 10 minutes ≈ 2,9. Approximation : Firstbeat ne publie pas ce volet. */
export const ANAEROBIC_TAU_SEC = 12 * 60;
export function anaerobicEffect(zone5Sec: number): number {
  return zone5Sec > 0 ? 5 * (1 - Math.exp(-zone5Sec / ANAEROBIC_TAU_SEC)) : 0;
}
