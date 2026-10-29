// Tests des calculs d’Apogée (node --test). Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { estimateDistance, estimateDuration, newBlock, validateSession } from '../src/domain/blocks';
import { addDays, today, localDay, mondayOf, weeksOfMonth } from '../src/domain/dates';
import { derive, refsOf } from '../src/domain/engine';
import { bestSegment, bestSpeedOver, efficiency, personalRecords, suggestZones } from '../src/domain/records';
import { forecastLoad } from '../src/domain/forecast';
import { fitnessByDiscipline } from '../src/domain/loadByDiscipline';
import { polarSplit, zoneIndex, zoneTimes } from '../src/domain/zones';
import { trainingAlerts } from '../src/domain/review';
import { planCompliance } from '../src/domain/compliance';
import { computeDailyForm } from '../src/domain/form';
import { ingest } from '../src/domain/health';
import { encodeFit, fitCrc, fitFileName, toFitWorkouts } from '../src/domain/fit';
import { sleepStats, weightTrend } from '../src/domain/body';
import { analyzeHr, cleanHr, epocFromAverage, epocFromSeries, epocRate, hrDrift, sustainedPeak, trimpFromAverage, trimpFromSeries } from '../src/domain/hr';
import { importLegacyDb, emptyData } from '../src/domain/legacy';
import { buildLoadSeries, computeSessionLoads, resolveHrMax } from '../src/domain/load';
import { buildManualSession, parseBulkActual, parseBulkPlanned, parseManualFields } from '../src/domain/manual';
import { hm } from '../src/ui/format';
import { bmrKcal, dayEnergy, weekEnergy } from '../src/domain/energy';
import { mergeSleepParts } from '../src/domain/health';
import { loadFocus } from '../src/domain/loadStatus';
import { capacityHistory } from '../src/domain/capacity';
import { ingestEnergy, ingestVitals } from '../src/domain/healthExtra';
import { checkinStatus, currentCheckin, emptyCheckin, metricSeries, sundayOf } from '../src/domain/checkin';
import { mergeGarminGraph } from '../src/domain/garminGraph';
import { purgePlan } from '../src/domain/purge';
import { acuteSeries, dailyStatus, statusOf, weeklyStatus } from '../src/domain/loadStatus';
import type { DayLoad } from '../src/domain/load';
import { applyPreview, buildDossier, parsePlan, preview } from '../src/domain/coach';
import { RACE_DISTANCES, aerobicEffect, anaerobicEffect, riegel, teLevel, timeOfVdot, vdotOfPerformance, vo2OfRunning, vo2maxFromSubmax, vo2maxUth } from '../src/domain/science';
import { acuteScore, bestEfforts, energyReserve, enduranceScore, hillScore, readiness, restingScore, sleepScore, trainingEffects, vo2maxEstimate } from '../src/domain/capacity';
import { defaultDisp, fromDisp, toDisp } from '../src/ui/targetUnits';
import type { ActualSession, AppData, Block } from '../src/domain/types';

const SETTINGS = { provisionalLoad: true };

function legacy(): AppData {
  execFileSync('python3', ['tests/fixtures/make_legacy_db.py', '/tmp/apogee-legacy-test.db']);
  return importLegacyDb(new Uint8Array(readFileSync('/tmp/apogee-legacy-test.db'))).data;
}

test('dates : jour civil selon le décalage de la montre, semaines du mois', () => {
  assert.equal(localDay('2026-09-01T23:30:00.000Z', 120), '2026-09-02');
  assert.equal(localDay('2026-09-01T23:30:00.000Z', 0), '2026-09-01');
  assert.equal(mondayOf('2026-10-11'), '2026-10-05');
  assert.equal(weeksOfMonth('2026-10')[0], '2026-09-28'); // la première semaine partielle est comprise
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('lecteur SQLite et reprise de l’ancienne base', () => {
  const d = legacy();
  assert.equal(d.athlete.main.displayName, 'Mathieu');
  assert.deepEqual(d.athlete.main.availability, ['mon', 'wed']);
  assert.equal(d.race.main.targetRunSeconds, 6600);
  assert.equal(Object.keys(d.zones).length, 1, 'l’estimation automatique de FC max n’est pas reprise');
  const p = Object.values(d.planned)[0];
  assert.equal(p.blocks.length, 2);
  assert.equal(p.blocks[1].kind, 'SET');
  assert.equal(p.blocks[1].children.length, 2);
  assert.equal(p.blocks[1].children[0].targetLow, 240);
  const run = Object.values(d.actual).find((a) => a.sourceId === 'g-123')!;
  assert.equal(run.rpe, 6);
  assert.equal(run.comment, 'Bonnes jambes');
  assert.equal(d.series[run.id].hr.length, 400, 'série complète malgré les pages de débordement');
  const str = Object.values(d.actual).find((a) => a.discipline === 'STRENGTH')!;
  assert.equal(str.manualPlannedId, null, 'marquée « non prévue »');
  assert.equal(str.source, 'manual');
  assert.ok(Object.keys(d.resting).length > 300, 'pages intérieures de l’arbre B parcourues');
  assert.equal(Object.values(d.exchanges)[0].exportSessions?.length, 1);
});

test('TRIMP : série et FC moyenne cohérents, dérive', () => {
  const c = { hrMaxBpm: 195, hrRestBpm: 50, sex: 'M' as const };
  const series: [number, number][] = Array.from({ length: 330 }, (_, i) => [i * 11, 150]);
  const t = trimpFromSeries(series, c, 3630)!;
  const avg = trimpFromAverage(150, 3630, c)!;
  assert.ok(Math.abs(t.value - avg) / avg < 0.02, `${t.value} ≈ ${avg}`);
  assert.equal(hrDrift(series), 0);
  const rising: [number, number][] = Array.from({ length: 330 }, (_, i) => [i * 11, i < 165 ? 140 : 154]);
  assert.ok(Math.abs(hrDrift(rising)! - 0.1) < 0.001);
  // pic soutenu : un artefact isolé à 220 ne compte pas
  const spiky: [number, number][] = series.map((p, i) => (i === 100 ? [p[0], 220] : p));
  assert.equal(sustainedPeak(spiky), 150);
});

test('FC max : la valeur saisie n’est jamais écrasée par Tanaka', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: '', displayName: null, birthDate: '2002-01-01', sex: 'M', availability: [], equipment: [], injuries: [] };
  const now = new Date('2026-10-01T00:00:00Z');
  assert.equal(resolveHrMax(d, now).origin, 'tanaka');
  assert.ok(Math.abs(resolveHrMax(d, now).bpm! - 191.2) < 0.01);
  d.zones.z = { id: 'z', updatedAt: '', kind: 'hr_max', value: 186, measuredAt: '2026-09-01', source: 'test', notes: null };
  assert.equal(resolveHrMax(d, now).bpm, 186);
});

function session(id: string, day: string, o: Partial<ActualSession> = {}): ActualSession {
  return { ...buildManualSession({ date: day, discipline: 'RUN', durationMin: 60, distanceKm: 10, avgHrBpm: null, rpe: null }, id), ...o };
}

test('sRPE recalé sur l’échelle du TRIMP, charge provisoire', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: '', displayName: null, birthDate: '1995-01-01', sex: 'M', availability: [], equipment: [], injuries: [] };
  d.resting.r = { id: '2026-09-01', updatedAt: '', day: '2026-09-01', bpm: 50 };
  for (let i = 0; i < 6; i++) {
    const day = addDays('2026-09-01', i);
    const id = 'h' + i;
    d.actual[id] = session(id, day, { source: 'health', sourceId: 'g' + i, rpe: 5, hasSeries: true });
    d.series[id] = { id, updatedAt: '', hr: Array.from({ length: 330 }, (_, k) => [Date.parse(day + 'T08:00:00Z') / 1000 + k * 11, 150] as [number, number]), speed: [] };
  }
  d.actual.m = session('m', '2026-09-08', { rpe: 5 });
  d.actual.p = session('p', '2026-09-09');
  const { loads, ctx } = computeSessionLoads(d, SETTINGS, new Date('2026-09-10T12:00:00Z'));
  assert.equal(ctx.srpeCalibrationPairs, 6);
  const measured = loads.get('h0')!.load!;
  const manual = loads.get('m')!;
  assert.equal(manual.method, 'srpe');
  assert.ok(Math.abs(manual.load! - measured) / measured < 0.01, 'même RPE, même durée → même charge que la séance mesurée');
  const prov = loads.get('p')!;
  assert.equal(prov.method, 'provisional');
  assert.ok(Math.abs(prov.load! - measured) / measured < 0.01);
  assert.equal(computeSessionLoads(d, { provisionalLoad: false }).loads.get('p')!.method, 'pending');
});

test('Banister : série continue, amorçage, forfait d’interruption', () => {
  const d = emptyData();
  d.actual.a = session('a', '2026-09-01', { rpe: 5 });
  d.interruptions.i = { id: 'i', updatedAt: '', label: 'GR20', startDate: '2026-09-03', endDate: '2026-09-04', reason: 'external_load', dailyLoadOverride: 45, suspendsReminders: true, notes: null };
  const { loads } = computeSessionLoads(d, SETTINGS);
  const s = buildLoadSeries(d, loads, '2026-09-06');
  assert.equal(s.days.length, 6);
  assert.equal(s.byDay.get('2026-09-03')!.load, 45);
  assert.ok(s.byDay.get('2026-09-03')!.interruptionFill);
  assert.equal(s.byDay.get('2026-09-02')!.load, 0);
  assert.ok(s.isPriming);
});

test('forme du jour : fraîcheur du réveil, référence sans le jour même', () => {
  const sleep = new Map<string, number>(), rest = new Map<string, number>(), fresh = new Map<string, number>(), rpe = new Map<string, number>();
  for (let k = 1; k <= 14; k++) { const d = addDays('2026-09-15', -k); sleep.set(d, 27000 + (k % 3) * 600); rest.set(d, 48 + (k % 2)); fresh.set(d, 0); }
  sleep.set('2026-09-15', 30600); rest.set('2026-09-15', 46); fresh.set('2026-09-15', 10);
  const f = computeDailyForm('2026-09-15', { sleep, restingHr: rest, freshness: fresh, previousRpe: rpe })!;
  assert.ok(f.score > 60, 'bien dormi, FC basse, frais → au-dessus de 60');
  assert.deepEqual(f.missing, ['previousRpe']);
});

test('estimation durée/distance : fourchette au milieu, % VMA résolu', () => {
  const w: Block = { ...newBlock('WORK'), measure: 'DISTANCE', measureValue: 1000, targetType: 'PACE', targetLow: 240, targetHigh: 300 };
  assert.equal(estimateDuration([w], 'RUN').value, 270);
  const rel: Block = { ...newBlock('WORK'), measure: 'TIME', measureValue: 600, targetType: 'PACE', targetLow: 80, relativeTo: 'VMA' };
  assert.equal(estimateDistance([rel], 'RUN').certainty, 'unknown');
  const e = estimateDistance([rel], 'RUN', { vma: 5, css: null, ftp: null, hrMax: null });
  assert.equal(e.value, 2400);
  assert.ok(e.usedRefs);
  const set: Block = { ...newBlock('SET'), setCount: 4, children: [{ ...newBlock('WORK'), measure: 'DISTANCE', measureValue: 400, targetType: 'PACE', targetLow: 240 }, { ...newBlock('RECOVERY'), measureValue: 90 }] };
  assert.equal(estimateDuration([set], 'RUN').value, 4 * (96 + 90));
  assert.deepEqual(validateSession({ discipline: 'RUN', plannedDate: '2026-09-01', blocks: [] }).map((i) => i.code), ['EMPTY_SESSION']);
});

test('rattachement auto, y compris séance déplacée d’un jour', () => {
  const d = legacy();
  const r = derive(d, SETTINGS, new Date('2026-09-20T10:00:00Z'));
  const run = Object.values(d.actual).find((a) => a.sourceId === 'g-123')!;
  assert.equal(r.links.byActual.get(run.id)?.plannedId, Object.values(d.planned)[0].id);
  // déplacée au lendemain
  const p = Object.values(d.planned)[0];
  d.planned[p.id] = { ...p, plannedDate: '2026-09-01' };
  const r2 = derive(d, SETTINGS, new Date('2026-09-20T10:00:00Z'));
  const l = r2.links.byActual.get(run.id)!;
  assert.equal(l.plannedId, p.id);
  assert.ok(l.confidence! < 0.6);
});

test('import manuel en lot', () => {
  const r = parseBulkActual('2026-08-01;RUN;45;8,2;152;6\n02/08/2026;natation;40\n# commentaire\n2026-08-03;YOGA;30');
  assert.equal(r.valid.length, 2);
  assert.equal(r.valid[1].discipline, 'SWIM');
  assert.equal(r.issues.length, 1);
  const p = parseBulkPlanned('2026-10-20;BIKE;90;Sortie longue');
  assert.equal(p.valid[0].blocks[0].measureValue, 5400);
});

test('coach : export, import, chevauchement vérifié après import', () => {
  const d = legacy();
  const r = derive(d, SETTINGS, new Date('2026-08-30T10:00:00Z'));
  const dossier = buildDossier(d, r, Object.keys(d.actual), new Date('2026-08-30T10:00:00Z'));
  assert.equal(dossier.schemaVersion, 'apogee/1');
  assert.equal(dossier.upcomingPlannedSessions[0].refKey, 'k-1');
  assert.equal(dossier.phases[0].refKey, 'phase:' + Object.keys(d.phases)[0]);
  const phaseId = Object.keys(d.phases)[0];
  const plan = JSON.stringify({
    schemaVersion: 'apogee/1', planValidUntil: '2026-10-05', operations: [
      { entity: 'phase', action: 'update', idempotencyKey: 'phase:' + phaseId, label: 'Reprise', startDate: '2026-08-25', endDate: '2026-09-14' },
      { entity: 'phase', action: 'create', idempotencyKey: 'bloc-2', label: 'Volume', startDate: '2026-09-15', endDate: '2026-10-05' },
      { entity: 'phase', action: 'create', idempotencyKey: 'bloc-3', label: 'Chevauche', startDate: '2026-10-01', endDate: '2026-10-10' },
      { entity: 'session', action: 'update', idempotencyKey: 'k-1', discipline: 'RUN', plannedDate: '2026-09-02', title: 'Footing modifié', blocks: [newBlock('WORK')] },
      { entity: 'session', action: 'create', idempotencyKey: 'vide', discipline: 'RUN', plannedDate: '2026-09-05', blocks: [] },
      { nope: true },
    ],
  });
  const parsed = parsePlan('```json\n' + plan + '\n```');
  assert.ok(parsed.ok);
  assert.ok(parsePlan(plan.replace('apogee/1', 'ironapp/1')).ok, 'l\'ancien nom du format reste accepté');
  assert.ok(parsePlan(plan.replace('apogee/1', 'quadra/1')).ok, 'le nom Quadra du format reste accepté');
  if (!parsed.ok) return;
  assert.equal(parsed.malformed, 1);
  const pv = preview(d, parsed.plan, parsed.malformed);
  assert.equal(pv.updated.length, 1, 'seule la phase est mise à jour (le WORK sans durée de k-1 est rejeté)');
  assert.ok(pv.rejected.some((x) => x.idempotencyKey === 'k-1') && pv.rejected.some((x) => x.idempotencyKey === 'vide'));
  assert.ok(pv.updated.some((x) => x.idempotencyKey === 'phase:' + phaseId), 'décaler un bloc existant est accepté');
  assert.ok(pv.created.some((x) => x.idempotencyKey === 'bloc-2'), 'le bloc suivant, posé sur l’ancienne fin du premier, est accepté');
  assert.ok(pv.rejected.some((x) => x.idempotencyKey === 'bloc-3'), 'un chevauchement dans le même fichier est refusé');
  const { mutations, exchange } = applyPreview(d, pv, parsed.plan, parsed.hash);
  assert.equal(exchange.planValidUntil, '2026-10-05');
  assert.ok(mutations.puts.some((p) => p.coll === 'phases' && (p.rec as { idempotencyKey: string | null }).idempotencyKey === 'bloc-2'));
});

test('Health Connect : nouvelle séance, mise à jour d’une série arrivée en retard, nuit la plus longue', () => {
  const d = emptyData();
  const base = { id: 'hc1', clientRecordId: 'garmin-1', startTime: '2026-10-01T06:00:00Z', endTime: '2026-10-01T07:00:00Z', startZoneOffsetSeconds: 7200, exerciseType: 56, distanceM: 10000, activeKcal: 600, totalKcal: 700, elevationM: 50, hr: [] as [number, number][], speed: [] as [number, number][] };
  const r1 = ingest(d, [base], [], []);
  assert.equal(r1.report.inserted, 1);
  const s = r1.ops.actual[0];
  d.actual[s.id] = s;
  const hr = Array.from({ length: 300 }, (_, i) => [Date.parse('2026-10-01T06:00:00Z') / 1000 + i * 12, 140] as [number, number]);
  const r2 = ingest(d, [{ ...base, hr }], [
    { id: 'n1', clientRecordId: null, startTime: '2026-09-30T21:00:00Z', endTime: '2026-10-01T05:00:00Z', startZoneOffsetSeconds: 7200 },
    { id: 'n2', clientRecordId: null, startTime: '2026-10-01T12:00:00Z', endTime: '2026-10-01T12:30:00Z', startZoneOffsetSeconds: 7200 },
  ], [{ id: 'r', time: '2026-10-01T05:00:00Z', zoneOffsetSeconds: 7200, bpm: 47 }]);
  assert.equal(r2.report.updated, 1);
  assert.equal(r2.ops.actual[0].id, s.id, 'même identifiant');
  assert.equal(r2.ops.actual[0].discipline, 'RUN');
  assert.equal(r2.ops.sleep.length, 1);
  assert.equal(r2.ops.sleep[0].durationSec, 8 * 3600);
  assert.equal(r2.ops.resting[0].day, '2026-10-01');
});

test('estimation : bloc sans cible estimé à l’allure d’endurance, signalé comme approché', () => {
  const refs = { vma: 17 / 3.6, css: 100 / 105, ftp: null, hrMax: null };
  const blocks: Block[] = [{ ...newBlock('WORK'), measure: 'DISTANCE', measureValue: 400 }];
  const e = estimateDuration(blocks, 'SWIM', refs as never);
  assert.equal(e.approx, 1);
  assert.equal(e.certainty, 'partial');
  assert.ok(Math.abs(e.value - 400 / ((100 / 105) * 0.9)) < 0.01);
  const none = estimateDuration(blocks, 'SWIM');
  assert.equal(none.certainty, 'unknown');
});

test('BRICK : la course d’un enchaînement n’est comparée qu’à la partie course du prévu', async () => {
  const { comparePlan } = await import('../src/domain/review');
  const p = { id: 'p', updatedAt: '', discipline: 'BRICK' as const, plannedDate: '2026-10-10', title: null, notes: null, origin: 'manual' as const, idempotencyKey: null, coachExchangeId: null, createdAt: '',
    blocks: [{ ...newBlock('WORK'), measureValue: 5400, discipline: 'BIKE' as const }, { ...newBlock('TRANSITION'), measure: 'OPEN' as const, measureValue: null }, { ...newBlock('WORK'), measureValue: 1500, discipline: 'RUN' as const }] };
  const c = comparePlan(p, { durationSec: 1560, distanceM: 5100, discipline: 'RUN' }, { vma: null, css: null, ftp: null, hrMax: null } as never);
  assert.equal(c.part, true);
  assert.equal(c.expectedDuration, 1500);
  assert.ok(c.ratio! > 1 && c.ratio! < 1.1);
});

test('dossier coach de l’ancienne app : complète sans doublon, puis la montre reprend la séance', async () => {
  const { importDossierData, isDossier } = await import('../src/domain/dossier');
  const d = emptyData();
  const dossier = {
    schemaVersion: 'apogee/1',
    recentActualSessions: [
      { internalId: 53, discipline: 'BIKE', startAt: '2026-10-11T14:26:36.000Z', durationSec: 9522, distanceM: 61306, avgHrBpm: 144, rpe: 7, comment: null },
      { internalId: 52, discipline: 'RUN', startAt: '2026-10-09T04:32:37.000Z', durationSec: 1802, distanceM: 9755, avgHrBpm: 167, rpe: 7, comment: 'ok' },
    ],
    upcomingPlannedSessions: [{ refKey: 'session:80', discipline: 'BIKE', plannedDate: '2026-10-11', title: 'Isar', notes: null, blocks: [{ ...newBlock('WORK'), measureValue: 5400 }] }],
  };
  assert.ok(isDossier(dossier));
  // la course existe déjà (lue par la montre, autre identifiant, une minute d'écart) sans ressenti
  d.actual['x'] = buildManualSession({ date: '2026-10-09', discipline: 'RUN', durationMin: 30, distanceKm: null, avgHrBpm: null, rpe: null, comment: null });
  d.actual['x'] = { ...d.actual['x'], id: 'x', startAt: '2026-10-09T04:33:30.000Z', source: 'health', sourceId: 'garmin-1' };
  const r = importDossierData(d, dossier as never);
  assert.equal(r.report.added, 1);
  assert.equal(r.report.completed, 1);
  assert.equal(r.report.plannedAdded, 1);
  assert.equal(r.planned[0].id, '80');
  assert.equal(r.actual.find((x) => x.id === 'x')!.rpe, 7);
  const bike = r.actual.find((x) => x.id === '53')!;
  assert.equal(bike.sourceId, 'dossier:53');
  // la montre remonte la même sortie vélo : la séance du dossier est complétée, pas dupliquée
  for (const a of r.actual) d.actual[a.id] = a;
  const t0 = Date.parse('2026-10-11T14:26:40.000Z') / 1000;
  const hr: [number, number][] = Array.from({ length: 200 }, (_, i) => [t0 + i * 5, 140 + (i % 7)]);
  const ing = ingest(d, [{ id: 'hc1', clientRecordId: 'garmin-53', startTime: '2026-10-11T14:26:40.000Z', endTime: '2026-10-11T17:05:20.000Z', startZoneOffsetSeconds: 7200, exerciseType: 8, distanceM: 61300, activeKcal: 900, totalKcal: null, elevationM: 300, hr, speed: [] }], [], []);
  assert.equal(ing.report.inserted, 0);
  assert.equal(ing.report.updated, 1);
  const up = ing.ops.actual[0];
  assert.equal(up.id, '53');
  assert.equal(up.sourceId, 'garmin-53');
  assert.equal(up.rpe, 7);
  assert.equal(up.hasSeries, true);
});

test('sauvegarde : un export puis une restauration redonne exactement les mêmes données (aucune collection oubliée)', async () => {
  const { backupBlob, parseBackup } = await import('../src/data/backup');
  const { COLLECTIONS } = await import('../src/domain/types');
  const data = JSON.parse(JSON.stringify(legacy())) as Record<string, Record<string, unknown>>;
  // supprimé = enregistrement conservé avec son drapeau : la sauvegarde doit aussi le garder
  const firstActual = Object.keys(data.actual)[0];
  (data.actual[firstActual] as { deleted?: boolean }).deleted = true;
  const text = await backupBlob(data as unknown as AppData).text();
  const back = parseBackup(text) as unknown as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(back).sort(), Object.keys(data).sort(), 'toutes les collections du modèle sont dans la sauvegarde');
  for (const c of COLLECTIONS) assert.deepEqual(back[c], data[c], 'collection ' + c);
  assert.ok(Object.values(data).flatMap((x) => Object.keys(x)).length > 20, 'jeu de données réaliste');
});

test('sauvegarde : les fichiers faits sous les anciens noms (quadra, ironapp) restent lisibles', async () => {
  const { backupBlob, parseBackup } = await import('../src/data/backup');
  const data = JSON.parse(JSON.stringify(legacy())) as unknown as AppData;
  const text = await backupBlob(data).text();
  for (const old of ['quadra-backup/1', 'ironapp-backup/1']) {
    const back = parseBackup(text.replace('apogee-backup/1', old));
    assert.deepEqual(Object.keys(back).sort(), Object.keys(data).sort(), old);
  }
  assert.throws(() => parseBackup(text.replace('apogee-backup/1', 'autre/1')));
});

test('doublons : la même séance Garmin enregistrée deux fois se fusionne en gardant le ressenti, le rattachement et le titre', async () => {
  const { planDedupe } = await import('../src/domain/dedupe');
  const d = emptyData();
  const base = {
    updatedAt: '2026-10-12T00:00:00.000Z', sourceId: 'g-1', source: 'health', discipline: 'RUN', rawExerciseType: '56', startAt: '2026-10-10T08:00:00.000Z', endAt: '2026-10-10T08:30:00.000Z',
    zoneOffsetMinutes: 120, durationSec: 1800, distanceM: 5000, activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: null, avgHrBpm: 140, maxHrBpm: 160, minHrBpm: 100,
    hrCoverageRatio: 1, hrSampleCount: 300, avgSpeedMs: 2.7, maxSpeedMs: 3.5, hasSeries: true, edited: [], rpe: null, comment: null,
  };
  const orig = { ...base, id: '7', ingestedAt: '2026-08-22T10:00:00.000Z', rpe: 6, manualPlannedId: 'p-9' } as unknown as ActualSession;
  const copy = { ...base, id: '1792165407248147', ingestedAt: '2026-10-16T15:43:00.000Z', comment: 'jambes lourdes', title: 'Sortie avec Paul' } as unknown as ActualSession;
  const other = { ...base, id: '8', sourceId: 'g-2', ingestedAt: '2026-08-23T10:00:00.000Z' } as unknown as ActualSession;
  for (const a of [orig, copy, other]) d.actual[a.id] = a;
  const plan = planDedupe(d);
  assert.deepEqual(plan.drop, ['1792165407248147'], 'seule la copie est supprimée');
  assert.equal(plan.put.length, 1);
  assert.equal(plan.put[0].id, '7');
  assert.equal(plan.put[0].rpe, 6);
  assert.equal(plan.put[0].manualPlannedId, 'p-9');
  assert.equal(plan.put[0].comment, 'jambes lourdes', 'le commentaire de la copie est recopié');
  assert.equal(plan.put[0].title, 'Sortie avec Paul');
  // le résultat ne dépend pas de l'ordre : deux appareils font le même choix
  const d2 = emptyData();
  for (const a of [other, copy, orig]) d2.actual[a.id] = a;
  assert.deepEqual(planDedupe(d2).drop, plan.drop);
  // plus aucun doublon : rien à faire
  delete d.actual[copy.id];
  assert.equal(planDedupe(d).drop.length, 0);
});

test('cache HR : le résultat en cache est identique au calcul direct et réutilisé', () => {
  const raw: [number, number][] = Array.from({ length: 400 }, (_, i) => [i * 5, 120 + Math.round(30 * Math.sin(i / 20)) + (i === 200 ? 999 : 0)]);
  const a = analyzeHr(raw);
  assert.deepEqual(a.clean, cleanHr(raw));
  assert.equal(a.peak, sustainedPeak(cleanHr(raw)));
  assert.equal(a.drift, hrDrift(cleanHr(raw)));
  assert.equal(analyzeHr(raw), a, 'même tableau → même objet en cache');
});

test('respect du plan : séances échues rattachées, interruptions neutres, durée connue seulement', () => {
  const data = legacy();
  const d = derive(data, SETTINGS, new Date('2026-10-01T12:00:00Z'));
  const rep = planCompliance(data, d.links, refsOf(data, d.ctx.hrMax.bpm), d.today);
  const all = [...rep.weeks, ...rep.months];
  for (const c of all) { assert.ok(c.done <= c.planned); assert.ok(c.doneSec >= 0); }
  assert.ok(rep.last4.planned >= rep.last4.done);
});

test('zones de FC : bornes, temps par zone, répartition facile / soutenue / intense', () => {
  assert.equal(zoneIndex(100, 200), 0);
  assert.equal(zoneIndex(120, 200), 1, '60 % est le début de Z2');
  assert.equal(zoneIndex(160, 200), 3);
  assert.equal(zoneIndex(180, 200), 4);
  const ser: [number, number][] = Array.from({ length: 101 }, (_, i) => [i * 10, i < 50 ? 110 : i < 80 ? 170 : 185]);
  const z = zoneTimes(ser, 200);
  assert.equal(z.reduce((t, x) => t + x, 0), 1000 + 11, 'le dernier échantillon vaut l’intervalle nominal');
  const p = polarSplit(z);
  assert.equal(p.easy + p.hard + p.intense, p.total);
  assert.ok(p.easy > p.hard && p.hard > p.intense);
});

test('records : meilleur segment et meilleure vitesse tenue dans une série de vitesse', () => {
  // 5 m/s pendant 600 s puis 3 m/s pendant 600 s : le meilleur km est dans la partie rapide
  const sp: [number, number][] = Array.from({ length: 241 }, (_, i) => [i * 5, i * 5 < 600 ? 5 : 3]);
  const t = bestSegment(sp, 1000)!;
  assert.ok(Math.abs(t - 200) <= 5, `1 km en ~200 s, obtenu ${t}`);
  const v = bestSpeedOver(sp, 360)!;
  assert.ok(Math.abs(v - 5) < 0.05);
  assert.equal(bestSegment(sp.slice(0, 4), 100), null);
});

test('records : temps de déplacement (arrêts exclus), arrivée interpolée, courbe recalée sur la distance de la séance', () => {
  const steady = (v: number, sec: number, step = 1, t0 = 0): [number, number][] => Array.from({ length: Math.floor(sec / step) + 1 }, (_, i) => [t0 + i * step, v]);
  // 10 m/s : 1 km en 100 s pile, même quand les points sont espacés de 7 s (arrivée interpolée entre deux points)
  assert.ok(Math.abs(bestSegment(steady(10, 4000), 1000)! - 100) < 0.01);
  assert.ok(Math.abs(bestSegment(steady(10, 4000, 7), 1000)! - 100) < 0.01);
  // 10 m/s pendant 1 000 s, 10 minutes d'arrêt (aucun point), puis 10 m/s pendant 1 000 s : 20 km = 2 000 s de déplacement, pas 2 600
  const withStop = [...steady(10, 1000), ...steady(10, 1000, 1, 1600)];
  assert.ok(Math.abs(bestSegment(withStop, 15000)! - 1500) < 0.5, 'les arrêts ne comptent pas');
  // vitesse recalée : 2 % de distance en plus = 2 % de temps en moins
  assert.ok(Math.abs(bestSegment(steady(10, 4000), 1000, 1.02)! - 100 / 1.02) < 0.01);
  // le meilleur 1 km est dans la partie rapide, qu'il commence ou finisse entre deux points
  const mixed: [number, number][] = [...steady(5, 600, 5), ...steady(8, 600, 5, 605)];
  assert.ok(Math.abs(bestSegment(mixed, 1000)! - 125) < 1.5);
  // personalRecords : une courbe qui ne couvre que 70 % de la distance enregistrée n'est pas utilisée
  const data = emptyData();
  const mk = (id: string, distanceM: number) => ({ id, updatedAt: '', sourceId: id, source: 'health', discipline: 'BIKE', rawExerciseType: '8', startAt: '2026-10-18T07:00:00.000Z', endAt: '2026-10-18T08:30:00.000Z', zoneOffsetMinutes: 0, durationSec: 5400, distanceM, activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: null, avgHrBpm: null, maxHrBpm: null, minHrBpm: null, hrCoverageRatio: null, hrSampleCount: null, avgSpeedMs: null, maxSpeedMs: null, hasSeries: true, edited: [], rpe: null, comment: null, ingestedAt: '' }) as unknown as ActualSession;
  data.actual.a = mk('a', 45000);
  data.series.a = { id: 'a', updatedAt: '', hr: [], speed: steady(9, 5000) };      // 45 km au compteur, 45 km dans la courbe
  data.actual.b = mk('b', 64000);
  data.series.b = { id: 'b', updatedAt: '', hr: [], speed: steady(9, 5000) };      // 64 km annoncés, 45 km dans la courbe : inutilisable
  const recs = personalRecords(data);
  const r20 = recs.find((r) => r.spec.label === '20 km')!;
  assert.equal(r20.sessionId, 'a');
  assert.ok(Math.abs(r20.timeSec - 20000 / 9) < 0.5, `20 km à 9 m/s : ${r20.timeSec}`);
  assert.equal(r20.basis, 'segment');
});

test('efficacité à vélo : disponible dès deux sorties, et dit pourquoi des séances sont écartées', () => {
  const data = emptyData();
  const ride = (id: string, day: string, hr: number, climbM = 100) => ({ id, updatedAt: '', sourceId: id, source: 'health', discipline: 'BIKE', rawExerciseType: '8', startAt: day + 'T07:00:00.000Z', endAt: day + 'T08:30:00.000Z', zoneOffsetMinutes: 0, durationSec: 5400, distanceM: 40000, activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: climbM, avgHrBpm: hr, maxHrBpm: null, minHrBpm: null, hrCoverageRatio: null, hrSampleCount: null, avgSpeedMs: null, maxSpeedMs: null, hasSeries: false, edited: [], rpe: null, comment: null, ingestedAt: '' }) as unknown as ActualSession;
  // FC max 190 : 55 % = 105 bpm ; 130 bpm = 68 % (hors de l'ancienne bande vélo ? non, dedans), 100 bpm = 53 % (trop bas)
  data.actual.a = ride('a', '2026-10-04', 132);
  data.actual.b = ride('b', '2026-10-11', 128);
  data.actual.c = ride('c', '2026-10-12', 100);
  data.actual.d = ride('d', '2026-10-13', 135, 1500);   // 3,75 % de pente : écartée
  const ef = efficiency(data, 190, 'BIKE', '2026-10-17');
  assert.equal(ef.points.length, 2);
  assert.deepEqual(ef.diag, { sessions: 4, withHr: 4, inBand: 3, flat: 2 });
  assert.ok(ef.lastVsPrevious! > 0, 'même distance et même durée à une FC plus basse : plus efficace');
  const one = emptyData(); one.actual.a = ride('a', '2026-10-04', 132);
  assert.equal(efficiency(one, 190, 'BIKE', '2026-10-17').points.length, 1);
});

test('sommeil : le temps endormi remplace le temps passé au lit, une sieste ou une nuit sans étapes ne le remplace pas', () => {
  const d = emptyData();
  const night = (id: string, start: string, end: string, asleepSec?: number | null) => ({ id, clientRecordId: null, startTime: start, endTime: end, startZoneOffsetSeconds: 7200, ...(asleepSec === undefined ? {} : { asleepSec }) });
  // nuit lue sans étapes (ancien APK) : 8 h au lit
  let r = ingest(d, [], [night('n1', '2026-10-16T20:30:00Z', '2026-10-17T04:30:00Z')], []);
  assert.equal(r.ops.sleep[0].durationSec, 8 * 3600);
  assert.ok(!r.ops.sleep[0].fromStages);
  d.sleep[r.ops.sleep[0].id] = r.ops.sleep[0];
  // même nuit relue avec les étapes : 7 h endormi, qui remplace les 8 h
  r = ingest(d, [], [night('n1', '2026-10-16T20:30:00Z', '2026-10-17T04:30:00Z', 7 * 3600)], []);
  assert.equal(r.ops.sleep.length, 1);
  assert.equal(r.ops.sleep[0].durationSec, 7 * 3600);
  assert.equal(r.ops.sleep[0].fromStages, true);
  d.sleep[r.ops.sleep[0].id] = r.ops.sleep[0];
  // une sieste du même jour (plus courte) ou une lecture sans étapes ne l'écrase pas
  assert.equal(ingest(d, [], [night('nap', '2026-10-17T11:00:00Z', '2026-10-17T11:40:00Z', 35 * 60)], []).ops.sleep.length, 0);
  assert.equal(ingest(d, [], [night('n1', '2026-10-16T20:30:00Z', '2026-10-17T04:30:00Z', null)], []).ops.sleep.length, 0);
  // jamais plus que le temps passé au lit
  const odd = ingest(emptyData(), [], [night('x', '2026-10-16T20:30:00Z', '2026-10-17T04:30:00Z', 99 * 3600)], []);
  assert.equal(odd.ops.sleep[0].durationSec, 8 * 3600);
  assert.equal(sleepStats(d, '2026-10-17').staged14, 1);
});

test('forme de fond par discipline : la somme des disciplines redonne la forme de fond totale', () => {
  const data = legacy();
  const d = derive(data, SETTINGS, new Date('2026-10-01T12:00:00Z'));
  const slices = fitnessByDiscipline(data, d.loads, d.series);
  if (!slices.length) return;
  const last = slices[slices.length - 1];
  assert.ok(Math.abs(last.total - d.series.days[d.series.days.length - 1].fitness) < 1e-6);
});

test('prévisionnel : une séance prévue à venir fait monter la charge projetée ; sans plan, rien à projeter', () => {
  const data = legacy();
  const now = new Date('2026-10-01T12:00:00Z');
  const d = derive(data, SETTINGS, now);
  if (!d.series.days.length) return;
  const base = forecastLoad(data, d.series, d.loads, d.links, d.refs, d.today, 14);
  assert.equal(base.days[0].day, d.today);
  assert.ok(base.days.every((x) => x.load >= 0));
  const tpl = Object.values(data.planned).find((p) => p.discipline === 'RUN' || p.discipline === 'BIKE');
  if (!tpl) return;
  const fut = { ...data, planned: { ...data.planned, fx: { ...tpl, id: 'fx', plannedDate: addDays(d.today, 2), blocks: [{ ...tpl.blocks[0], kind: 'WORK' as const, measure: 'TIME' as const, measureValue: 3600, discipline: undefined }] } } } as AppData;
  const withPlan = forecastLoad(fut, d.series, d.loads, d.links, d.refs, d.today, 14);
  const day2 = withPlan.days.find((x) => x.day === addDays(d.today, 2))!;
  assert.ok(day2.load >= base.days.find((x) => x.day === day2.day)!.load);
});

test('alerte blessure : blessure active + charge qui monte ; rien si la blessure est résolue', () => {
  const data = legacy();
  data.athlete.main = { ...data.athlete.main, injuries: [{ id: 'i', label: 'Achille', date: null, notes: null, resolved: false }] };
  const constat = { acuteChronicRatio: 1.4 } as never;
  const series = { byDay: new Map<string, { load: number }>() };
  const codes = (inj: boolean) => { if (inj) data.athlete.main.injuries[0].resolved = true; return trainingAlerts(data, { byActual: new Map(), byPlanned: new Map() }, new Map(), constat, '2026-10-10', series).map((a) => a.code); };
  assert.ok(codes(false).includes('INJURY_LOAD'));
  assert.ok(!codes(true).includes('INJURY_LOAD'));
});

test('estimation de VMA : proposée seulement si elle dépasse la valeur actuelle', () => {
  const data = emptyData();
  const sp: [number, number][] = Array.from({ length: 200 }, (_, i) => [i * 5, 5]);
  data.actual.a = { id: 'a', updatedAt: '', sourceId: 'x', source: 'health', discipline: 'RUN', rawExerciseType: '56', startAt: '2026-10-05T07:00:00.000Z', endAt: '2026-10-05T07:20:00.000Z', zoneOffsetMinutes: 0, durationSec: 1000, distanceM: 5000, activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: null, avgHrBpm: null, maxHrBpm: null, minHrBpm: null, hrCoverageRatio: null, hrSampleCount: null, avgSpeedMs: 5, maxSpeedMs: null, hasSeries: true, edited: [], rpe: null, comment: null, ingestedAt: '' } as ActualSession;
  data.series.a = { id: 'a', updatedAt: '', hr: [], speed: sp };
  const lower = { id: 'z', updatedAt: '', kind: 'vma', value: 4.6, measuredAt: '2026-06-01T00:00:00.000Z', source: 'test', notes: null } as const;
  const higher = { ...lower, value: 5.5 };
  assert.equal(suggestZones(data, { vma: lower, css: null }, '2026-10-10').length, 1);
  assert.equal(suggestZones(data, { vma: higher, css: null }, '2026-10-10').length, 0);
});

test('poids et sommeil : tendance sur 7 jours, régularité du coucher', () => {
  const data = emptyData();
  for (let k = 0; k < 7; k++) { const d = addDays('2026-10-04', k); data.weight[d] = { id: d, updatedAt: '', day: d, kg: 74, source: 'health' }; }
  for (let k = 0; k < 7; k++) { const d = addDays('2026-09-06', k); data.weight[d] = { id: d, updatedAt: '', day: d, kg: 76, source: 'health' }; }
  const t = weightTrend(data, '2026-10-10');
  assert.ok(Math.abs(t.avg7! - 74) < 1e-9);
  assert.ok(Math.abs(t.change! - -2) < 1e-9);
  // coucher à 22 h 30 chaque soir : écart-type nul ; passer après minuit ne casse pas le calcul
  for (let k = 1; k <= 10; k++) {
    const d = addDays('2026-10-10', -k);
    const start = new Date(Date.parse(addDays(d, -1) + 'T22:30:00Z') + (k % 2 ? 0 : 3600000 * 2)).toISOString();
    data.sleep[d] = { id: d, updatedAt: '', nightDate: d, startAt: start, endAt: d + 'T06:30:00.000Z', zoneOffsetMinutes: 0, durationSec: 8 * 3600, sourceId: null };
  }
  const st = sleepStats(data, '2026-10-10');
  assert.equal(st.nights14, 10);
  assert.ok(st.bedtimeSd! > 50 && st.bedtimeSd! < 80, 'deux heures de coucher à 2 h d’écart : ≈ 63 min');
  assert.ok(Math.abs(st.avg7! - 8 * 3600) < 1);
});

test('Health Connect : poids (dernière pesée du jour, la saisie manuelle n’est pas écrasée)', () => {
  const d = emptyData();
  const r = ingest(d, [], [], [], { weight: [{ id: 'w1', time: '2026-10-01T06:00:00Z', zoneOffsetSeconds: 0, kg: 74.04 }, { id: 'w2', time: '2026-10-01T18:00:00Z', zoneOffsetSeconds: 0, kg: 73.46 }, { id: 'w3', time: '2026-10-01T19:00:00Z', zoneOffsetSeconds: 0, kg: 900 }] });
  assert.equal(r.ops.weight.length, 1);
  assert.equal(r.ops.weight[0].kg, 73.5, 'dernière pesée du jour, arrondie au dixième');
  d.weight['2026-10-01'] = { id: '2026-10-01', updatedAt: '', day: '2026-10-01', kg: 72, source: 'manual' };
  assert.equal(ingest(d, [], [], [], { weight: [{ id: 'w', time: '2026-10-01T18:00:00Z', zoneOffsetSeconds: 0, kg: 73.5 }] }).ops.weight.length, 0);
});

/** Lecteur FIT minimal et indépendant de l'encodeur : en-tête, CRC, définitions et données. */
function readFit(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  assert.equal(buf[0], 14);
  assert.equal(String.fromCharCode(...buf.slice(8, 12)), '.FIT');
  assert.equal(v.getUint16(12, true), fitCrc(buf, 0, 12), 'CRC de l’en-tête');
  const dataSize = v.getUint32(4, true);
  assert.equal(buf.length, 14 + dataSize + 2);
  assert.equal(v.getUint16(buf.length - 2, true), fitCrc(buf, 0, buf.length - 2), 'CRC du fichier');
  const defs = new Map<number, { global: number; fields: [number, number][] }>();
  const msgs: { global: number; f: Record<number, number | string> }[] = [];
  let o = 14;
  while (o < 14 + dataSize) {
    const h = buf[o++];
    if (h & 0x40) {
      o += 2; const global = v.getUint16(o, true); o += 2; const n = buf[o++];
      const fields: [number, number][] = [];
      for (let i = 0; i < n; i++) { fields.push([buf[o], buf[o + 1]]); o += 3; }
      defs.set(h & 0x0f, { global, fields });
    } else {
      const def = defs.get(h & 0x0f)!; const f: Record<number, number | string> = {};
      for (const [num, size] of def.fields) {
        if (size === 1) f[num] = buf[o]; else if (size === 2) f[num] = v.getUint16(o, true); else if (size === 4) f[num] = v.getUint32(o, true);
        else f[num] = new TextDecoder().decode(buf.slice(o, o + size)).replace(/\0+$/, '');
        o += size;
      }
      msgs.push({ global: def.global, f });
    }
  }
  assert.equal(o, 14 + dataSize);
  return msgs;
}

test('fichier .FIT : structure valide, cibles converties, répétitions, BRICK en deux fichiers', () => {
  const refs = { vma: 4.8, css: 100 / 105, ftp: 250, hrMax: 188 };
  const warm = { ...newBlock('WARMUP'), measureValue: 600 };
  const set = { ...newBlock('SET'), setCount: 6, children: [
    { ...newBlock('WORK'), measure: 'TIME' as const, measureValue: 180, targetType: 'PACE' as const, targetLow: 270, targetHigh: 280, label: 'Vite' },
    { ...newBlock('RECOVERY'), measure: 'TIME' as const, measureValue: 90 },
  ] };
  const cool = { ...newBlock('COOLDOWN'), measureValue: 300 };
  const run = { id: 'p', updatedAt: '', discipline: 'RUN', plannedDate: '2026-10-20', title: 'Fractionné 6×3', notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: [warm, set, cool], createdAt: '' } as never;
  const [wk] = toFitWorkouts(run, refs);
  assert.equal(wk.steps.length, 5); // échauffement, effort, récupération, répétition, retour au calme
  const msgs = readFit(encodeFit(wk, new Date('2026-10-17T10:00:00Z')));
  assert.equal(msgs[0].global, 0); assert.equal(msgs[0].f[0], 5, 'fichier d’entraînement');
  assert.equal(msgs[1].global, 26); assert.equal(msgs[1].f[4], 1, 'course à pied'); assert.equal(msgs[1].f[6], wk.steps.length); assert.equal(msgs[1].f[8], 'Fractionné 6×3');
  const steps = msgs.filter((m) => m.global === 27).map((m) => m.f);
  assert.equal(steps.length, wk.steps.length);
  const work = steps[1];
  assert.equal(work[1], 0, 'durée en temps'); assert.equal(work[2], 180000, 'en millisecondes');
  assert.equal(work[3], 0, 'cible de vitesse');
  assert.equal(work[5], Math.round((1000 / 280) * 1000), 'vitesse basse = allure lente'); assert.equal(work[6], Math.round((1000 / 270) * 1000));
  assert.equal(work[0], 'Vite');
  const rep = steps[3];
  assert.equal(rep[1], 6, 'répéter jusqu’à la fin des étapes'); assert.equal(rep[2], 1, 'revient à l’étape 1'); assert.equal(rep[4], 6, '6 répétitions');
  assert.equal(steps[0][7], 2, 'intensité échauffement'); assert.equal(steps[2][7], 4, 'récupération');
  // puissance en % de FTP et FC en % de FC max
  const bike = { ...run, discipline: 'BIKE', blocks: [{ ...newBlock('WORK'), measure: 'DISTANCE' as const, measureValue: 20000, targetType: 'POWER' as const, targetLow: 80, targetHigh: 90, relativeTo: 'FTP' as const }, { ...newBlock('WORK'), measure: 'OPEN' as const, measureValue: null, targetType: 'HR' as const, targetLow: 70, targetHigh: 80, relativeTo: 'HRMAX' as const }] } as never;
  const b = toFitWorkouts(bike, refs)[0].steps;
  assert.equal(b[0].durationType, 1); assert.equal(b[0].durationValue, 2000000, 'distance en centimètres');
  assert.equal(b[0].low, 200 + 1000); assert.equal(b[0].high, 225 + 1000);
  assert.equal(b[1].low, Math.round(188 * 0.7) + 100);
  // référence inconnue : étape ouverte et avertissement
  const noRef = toFitWorkouts(bike, { vma: null, css: null, ftp: null, hrMax: null })[0];
  assert.equal(noRef.steps[0].targetType, 2); assert.equal(noRef.warnings.length, 2);
  // BRICK : un fichier par discipline, la transition disparaît
  const brick = { ...run, discipline: 'BRICK', title: 'Brick', blocks: [{ ...newBlock('WORK'), discipline: 'BIKE' as const, measureValue: 3600 }, { ...newBlock('TRANSITION'), measure: 'OPEN' as const }, { ...newBlock('WORK'), discipline: 'RUN' as const, measureValue: 1200 }] } as never;
  const files = toFitWorkouts(brick, refs);
  assert.deepEqual(files.map((f) => f.discipline), ['BIKE', 'RUN']);
  assert.ok(files[1].name.includes('course'));
  assert.equal(readFit(encodeFit(files[0]))[1].f[4], 2);
  // renforcement : sport « entraînement », répétitions, nom de l'exercice
  const str = { ...run, discipline: 'STRENGTH', title: 'Renfo', blocks: [{ ...newBlock('WORK'), measure: 'REPS' as const, measureValue: 12, label: 'Squat' }, { ...newBlock('REST'), measure: 'TIME' as const, measureValue: 60 }] } as never;
  const sw = toFitWorkouts(str, refs)[0];
  const sm = readFit(encodeFit(sw));
  assert.equal(sm[1].f[4], 10); assert.equal(sm[1].f[11], 20);
  assert.equal(sm[2].f[0], 'Squat'); assert.equal(sm[2].f[1], 29); assert.equal(sm[2].f[2], 12);
  // commentaire de 1 à 5 mots pour la montre : la consigne du bloc, à défaut son libellé
  assert.equal(sm[2].f[8], 'Squat');
  const swim = { ...run, discipline: 'SWIM', title: 'Natation', blocks: [{ ...newBlock('WORK'), measure: 'DISTANCE' as const, measureValue: 25, notes: 'costal gauche, bras tendu devant, tête basse, respiration' }] } as typeof run;
  const swm = readFit(encodeFit(toFitWorkouts(swim, refs)[0]));
  assert.equal(swm[2].f[8], 'costal gauche, bras tendu devant,');
  assert.equal(fitFileName('Fractionné 6×3 — vélo', '2026-10-20'), '2026-10-20-Fractionne-6-3-velo.fit');
});

test('saisie manuelle : dénivelé enregistré et borné ; durées longues en 2h05', () => {
  const ok = parseManualFields({ date: '2026-10-20', discipline: 'BIKE', durationMin: '125', distanceKm: '50', elevationM: '830' });
  assert.ok('input' in ok);
  if ('input' in ok) assert.equal(buildManualSession(ok.input, 'e1').elevationGainM, 830);
  assert.ok('error' in parseManualFields({ date: '2026-10-20', discipline: 'RUN', durationMin: '30', elevationM: '-5' }));
  assert.ok('error' in parseManualFields({ date: '2026-10-20', discipline: 'RUN', durationMin: '30', elevationM: '99999' }));
  assert.equal(hm(125 * 60), '2h05');
  assert.equal(hm(41 * 60).replace(/\s/g, ' '), '41 min');
});

test('charge aiguë : entonnoir 0,8–1,3 × charge habituelle, statuts et bande hebdomadaire', () => {
  const mk = (n: number, f: (i: number) => number): DayLoad[] => Array.from({ length: n }, (_, i) => ({ day: addDays('2026-08-03', i), load: f(i), estimated: false, interruptionFill: false, fitness: 40 + i * 0.1, fatigue: 40, freshness: 0 }));
  const flat = acuteSeries(mk(40, () => 50));
  assert.equal(flat[26].chronic, null); // moins de 28 jours : pas d'entonnoir
  assert.equal(flat[39].acute, 350);
  assert.equal(flat[39].chronic, 350);
  assert.equal(flat[39].lo, 280);
  assert.equal(flat[39].hi, 455);
  assert.ok(Math.abs(flat[39].ratio! - 1) < 1e-9);
  assert.equal(statusOf(1, 2), 'productive');
  assert.equal(statusOf(1, 0), 'maintaining');
  assert.equal(statusOf(1, -3), 'unproductive');
  assert.equal(statusOf(0.6, 0), 'recovery');
  assert.equal(statusOf(0.3, -3), 'detraining');
  assert.equal(statusOf(1.4, 0), 'high');
  assert.equal(statusOf(1.8, 0), 'overreaching');
  assert.equal(statusOf(null, 0), null);
  // semaine très chargée après 5 semaines régulières : surcharge sur la dernière semaine
  const days = mk(42, (i) => (i >= 35 ? 150 : 50));
  const w = weeklyStatus(days, days[41].day, 3);
  assert.equal(w.length, 3);
  assert.equal(w[2].status, 'overreaching');
});

test('calories : repos Health Connect ou estimé, actives de secours, bilan avec le journal', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: 'x', displayName: null, birthDate: '1990-01-01', sex: 'M', heightCm: 180, availability: [], equipment: [], injuries: [] };
  d.weight['2026-10-01'] = { id: '2026-10-01', updatedAt: 'x', day: '2026-10-01', kg: 80, source: 'manual' };
  assert.equal(Math.round(bmrKcal(d.athlete.main, 80, '2026-10-27')!), 1750);
  assert.equal(bmrKcal({ sex: null, heightCm: 180, birthDate: '1990-01-01' }, 80, '2026-10-27'), null);
  // sans total Health Connect : repos estimé ; actives issues des séances
  d.actual['s1'] = session('s1', '2026-10-26', { activeCaloriesJ: 500 * 4184 });
  const a = dayEnergy(d, '2026-10-26');
  assert.equal(Math.round(a.active!), 500);
  assert.equal(a.activeFrom, 'sessions');
  assert.equal(a.restFrom, 'estimation');
  assert.equal(Math.round(a.total!), 2250);
  // total Health Connect : repos = total − actives
  d.energy['2026-10-27'] = { id: '2026-10-27', updatedAt: 'x', day: '2026-10-27', activeKcal: 600, totalKcal: 2500, source: 'health' };
  d.meals['m1'] = { id: 'm1', updatedAt: 'x', day: '2026-10-27', kcal: 700, label: 'Déjeuner' };
  d.meals['m2'] = { id: 'm2', updatedAt: 'x', day: '2026-10-27', kcal: 1000, label: null };
  d.meals['m3'] = { id: 'm3', updatedAt: 'x', day: '2026-10-27', kcal: 999, label: null, deleted: true };
  const b = dayEnergy(d, '2026-10-27');
  assert.equal(b.rest, 1900); assert.equal(b.restFrom, 'health'); assert.equal(b.total, 2500);
  assert.equal(b.intake, 1700); assert.equal(b.balance, -800);
  const w = weekEnergy(d, '2026-10-26');
  assert.equal(w.days.length, 7); assert.equal(w.mealDays, 1); assert.equal(Math.round(w.active), 1100);
});

test('Health Connect annexes : dépense du jour, VO₂max et HRV, sans réécrire ce qui n’a pas changé', () => {
  const d = emptyData();
  const rows = [{ day: '2026-10-20', activeKcal: 612.4, totalKcal: 2510.2 }, { day: '2026-10-21', activeKcal: null, totalKcal: null }];
  const ops = ingestEnergy(d, rows);
  assert.equal(ops.length, 1); assert.equal(ops[0].activeKcal, 612); assert.equal(ops[0].totalKcal, 2510);
  d.energy['2026-10-20'] = ops[0];
  assert.equal(ingestEnergy(d, rows).length, 0);
  const v = ingestVitals(d, [{ id: 'a', time: '2026-10-20T06:00:00Z', zoneOffsetSeconds: 3600, value: 52.46 }, { id: 'b', time: '2026-10-20T20:00:00Z', zoneOffsetSeconds: 3600, value: 51 }], [{ id: 'h1', time: '2026-10-20T03:00:00Z', zoneOffsetSeconds: 3600, ms: 60 }, { id: 'h2', time: '2026-10-20T04:00:00Z', zoneOffsetSeconds: 3600, ms: 70 }]);
  assert.equal(v.length, 1); assert.equal(v[0].vo2max, 51); assert.equal(v[0].hrvMs, 65);
  d.vitals['2026-10-20'] = v[0];
  const c = currentCheckin(d, '2026-10-22');
  assert.equal(c.week, '2026-10-19'); assert.equal(c.saved, null);
  assert.equal(c.draft.vo2max, 51);
  d.checkins['2026-10-19'] = { ...c.draft, updatedAt: 'x', pred5kSec: 1500 } as never;
  assert.deepEqual(metricSeries(d, 'pred5kSec'), [{ week: '2026-10-19', day: '2026-10-19', v: 1500 }]);
  assert.equal(currentCheckin(d, '2026-10-22').saved?.pred5kSec, 1500);
});

test('science du sport : VDOT de Daniels, Riegel, Uth, VO₂max sous-maximale, Training Effect', () => {
  // tables de Daniels : 5 km en 20:00 -> VDOT ≈ 49,8 ; marathon en 3:00 -> ≈ 53,5
  assert.ok(Math.abs(vdotOfPerformance(5000, 1200)! - 49.8) < 0.15);
  assert.ok(Math.abs(vdotOfPerformance(42195, 10800)! - 53.5) < 0.15);
  assert.equal(vdotOfPerformance(100, 15), null, 'trop court : formule hors de son domaine');
  // VDOT 50 : 5 km ≈ 19:57, marathon ≈ 3:10:49 (à une minute près)
  assert.ok(Math.abs(timeOfVdot(50, 5000)! - 1197) < 8);
  assert.ok(Math.abs(timeOfVdot(50, 42195)! - 11449) < 90);
  // aller-retour : le temps rend le VDOT d'origine
  assert.ok(Math.abs(vdotOfPerformance(10000, timeOfVdot(47, 10000)!)! - 47) < 0.01);
  // Riegel : 20:00 au 5 km -> 41:42 au 10 km
  assert.ok(Math.abs(riegel(1200, 5000, 10000) - 2502) < 1);
  assert.equal(RACE_DISTANCES.length, 4);
  // Uth : 190 / 50 -> 58,1
  assert.ok(Math.abs(vo2maxUth(190, 50)! - 58.14) < 0.01);
  assert.equal(vo2maxUth(190, 10), null);
  // ACSM : 3,33 m/s (12 km/h) à plat = 0,2 × 200 + 3,5 = 43,5
  assert.ok(Math.abs(vo2OfRunning(200 / 60) - 43.5) < 1e-9);
  // à 75 % de la réserve de FC, VO₂ de 43,5 -> VO₂max = 3,5 + 40 / 0,75
  assert.ok(Math.abs(vo2maxFromSubmax(43.5, 50 + 0.75 * 130, 50, 180)! - (3.5 + 40 / 0.75)) < 1e-9);
  assert.equal(vo2maxFromSubmax(43.5, 90, 50, 180), null, 'intensité trop basse');
  // Training Effect : séance à la charge de référence ≈ 3,3 ; croît et sature vers 5
  assert.ok(Math.abs(aerobicEffect(70, 70) - 3.34) < 0.05);
  assert.ok(aerobicEffect(35, 70) < aerobicEffect(70, 70) && aerobicEffect(70, 70) < aerobicEffect(250, 70) && aerobicEffect(250, 70) < 5);
  assert.equal(aerobicEffect(0, 70), 0);
  assert.equal(teLevel(0.5), 'none'); assert.equal(teLevel(2.4), 'maintain'); assert.equal(teLevel(3.3), 'improve'); assert.equal(teLevel(4.2), 'high'); assert.equal(teLevel(4.9), 'over');
  assert.ok(Math.abs(anaerobicEffect(600) - 2.83) < 0.05);
  assert.equal(anaerobicEffect(0), 0);
});

test('disponibilité : échelles de sommeil, FC de repos et charge aiguë', () => {
  assert.equal(sleepScore(8 * 3600), 100); assert.equal(sleepScore(6 * 3600), 50); assert.equal(sleepScore(3 * 3600), 0);
  assert.equal(restingScore(-2), 100); assert.equal(restingScore(4), 50); assert.equal(restingScore(12), 0);
  assert.equal(acuteScore(0.6), 100); assert.ok(Math.abs(acuteScore(1.3) - 75) < 1e-9); assert.ok(Math.abs(acuteScore(1.5) - 45) < 1e-9); assert.equal(acuteScore(2.2), 0);
});

/** Six semaines d'un coureur : sorties régulières avec séries de FC et de vitesse, nuits et FC de repos. */
function runnerData(): AppData {
  const data = emptyData();
  data.athlete.main = { id: 'main', updatedAt: 'x', displayName: 'T', birthDate: '1990-01-01', sex: 'M', availability: [], equipment: [], injuries: [] } as never;
  data.zones.hr = { id: 'hr', updatedAt: 'x', kind: 'hr_max', value: 190, measuredAt: '2026-01-01T00:00:00Z', source: 'manual', notes: null } as never;
  const start = '2026-09-14';
  for (let i = 0; i < 44; i++) {
    const day = addDays(start, i);
    data.resting[day] = { id: day, updatedAt: 'x', day, bpm: i === 43 ? 58 : 52 } as never;
    data.sleep[day] = { id: day, updatedAt: 'x', nightDate: day, startAt: day + 'T00:00:00Z', endAt: day + 'T07:00:00Z', zoneOffsetMinutes: 0, durationSec: (i === 43 ? 5.5 : 7.5) * 3600, sourceId: null } as never;
    if (i % 2 === 0 && i < 43) {
      const id = 'r' + i, dur = 3000, speed = 3.3 + (i % 4) * 0.03; // ≈ 12 km/h
      const hr: [number, number][] = [], sp: [number, number][] = [];
      const t0 = Date.parse(day + 'T07:00:00Z') / 1000;
      for (let k = 0; k < dur; k += 5) { hr.push([t0 + k, 150 + (k > 2400 ? 12 : 0)]); sp.push([t0 + k, speed]); }
      data.actual[id] = { id, updatedAt: 'x', sourceId: id, source: 'health', discipline: 'RUN', rawExerciseType: '56', startAt: day + 'T07:00:00.000Z', endAt: day + 'T07:50:00.000Z', zoneOffsetMinutes: 0, durationSec: dur, distanceM: speed * dur, activeCaloriesJ: null, totalCaloriesJ: null, elevationGainM: 20, avgHrBpm: 152, maxHrBpm: 175, minHrBpm: 100, hrCoverageRatio: 1, hrSampleCount: hr.length, avgSpeedMs: speed, maxSpeedMs: speed, hasSeries: true, edited: [], rpe: null, comment: null, ingestedAt: '' } as never;
      data.series[id] = { id, updatedAt: 'x', hr, speed: sp } as never;
    }
  }
  return data;
}

test('Training Effect, VO₂max estimée, prédictions : cohérents sur un historique régulier', () => {
  const data = runnerData();
  const d = derive(data, SETTINGS, new Date('2026-10-27T12:00:00Z'));
  const fx = trainingEffects(data, d);
  const e = fx.get('r40')!;
  assert.ok(e.aerobic > 2 && e.aerobic < 4.5, 'séance habituelle : effet aérobie moyen à bon');
  assert.equal(e.refIsDefault, false);
  assert.ok(e.zone5Sec === 0 && e.anaerobic === 0, 'FC à 79–86 % : pas de zone 5');
  assert.equal(fx, trainingEffects(data, d), 'résultat en cache');
  // VO₂max : FC de réserve ≈ (152-52)/(190-52) = 72 % ; VO₂ ≈ 0,2 × 192 + 3,5 = 41,9 -> ≈ 56
  const efforts = bestEfforts(data, d.today);
  assert.ok(efforts.some((x) => x.distanceM === 5000) && efforts.some((x) => x.distanceM === 10000));
  const v = vo2maxEstimate(data, d, efforts);
  assert.equal(v.method, 'submax');
  assert.ok(v.value! > 50 && v.value! < 62, 'VO₂max ' + v.value);
  assert.ok(v.uth !== null && Math.abs(v.uth - 15.3 * 190 / 52) < 3);
  assert.ok(v.vdot!.value > 30 && v.vdot!.value < v.value! + 1, 'le VDOT d\'un entraînement reste une borne basse');
  // endurance et côtes
  const en = enduranceScore(data, d.today, v.value)!;
  assert.ok(en.score > 0 && en.score <= 100 && en.aerobic !== null);
  assert.equal(enduranceScore(emptyData(), d.today, null), null);
  const hs = hillScore(data, d.today)!;
  assert.equal(hs.bestVam, null, 'séances à plat : pas de VAM');
  assert.ok(hs.score >= 0);
});

test('disponibilité et réserve d\'énergie : une mauvaise nuit et une FC de repos élevée font baisser le score', () => {
  const data = runnerData();
  const d = derive(data, SETTINGS, new Date('2026-10-27T12:00:00Z'));
  const bad = readiness(data, d, '2026-10-27')!;   // nuit de 5 h 30 et FC de repos à 58
  const good = readiness(data, d, '2026-10-24')!;
  assert.ok(bad.score < good.score, bad.score + ' < ' + good.score);
  assert.ok(bad.factors.find((f) => f.key === 'restingHr')!.score < 50);
  assert.ok(Math.abs(bad.factors.reduce((t, f) => t + f.effectiveWeight, 0) - 1) < 1e-9);
  assert.equal(readiness(emptyData(), derive(emptyData(), SETTINGS, new Date('2026-10-27T12:00:00Z'))), null);
  const res = energyReserve(data, d, 10);
  assert.equal(res.length, 10);
  assert.ok(res.every((p) => p.wake <= 100 && p.evening >= 5 && p.evening <= p.wake));
  assert.ok(res[9].wake < res[8].wake, 'courte nuit : réveil plus bas');
});

test('indice de côtes : la vitesse ascensionnelle ne compte que les séances vraiment vallonnées', () => {
  const data = emptyData();
  const mk = (id: string, day: string, gain: number, dist: number, dur: number, disc: 'RUN' | 'BIKE') => ({ id, updatedAt: 'x', sourceId: id, source: 'health', discipline: disc, rawExerciseType: '', startAt: day + 'T07:00:00.000Z', endAt: day + 'T09:00:00.000Z', zoneOffsetMinutes: 0, durationSec: dur, distanceM: dist, elevationGainM: gain, avgHrBpm: null, edited: [], rpe: null, comment: null }) as never;
  data.actual.a = mk('a', '2026-10-20', 900, 30000, 3600 * 2, 'BIKE'); // 3 % ; 450 m/h
  data.actual.b = mk('b', '2026-10-22', 50, 10000, 3000, 'RUN');       // trop plat
  const h = hillScore(data, '2026-10-27')!;
  assert.equal(h.best!.sessionId, 'a');
  assert.ok(Math.abs(h.bestVam! - 450) < 1e-9);
  assert.equal(h.vamScore, Math.round(450 / 700 * 100));
  assert.ok(Math.abs(h.weeklyGain - 237.5) < 1e-9);
  assert.equal(hillScore(emptyData(), '2026-10-27'), null);
});

test('roulettes de bloc : conversions d\'affichage (vitesse en dixièmes de km/h, charge en dixièmes de kg, % et allures inchangés)', () => {
  assert.equal(toDisp('SPEED', null, 12.5 / 3.6), 125);
  assert.ok(Math.abs(fromDisp('SPEED', null, 125) - 12.5 / 3.6) < 1e-12);
  assert.equal(toDisp('LOAD', null, 22.5), 225); assert.equal(fromDisp('LOAD', null, 225), 22.5);
  assert.equal(toDisp('PACE', null, 270), 270); assert.equal(fromDisp('PACE', null, 270), 270);
  assert.equal(toDisp('SPEED', 'VMA', 85), 85); assert.equal(fromDisp('SPEED', 'VMA', 85), 85);
  assert.equal(defaultDisp('PACE', null, 'SWIM'), 105); assert.equal(defaultDisp('ZONE', null, 'RUN'), 2); assert.equal(defaultDisp('POWER', 'FTP', 'BIKE'), 85);
});

test('calories : avec les calories de repos de la montre, le total de Health Connect est partagé comme Garmin Connect', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: 'x', displayName: null, birthDate: null, sex: null, availability: [], equipment: [], injuries: [], restKcal: 2150 };
  d.energy['2026-10-26'] = { id: '2026-10-26', updatedAt: 'x', day: '2026-10-26', activeKcal: 1362, totalKcal: 2408, source: 'health' };
  const e = dayEnergy(d, '2026-10-26', 600);
  assert.equal(e.rest, 2150); assert.equal(e.active, 258); assert.equal(e.total, 2408);
  // jour en cours : repos au prorata de l'heure (la montre fait pareil), actives jamais négatives
  const t = today();
  d.energy[t] = { id: t, updatedAt: 'x', day: t, activeKcal: 400, totalKcal: 1200, source: 'health' };
  const n = dayEnergy(d, t, 720);
  assert.equal(n.rest, 1075); assert.equal(n.active, 125);
  // sans réglage : comportement d'avant
  d.athlete.main = { ...d.athlete.main!, restKcal: null };
  assert.equal(dayEnergy(d, '2026-10-26').rest, 1046);
});

test('sommeil : les sessions d’une même nuit coupée par un réveil sont recollées, pas les siestes', () => {
  const part = (id: string, a: string, b: string, asleep: number) => ({ id, clientRecordId: null, startTime: a, endTime: b, startZoneOffsetSeconds: 0, asleepSec: asleep });
  const out = mergeSleepParts([
    part('b', '2026-10-27T02:00:00Z', '2026-10-27T05:30:00Z', 11000),
    part('a', '2026-10-26T22:30:00Z', '2026-10-27T01:15:00Z', 9000), // 45 min avant la suivante : même nuit
    part('n', '2026-10-27T14:00:00Z', '2026-10-27T14:40:00Z', 2000), // sieste
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].asleepSec, 20000); assert.equal(out[0].startTime, '2026-10-26T22:30:00Z'); assert.equal(out[0].endTime, '2026-10-27T05:30:00Z');
  assert.equal(out[1].asleepSec, 2000);
});

test('répartition de la charge : le renforcement compte en anaérobie', () => {
  const d = emptyData();
  const base = { updatedAt: 'x', rawExerciseType: '', source: 'manual' as const, startAt: '2026-10-25T10:00:00.000Z', endAt: '2026-10-25T11:00:00.000Z', zoneOffsetMinutes: 0, durationSec: 3600, distanceM: null, avgHrBpm: null };
  d.actual.f = { ...base, id: 'f', sourceId: 'f', discipline: 'STRENGTH' } as unknown as ActualSession;
  const loads = new Map([['f', { load: 60 } as never]]);
  const f = loadFocus(d, loads, 188, '2026-10-27');
  assert.equal(f.anaerobic, 60); assert.equal(f.low, 0); assert.equal(f.total, 60);
});

test('modèle d\'effort (type EPOC) : seuil à 50 % de la FC max, saturation, et une séance courte et dure pèse plus qu\'une longue et facile', () => {
  const flat = (bpm: number, sec: number): [number, number][] => Array.from({ length: sec / 5 }, (_, i) => [i * 5, bpm] as [number, number]);
  assert.equal(epocRate(0.5), 0);
  assert.equal(epocRate(0.3), 0);
  const hrMax = 200;
  const hour70 = epocFromSeries(flat(140, 3600), hrMax, 3600)!;
  // 24,8 × 0,2^1,5 × 44,7 × (1 − e^(−60/44,7)) ≈ 73
  assert.ok(Math.abs(hour70.value - 73) < 2, 'une heure à 70 % : ' + hour70.value);
  const longEasy = epocFromSeries(flat(125, 4 * 3600), hrMax, 4 * 3600)!.value;
  const longerEasy = epocFromSeries(flat(125, 8 * 3600), hrMax, 8 * 3600)!.value;
  assert.ok(longerEasy < longEasy * 1.08, 'la charge sature : doubler la durée ne double pas l\'effort');
  const shortHard = epocFromSeries(flat(180, 1800), hrMax, 1800)!.value;
  assert.ok(shortHard > longEasy, 'une demi-heure à 90 % pèse plus que 4 h à 62 %');
  const viaAvg = epocFromAverage(140, 3600, hrMax)!;
  assert.ok(Math.abs(viaAvg - hour70.value) < 1, 'FC moyenne constante : même valeur que la courbe');
  assert.equal(epocFromSeries(flat(140, 20), hrMax, 20)?.value ?? null, null, 'moins de 10 mesures : pas de charge mesurée');
});

test('sommeil corrigé à la main : la lecture de la montre ne l\'écrase plus', () => {
  const d = emptyData();
  d.sleep['2026-10-17'] = { id: '2026-10-17', updatedAt: 'x', nightDate: '2026-10-17', startAt: '2026-10-16T21:00:00.000Z', endAt: '2026-10-17T05:00:00.000Z', zoneOffsetMinutes: 120, durationSec: 8 * 3600, fromStages: true, edited: true, sourceId: 'manual' } as never;
  const night = { id: 'n1', clientRecordId: null, startTime: '2026-10-17T02:22:00Z', endTime: '2026-10-17T05:00:00Z', startZoneOffsetSeconds: 7200, asleepSec: 2.5 * 3600 };
  assert.equal(ingest(d, [], [night], []).ops.sleep.length, 0, 'nuit validée : intacte');
  d.sleep['2026-10-17'].edited = false;
  assert.equal(ingest(d, [], [night], []).ops.sleep.length, 0, 'non validée mais plus longue : la valeur la plus longue gagne');
});

test('pas et étages : fusionnés par jour avec la dépense, et réécrits seulement s\'ils changent', () => {
  const d = emptyData();
  const day = '2026-10-20';
  let rows = ingestEnergy(d, [{ day, activeKcal: 900, totalKcal: 3000 }], [{ day, steps: 12345, floors: 17 }]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].activeKcal, rows[0].totalKcal, rows[0].steps, rows[0].floors], [900, 3000, 12345, 17]);
  d.energy[day] = rows[0];
  assert.equal(ingestEnergy(d, [{ day, activeKcal: 900, totalKcal: 3000 }], [{ day, steps: 12345, floors: 17 }]).length, 0);
  // seuls les pas arrivent (étages non transmis) : les calories déjà connues sont conservées
  rows = ingestEnergy(d, [], [{ day, steps: 13000 }]);
  assert.equal(rows[0].steps, 13000); assert.equal(rows[0].totalKcal, 3000); assert.equal(rows[0].floors, 17);
});

test('courbes de capacité : un point par jour, et la VO₂max suit les sorties récentes au lieu de rester sur un palier', () => {
  const data = runnerData();
  const d = derive(data, SETTINGS, new Date('2026-10-27T12:00:00Z'));
  const h = capacityHistory(data, d, 40);
  assert.equal(h.length, 40);
  assert.equal(h[39].day, '2026-10-27');
  const v = h.map((p) => p.vo2max).filter((x): x is number => x !== null);
  assert.ok(v.length > 20);
  assert.ok(new Set(v.map((x) => Math.round(x * 100))).size >= 6, 'valeurs distinctes : pas de paliers');
  let run = 1, maxRun = 1;
  for (let i = 1; i < v.length; i++) { run = Math.abs(v[i] - v[i - 1]) < 0.005 ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  assert.ok(maxRun <= 3, 'jamais plus de 3 jours identiques de suite (séances tous les 2 jours) : ' + maxRun);
  const efforts = bestEfforts(data, d.today);
  assert.equal(h[39].vo2max, vo2maxEstimate(data, d, efforts).value, 'dernier point = valeur du jour');
});

test('calories : la dépense de base de la montre donne le repos ; le réglage du profil reste prioritaire', () => {
  const d = emptyData();
  d.energy['2026-10-26'] = { id: '2026-10-26', updatedAt: 'x', day: '2026-10-26', activeKcal: 1282, totalKcal: 2681, basalKcal: 2167, source: 'health' };
  const e = dayEnergy(d, '2026-10-26', 600);
  assert.equal(e.rest, 2167); assert.equal(e.active, 514); assert.equal(e.total, 2681); assert.equal(e.restHow, 'basal');
  // sans dépense de base ni réglage : simple différence des valeurs de Health Connect, signalée comme telle
  d.energy['2026-10-26'] = { ...d.energy['2026-10-26'], basalKcal: null };
  assert.equal(dayEnergy(d, '2026-10-26').restHow, 'split');
  // le réglage de Profil passe avant
  d.energy['2026-10-26'] = { ...d.energy['2026-10-26'], basalKcal: 2167 };
  d.athlete.main = { id: 'main', updatedAt: 'x', displayName: null, birthDate: null, sex: null, availability: [], equipment: [], injuries: [], restKcal: 2100 };
  assert.equal(dayEnergy(d, '2026-10-26', 600).rest, 2100);
  // la dépense de base lue est conservée avec le jour
  const rows = ingestEnergy(emptyData(), [{ day: '2026-10-20', activeKcal: 900, totalKcal: 3000, basalKcal: 2150 }]);
  assert.equal(rows[0].basalKcal, 2150);
});

test('statut d\'entraînement par jour : une case par jour, même règle que par semaine', () => {
  const days: DayLoad[] = Array.from({ length: 60 }, (_, i) => ({ day: addDays('2026-08-01', i), load: 60, estimated: false, interruptionFill: false, fitness: 40 + i * 0.3, fatigue: 50, freshness: -5 }));
  const cells = dailyStatus(days, '2026-09-29', 7);
  assert.equal(cells.length, 7);
  assert.ok(cells.every((c) => c.daily && c.status !== null));
  assert.equal(cells[6].start, '2026-09-29');
  assert.ok(cells[6].ratio !== null && Math.abs(cells[6].ratio! - 1) < 0.01, 'charge constante : rapport ≈ 1');
});

test('point de la semaine : statut fait / à faire et prochain dimanche', () => {
  const d = emptyData();
  assert.equal(sundayOf('2026-10-29'), '2026-11-01');
  assert.equal(sundayOf('2026-11-01'), '2026-11-01');
  // jeudi 29/10 : le dernier dimanche est le 25/10, le prochain le 01/11
  assert.deepEqual(checkinStatus(d, '2026-10-29'), { done: false, due: '2026-10-25', next: '2026-11-01' });
  // le point du dimanche 25/10 (semaine du 19/10) est rempli : coche
  d.checkins['2026-10-19'] = { ...emptyCheckin('2026-10-19'), day: '2026-10-25', pred5kSec: 1350, updatedAt: 'x' } as never;
  assert.equal(checkinStatus(d, '2026-10-29').done, true);
  assert.equal(checkinStatus(d, '2026-10-25').done, true);
  // dès le lundi suivant le dimanche 01/11 devient le prochain ; le 02/11 il faut le point du 01/11
  assert.equal(checkinStatus(d, '2026-11-01').done, false);
  assert.equal(checkinStatus(d, '2026-11-01').next, '2026-11-08');
  assert.equal(checkinStatus(d, '2026-11-03').done, false);
  // saisi à l'avance pour la semaine en cours : fait
  d.checkins['2026-10-26'] = { ...emptyCheckin('2026-10-26'), day: '2026-11-01', pred5kSec: 1340, updatedAt: 'x' } as never;
  assert.equal(checkinStatus(d, '2026-10-29').done, true);
  // la courbe est datée du jour saisi, pas du lundi
  assert.equal(metricSeries(d, 'pred5kSec')[0].day, '2026-10-25');
});

test('relevés Garmin repris sans rien écraser', () => {
  const d = emptyData();
  d.energy['2026-10-20'] = { id: '2026-10-20', updatedAt: 'x', day: '2026-10-20', activeKcal: 900, totalKcal: 3050, basalKcal: 2150, steps: null, floors: null, source: 'health' };
  const file = {
    format: 'apogee-garmin/1' as const,
    energy: [
      { day: '2026-10-19', totalKcal: 2800, restKcal: 2150, steps: 9000, floors: 12 },
      { day: '2026-10-20', totalKcal: 2999, restKcal: 2100, steps: 11000, floors: 15 },
      { day: '2999-01-01', totalKcal: 1, steps: 1 },
    ],
    predictions: [
      { day: '2026-10-18', pred5kSec: 1360, pred10kSec: 2970, predHalfSec: 6700, predMarathonSec: 14900 },
      { day: '2026-10-17', pred5kSec: 1, pred10kSec: 1, predHalfSec: 1, predMarathonSec: 1 },
    ],
  };
  const r = mergeGarminGraph(d, file);
  assert.equal(r.report.energyAdded, 1);
  assert.equal(r.report.energyFilled, 1);
  const added = r.energy.find((x) => x.day === '2026-10-19')!;
  assert.equal(added.activeKcal, 650);
  assert.equal(added.steps, 9000);
  const filled = r.energy.find((x) => x.day === '2026-10-20')!;
  // calories déjà lues : conservées ; pas et étages manquants : comblés
  assert.equal(filled.totalKcal, 3050);
  assert.equal(filled.activeKcal, 900);
  assert.equal(filled.steps, 11000);
  assert.equal(r.energy.some((x) => x.day === '2999-01-01'), false);
  // une seule fiche par semaine, le relevé le plus tardif l'emporte
  assert.equal(r.checkins.length, 1);
  assert.equal(r.checkins[0].week, '2026-10-12');
  assert.equal(r.checkins[0].day, '2026-10-18');
  assert.equal(r.checkins[0].pred5kSec, 1360);
  // un point déjà saisi n'est pas écrasé
  d.checkins['2026-10-12'] = { ...emptyCheckin('2026-10-12'), pred5kSec: 1400, updatedAt: 'x' } as never;
  const again = mergeGarminGraph(d, file);
  assert.equal(again.checkins[0].pred5kSec, 1400);
  assert.equal(again.checkins[0].pred10kSec, 2970);
});

test('effacer l’historique avant une date : seulement les données datées, séries et enchaînements avec leurs séances', () => {
  const d = emptyData();
  const mk = (id: string, day: string) => ({ id, updatedAt: 'x', sourceId: id, source: 'manual', discipline: 'RUN', rawExerciseType: 'manual', startAt: day + 'T08:00:00.000Z', endAt: day + 'T09:00:00.000Z', zoneOffsetMinutes: 0 }) as never;
  d.actual.a1 = mk('a1', '2026-07-20'); d.actual.a2 = mk('a2', '2026-08-05');
  d.series.a1 = { id: 'a1', updatedAt: 'x' } as never; d.series.a2 = { id: 'a2', updatedAt: 'x' } as never;
  d.bricks.b1 = { id: 'b1', updatedAt: 'x', firstId: 'a1', secondId: 'a2', day: '2026-07-20' } as never;
  d.sleep['2026-07-30'] = { id: '2026-07-30', updatedAt: 'x', nightDate: '2026-07-30' } as never;
  d.energy['2026-08-02'] = { id: '2026-08-02', updatedAt: 'x', day: '2026-08-02', activeKcal: 1, totalKcal: 2, source: 'health' };
  d.energy['2026-08-01'] = { id: '2026-08-01', updatedAt: 'x', day: '2026-08-01', activeKcal: 1, totalKcal: 2, source: 'health' };
  d.checkins['2026-07-27'] = { ...emptyCheckin('2026-07-27'), day: '2026-08-02', updatedAt: 'x' } as never;
  d.checkins['2026-07-13'] = { ...emptyCheckin('2026-07-13'), day: '2026-07-19', updatedAt: 'x' } as never;
  d.zones.z = { id: 'z', updatedAt: 'x' } as never;
  const keys = purgePlan(d, '2026-08-02').map((k) => k.join(':')).sort();
  assert.deepEqual(keys, ['actual:a1', 'bricks:b1', 'checkins:2026-07-13', 'energy:2026-08-01', 'series:a1', 'sleep:2026-07-30']);
});

test('pas, étages, calories : une valeur saisie à la main n\'est jamais écrasée par la montre', () => {
  const d = emptyData();
  d.energy['2026-10-26'] = { id: '2026-10-26', updatedAt: 'x', day: '2026-10-26', activeKcal: 1000, totalKcal: 3100, basalKcal: 2100, steps: 20000, floors: 30, edited: ['kcal', 'steps'], source: 'health' };
  // la montre lit d'autres valeurs : calories et pas corrigés restent, les étages (non corrigés) suivent la montre
  const out = ingestEnergy(d, [{ day: '2026-10-26', activeKcal: 700, totalKcal: 2800, basalKcal: 2100 }], [{ day: '2026-10-26', steps: 18000, floors: 28 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].activeKcal, 1000); assert.equal(out[0].totalKcal, 3100); assert.equal(out[0].steps, 20000); assert.equal(out[0].floors, 28);
  assert.deepEqual(out[0].edited, ['kcal', 'steps']);
  // rien ne change côté montre : rien à réécrire
  assert.equal(ingestEnergy(d, [{ day: '2026-10-26', activeKcal: 700, totalKcal: 2800 }], [{ day: '2026-10-26', steps: 18000, floors: 30 }]).length, 0);
  // calories saisies : repos = total − actives, sans le calage du profil
  d.athlete.main = { id: 'main', updatedAt: 'x', restKcal: 2150 } as never;
  const e = dayEnergy(d, '2026-10-26', 600);
  assert.equal(e.restHow, 'manual'); assert.equal(e.active, 1000); assert.equal(e.rest, 2100); assert.equal(e.total, 3100);
});
