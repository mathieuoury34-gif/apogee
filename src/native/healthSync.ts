// Collecte Health Connect (APK uniquement) : lecture depuis le dernier point de synchronisation, avec 48 h de
// recouvrement (Garmin dépose parfois en retard). Au premier lancement, l'historique est relu aussi loin que
// Health Connect le permet (permission « historique ») : tout ce que Garmin y a déposé est récupéré.
import { useSyncExternalStore } from 'react';
import { ingest, type IngestReport, type NativeResting, type NativeSession, type NativeSleep } from '../domain/health';
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
    const [s, n, r] = await Promise.all([
      h.readSessions(range) as Promise<{ sessions: NativeSession[] }>,
      (h.readSleep(range) as Promise<{ nights: NativeSleep[] }>).catch(() => ({ nights: [] })),
      (h.readResting(range) as Promise<{ records: NativeResting[] }>).catch(() => ({ records: [] })),
    ]);
    const { ops, report } = ingest(getData(), s.sessions ?? [], n.nights ?? [], r.records ?? []);
    commit((tx) => {
      ops.actual.forEach((x) => tx.put('actual', x));
      ops.series.forEach((x) => tx.put('series', x));
      ops.sleep.forEach((x) => tx.put('sleep', x));
      ops.resting.forEach((x) => tx.put('resting', x));
    });
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
