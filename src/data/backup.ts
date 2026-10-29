// Sauvegarde JSON complète, restauration, reprise de l'ancienne base Android.
import { $t } from '../i18n';
import { emptyData, importLegacyDb, type LegacyReport } from '../domain/legacy';
import { liveRecords } from '../domain/load';
import { importDossierData, isDossier, type Dossier, type DossierReport } from '../domain/dossier';
import { graphMessage, isGarminGraph, mergeGarminGraph, type GarminGraphFile } from '../domain/garminGraph';
import type { AppData } from '../domain/types';
import { COLLECTIONS } from '../domain/types';
import { commit, getData, replaceAll } from './store';

export const BACKUP_FORMAT = 'apogee-backup/1';
const OLD_BACKUP_FORMATS = ['quadra-backup/1', 'ironapp-backup/1']; // sauvegardes faites avant les renommages

export function backupBlob(data: AppData): Blob {
  return new Blob([JSON.stringify({ format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data })], { type: 'application/json' });
}

export function parseBackup(text: string): AppData {
  const j = JSON.parse(text) as { format?: string; data?: AppData };
  if ((j.format !== BACKUP_FORMAT && !OLD_BACKUP_FORMATS.includes(String(j.format))) || !j.data) throw new Error($t("ce fichier n’est pas une sauvegarde Apogée"));
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

/** Complète les données avec le dossier coach `apogee/1` exporté par l'ancienne app (voir domain/dossier.ts). */
export function importDossier(dossier: Dossier): DossierReport {
  const { actual, planned, report } = importDossierData(getData(), dossier);
  commit((tx) => { actual.forEach((x) => tx.put('actual', x)); planned.forEach((x) => tx.put('planned', x)); });
  return report;
}

/** Reprend des relevés Garmin mesurés sur des captures (pas, étages, calories, prédictions) : ne remplace rien, comble seulement ce qui manque. */
export function importGarminGraph(file: GarminGraphFile): string {
  const { energy, checkins, report } = mergeGarminGraph(getData(), file);
  commit((tx) => { energy.forEach((x) => tx.put('energy', x)); checkins.forEach((x) => tx.put('checkins', x)); });
  return graphMessage(report) || $t("Rien à ajouter : tout était déjà là");
}

/** Lit un fichier JSON choisi par l'utilisateur : sauvegarde Apogée, dossier coach de l'ancienne app ou relevés Garmin mesurés. */
export function readJsonFile(text: string): { kind: 'backup'; data: AppData } | { kind: 'dossier'; dossier: Dossier } | { kind: 'garmin'; file: GarminGraphFile } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error($t("ce fichier n’est pas un JSON lisible")); }
  if (isDossier(j)) return { kind: 'dossier', dossier: j };
  if (isGarminGraph(j)) return { kind: 'garmin', file: j };
  return { kind: 'backup', data: parseBackup(text) };
}

export function dossierMessage(r: DossierReport): string {
  const parts = [$t("{0} séance(s) ajoutée(s)", { 0: r.added })];
  if (r.completed) parts.push($t("{0} complétée(s) (ressenti, commentaire)", { 0: r.completed }));
  if (r.known) parts.push($t("{0} déjà présente(s)", { 0: r.known }));
  if (r.plannedAdded) parts.push($t("{0} séance(s) prévue(s) ajoutée(s)", { 0: r.plannedAdded }));
  return $t("Dossier coach : ") + parts.join(', ');
}

