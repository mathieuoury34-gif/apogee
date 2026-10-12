// Sauvegarde JSON complète, restauration, reprise de l'ancienne base Android.
import { emptyData, importLegacyDb, type LegacyReport } from '../domain/legacy';
import { liveRecords } from '../domain/load';
import type { AppData } from '../domain/types';
import { COLLECTIONS } from '../domain/types';
import { commit, getData, replaceAll } from './store';

export const BACKUP_FORMAT = 'ironapp-backup/1';

export function backupBlob(data: AppData): Blob {
  return new Blob([JSON.stringify({ format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data })], { type: 'application/json' });
}

export function parseBackup(text: string): AppData {
  const j = JSON.parse(text) as { format?: string; data?: AppData };
  if (j.format !== BACKUP_FORMAT || !j.data) throw new Error('ce fichier n’est pas une sauvegarde Iron App');
  const d = emptyData();
  for (const c of COLLECTIONS) (d as unknown as Record<string, unknown>)[c] = j.data[c] ?? {};
  return d;
}

export function restoreBackup(d: AppData): void {
  replaceAll(d);
}

export function isEmpty(data: AppData): boolean {
  return !liveRecords(data.actual).length && !liveRecords(data.planned).length;
}

/**
 * Reprend l'ancienne base. Si l'app contient déjà des séances (collectées par l'APK avant la reprise), une
 * même activité Garmin n'est gardée qu'une fois : la version de l'ancienne base (avec son RPE, son
 * rattachement) l'emporte, la série cardio la plus complète est conservée.
 */
export function importLegacy(bytes: Uint8Array): LegacyReport {
  const { data: legacy, report } = importLegacyDb(bytes);
  const cur = getData();
  const bySource = new Map(liveRecords(cur.actual).map((s) => [s.sourceId, s]));
  commit((tx) => {
    for (const c of COLLECTIONS) {
      if (c === 'actual' || c === 'series') continue;
      for (const rec of Object.values(legacy[c])) {
        const existing = (cur[c] as Record<string, { updatedAt: string; deleted?: boolean }>)[rec.id];
        // profil et course : on ne remplace pas une saisie plus récente faite dans la nouvelle app
        if ((c === 'athlete' || c === 'race') && existing && !existing.deleted) continue;
        tx.put(c, rec as never);
      }
    }
    for (const s of Object.values(legacy.actual)) {
      const dup = bySource.get(s.sourceId);
      let ser = legacy.series[s.id];
      if (dup && dup.id !== s.id) {
        const dupSer = cur.series[dup.id];
        if (dupSer && !dupSer.deleted && (!ser || dupSer.hr.length > ser.hr.length)) ser = { ...dupSer, id: s.id };
        tx.remove('actual', dup.id);
        if (dupSer) tx.remove('series', dup.id);
      }
      tx.put('actual', { ...s, hasSeries: !!ser || s.hasSeries });
      if (ser) tx.put('series', ser);
    }
  });
  return report;
}
