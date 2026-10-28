// Collecte Health Connect (APK uniquement) : lecture depuis le dernier point de synchronisation, avec 48 h de
// recouvrement (Garmin dépose parfois en retard). Au premier lancement, l'historique est relu aussi loin que
// Health Connect le permet (permission « historique ») : tout ce que Garmin y a déposé est récupéré.
import { useSyncExternalStore } from 'react';
import { ingest, type IngestReport, type NativeResting, type NativeSession, type NativeSleep, type NativeWeight } from '../domain/health';
import { ingestEnergy, ingestVitals, type NativeActivityDay, type NativeEnergyDay, type NativeHrv, type NativeVo2 } from '../domain/healthExtra';
import { commit, getData, getPrefs, setPrefs } from '../data/store';
import { native } from './bridge';

export interface HealthState {
  availability: 'available' | 'unavailable' | 'update_required' | 'error' | 'absent';
  granted: string[];
  missing: string[];
  history: boolean;
  running: boolean;
  lastReport: IngestReport | null;
  error: string;
}
let state: HealthState = { availability: 'absent', granted: [], missing: [], history: false, running: false, lastReport: null, error: '' };
const ls = new Set<() => void>();
const set = (p: Partial<HealthState>) => { state = { ...state, ...p }; ls.forEach((l) => l()); };
export function useHealth(): HealthState {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state);
}

const FIRST_RUN_DAYS_HISTORY = 400;
const FIRST_RUN_DAYS = 30;
const OVERLAP_H = 48;

export async function refreshHealthState(): Promise<HealthState> {
  const h = native.health();
  if (!h) { set({ availability: 'absent' }); return state; }
  try {
    const a = await h.availability();
    if (a.status !== 'available') { set({ availability: a.status }); return state; }
    const p = await h.permissions();
    set({ availability: 'available', granted: p.granted ?? [], missing: p.missing ?? [], history: !!p.history });
  } catch (e) {
    set({ availability: 'error', error: (e as Error).message });
  }
  return state;
}

export async function requestHealthPermissions(): Promise<void> {
  const h = native.health();
  if (!h) return;
  try { await h.requestAccess(); } catch (e) { set({ error: (e as Error).message }); }
  await refreshHealthState();
}

export function openHealthSettings(): void {
  native.health()?.openSettings?.();
}

export async function runHealthSync(): Promise<IngestReport | null> {
  const h = native.health();
  if (!h || state.running) return null;
  await refreshHealthState();
  if (state.availability !== 'available' || state.missing.includes('ExerciseSession')) return null;
  set({ running: true, error: '' });
  const end = new Date();
  const prev = getPrefs().healthSyncedUntil;
  const start = prev ? new Date(Date.parse(prev) - OVERLAP_H * 3600_000) : new Date(end.getTime() - (state.history ? FIRST_RUN_DAYS_HISTORY : FIRST_RUN_DAYS) * 86400_000);
  const range = { start: start.toISOString(), end: end.toISOString() };
  try {
    // une fois, relire 400 jours de nuits pour y mettre le temps réellement endormi (les étapes viennent de l'APK à jour)
    const rescanSleep = !getPrefs().healthSleepAsleep || !getPrefs().healthSleepMerged;
    const sleepRange = rescanSleep ? { start: new Date(end.getTime() - FIRST_RUN_DAYS_HISTORY * 86400_000).toISOString(), end: range.end } : range;
    const [s, n, r, wt] = await Promise.all([
      h.readSessions(range) as Promise<{ sessions: NativeSession[] }>,
      (h.readSleep(sleepRange) as Promise<{ nights: NativeSleep[] }>).catch(() => ({ nights: [] })),
      (h.readResting(range) as Promise<{ records: NativeResting[] }>).catch(() => ({ records: [] })),
      // poids : un APK ou une autorisation en retard ne bloque rien
      (h.readWeight?.(range) as Promise<{ records: NativeWeight[] }> | undefined)?.catch(() => ({ records: [] })) ?? Promise.resolve({ records: [] as NativeWeight[] }),
    ]);
    // dépense du jour, VO₂max, HRV : un APK plus ancien ou une autorisation refusée ne bloque rien
    const [en, act, vo2, hrv] = await Promise.all([
      (h.readDailyEnergy?.(getPrefs().healthEnergyScan ? range : { start: new Date(end.getTime() - 120 * 86400_000).toISOString(), end: range.end }) as Promise<{ days: NativeEnergyDay[] }> | undefined)?.catch(() => ({ days: [] as NativeEnergyDay[] })) ?? Promise.resolve({ days: [] as NativeEnergyDay[] }),
      (h.readDailyActivity?.(getPrefs().healthActivityScan ? range : { start: new Date(end.getTime() - 120 * 86400_000).toISOString(), end: range.end }) as Promise<{ days: NativeActivityDay[] }> | undefined)?.catch(() => ({ days: [] as NativeActivityDay[] })) ?? Promise.resolve({ days: [] as NativeActivityDay[] }),
      (h.readVo2Max?.(range) as Promise<{ records: NativeVo2[] }> | undefined)?.catch(() => ({ records: [] as NativeVo2[] })) ?? Promise.resolve({ records: [] as NativeVo2[] }),
      (h.readHrv?.(range) as Promise<{ records: NativeHrv[] }> | undefined)?.catch(() => ({ records: [] as NativeHrv[] })) ?? Promise.resolve({ records: [] as NativeHrv[] }),
    ]);
    const energyOps = ingestEnergy(getData(), en.days ?? [], act.days ?? []);
    const vitalsOps = ingestVitals(getData(), vo2.records ?? [], hrv.records ?? []);
    setPrefs({ healthProbe: JSON.stringify({ at: range.end, energyDays: (en.days ?? []).length, activityDays: (act.days ?? []).length, vo2: (vo2.records ?? []).length, hrv: (hrv.records ?? []).length }) });
    const { ops, report } = ingest(getData(), s.sessions ?? [], n.nights ?? [], r.records ?? [], { weight: wt.records ?? [] });
    commit((tx) => {
      ops.actual.forEach((x) => tx.put('actual', x));
      ops.series.forEach((x) => tx.put('series', x));
      ops.sleep.forEach((x) => tx.put('sleep', x));
      ops.resting.forEach((x) => tx.put('resting', x));
      ops.weight.forEach((x) => tx.put('weight', x));
      energyOps.forEach((x) => tx.put('energy', x));
      vitalsOps.forEach((x) => tx.put('vitals', x));
    });
    if (!getPrefs().healthActivityScan && (act.days ?? []).length > 0) setPrefs({ healthActivityScan: true });
    if (!getPrefs().healthEnergyScan && (en.days ?? []).length > 0) setPrefs({ healthEnergyScan: true });
    if (rescanSleep && (n.nights ?? []).some((x) => 'asleepSec' in x)) setPrefs({ healthSleepAsleep: true, healthSleepMerged: true });
    setPrefs({ healthSyncedUntil: range.end, healthLastRun: range.end, healthLastError: '', healthLastReport: JSON.stringify(report) });
    set({ running: false, lastReport: report });
    return report;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    setPrefs({ healthLastRun: new Date().toISOString(), healthLastError: msg });
    set({ running: false, error: msg });
    return null;
  }
}
