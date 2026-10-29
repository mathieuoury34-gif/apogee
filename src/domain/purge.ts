// Nettoyage de l'historique : liste des enregistrements datés strictement avant un jour donné.
// Profil, course, zones, modèles de séance et échanges avec le coach ne sont pas des données datées : ils restent.
import { liveRecords, sessionDay } from './load';
import type { AppData, CollectionName } from './types';

export type PurgeKey = [CollectionName, string];

export function purgePlan(data: AppData, cutoff: string): PurgeKey[] {
  const out: PurgeKey[] = [];
  const before = (day: string | null | undefined) => !!day && day < cutoff;
  for (const x of liveRecords(data.planned)) if (before(x.plannedDate)) out.push(['planned', x.id]);
  const gone = new Set<string>();
  for (const x of liveRecords(data.actual)) if (before(sessionDay(x))) { out.push(['actual', x.id]); gone.add(x.id); }
  for (const x of liveRecords(data.series)) if (gone.has(x.id)) out.push(['series', x.id]);
  for (const x of liveRecords(data.bricks)) if (before(x.day) || gone.has(x.firstId) || gone.has(x.secondId)) out.push(['bricks', x.id]);
  for (const x of liveRecords(data.phases)) if (before(x.endDate)) out.push(['phases', x.id]);
  for (const x of liveRecords(data.interruptions)) if (before(x.endDate)) out.push(['interruptions', x.id]);
  for (const x of liveRecords(data.sleep)) if (before(x.nightDate)) out.push(['sleep', x.id]);
  for (const x of liveRecords(data.resting)) if (before(x.day)) out.push(['resting', x.id]);
  for (const x of liveRecords(data.weight)) if (before(x.day)) out.push(['weight', x.id]);
  for (const x of liveRecords(data.energy)) if (before(x.day)) out.push(['energy', x.id]);
  for (const x of liveRecords(data.meals)) if (before(x.day)) out.push(['meals', x.id]);
  for (const x of liveRecords(data.vitals)) if (before(x.day)) out.push(['vitals', x.id]);
  for (const x of liveRecords(data.checkins)) if (before(x.day || x.week)) out.push(['checkins', x.id]);
  return out;
}
