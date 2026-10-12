// État de l'application : données en mémoire, persistées sur l'appareil (IndexedDB), synchronisées par
// enregistrement avec Firestore quand le compte Google est relié (data/sync.ts).
import { useMemo, useSyncExternalStore } from 'react';
import { derive, type Derived } from '../domain/engine';
import { emptyData } from '../domain/legacy';
import { nowIso } from '../domain/ids';
import type { AppData, CalcSettings, CollectionName, Collections } from '../domain/types';
import { COLLECTIONS } from '../domain/types';
import { clearRecords, getMeta, readAll, setMeta, writeMany } from './idb';

export type Origin = 'local' | 'remote';
export interface Change { coll: CollectionName; id: string; origin: Origin }

let data: AppData = emptyData();
let ready = false;
const listeners = new Set<() => void>();
const changeHooks = new Set<(changes: Change[]) => void>();
/** Enregistrements modifiés sur cet appareil et pas encore envoyés au cloud (`collection/id`). */
export const dirty = new Set<string>();

const key = (c: string, id: string) => c + '/' + id;

export async function loadStore(): Promise<void> {
  try {
    const rows = await readAll();
    const d = emptyData();
    let latest = '';
    for (const { key: k, value } of rows) {
      const i = k.indexOf('/');
      const coll = k.slice(0, i) as CollectionName;
      if (!COLLECTIONS.includes(coll)) continue;
      const rec = value as { id: string; updatedAt: string };
      (d[coll] as Record<string, unknown>)[k.slice(i + 1)] = rec;
      if (rec.updatedAt > latest) latest = rec.updatedAt;
    }
    d.updatedAt = latest;
    data = d;
    const pend = await getMeta<string[]>('dirty');
    pend?.forEach((x) => dirty.add(x));
  } catch (e) {
    console.warn('[store] lecture impossible', e);
  }
  ready = true;
  emit([]);
}

function emit(changes: Change[]) {
  listeners.forEach((l) => l());
  if (changes.length) changeHooks.forEach((h) => h(changes));
}

let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
function persistDirty() {
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => { setMeta('dirty', [...dirty]).catch(() => undefined); }, 300);
}

export interface Tx {
  put<K extends CollectionName>(coll: K, rec: Collections[K]): void;
  remove(coll: CollectionName, id: string): void;
}

/**
 * Applique un lot de modifications. `origin: 'remote'` (synchronisation) garde l'horodatage reçu et ne
 * remarque rien à envoyer ; `'local'` horodate et met en file d'envoi.
 */
export function commit(fn: (tx: Tx) => void, origin: Origin = 'local'): void {
  const next = { ...data } as AppData;
  const touched = new Set<CollectionName>();
  const changes: Change[] = [];
  const puts: [string, unknown][] = [];
  const now = nowIso();
  const tx: Tx = {
    put(coll, rec) {
      if (!touched.has(coll)) { (next as unknown as Record<string, unknown>)[coll] = { ...data[coll] }; touched.add(coll); }
      const r = origin === 'local' ? { ...rec, updatedAt: now } : rec;
      (next[coll] as Record<string, unknown>)[rec.id] = r;
      puts.push([key(coll, rec.id), r]);
      changes.push({ coll, id: rec.id, origin });
      if (origin === 'local') dirty.add(key(coll, rec.id)); else dirty.delete(key(coll, rec.id));
    },
    remove(coll, id) {
      const cur = (next[coll] as Record<string, { id: string; updatedAt: string; deleted?: boolean }>)[id];
      if (!cur || cur.deleted) return;
      // pierre tombale minimale : la suppression se propage aux autres appareils
      tx.put(coll, { id, updatedAt: now, deleted: true } as never);
    },
  };
  fn(tx);
  if (!changes.length) return;
  next.updatedAt = now;
  data = next;
  writeMany(puts).catch((e) => console.warn('[store] écriture', e));
  if (origin === 'local') persistDirty();
  emit(changes);
}

/** Remplace toutes les données (restauration, reprise de l'ancienne base). Tout part vers le cloud. */
export function replaceAll(next: AppData): void {
  commit((tx) => {
    for (const c of COLLECTIONS) {
      for (const id of Object.keys(data[c])) if (!(id in next[c])) tx.remove(c, id);
      for (const rec of Object.values(next[c])) tx.put(c, rec as never);
    }
  });
}

/** Fusionne des données (import de l'ancienne base dans une app qui en contient déjà). */
export function mergeAll(next: AppData): void {
  commit((tx) => { for (const c of COLLECTIONS) for (const rec of Object.values(next[c])) tx.put(c, rec as never); });
}

/** Efface les données de CET appareil (le cloud n'est pas touché). */
export async function wipeLocal(): Promise<void> {
  await clearRecords();
  dirty.clear();
  data = emptyData();
  emit([]);
}

export function getData(): AppData { return data; }
export function isReady(): boolean { return ready; }
export function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
export function onChange(fn: (c: Change[]) => void): () => void { changeHooks.add(fn); return () => changeHooks.delete(fn); }
export function markClean(keys: string[]): void { keys.forEach((k) => dirty.delete(k)); persistDirty(); }

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}
export function useReady(): boolean {
  return useSyncExternalStore(subscribe, isReady, isReady);
}

// ------------------------------------------------------------------ préférences propres à l'appareil
const PREF_KEY = 'ironapp:prefs';
export interface Prefs {
  skipLogin: boolean;
  syncedUid?: string;
  provisionalLoad: boolean;
  /** Borne haute déjà lue dans Health Connect (APK). */
  healthSyncedUntil?: string;
  healthLastRun?: string;
  healthLastError?: string;
  healthLastReport?: string;
  /** Rappels de séance (APK) : heure locale. */
  reminderHour: number;
}
const DEFAULT_PREFS: Prefs = { skipLogin: false, provisionalLoad: true, reminderHour: 7 };
const prefListeners = new Set<() => void>();
let prefsCache: Prefs | null = null;
export function getPrefs(): Prefs {
  if (prefsCache) return prefsCache;
  try { prefsCache = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { prefsCache = { ...DEFAULT_PREFS }; }
  return prefsCache!;
}
export function setPrefs(p: Partial<Prefs>): void {
  prefsCache = { ...getPrefs(), ...p };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefsCache)); } catch { /* stockage indisponible */ }
  prefListeners.forEach((l) => l());
}
export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { prefListeners.add(l); return () => prefListeners.delete(l); }, getPrefs, getPrefs);
}

// ------------------------------------------------------------------ calculs dérivés
let derivedCache: { data: AppData; day: string; provisional: boolean; value: Derived } | null = null;
export function getDerived(d: AppData = data): Derived {
  const now = new Date();
  const day = now.toDateString();
  const settings: CalcSettings = { provisionalLoad: getPrefs().provisionalLoad };
  if (derivedCache && derivedCache.data === d && derivedCache.day === day && derivedCache.provisional === settings.provisionalLoad) return derivedCache.value;
  const value = derive(d, settings, now);
  derivedCache = { data: d, day, provisional: settings.provisionalLoad, value };
  return value;
}

export function useCalc(): { data: AppData; d: Derived } {
  const d = useData();
  const prefs = usePrefs();
  return useMemo(() => ({ data: d, d: getDerived(d) }), [d, prefs.provisionalLoad]);
}
