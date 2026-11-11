// Tests des calculs d’Apogée (node --test). Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { estimateDistance, estimateDuration, newBlock, validateSession } from '../src/domain/blocks';
import { addDays, today, localDay, mondayOf, weeksOfMonth } from '../src/domain/dates';
import { derive, refsAtFn, refsOf } from '../src/domain/engine';
import { bestSegment, bestSpeedOver, efficiency, personalRecords, suggestZones } from '../src/domain/records';
import { forecastLoad } from '../src/domain/forecast';
import { fitnessByDiscipline } from '../src/domain/loadByDiscipline';
import { polarSplit, zoneIndex, zoneRanges, zoneTimes } from '../src/domain/zones';
import { speedFromDistances } from '../src/domain/health';
import { overlaySteps, timedSteps } from '../src/domain/plannedSteps';
import { newBlock } from '../src/domain/blocks';
import { distanceAt, distanceCurve, intensityMinutes, primaryBenefit, rangeStats, speedStats } from '../src/domain/sessionStats';
import { trainingAlerts } from '../src/domain/review';
import { planCompliance } from '../src/domain/compliance';
import { computeDailyForm } from '../src/domain/form';
import { ingest } from '../src/domain/health';
import { encodeFit, fitCrc, fitFileName, toFitWorkouts } from '../src/domain/fit';
import { sleepStats, weightTrend } from '../src/domain/body';
import { SWIM_LOAD_FACTOR, analyzeHr, avgHrForLoad, bpmFromEquiv, cleanHr, epocFromAverage, equivIntensity, epocFromSeries, epocRate, hrDrift, sustainedPeak, trimpFromAverage, trimpFromSeries } from '../src/domain/hr';
import { importLegacyDb, emptyData } from '../src/domain/legacy';
import { cycleAt, cycleColor, cycleInfos, validateCycles, weeklyCycles } from '../src/domain/cycles';
import { buildLoadSeries, computeSessionLoads, hrMaxTimeline, resolveHrMax, restAtFn } from '../src/domain/load';
import { buildManualSession, parseBulkActual, parseBulkPlanned, parseManualFields } from '../src/domain/manual';
import { hm } from '../src/ui/format';
import { bmrKcal, dayEnergy, weekEnergy } from '../src/domain/energy';
import { mergeSleepParts } from '../src/domain/health';
import { loadFocus } from '../src/domain/loadStatus';
import { capacityHistory } from '../src/domain/capacity';
import { ingestEnergy, ingestVitals } from '../src/domain/healthExtra';
import { checkinStatus, currentCheckin, emptyCheckin, metricSeries, sundayOf } from '../src/domain/checkin';
import { correctFromGarmin, isGarminGraph, mergeGarminGraph } from '../src/domain/garminGraph';
import { correctSessions, sessionsMessage } from '../src/domain/garminSessions';
import { purgePlan } from '../src/domain/purge';
import { acuteSeries, dailyStatus, statusOf, weeklyStatus } from '../src/domain/loadStatus';
import type { DayLoad } from '../src/domain/load';
import { applyPreview, buildDossier, parsePlan, preview } from '../src/domain/coach';
import { RACE_DISTANCES, aerobicEffect, anaerobicEffect, riegel, teLevel, timeOfVdot, vdotOfPerformance, vo2OfRunning, vo2maxFromSubmax, vo2maxUth } from '../src/domain/science';
import { acuteScore, energyReserve, enduranceScore, hillScore, latestVo2max, readiness, restingScore, sleepScore, trainingEffects } from '../src/domain/capacity';
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

test('zones de FC (Karvonen) : bornes, temps par zone, répartition facile / soutenue / intense', () => {
  // sans FC de repos mesurée : repos de référence = 0,26 × FC max = 52 bpm, réserve = 148 bpm
  assert.equal(zoneIndex(100, 200), 0);
  assert.equal(zoneIndex(140, 200), 0, '52 + 0,6 × 148 = 140,8 : juste en dessous, c’est Z1');
  assert.equal(zoneIndex(142, 200), 1);
  assert.equal(zoneIndex(171, 200), 3, '80 % de la réserve = 170,4');
  assert.equal(zoneIndex(165, 200), 2);
  assert.equal(zoneIndex(185, 200), 3, '90 % de la réserve = 185,2 : 186 est Z5');
  assert.equal(zoneIndex(186, 200), 4);
  // avec une FC de repos mesurée de 50 : seuil Z2 = 50 + 0,6 × 150 = 140
  assert.equal(zoneIndex(139, 200, 50), 0);
  assert.equal(zoneIndex(140, 200, 50), 1);
  const r = zoneRanges(200, 50);
  assert.equal(r[0].lo, 50); assert.equal(r[4].hi, 200); assert.equal(Math.round(r[1].lo), 140);
  const ser: [number, number][] = Array.from({ length: 101 }, (_, i) => [i * 10, i < 50 ? 110 : i < 80 ? 175 : 192]);
  const z = zoneTimes(ser, 200);
  assert.equal(z.reduce((t, x) => t + x, 0), 1000 + 11, 'le dernier échantillon vaut l’intervalle nominal');
  const p = polarSplit(z);
  assert.equal(p.easy + p.hard + p.intense, p.total);
  assert.ok(p.easy > p.hard && p.hard > p.intense);
});

test('charge : l’intensité équivalente ne change rien à la FC de repos de référence et monte avec une FC de repos plus basse', () => {
  assert.ok(Math.abs(equivIntensity(150, 200, 52) - 0.75) < 1e-9, 'au repos de référence : FC ÷ FC max');
  assert.ok(Math.abs(bpmFromEquiv(equivIntensity(150, 200, 52), 200, 52) - 150) < 1e-9, 'aller-retour');
  assert.ok(equivIntensity(150, 200, 40) > equivIntensity(150, 200, 52), 'un cœur plus reposé : le même bpm est plus intense');
  const ser: [number, number][] = Array.from({ length: 121 }, (_, i) => [i * 30, 150]);
  assert.ok(Math.abs(epocFromSeries(ser, 200, 3600, null)!.value - epocFromSeries(ser, 200, 3600, 52)!.value) < 1e-6);
});

test('bilan de séance : plage sélectionnée, minutes d’intensité, vitesse et distance', () => {
  const pts = [{ t: 0, v: 100 }, { t: 10, v: 140 }, { t: 20, v: 140 }, { t: 30, v: 140 }];
  const r = rangeStats(pts, 0, 20, 60)!;
  assert.ok(Math.abs(r.avg - 120) < 1e-9 && r.min === 100 && r.max === 140);
  assert.equal(rangeStats(pts, 100, 200, 60), null);
  // 10 min à 60 % de la réserve ou plus (soutenues), 10 min à 45 % (modérées), 5 min facile
  const hr: [number, number][] = [];
  for (let i = 0; i < 25 * 6; i++) hr.push([i * 10, i < 30 ? 100 : i < 90 ? 118 : 141]);
  const im = intensityMinutes(hr, 200, 50);
  assert.equal(im.total, im.moderate + 2 * im.vigorous);
  assert.ok(im.vigorous >= 9 && im.moderate >= 9);
  const sp: [number, number][] = Array.from({ length: 61 }, (_, i) => [i * 10, i < 30 ? 3 : 0]);
  const st = speedStats(sp, null, 600);
  assert.ok(st.movingSec !== null && Math.abs(st.movingSec - 300) <= 20);
  const dc = distanceCurve(sp, 900)!;
  assert.ok(Math.abs(distanceAt(dc, 600) - 900) < 1e-6 && distanceAt(dc, -5) === 0);
  assert.equal(primaryBenefit([0, 0, 0, 0, 0], 3, 0), null);
  assert.equal(primaryBenefit([3000, 600, 0, 0, 0], 2, 0), 'recovery');
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
  const ok = parseManualFields({ date: '2026-10-20', discipline: 'BIKE', durationMin: '125', distanceKm: '50', elevationM: '830', descentM: '790' });
  assert.ok('input' in ok);
  if ('input' in ok) { const b = buildManualSession(ok.input, 'e1'); assert.equal(b.elevationGainM, 830); assert.equal(b.elevationLossM, 790); }
  assert.ok('error' in parseManualFields({ date: '2026-10-20', discipline: 'RUN', durationMin: '30', descentM: '-5' }));
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

test('Training Effect, VO₂max Garmin, endurance : cohérents sur un historique régulier', () => {
  const data = runnerData();
  const d = derive(data, SETTINGS, new Date('2026-10-27T12:00:00Z'));
  const fx = trainingEffects(data, d);
  const e = fx.get('r40')!;
  assert.ok(e.aerobic > 2 && e.aerobic < 4.5, 'séance habituelle : effet aérobie moyen à bon');
  assert.equal(e.refIsDefault, false);
  assert.ok(e.zone5Sec === 0 && e.anaerobic === 0, 'FC à 79–86 % : pas de zone 5');
  assert.equal(fx, trainingEffects(data, d), 'résultat en cache');
  // VO₂max : jamais recalculée, seule la valeur Garmin du point hebdomadaire compte (la plus récente à la date donnée)
  assert.equal(latestVo2max(data, d.today), null);
  data.checkins['2026-10-19'] = { ...emptyCheckin('2026-10-19'), day: '2026-10-25', vo2max: 54.1, updatedAt: 'x' };
  data.checkins['2026-10-26'] = { ...emptyCheckin('2026-10-26'), day: '2026-11-01', vo2max: 54.5, updatedAt: 'x' };
  assert.equal(latestVo2max(data, '2026-10-30')!.value, 54.1);
  assert.equal(latestVo2max(data, '2026-11-03')!.value, 54.5);
  const v = latestVo2max(data, d.today);
  // endurance et côtes
  const en = enduranceScore(data, d.today, v?.value ?? null)!;
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
  assert.equal(epocRate(0.15), 0);
  assert.ok(epocRate(0.9) > 4 * epocRate(0.7), 'courbe raide : un effort dur pèse bien plus qu\'un effort facile');
  const hrMax = 200;
  const hour70 = epocFromSeries(flat(140, 3600), hrMax, 3600)!;
  // 60 × 0,505^5 × (20 × (1 − e^(−3)) + 0,165 × 60) ≈ 57
  assert.ok(Math.abs(hour70.value - 57) < 2, 'une heure à 70 % : ' + hour70.value);
  const longEasy = epocFromSeries(flat(125, 4 * 3600), hrMax, 4 * 3600)!.value;
  const longerEasy = epocFromSeries(flat(125, 8 * 3600), hrMax, 8 * 3600)!.value;
  assert.ok(longerEasy < longEasy * 1.9 && longerEasy > longEasy, 'la charge sature en partie : doubler la durée ne double pas l\'effort');
  // une longue sortie stockée avec une mesure toutes les 80 s pèse comme la même sortie finement mesurée
  const sparse = Array.from({ length: 270 }, (_, i) => [i * 80, 125] as [number, number]);
  const sparseLoad = epocFromSeries(sparse, hrMax, 6 * 3600)!.value, denseLoad = epocFromSeries(flat(125, 6 * 3600), hrMax, 6 * 3600)!.value;
  assert.ok(Math.abs(sparseLoad - denseLoad) / denseLoad < 0.03, 'courbe espacée : ' + sparseLoad + ' vs ' + denseLoad);
  const shortHard = epocFromSeries(flat(180, 1800), hrMax, 1800)!.value;
  assert.ok(shortHard > longEasy, 'une demi-heure à 90 % pèse plus que 4 h à 62 %');
  const viaAvg = epocFromAverage(140, 3600, hrMax)!;
  assert.ok(Math.abs(viaAvg / 1.25 - hour70.value) < 1, 'FC moyenne : valeur de la courbe constante, majorée de la correction de moyenne (1,25)');
  assert.equal(epocFromSeries(flat(140, 20), hrMax, 20)?.value ?? null, null, 'moins de 10 mesures : pas de charge mesurée');
});

test('natation : la charge est majorée du facteur de natation, pas les autres disciplines', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: '', displayName: null, birthDate: '1995-01-01', sex: 'M', availability: [], equipment: [], injuries: [] };
  for (const [id, disc] of [['a', 'RUN'], ['b', 'SWIM']] as const) {
    d.actual[id] = session(id, '2026-09-01', { source: 'health', sourceId: id, discipline: disc, hasSeries: true, durationSec: 3600 });
    d.series[id] = { id, updatedAt: '', hr: Array.from({ length: 360 }, (_, k) => [1788000000 + k * 10, 140] as [number, number]), speed: [] };
  }
  const { loads } = computeSessionLoads(d, SETTINGS, new Date('2026-09-10T12:00:00Z'));
  assert.ok(Math.abs(loads.get('b')!.load! / loads.get('a')!.load! - SWIM_LOAD_FACTOR) < 0.001);
  assert.ok(Math.abs(avgHrForLoad(60, 3000, 205, SWIM_LOAD_FACTOR)! - avgHrForLoad(60 / SWIM_LOAD_FACTOR, 3000, 205)!) < 0.001, 'l\'inverse tient compte du facteur de natation');
});

function zoneReading(id: string, kind: 'vma' | 'css' | 'ftp' | 'hr_max', value: number, day: string) {
  return { id, updatedAt: 'x', kind, value, measuredAt: day + 'T12:00:00.000Z', source: 'test', notes: null } as never;
}

test('FC max datée : une nouvelle FC max ne change jamais la charge des séances antérieures', () => {
  const d = emptyData();
  d.athlete.main = { id: 'main', updatedAt: '', displayName: null, birthDate: '1995-01-01', sex: 'M', availability: [], equipment: [], injuries: [] };
  d.zones.a = zoneReading('a', 'hr_max', 200, '2026-08-01');
  d.zones.b = zoneReading('b', 'hr_max', 210, '2026-10-01');
  for (const [id, day] of [['early', '2026-07-10'], ['mid', '2026-09-10'], ['late', '2026-10-10']] as const) {
    d.actual[id] = session(id, day, { source: 'health', sourceId: id, hasSeries: true, durationSec: 3600 });
    d.series[id] = { id, updatedAt: '', hr: Array.from({ length: 360 }, (_, k) => [Date.parse(day + 'T08:00:00Z') / 1000 + k * 10, 150] as [number, number]), speed: [] };
  }
  const now = new Date('2026-10-20T12:00:00Z');
  const first = computeSessionLoads(d, SETTINGS, now);
  assert.equal(first.ctx.hrMaxAt('2026-07-10'), 200, 'avant le premier relevé : le premier relevé');
  assert.equal(first.ctx.hrMaxAt('2026-09-10'), 200);
  assert.equal(first.ctx.hrMaxAt('2026-10-01'), 210, 'le relevé s\'applique dès son jour');
  const flat = (hrMax: number) => epocFromSeries(d.series.mid.hr, hrMax, 3600)!.value;
  assert.ok(Math.abs(first.loads.get('mid')!.load! - flat(200)) < 0.01, 'séance de septembre : FC max 200');
  assert.ok(Math.abs(first.loads.get('late')!.load! - flat(210)) < 0.01, 'séance d\'octobre : FC max 210');
  assert.ok(first.loads.get('mid')!.load! > first.loads.get('late')!.load!, 'même courbe, FC max plus haute : charge plus basse');
  // une nouvelle FC max (190) datée du 01/11 ne touche aucune séance déjà faite
  d.zones.c = zoneReading('c', 'hr_max', 190, '2026-11-01');
  const second = computeSessionLoads(d, SETTINGS, new Date('2026-11-04T12:00:00Z'));
  for (const id of ['early', 'mid', 'late']) assert.equal(second.loads.get(id)!.load, first.loads.get(id)!.load, id);
  assert.equal(second.ctx.hrMaxAt('2026-11-02'), 190);
  assert.equal(second.ctx.hrMax.bpm, 190, 'la FC max d\'aujourd\'hui reste la dernière');
});

test('références datées (VMA, CSS, FTP, FC max) : une séance prévue garde celles de sa date', () => {
  const d = emptyData();
  d.zones.v1 = zoneReading('v1', 'vma', 4.0, '2026-04-05');
  d.zones.v2 = zoneReading('v2', 'vma', 4.4, '2026-10-22');
  d.zones.c1 = zoneReading('c1', 'css', 0.7, '2026-08-01');
  d.zones.h1 = zoneReading('h1', 'hr_max', 205, '2026-10-22');
  const at = refsAtFn(d, hrMaxTimeline(d));
  assert.equal(at('2026-09-01').vma, 4.0);
  assert.equal(at('2026-10-22').vma, 4.4);
  assert.equal(at('2026-12-01').vma, 4.4, 'une date future prend la dernière référence');
  assert.equal(at('2026-03-01').vma, 4.0, 'avant le premier relevé : le premier relevé');
  assert.equal(at('2026-09-01').css, 0.7);
  assert.equal(at('2026-09-01').ftp, null);
  const run: Block = { ...newBlock('WORK'), measure: 'DISTANCE', measureValue: 10000, targetType: 'PACE', targetLow: 80, relativeTo: 'VMA' };
  const old = estimateDuration([run], 'RUN', at('2026-09-01')).value, recent = estimateDuration([run], 'RUN', at('2026-10-25')).value;
  assert.ok(Math.abs(old - 10000 / (4.0 * 0.8)) < 0.5 && Math.abs(recent - 10000 / (4.4 * 0.8)) < 0.5, 'durée prévue selon la VMA de la date');
  assert.ok(old > recent);
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

test('corrections Garmin (apogee-garmin/2) : seulement les écarts nets, saisies à la main conservées', () => {
  const d = emptyData();
  d.energy['2026-10-20'] = { id: '2026-10-20', updatedAt: 'x', day: '2026-10-20', activeKcal: 900, totalKcal: 3050, basalKcal: 2150, steps: 10000, floors: 10, source: 'health' };
  d.energy['2026-10-21'] = { id: '2026-10-21', updatedAt: 'x', day: '2026-10-21', activeKcal: 700, totalKcal: 2850, steps: 8000, floors: 5, edited: ['steps'], source: 'health' };
  d.sleep['2026-10-20'] = { id: '2026-10-20', updatedAt: 'x', nightDate: '2026-10-20', startAt: '2026-10-19T21:00:00.000Z', endAt: '2026-10-20T05:00:00.000Z', zoneOffsetMinutes: 120, durationSec: 8 * 3600, fromStages: true, sourceId: 'hc' } as never;
  d.sleep['2026-10-21'] = { id: '2026-10-21', updatedAt: 'x', nightDate: '2026-10-21', startAt: '2026-10-20T21:00:00.000Z', endAt: '2026-10-21T05:00:00.000Z', zoneOffsetMinutes: 120, durationSec: 8 * 3600, fromStages: true, edited: true, sourceId: 'manual' } as never;
  const r = correctFromGarmin(d, {
    format: 'apogee-garmin/2',
    energy: [
      { day: '2026-10-20', totalKcal: 3060, restKcal: 2150, steps: 10100, floors: 14 },   // calories et pas conformes ; étages +4 : corrigés
      { day: '2026-10-21', totalKcal: 3400, restKcal: 2150, steps: 12000, floors: 5 },   // calories : écart net ; pas saisis à la main : gardés
    ],
    sleep: [{ night: '2026-10-20', durationMin: 330 }, { night: '2026-10-21', durationMin: 300 }, { night: '2026-10-22', durationMin: 400 }],
  }, 120);
  const a = r.energy.find((x) => x.day === '2026-10-20')!;
  assert.equal(a.floors, 14); assert.equal(a.totalKcal, 3050); assert.deepEqual(a.edited, ['floors']);
  const b = r.energy.find((x) => x.day === '2026-10-21')!;
  assert.equal(b.totalKcal, 3400); assert.equal(b.activeKcal, 1250); assert.equal(b.steps, 8000); assert.deepEqual(b.edited?.sort(), ['kcal', 'steps']);
  // sommeil : même lever que la montre, coucher déduit de la durée ; nuit validée à la main conservée ; nuit absente ajoutée
  const n = r.sleep.find((x) => x.nightDate === '2026-10-20')!;
  assert.equal(n.endAt, '2026-10-20T05:00:00.000Z'); assert.equal(n.durationSec, 330 * 60); assert.equal(n.edited, true);
  assert.equal(r.sleep.some((x) => x.nightDate === '2026-10-21'), false);
  assert.equal(r.sleep.find((x) => x.nightDate === '2026-10-22')!.endAt, '2026-10-22T05:00:00.000Z');
  assert.equal(r.report.sleepFixed, 1); assert.equal(r.report.sleepAdded, 1);
  // une fois corrigé, le calcul affiche les valeurs de Garmin sans calage
  d.energy['2026-10-21'] = b;
  assert.equal(dayEnergy(d, '2026-10-21', 600).active, 1250);
});

test('import Garmin : le seuil de lactate (FC, allure) est repris dans le point de la semaine, sans rien écraser', () => {
  const d = emptyData();
  const file = { format: 'apogee-garmin/1' as const, predictions: [{ day: '2026-08-16', lthrBpm: 185, lthPaceSecKm: 283 }, { day: '2026-10-11', lthrBpm: 184, lthPaceSecKm: 279 }] };
  const r = mergeGarminGraph(d, file);
  assert.equal(r.checkins.length, 2);
  const a = r.checkins.find((x) => x.day === '2026-08-16')!;
  assert.equal(a.lthrBpm, 185); assert.equal(a.lthPaceSecKm, 283); assert.equal(a.pred5kSec, null);
  d.checkins[a.week] = { ...a, lthrBpm: 190 };
  const again = mergeGarminGraph(d, file);
  assert.equal(again.checkins.find((x) => x.week === a.week), undefined);
});

test('import Garmin v2 : VO₂max et prédictions de la montre remplacent celles de l\'appli, sans toucher au ressenti', () => {
  const d = emptyData();
  d.checkins['2026-10-19'] = { ...emptyCheckin('2026-10-19'), day: '2026-10-25', vo2max: 53.9, pred5kSec: 1380, sleepFelt: 4, note: 'ok', updatedAt: 'x' };
  const file = {
    format: 'apogee-garmin/2' as const,
    predictions: [
      { day: '2026-10-25', vo2max: 54.1, pred5kSec: 1370, pred10kSec: 2977 },
      { day: '2026-11-01', vo2max: 54.46, pred5kSec: 1319 },
      { day: '2026-11-03', pred5kSec: 1305, predMarathonSec: 14178 },
    ],
  };
  const r = correctFromGarmin(d, file, 0);
  const byWeek = new Map(r.checkins.map((c) => [c.week, c]));
  const fixed = byWeek.get('2026-10-19')!;
  assert.equal(fixed.vo2max, 54.1, 'VO₂max remplacée');
  assert.equal(fixed.pred5kSec, 1370);
  assert.equal(fixed.pred10kSec, 2977);
  assert.equal(fixed.sleepFelt, 4, 'ressenti conservé'); assert.equal(fixed.note, 'ok');
  const sun = byWeek.get('2026-10-26')!;
  assert.equal(sun.vo2max, 54.5, 'une décimale'); assert.equal(sun.pred5kSec, 1319);
  const now = byWeek.get('2026-11-02')!;
  assert.equal(now.pred5kSec, 1305); assert.equal(now.day, '2026-11-03'); assert.equal(now.vo2max, null);
  assert.equal(r.report.checkinsFixed, 1); assert.equal(r.report.checkinsAdded, 2);
  // deuxième passage : tout est déjà conforme
  for (const c of r.checkins) d.checkins[c.week] = c;
  assert.equal(correctFromGarmin(d, file, 0).checkins.length, 0);
  // la version 1 ne remplace jamais
  const v1 = mergeGarminGraph({ ...emptyData(), checkins: { '2026-10-19': { ...emptyCheckin('2026-10-19'), vo2max: 53.9, updatedAt: 'x' } } }, { format: 'apogee-garmin/1', predictions: [{ day: '2026-10-25', vo2max: 54.1 }] });
  assert.equal(v1.checkins.length, 0);
});

test('FC moyenne estimée pour une charge donnée : inverse exact de la formule sur FC moyenne', () => {
  for (const [load, min] of [[20, 30], [75, 45], [140, 60], [250, 400], [450, 700]] as const) {
    const hr = avgHrForLoad(load, min * 60, 205)!;
    assert.ok(hr > 100 && hr < 215, 'FC plausible ' + hr);
    assert.ok(Math.abs(epocFromAverage(hr, min * 60, 205)! - load) < 0.01, 'aller-retour ' + load);
  }
  assert.equal(avgHrForLoad(0, 3000, 205), null); assert.equal(avgHrForLoad(60, 0, 205), null);
  assert.equal(avgHrForLoad(1200, 3600, 205), null, 'charge hors de portée');
});

test('import Garmin v3 : dénivelé remplacé, FC estimée seulement sans courbe, charge Garmin retrouvée', () => {
  const d = runnerData();
  const base = d.actual['r0'];
  d.actual['m1'] = { ...base, id: 'm1', sourceId: 'manual:m1', source: 'manual', startAt: '2026-09-20T12:00:00.000Z', durationSec: 3000, avgHrBpm: 100, hasSeries: false, elevationGainM: null, edited: [] } as never;
  d.actual['h1'] = { ...base, id: 'h1', sourceId: 'h1', source: 'health', startAt: '2026-09-21T03:00:00.000Z', durationSec: 6 * 3600, discipline: 'OTHER', avgHrBpm: 100, hasSeries: false, elevationGainM: 300, edited: ['durationSec'] } as never;
  d.actual['m2'] = { ...base, id: 'm2', sourceId: 'manual:m2', source: 'manual', startAt: '2026-09-22T12:00:00.000Z', durationSec: 7 * 3600, discipline: 'OTHER', avgHrBpm: 100, hasSeries: false, elevationGainM: null, edited: [] } as never;
  const file = {
    format: 'apogee-garmin/3' as const,
    sessions: [
      { startAt: '2026-09-22T04:16:00Z', sessionId: 'm2', discipline: 'OTHER', elevationM: 800, descentM: 950, loadEstimate: 30, label: 'saisie à midi, par identifiant' },
      { startAt: '2026-09-22T12:00:00Z', sessionId: 'inconnu', label: 'identifiant inconnu' },
      { startAt: '2026-09-14T07:02:00Z', discipline: 'RUN', elevationM: 12, loadGarmin: 999, label: 'avec courbe' },
      { startAt: '2026-09-20T12:00:00Z', elevationM: 40, loadGarmin: 80, label: 'saisie' },
      { startAt: '2026-09-21T03:00:00Z', discipline: 'OTHER', elevationM: 1540, loadGarmin: 120, label: 'rando' },
      { startAt: '2026-09-21T03:00:00Z', discipline: 'BIKE', elevationM: 5, label: 'mauvaise discipline' },
      { startAt: '2026-01-01T03:00:00Z', elevationM: 5, label: 'absente' },
    ],
  };
  assert.ok(isGarminGraph(file));
  const now = new Date('2026-10-27T12:00:00Z');
  const hrMax = resolveHrMax(d, now).bpm;
  const r = correctSessions(d, file.sessions, hrMax, restAtFn(d));
  const by = new Map(r.actual.map((s) => [s.id, s]));
  assert.equal(by.get('r0')!.elevationGainM, 12, 'dénivelé remplacé'); assert.equal(by.get('r0')!.avgHrBpm, 152, 'courbe : FC moyenne intacte');
  assert.deepEqual(by.get('r0')!.edited, ['elevationGainM']);
  assert.deepEqual(by.get('m1')!.edited, [], 'saisie à la main : pas de marqueur');
  assert.deepEqual(by.get('h1')!.edited.sort(), ['avgHrBpm', 'durationSec', 'elevationGainM']);
  assert.equal(by.get('h1')!.elevationGainM, 1540);
  assert.equal(by.get('m2')!.elevationGainM, 800); assert.equal(by.get('m2')!.elevationLossM, 950); assert.deepEqual(by.get('m2')!.edited, []);
  assert.equal(r.report.descentSet, 1);
  assert.equal(r.report.curveKept, 1); assert.equal(r.report.hrEstimated, 3); assert.equal(r.report.elevationSet, 4);
  assert.deepEqual(r.report.notFound, ['identifiant inconnu', 'mauvaise discipline', 'absente']);
  assert.match(sessionsMessage(r.report), /4 dénivelé\(s\)|4 elevation/);
  // la charge de l'appli retombe sur celle de Garmin pour les séances sans courbe, et ne bouge pas pour celle avec courbe
  const before = computeSessionLoads(d, SETTINGS, now).loads;
  for (const s of r.actual) d.actual[s.id] = s;
  const after = computeSessionLoads(d, SETTINGS, now).loads;
  assert.ok(Math.abs(after.get('m1')!.load! - 80) < 1.5, 'saisie : ' + after.get('m1')!.load);
  assert.ok(Math.abs(after.get('h1')!.load! - 120) < 1.5, 'rando : ' + after.get('h1')!.load);
  assert.equal(after.get('h1')!.method, 'trimp_avg');
  assert.ok(Math.abs(after.get('m2')!.load! - 30) < 1.5, 'estimation : ' + after.get('m2')!.load);
  assert.equal(after.get('r0')!.load, before.get('r0')!.load);
  // deuxième passage : rien à faire
  const again = correctSessions(d, file.sessions, hrMax, restAtFn(d));
  assert.equal(again.actual.length, 0); assert.equal(again.report.elevationKept, 4); assert.equal(again.report.descentKept, 1); assert.equal(again.report.hrKept, 3);
});

test('coach : le dossier contient les valeurs Garmin (VO₂max, seuil, prédictions) et la santé récente', () => {
  const data = runnerData();
  data.checkins['2026-10-26'] = { ...emptyCheckin('2026-10-26'), day: '2026-11-01', vo2max: 54.5, lthrBpm: 184, lthPaceSecKm: 279, pred5kSec: 1319, pred10kSec: 2860, predHalfSec: 6467, predMarathonSec: 14317, sleepFelt: 4, updatedAt: 'x' };
  data.checkins['2026-11-02'] = { ...emptyCheckin('2026-11-02'), day: '2026-11-03', pred5kSec: 1305, pred10kSec: 2833, predHalfSec: 6397, predMarathonSec: 14178, updatedAt: 'x' };
  const now = new Date('2026-11-03T10:00:00Z');
  const dossier = buildDossier(data, derive(data, SETTINGS, now), [], now);
  const w = dossier.watchReadings;
  assert.equal(w.latest.vo2max!.value, 54.5);
  assert.equal(w.latest.vo2max!.readingDay, '2026-11-01', 'VO₂max : dernier relevé qui en contient une, pas le plus récent des points');
  assert.equal(w.latest.racePredictions.fiveKm!.seconds, 1305);
  assert.equal(w.latest.racePredictions.fiveKm!.clock, '21:45');
  assert.equal(w.latest.racePredictions.marathon!.clock, '3:56:18');
  assert.equal(w.latest.lactateThreshold!.hrBpm, 184);
  assert.equal(w.latest.lactateThreshold!.paceClock, '4:39');
  assert.equal(w.latest.feel.sleep1to5!.value, 4);
  assert.equal(w.weekly.length, 2);
  assert.equal(w.weekly[1].pred10kClock, '47:13');
  assert.equal(dossier.recentHealth.windowDays, 7);
  assert.ok('avgSleepHours' in dossier.recentHealth && 'restingHrBpm' in dossier.recentHealth && 'lastWeightKg' in dossier.recentHealth);
  assert.match(dossier.responseContract.instructions, /watchReadings/);
  // sans point hebdomadaire : sections présentes mais vides, rien ne plante
  const empty = buildDossier(emptyData(), derive(emptyData(), SETTINGS, now), [], now);
  assert.equal(empty.watchReadings.latest.vo2max, null);
  assert.equal(empty.watchReadings.weekly.length, 0);
});

test('cycles de charge : validation, couleurs bleu→violet / vert, semaines générées', () => {
  const up = (a: string, b: string) => ({ kind: 'up' as const, startDate: a, endDate: b, label: null });
  const down = (a: string, b: string) => ({ kind: 'down' as const, startDate: a, endDate: b, label: null });
  // 4 semaines : 3 montées puis 1 descente, depuis un lundi
  const wk = weeklyCycles('2026-10-05', '2026-11-01', 3);
  assert.deepEqual(wk.map((c) => c.kind), ['up', 'up', 'up', 'down']);
  assert.equal(wk[3].endDate, '2026-11-01');
  const partial = weeklyCycles('2026-10-05', '2026-10-24', 2);
  assert.deepEqual(partial.map((c) => c.kind), ['up', 'up', 'down']);
  assert.equal(partial[2].endDate, '2026-10-24', 'la dernière semaine est tronquée à la fin du bloc');
  assert.deepEqual(validateCycles(wk, '2026-10-05', '2026-11-01'), []);
  assert.deepEqual(validateCycles(wk, '2026-10-06', '2026-11-01'), ['CYCLE_OUTSIDE_PHASE']);
  assert.ok(validateCycles([up('2026-10-05', '2026-10-12'), up('2026-10-12', '2026-10-19')], '2026-10-05', '2026-11-01').includes('CYCLE_OVERLAP'));
  assert.ok(validateCycles([up('2026-10-12', '2026-10-05')], '2026-10-01', '2026-11-01').includes('CYCLE_DATES_INVERTED'));
  // couleurs : 1re montée bleue, dernière violette, une descente coupe la série et reste verte
  assert.equal(cycleColor('up', 0, 3), 'hsl(212 68% 62%)');
  assert.equal(cycleColor('up', 2, 3), 'hsl(276 68% 62%)');
  assert.equal(cycleColor('up', 0, 1), 'hsl(212 68% 62%)');
  assert.equal(cycleColor('down'), 'hsl(140 52% 62%)');
  const infos = cycleInfos([...wk, ...weeklyCycles('2026-11-02', '2026-11-15', 1).map((c) => ({ ...c }))]);
  assert.deepEqual(infos.map((x) => x.text), ['Montée 1/3', 'Montée 2/3', 'Montée 3/3', 'Descente', 'Montée 1/1', 'Descente']);
  assert.equal(infos[4].color, cycleColor('up', 0, 1));
  // cycle d'un jour donné
  const ph = [{ id: 'p1', updatedAt: '', label: 'Dév.', phase: 'build', startDate: '2026-10-05', endDate: '2026-11-01', intent: null, objective: null, notes: null, cycles: wk, idempotencyKey: null, coachExchangeId: null }];
  assert.equal(cycleAt(ph, '2026-10-20')?.info.text, 'Montée 3/3');
  assert.equal(cycleAt(ph, '2026-10-28')?.info.text, 'Descente');
  assert.equal(cycleAt(ph, '2026-11-05'), null);
  assert.equal(down('2026-10-01', '2026-10-02').kind, 'down');
});

test('coach : cycles de charge dans un bloc (absent = on garde, null = on efface, hors bloc = refusé)', () => {
  const d = legacy();
  const phaseId = Object.keys(d.phases)[0];
  const ph = d.phases[phaseId];
  const cyc = [{ kind: 'up', startDate: ph.startDate, endDate: ph.startDate, label: null }];
  const run = (op: Record<string, unknown>) => {
    const parsed = parsePlan(JSON.stringify({ schemaVersion: 'apogee/1', planValidUntil: null, operations: [op] }));
    assert.ok(parsed.ok);
    if (!parsed.ok) throw new Error('x');
    const pv = preview(d, parsed.plan, parsed.malformed);
    return { pv, applied: applyPreview(d, pv, parsed.plan, parsed.hash) };
  };
  const base = { entity: 'phase', action: 'update', idempotencyKey: 'phase:' + phaseId, label: ph.label, startDate: ph.startDate, endDate: ph.endDate };
  const withCycles = run({ ...base, cycles: cyc });
  const saved = withCycles.applied.mutations.puts.find((p) => p.coll === 'phases')!.rec as { cycles: unknown };
  assert.deepEqual(saved.cycles, cyc);
  // absent : on garde ceux du bloc
  d.phases[phaseId] = { ...ph, cycles: cyc as never };
  const kept = run(base).applied.mutations.puts.find((p) => p.coll === 'phases')!.rec as { cycles: unknown };
  assert.deepEqual(kept.cycles, cyc);
  // null ou [] : on efface
  assert.equal((run({ ...base, cycles: null }).applied.mutations.puts.find((p) => p.coll === 'phases')!.rec as { cycles: unknown }).cycles, null);
  assert.equal((run({ ...base, cycles: [] }).applied.mutations.puts.find((p) => p.coll === 'phases')!.rec as { cycles: unknown }).cycles, null);
  // cycle hors du bloc : opération refusée avec le bon code
  const bad = run({ ...base, cycles: [{ kind: 'down', startDate: '2000-01-01', endDate: '2000-01-07', label: null }] });
  assert.equal(bad.pv.rejected.length, 1);
  assert.deepEqual(bad.pv.rejected[0].issueCodes, ['CYCLE_OUTSIDE_PHASE']);
  // cycle mal formé : opération comptée comme illisible
  const parsedBad = parsePlan(JSON.stringify({ schemaVersion: 'apogee/1', operations: [{ ...base, cycles: [{ kind: 'sideways', startDate: ph.startDate, endDate: ph.endDate }] }] }));
  assert.ok(parsedBad.ok && parsedBad.malformed === 1);
  // le dossier exporté donne les cycles au coach
  const r = derive(d, SETTINGS, new Date('2026-08-30T10:00:00Z'));
  const dossier = buildDossier(d, r, Object.keys(d.actual), new Date('2026-08-30T10:00:00Z'));
  assert.deepEqual(dossier.phases[0].cycles, cyc);
});

test('séance prévue minutée : étapes à plat, superposition sur la courbe réelle, refus si une étape n’est pas au temps', () => {
  const wu = { ...newBlock('WARMUP'), measureValue: 300 };
  const set = { ...newBlock('SET'), setCount: 3, children: [{ ...newBlock('WORK'), measureValue: 60 }, { ...newBlock('RECOVERY'), measureValue: 60 }] };
  const cd = { ...newBlock('COOLDOWN'), measureValue: 120 };
  const steps = timedSteps([wu, set, cd])!;
  assert.equal(steps.length, 8);
  assert.equal(steps.reduce((a, x) => a + x.sec, 0), 300 + 3 * 120 + 120);
  const planned = { id: 'p', updatedAt: 'x', discipline: 'RUN', plannedDate: '2026-10-01', title: null, notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: [wu, set, cd], createdAt: 'x' } as never;
  // 5 min à 3 m/s, 3 × (60 s à 5 m/s + 60 s à 2 m/s), 2 min à 3 m/s ; une mesure par seconde
  const sp: [number, number][] = [], hr: [number, number][] = [];
  let t = 1000;
  const push = (sec: number, v: number, h: number) => { for (let i = 0; i < sec; i++, t++) { sp.push([t, v]); hr.push([t, h]); } };
  push(300, 3, 130); for (let k = 0; k < 3; k++) { push(60, 5, 170); push(60, 2, 140); } push(120, 3, 125);
  const r = overlaySteps(planned, 1000, 780, sp, hr, null, 'RUN')!;
  assert.equal(r.length, 8);
  const works = r.filter((x) => x.kind === 'WORK');
  assert.equal(works.length, 3);
  assert.ok(works.every((w) => Math.abs(w.ms! - 5) < 0.05 && Math.abs(w.avgHr! - 170) < 1));
  assert.equal(works[2].rank, 3);
  assert.equal(overlaySteps(planned, 1000, 1500, sp, hr, null, 'RUN')!.length, 8, 'séance plus longue que le prévu : toutes les étapes prévues sont données');
  const short = overlaySteps(planned, 1000, 400, sp, hr, null, 'RUN')!;
  assert.equal(short.length, 3, 'séance plus courte : les étapes après la fin sont écartées');
  assert.equal(short[2].to - short[2].from, 40, 'la dernière étape est tronquée à la fin de la séance');
  // modification à la main : on inverse l’ordre des deux premières étapes et on raccourcit la première
  const ed = steps.map((_, i) => ({ i, sec: steps[i].sec }));
  [ed[0], ed[1]] = [ed[1], ed[0]]; ed[1] = { i: 0, sec: 120 };
  const r2 = overlaySteps(planned, 1000, 780, sp, hr, null, 'RUN', ed)!;
  assert.equal(r2[0].kind, 'WORK'); assert.equal(r2[1].kind, 'WARMUP'); assert.equal(r2[1].to - r2[1].from, 120);
  assert.equal(overlaySteps(planned, 1000, 780, sp, hr, null, 'RUN', ed.slice(1))!.length, 8, 'une modification qui ne colle plus au prévu est ignorée');
  assert.equal(overlaySteps(planned, 1000, 780, sp, hr, null, 'BIKE'), null, 'autre discipline');
  assert.equal(timedSteps([wu, { ...newBlock('WORK'), measure: 'DISTANCE', measureValue: 1000 }]), null, 'une étape à la distance : pas de découpage');
});

test('natation : la vitesse est reconstruite à partir des distances par longueur, avec les pauses à vitesse nulle', () => {
  // 10 longueurs de 25 m en 25 s (1 m/s), puis une pause de 20 s, puis 5 longueurs en 20 s (1,25 m/s)
  const d: [number, number, number][] = [];
  let t = 100;
  for (let i = 0; i < 10; i++) { d.push([t, t + 25, 25]); t += 25; }
  t += 20;
  for (let i = 0; i < 5; i++) { d.push([t, t + 20, 25]); t += 20; }
  const sp = speedFromDistances(d);
  assert.ok(sp.length >= 30);
  assert.ok(sp.some((p) => p[1] === 0), 'la pause apparaît à vitesse nulle');
  assert.ok(Math.abs(sp[0][1] - 1) < 1e-9 && Math.abs(sp[sp.length - 1][1] - 1.25) < 1e-9);
  const curve = distanceCurve(sp, 375)!;
  assert.ok(Math.abs(distanceAt(curve, 1e9) - 375) < 1e-6);
});

test('coach : le dossier donne le détail du compte rendu (zones de FC, résultat des étapes prévues, correction de l’athlète)', () => {
  const wu = { ...newBlock('WARMUP'), measureValue: 300 };
  const set = { ...newBlock('SET'), setCount: 2, children: [{ ...newBlock('WORK'), measureValue: 60 }, { ...newBlock('RECOVERY'), measureValue: 60 }] };
  const planned = { id: 'p1', updatedAt: 'x', discipline: 'RUN', plannedDate: '2026-10-01', title: 'Fractionné', notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: [wu, set], createdAt: 'x' };
  const t0 = Date.parse('2026-10-01T08:00:00Z') / 1000;
  const hr: [number, number][] = [], sp: [number, number][] = [];
  const push = (from: number, sec: number, v: number, h: number) => { for (let i = 0; i < sec; i++) { hr.push([t0 + from + i, h]); sp.push([t0 + from + i, v]); } };
  push(0, 300, 3, 130); push(300, 60, 5, 170); push(360, 60, 2, 140); push(420, 60, 5, 172); push(480, 60, 2, 141);
  const actual = { id: 'a1', updatedAt: 'x', sourceId: 'g-a1', source: 'health', discipline: 'RUN', rawExerciseType: '56', startAt: new Date(t0 * 1000).toISOString(), endAt: new Date((t0 + 540) * 1000).toISOString(), durationSec: 540, distanceM: 1740, avgHrBpm: 145, maxHrBpm: 175, rpe: 6, comment: null, hasSeries: true, manualPlannedId: 'p1' };
  const d = emptyData();
  (d.planned as Record<string, unknown>).p1 = planned; (d.actual as Record<string, unknown>).a1 = actual;
  (d.series as Record<string, unknown>).a1 = { id: 'a1', updatedAt: 'x', hr, speed: sp };
  const now = new Date('2026-10-02T10:00:00Z');
  const dos = buildDossier(d, derive(d, SETTINGS, now), ['a1'], now);
  const s = dos.recentActualSessions[0] as unknown as Record<string, unknown>;
  assert.equal(s.maxHrBpm, 175);
  const res = s.plannedStepResults as { kind: string; durationSec: number; avgHrBpm: number; paceSec: number }[];
  assert.equal(res.length, 5);
  assert.deepEqual(res.map((x) => x.kind), ['WARMUP', 'WORK', 'RECOVERY', 'WORK', 'RECOVERY']);
  assert.equal(res[1].durationSec, 60); assert.equal(res[1].avgHrBpm, 170); assert.equal(res[1].paceSec, 200);
  assert.equal(s.stepsEditedByAthlete, false);
  // l'athlète a corrigé l'ordre : la première étape devient le premier effort
  (d.actual as Record<string, { stepsEdit?: unknown }>).a1.stepsEdit = [{ i: 1, sec: 60 }, { i: 0, sec: 300 }, { i: 2, sec: 60 }, { i: 3, sec: 60 }, { i: 4, sec: 60 }];
  const dos2 = buildDossier(d, derive(d, SETTINGS, now), ['a1'], now);
  const s2 = dos2.recentActualSessions[0] as unknown as Record<string, unknown>;
  assert.equal(s2.stepsEditedByAthlete, true);
  assert.equal((s2.plannedStepResults as { kind: string }[])[0].kind, 'WORK');
  assert.ok('hrZones' in s && 'watchLaps' in s);
});

// ------------------------------------------------------------------ alimentation
import { buildNutrition, checkPlan, estimateIntensity, intakeText, leadText, nutritionForSession, phaseState, weekShopping, type NutriInput } from '../src/domain/nutrition';
import { DEFAULT_FOODS, carbsOf, resolveBank, sodiumOf } from '../src/domain/foods';

const NB: NutriInput = { discipline: 'RUN', minutes: 60, level: 'moderate', hot: false, weightKg: 75, test: false, laterToday: false, nextDayQuality: false, daysToRace: null, caffeine: false };

test('alimentation : banque par défaut, valeurs par portion et produit ajouté', () => {
  const bank = resolveBank(emptyData());
  assert.equal(bank.length, DEFAULT_FOODS.length);
  const gel = bank.find((f) => f.id === 'd:gel')!;
  assert.ok(carbsOf(gel) > 20 && carbsOf(gel) < 26);
  assert.equal(Math.round(sodiumOf(bank.find((f) => f.id === 'd:salt')!)), 393);
  const d = emptyData();
  (d.foods as Record<string, unknown>).f1 = { id: 'f1', updatedAt: 'x', base: null, category: 'bar', name: 'Ma barre', unit: '1 barre', massG: 50, liquid: false, kcal100: 400, carbs100: 60, protein100: 8, salt100: 0.5, caffeineMg: null, mixed: false };
  (d.foods as Record<string, unknown>).h1 = { id: 'h1', updatedAt: 'x', base: 'd:gel', hidden: true, category: 'drink', name: '', unit: '', massG: 1, liquid: false, kcal100: null, carbs100: 0, protein100: null, salt100: null, caffeineMg: null, mixed: false };
  const b2 = resolveBank(d);
  assert.equal(b2[0].name, 'Ma barre');
  assert.ok(!b2.some((f) => f.id === 'd:gel'));
  // le calcul choisit d'abord le produit de l'athlète dans sa catégorie
  const p = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 180, level: 'moderate' }, b2);
  assert.ok(p.during.shopping.some((x) => x.foodId === 'f1'));
});

test('alimentation : plans de référence du guide', () => {
  // vélo 3 h : 60–65 g/h, boisson + barre, sodium couvert ; une prise chaque 20 min au plus
  const bike = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, daysToRace: 189 }, DEFAULT_FOODS);
  assert.ok(bike.during.carbsPerHActual >= 55 && bike.during.carbsPerHActual <= 66, String(bike.during.carbsPerHActual));
  assert.ok(bike.during.shopping.length >= 2);
  assert.ok(bike.events.filter((e) => e.phase === 'during' && e.id.startsWith('d-') && e.items.length === 0 && e.id !== 'd-drink').length === 0, 'pas de prise vide');
  // natation courte : rien pendant, collation 1 h avant
  const swim = buildNutrition({ ...NB, discipline: 'SWIM', minutes: 35 }, DEFAULT_FOODS);
  assert.equal(swim.during.carbsPerHActual, 0);
  assert.equal(swim.during.shopping.length, 0);
  assert.ok(swim.events.some((e) => e.id === 'b-meal'));
  // musculation : protéines après
  const st = buildNutrition({ ...NB, discipline: 'STRENGTH', minutes: 60 }, DEFAULT_FOODS);
  assert.ok(st.events.some((e) => e.phase === 'after' && e.proteinG > 10));
  // course facile de 40 min : rien à manger pendant
  const easy = buildNutrition({ ...NB, minutes: 40, level: 'easy' }, DEFAULT_FOODS);
  assert.equal(easy.during.shopping.length, 0);
  // caféine seulement si activée
  assert.ok(!buildNutrition({ ...NB, level: 'quality' }, DEFAULT_FOODS).events.some((e) => e.id === 'b-caf'));
  assert.ok(buildNutrition({ ...NB, level: 'quality', caffeine: true }, DEFAULT_FOODS).events.some((e) => e.id === 'b-caf'));
  // chaud : plus de boisson
  const cold = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 120 }, DEFAULT_FOODS), hot = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 120, hot: true }, DEFAULT_FOODS);
  assert.ok((hot.during.fluidPerH?.[0] ?? 0) > (cold.during.fluidPerH?.[0] ?? 0));
  // aucun apport ne dépasse le plafond de 90 g/h
  for (const m of [45, 75, 120, 240, 360]) assert.ok(buildNutrition({ ...NB, discipline: 'BIKE', minutes: m }, DEFAULT_FOODS).during.carbsPerHActual <= 95);
});

test('alimentation : intensité estimée et textes', () => {
  const refs = { vma: 4.5, css: 1.2, ftp: 220, hrMax: 190 } as unknown as Parameters<typeof estimateIntensity>[1];
  const blk = (extra: object) => ({ ...newBlock('WORK'), measure: 'TIME', durationSec: 600, ...extra });
  const hr = estimateIntensity({ discipline: 'RUN', title: null, blocks: [blk({ targetType: 'HR', targetLow: 90, targetHigh: 95, relativeTo: 'HRMAX' })] as never }, refs);
  assert.equal(hr.level, 'quality');
  const easy = estimateIntensity({ discipline: 'RUN', title: 'Footing facile', blocks: [blk({})] as never }, refs);
  assert.equal(easy.level, 'easy');
  assert.equal(leadText(120), '2 h'); assert.equal(leadText(90), '1 h 30'); assert.equal(leadText(45), '45 min');
  const it = (qty: number, name = 'Barre') => intakeText({ foodId: 'x', name, unit: '', qty, amount: 0, liquid: false, carbsG: 0, sodiumMg: 0, proteinG: 0, ml: 0 });
  assert.equal(it(1), 'Barre'); assert.equal(it(0.5), '½ × Barre'); assert.equal(it(1.5), '1½ × Barre'); assert.equal(it(2), '2 × Barre');
});

test('alimentation : modification des aliments, validation, régime, favoris, récupération', () => {
  const bank = DEFAULT_FOODS;
  const base = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, daysToRace: 189 }, bank);
  const c0 = checkPlan(base);
  assert.ok(c0.length >= 3 && c0.every((c) => c.state === 'ok'), JSON.stringify(c0.filter((c) => c.state !== 'ok')));
  // l'athlète remplace le repas d'avant par un seul pain : l'apport devient insuffisant
  const edited = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, daysToRace: 189, edits: { 'b-meal': [{ foodId: 'd:bread', qty: 1 }] } }, bank);
  const meal = edited.events.find((e) => e.id === 'b-meal')!;
  assert.equal(meal.edited, true); assert.equal(meal.items.length, 1);
  assert.equal(checkPlan(edited).find((c) => c.key === 'b-carbs')!.state, 'low');
  assert.equal(phaseState(checkPlan(edited), 'before'), 'low');
  // retirer toute la boisson pendant la séance : les glucides par heure baissent et la liste à emporter suit
  const noDrink = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, daysToRace: 189, edits: { 'd-drink': [] } }, bank);
  assert.ok(noDrink.during.carbsPerHActual < base.during.carbsPerHActual);
  assert.ok(!noDrink.during.shopping.some((x) => x.liquid));
  // produit inconnu ignoré
  const unk = buildNutrition({ ...NB, edits: { 'b-meal': [{ foodId: 'inconnu', qty: 2 }] } }, bank);
  assert.equal(unk.events.find((e) => e.id === 'b-meal')?.items.length ?? 0, 0);
  // récupération rapide : une seule ligne, 4 h ou 2 h
  const fast = buildNutrition({ ...NB, level: 'quality', laterToday: true }, bank);
  const f = fast.events.find((e) => e.id === 'a-fast')!;
  assert.equal(f.times, 2); assert.ok(!fast.events.some((e) => /^a-c\d$/.test(e.id)));
  assert.equal(buildNutrition({ ...NB, level: 'quality', laterToday: true, recovery: 'full' }, bank).events.find((e) => e.id === 'a-fast')!.times, 4);
  // protéines après : dans la fourchette (pas de dépassement)
  const rec = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190 }, bank);
  assert.ok(checkPlan(rec).filter((c) => c.phase === 'after').every((c) => c.state !== 'high'));
  // régime et favoris
  const d = emptyData();
  (d.nutri as Record<string, unknown>).main = { id: 'main', updatedAt: 'x', diet: ['lactose', 'gluten'], favorites: ['d:gel'] };
  const b2 = resolveBank(d);
  assert.ok(!b2.some((x) => ['d:chocmilk', 'd:skyr', 'd:whey', 'd:bread', 'd:pasta', 'd:oats', 'd:bar', 'd:pretzel'].includes(x.id)));
  assert.equal(b2.find((x) => x.id === 'd:gel')!.fav, true);
  const run = buildNutrition({ ...NB, minutes: 100, level: 'moderate' }, b2);
  assert.ok(run.during.shopping.some((x) => x.foodId === 'd:gel'));
});

test('alimentation v3 : intensité, favoris exclusifs, poids daté, liste de courses', () => {
  const bank = DEFAULT_FOODS;
  // l'intensité place les quantités dans la fourchette : facile < modérée < intense
  const mk = (level: 'easy' | 'moderate' | 'quality') => buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, level }, bank);
  const e = mk('easy'), m = mk('moderate'), q = mk('quality');
  assert.ok(e.during.carbsPerHActual <= m.during.carbsPerHActual && m.during.carbsPerHActual <= q.during.carbsPerHActual);
  assert.ok(q.during.carbsPerHActual > e.during.carbsPerHActual || q.before.carbs![0] >= e.before.carbs![0]);
  // favoris : dès qu'il y en a un, seuls les favoris (et le sel) sont utilisés
  const d = emptyData();
  (d.nutri as Record<string, unknown>).main = { id: 'main', updatedAt: 'x', favorites: ['d:gel', 'd:banana'] };
  const fav = resolveBank(d);
  assert.ok(fav.every((x) => x.fav || x.category === 'salt'));
  assert.ok(resolveBank(d, true).length > fav.length);
  const plan = buildNutrition({ ...NB, discipline: 'BIKE', minutes: 190, level: 'moderate' }, fav, resolveBank(d, true));
  const ids = new Set(plan.events.flatMap((x) => x.items.map((i) => i.foodId)));
  for (const id of ids) assert.ok(fav.some((f) => f.id === id), id);
  // poids : la pesée du jour de la séance compte, pas une pesée plus récente
  const blocks = [{ ...newBlock('WORK'), measure: 'TIME' as const, measureValue: 3600 }];
  const rec = (id: string, date: string) => ({ id, updatedAt: 'x', discipline: 'RUN', plannedDate: date, title: null, notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks, createdAt: 'x' });
  const dd = emptyData();
  const P = dd.planned as Record<string, unknown>;
  P.a = rec('a', '2030-03-04'); P.b = rec('b', '2030-03-12');
  const W = dd.weight as Record<string, unknown>;
  W.w1 = { id: 'w1', updatedAt: 'x', day: '2030-03-01', kg: 60, source: 'manual' };
  W.w2 = { id: 'w2', updatedAt: 'x', day: '2030-03-10', kg: 90, source: 'manual' };
  const refs = {} as never;
  const kgA = nutritionForSession(dd, refs, P.a as never, bank, '2030-03-01').plan!.weightKg;
  const kgB = nutritionForSession(dd, refs, P.b as never, bank, '2030-03-01').plan!.weightKg;
  assert.equal(kgA, 60); assert.equal(kgB, 90);
  // deux séances le même jour : seule la première (ordre du calendrier) a la récupération rapide ; plus du tout si l'autre est déjà faite
  const long = [{ ...newBlock('WORK'), measure: 'TIME' as const, measureValue: 10800 }];
  const d2 = emptyData();
  const Q = d2.planned as Record<string, unknown>;
  Q.x = { ...rec('x', '2030-04-01'), discipline: 'BIKE', blocks: long };
  Q.y = { ...rec('y', '2030-04-01'), discipline: 'STRENGTH' };
  const hasFast = (id: string, done?: (i: string) => boolean) => nutritionForSession(d2, refs, Q[id] as never, bank, '2030-03-01', done).plan!.events.some((e) => e.id === 'a-fast');
  assert.equal(hasFast('x'), true); assert.equal(hasFast('y'), false); assert.equal(hasFast('x', (i) => i === 'y'), false);
  // liste de courses : séances à venir de la semaine, sans celles déjà faites
  const all = weekShopping(dd, () => refs, bank, '2030-03-04', '2030-03-04', () => false);
  assert.ok(all.sessions >= 1);
  // la liste de courses est exactement la somme des cartes des séances de la semaine
  const ws = weekShopping(d2, () => refs, bank, '2030-04-01', '2030-04-01', () => false);
  const sum = new Map<string, number>();
  for (const id of ['x', 'y']) {
    const pl = nutritionForSession(d2, refs, Q[id] as never, bank, '2030-04-01').plan!;
    for (const it of [...pl.during.shopping, ...pl.events.filter((e) => e.phase !== 'during').flatMap((e) => e.items.map((i) => ({ ...i, qty: i.qty * (e.times ?? 1) })))]) sum.set(it.foodId, (sum.get(it.foodId) ?? 0) + it.qty);
  }
  for (const l of ws.lines) if (l.units > 0) assert.equal(l.units, Math.ceil((sum.get(l.foodId) ?? 0) - 0.001), l.foodId);
  const none = weekShopping(dd, () => refs, bank, '2030-03-04', '2030-03-04', () => true);
  assert.equal(none.lines.length, 0);
  const past = weekShopping(dd, () => refs, bank, '2030-03-04', '2030-03-06', () => false);
  assert.equal(past.sessions, 0);
});
