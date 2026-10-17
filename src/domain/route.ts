// Tracé GPS d'une séance (lu à la demande dans Health Connect) : distance, profil d'altitude, dénivelé,
// et projection plane du tracé. Aucun fond de carte : l'app n'appelle aucun service de cartographie.
import type { RoutePoint } from './types';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversine(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[2] - a[2]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RouteStats {
  distanceM: number;
  /** `[distance cumulée m, altitude m]`, altitude lissée (moyenne sur 5 points). */
  profile: [number, number][];
  ascentM: number | null;
  descentM: number | null;
  minAlt: number | null;
  maxAlt: number | null;
  /** Points du tracé projetés dans [0,1] × [0,1] (ordonnée vers le haut), proportions conservées. */
  shape: [number, number][];
  /** Rapport largeur / hauteur de l'emprise. */
  aspect: number;
}

/** Seuil de ré-armement du cumul de dénivelé : les variations plus petites sont du bruit GPS / baromètre. */
export const ALT_HYSTERESIS_M = 3;

export function routeStats(route: RoutePoint[]): RouteStats | null {
  const pts = route.filter((p) => Number.isFinite(p[1]) && Number.isFinite(p[2]));
  if (pts.length < 5) return null;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const distanceM = cum[cum.length - 1];
  if (distanceM < 50) return null;
  // altitude : lissage puis cumul avec seuil
  const withAlt = pts.map((p, i) => ({ d: cum[i], a: p[3] })).filter((x): x is { d: number; a: number } => x.a !== null && Number.isFinite(x.a));
  let profile: [number, number][] = [], ascentM: number | null = null, descentM: number | null = null, minAlt: number | null = null, maxAlt: number | null = null;
  if (withAlt.length >= 5) {
    const sm = withAlt.map((x, i) => {
      const lo = Math.max(0, i - 2), hi = Math.min(withAlt.length - 1, i + 2);
      let t = 0;
      for (let k = lo; k <= hi; k++) t += withAlt[k].a;
      return t / (hi - lo + 1);
    });
    profile = withAlt.map((x, i) => [x.d, sm[i]]);
    let ref = sm[0], up = 0, down = 0;
    for (const v of sm) {
      if (v - ref >= ALT_HYSTERESIS_M) { up += v - ref; ref = v; }
      else if (ref - v >= ALT_HYSTERESIS_M) { down += ref - v; ref = v; }
    }
    ascentM = Math.round(up); descentM = Math.round(down);
    minAlt = Math.min(...sm); maxAlt = Math.max(...sm);
  }
  // projection équirectangulaire centrée sur la latitude moyenne
  const lat0 = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const kx = Math.cos(rad(lat0));
  const xs = pts.map((p) => p[2] * kx), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  const shape = pts.map((_, i) => [(xs[i] - x0) / span, (ys[i] - y0) / span] as [number, number]);
  return { distanceM, profile, ascentM, descentM, minAlt, maxAlt, shape, aspect: (x1 - x0) / Math.max(y1 - y0, 1e-9) };
}
