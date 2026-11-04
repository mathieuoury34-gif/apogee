// Reprise, depuis les fiches Garmin Connect, du dénivelé exact et de la charge de chaque séance (format apogee-garmin/3).
// Le dénivelé de Health Connect diffère souvent de celui de la montre ; la charge sert, pour une activité sans capteur
// cardiaque, à estimer une FC moyenne qui redonne la charge de Garmin (une séance avec courbe garde sa charge calculée).
import { $t } from '../i18n';
import { analyzeHr, avgHrForLoad, MIN_SAMPLES_FOR_TRIMP } from './hr';
import { nowIso } from './ids';
import { liveRecords } from './load';
import { ACTUAL_DISCIPLINES, type ActualSession, type AppData } from './types';

export interface GraphSession {
  /** Début de la séance (ISO). Sert à retrouver la séance de l'appli, à 5 minutes près. */
  startAt: string;
  /** Si renseignée, la séance retrouvée doit être de cette discipline (RUN, BIKE, SWIM, STRENGTH, OTHER). */
  discipline?: string;
  /** Dénivelé positif affiché par Garmin Connect (m). */
  elevationM?: number | null;
  /** Charge d'entraînement affichée par Garmin Connect (« Exercise Load »). */
  loadGarmin?: number | null;
  /** Nom de la séance, pour les messages. */
  label?: string;
}

export const MATCH_TOLERANCE_MS = 5 * 60_000;

export interface SessionsReport {
  matched: number; notFound: string[];
  elevationSet: number; elevationKept: number;
  hrEstimated: number; hrKept: number;
  /** Séances avec une courbe cardiaque exploitable : leur charge est calculée sur la courbe, jamais modifiée par l'import. */
  curveKept: number;
  /** Charge Garmin trop élevée pour être retrouvée avec une FC moyenne plausible. */
  hrOutOfRange: number;
}

export function correctSessions(data: AppData, rows: GraphSession[] | undefined, hrMaxBpm: number | null): { actual: ActualSession[]; report: SessionsReport } {
  const report: SessionsReport = { matched: 0, notFound: [], elevationSet: 0, elevationKept: 0, hrEstimated: 0, hrKept: 0, curveKept: 0, hrOutOfRange: 0 };
  const live = liveRecords(data.actual);
  const patched = new Map<string, ActualSession>();
  const now = nowIso();
  for (const r of rows ?? []) {
    const t = typeof r?.startAt === 'string' ? Date.parse(r.startAt) : NaN;
    const label = r?.label || r?.startAt || '?';
    if (!Number.isFinite(t)) { report.notFound.push(label); continue; }
    const disc = (ACTUAL_DISCIPLINES as readonly string[]).includes(r.discipline ?? '') ? r.discipline : null;
    let best: ActualSession | null = null, bestGap = Infinity;
    for (const s of live) {
      if (disc && s.discipline !== disc) continue;
      const gap = Math.abs(Date.parse(s.startAt) - t);
      if (gap <= MATCH_TOLERANCE_MS && gap < bestGap) { best = s; bestGap = gap; }
    }
    if (!best) { report.notFound.push(label); continue; }
    report.matched++;
    const cur = patched.get(best.id) ?? best;
    let next: ActualSession = cur;
    const edited = new Set(cur.edited);
    let changed = false;

    const el = typeof r.elevationM === 'number' && Number.isFinite(r.elevationM) && r.elevationM >= 0 && r.elevationM <= 9000 ? Math.round(r.elevationM) : null;
    if (el !== null) {
      if (cur.elevationGainM !== null && cur.elevationGainM !== undefined && Math.abs(cur.elevationGainM - el) < 0.5) report.elevationKept++;
      else { next = { ...next, elevationGainM: el }; edited.add('elevationGainM'); report.elevationSet++; changed = true; }
    }

    const load = typeof r.loadGarmin === 'number' && Number.isFinite(r.loadGarmin) ? r.loadGarmin : null;
    if (load !== null && load > 0) {
      const ser = data.series[best.id];
      const curve = !!ser && !ser.deleted && analyzeHr(ser.hr).clean.length >= MIN_SAMPLES_FOR_TRIMP;
      if (curve) report.curveKept++;
      else {
        const est = hrMaxBpm ? avgHrForLoad(load, cur.durationSec, hrMaxBpm) : null;
        if (est === null) report.hrOutOfRange++;
        else {
          const v = Math.round(est * 10) / 10;
          if (cur.avgHrBpm !== null && cur.avgHrBpm !== undefined && Math.abs(cur.avgHrBpm - v) < 0.05) report.hrKept++;
          else { next = { ...next, avgHrBpm: v }; edited.add('avgHrBpm'); report.hrEstimated++; changed = true; }
        }
      }
    }
    if (changed) patched.set(best.id, { ...next, updatedAt: now, edited: next.source === 'manual' ? [] : [...edited] });
  }
  return { actual: [...patched.values()], report };
}

export function sessionsMessage(r: SessionsReport): string {
  const parts: string[] = [];
  if (r.elevationSet) parts.push($t("{0} dénivelé(s) mis à jour d’après Garmin", { 0: r.elevationSet }));
  if (r.hrEstimated) parts.push($t("{0} FC moyenne(s) estimée(s) pour retrouver la charge Garmin", { 0: r.hrEstimated }));
  if (r.curveKept) parts.push($t("{0} séance(s) avec courbe cardiaque : charge calculée sur la courbe, inchangée", { 0: r.curveKept }));
  if (r.hrOutOfRange) parts.push($t("{0} charge(s) Garmin trop élevée(s) pour une FC plausible, non estimée(s)", { 0: r.hrOutOfRange }));
  if (r.elevationKept + r.hrKept) parts.push($t("{0} valeur(s) déjà conformes", { 0: r.elevationKept + r.hrKept }));
  if (r.notFound.length) parts.push($t("{0} séance(s) introuvable(s) dans l’appli ({1})", { 0: r.notFound.length, 1: r.notFound.slice(0, 3).join(', ') + (r.notFound.length > 3 ? '…' : '') }));
  return parts.join(', ');
}
