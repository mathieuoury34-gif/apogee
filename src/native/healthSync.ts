// Collecte Health Connect (APK uniquement) : lecture depuis le dernier point de synchronisation, avec 48 h de
// recouvrement (Garmin dépose parfois en retard). Au premier lancement, l'historique est relu aussi loin que
// Health Connect le permet (permission « historique ») : tout ce que Garmin y a déposé est récupéré.
import { useSyncExternalStore } from 'react';
import { ingest, withRoute, type IngestReport, type NativeHrv, type NativeResting, type NativeRoute, type NativeSession, type NativeSleep, type NativeWeight } from '../domain/health';
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
    const [s, n, r, hv, wt] = await Promise.all([
      h.readSessions(range) as Promise<{ sessions: NativeSession[] }>,
      (h.readSleep(range) as Promise<{ nights: NativeSleep[] }>).catch(() => ({ nights: [] })),
      (h.readResting(range) as Promise<{ records: NativeResting[] }>).catch(() => ({ records: [] })),
      // lectures ajoutées avec la version « puissance, HRV, poids » : un APK ou une autorisation en retard ne bloque rien
      (h.readHrv?.(range) as Promise<{ records: NativeHrv[] }> | undefined)?.catch(() => ({ records: [] })) ?? Promise.resolve({ records: [] as NativeHrv[] }),
      (h.readWeight?.(range) as Promise<{ records: NativeWeight[] }> | undefined)?.catch(() => ({ records: [] })) ?? Promise.resolve({ records: [] as NativeWeight[] }),
    ]);
    const { ops, report } = ingest(getData(), s.sessions ?? [], n.nights ?? [], r.records ?? [], { hrv: hv.records ?? [], weight: wt.records ?? [] });
    commit((tx) => {
      ops.actual.forEach((x) => tx.put('actual', x));
      ops.series.forEach((x) => tx.put('series', x));
      ops.sleep.forEach((x) => tx.put('sleep', x));
      ops.resting.forEach((x) => tx.put('resting', x));
      ops.hrv.forEach((x) => tx.put('hrv', x));
      ops.weight.forEach((x) => tx.put('weight', x));
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

export type RouteOutcome = 'ok' | 'none' | 'denied' | 'unavailable';

/** Lit le tracé GPS d'une séance dans Health Connect (l'écran d'accord s'ouvre si besoin) et le range dans sa série. */
export async function loadRoute(session: { id: string; sourceId: string; startAt: string; endAt: string }): Promise<RouteOutcome> {
  const h = native.health();
  if (!h?.readRoute) return 'unavailable';
  const res = (await h.readRoute({ startTime: session.startAt, endTime: session.endAt, clientRecordId: session.sourceId })) as NativeRoute;
  if (res.status !== 'ok') return res.status;
  if (!res.points?.length) return 'none';
  commit((tx) => tx.put('series', withRoute(getData().series[session.id], session.id, res.points)));
  return 'ok';
}
