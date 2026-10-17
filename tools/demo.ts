// Jeu de données de démonstration (captures d'écran, essais) : 17 semaines d'entraînement fictives mais
// plausibles, séries cardio, nuits, FC de repos, plan coach, périodisation. N'est jamais embarqué dans l'app.
// Usage : node --import tsx tools/demo.ts > tools/demo.json   (paires [clé IndexedDB, enregistrement])
import { addDays, dayRange } from '../src/domain/dates';
import { newBlock } from '../src/domain/blocks';
import type { ActualDiscipline, AppData, Block, PlannedDiscipline } from '../src/domain/types';
import { emptyData } from '../src/domain/legacy';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const TODAY = process.argv[2] || '2026-10-12';
const START = addDays(TODAY, -7 * 17);
const d: AppData = emptyData();
const now = TODAY + 'T06:00:00.000Z';
let idc = 1000;
const id = () => String(++idc);

d.athlete.main = { id: 'main', updatedAt: now, displayName: 'Mathieu', birthDate: '1991-04-18', sex: 'M', availability: ['mon', 'tue', 'wed', 'thu', 'sat', 'sun'], equipment: ['Home trainer', 'Piscine 25 m', 'Capteur de puissance'], injuries: [{ id: 'inj1', label: 'Gêne tendon d’Achille droit', date: '2026-08-02', notes: null, resolved: true }] };
d.race.main = { id: 'main', updatedAt: now, name: 'Ironman 70.3 Aix-en-Provence', raceDate: '2027-05-23', swimDistanceM: 1900, bikeDistanceM: 90000, runDistanceM: 21097, targetTotalSeconds: 5 * 3600 + 45 * 60, targetSwimSeconds: 38 * 60, targetBikeSeconds: 3 * 3600, targetRunSeconds: 1 * 3600 + 55 * 60, targetTransitionSeconds: 10 * 60, targetRevisedAt: '2026-09-01T10:00:00.000Z', notes: null };
const zone = (kind: 'vma' | 'ftp' | 'css' | 'hr_max', value: number, day: string, source: 'test' | 'estimation' | 'manual' = 'test') => { const i = id(); d.zones[i] = { id: i, updatedAt: now, kind, value, measuredAt: day + 'T10:00:00.000Z', source, notes: null }; };
zone('vma', 16.8 / 3.6, '2026-06-20'); zone('vma', 17.4 / 3.6, '2026-09-12');
zone('ftp', 232, '2026-06-27'); zone('ftp', 248, '2026-09-20');
zone('css', 100 / 108, '2026-07-04'); zone('css', 100 / 104, '2026-09-26', 'estimation');
zone('hr_max', 188, '2026-06-20');
const phase = (label: string, ph: string, s: string, e: string, intent: string, objective: string | null) => { const i = id(); d.phases[i] = { id: i, updatedAt: now, label, phase: ph, startDate: s, endDate: e, intent, objective, notes: null, idempotencyKey: null, coachExchangeId: 'x1' }; };
phase('Reprise', 'base', START, '2026-07-26', 'Retrouver la régularité dans les trois sports', null);
phase('Foncier 1', 'base', '2026-07-27', '2026-09-06', 'Construire le volume en endurance fondamentale', '3 sorties vélo de plus de 3 h');
phase('Développement 1', 'build', '2026-09-07', '2026-11-01', 'Monter le seuil vélo et l’allure course', 'FTP ≥ 255 W');
phase('Récupération', 'recovery', '2026-11-02', '2026-11-15', 'Assimiler le bloc', null);
const intr = id();
d.interruptions[intr] = { id: intr, updatedAt: now, label: 'Vacances en Bretagne', reason: 'travel', startDate: '2026-08-10', endDate: '2026-08-16', dailyLoadOverride: null, suspendsReminders: true, notes: null };

const RAW: Record<ActualDiscipline, string> = { RUN: '56', BIKE: '8', SWIM: '74', STRENGTH: '70', OTHER: '79' };
function session(day: string, disc: ActualDiscipline, min: number, opts: { km?: number; hr?: number; rpe?: number | null; hour?: number; series?: boolean; comment?: string } = {}) {
  const i = id();
  const start = new Date(day + 'T' + String(opts.hour ?? 7).padStart(2, '0') + ':' + String(Math.floor(rnd() * 50)).padStart(2, '0') + ':00.000Z');
  const dur = Math.round(min * 60);
  const end = new Date(start.getTime() + dur * 1000);
  const avg = opts.hr ?? null;
  const withSeries = opts.series !== false && avg !== null && day < TODAY;
  d.actual[i] = {
    id: i, updatedAt: now, sourceId: 'garmin-' + i, source: 'health', discipline: disc, rawExerciseType: RAW[disc], startAt: start.toISOString(), endAt: end.toISOString(), zoneOffsetMinutes: 120,
    durationSec: dur, distanceM: opts.km ? Math.round(opts.km * 1000) : null, activeCaloriesJ: Math.round(min * 11 * 4184), totalCaloriesJ: null, elevationGainM: disc === 'BIKE' ? Math.round(opts.km! * 6) : disc === 'RUN' ? Math.round(opts.km! * 4) : null,
    avgHrBpm: avg, maxHrBpm: avg ? avg + 18 + Math.round(rnd() * 8) : null, minHrBpm: avg ? 95 : null, hrCoverageRatio: withSeries ? 0.99 : null, hrSampleCount: withSeries ? Math.round(dur / 5) : null,
    avgSpeedMs: opts.km ? (opts.km * 1000) / dur : null, maxSpeedMs: null, hasSeries: withSeries, edited: [], rpe: opts.rpe === undefined ? null : opts.rpe, comment: opts.comment ?? null, ingestedAt: end.toISOString(),
  };
  if (withSeries) {
    const hr: [number, number][] = [];
    const t0 = Math.floor(start.getTime() / 1000);
    let v = avg! - 25;
    for (let t = 0; t <= dur; t += 5) {
      const target = avg! + (t / dur - 0.5) * 8 + (disc === 'RUN' && min < 60 && t > dur * 0.3 && t < dur * 0.8 ? (Math.floor(t / 240) % 2 ? 10 : -6) : 0);
      v += (target - v) * 0.06 + (rnd() - 0.5) * 2.4;
      hr.push([t0 + t, Math.round(v)]);
    }
    const speed: [number, number][] = [];
    if (opts.km && disc !== 'STRENGTH') {
      const v0 = (opts.km * 1000) / dur;
      // vitesse en m/s toutes les 5 s, ondulation déterministe (pas de tirage : la graine des autres données ne bouge pas)
      for (let t = 0; t <= dur; t += 5) speed.push([t0 + t, Math.max(0.3, v0 * (1 + 0.06 * Math.sin(t / 240) + (disc === 'RUN' && min < 60 && t > dur * 0.3 && t < dur * 0.8 ? (Math.floor(t / 240) % 2 ? 0.18 : -0.08) : 0)))]);
    }
    d.series[i] = { id: i, updatedAt: now, hr, speed };
  }
  return d.actual[i];
}
const B = (p: Partial<Block>): Block => ({ ...newBlock(p.kind ?? 'WORK'), ...p });
function planned(day: string, disc: PlannedDiscipline, title: string, blocks: Block[], notes: string | null = null) {
  const i = id();
  d.planned[i] = { id: i, updatedAt: now, discipline: disc, plannedDate: day, title, notes, origin: 'coach', idempotencyKey: null, coachExchangeId: 'x1', blocks, createdAt: now };
  return d.planned[i];
}
const plans = {
  swim: () => [B({ kind: 'WARMUP', measure: 'DISTANCE', measureValue: 400, label: 'Échauffement crawl' }), B({ kind: 'SET', setMode: 'REPEAT', setCount: 8, children: [B({ measure: 'DISTANCE', measureValue: 100, targetType: 'PACE', targetLow: 105, targetHigh: 110 }), B({ kind: 'REST', measure: 'TIME', measureValue: 20 })] }), B({ measure: 'DISTANCE', measureValue: 600, label: 'Pull-buoy', targetType: 'RPE', targetLow: 5 }), B({ kind: 'COOLDOWN', measure: 'DISTANCE', measureValue: 200 })],
  runInt: () => [B({ kind: 'WARMUP', measureValue: 900, label: 'Footing' }), B({ kind: 'SET', setMode: 'REPEAT', setCount: 6, children: [B({ measure: 'TIME', measureValue: 180, targetType: 'SPEED', targetLow: 90, relativeTo: 'VMA' }), B({ kind: 'RECOVERY', measure: 'TIME', measureValue: 120 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })],
  bike: (min: number) => [B({ kind: 'WARMUP', measureValue: 900 }), B({ measure: 'TIME', measureValue: (min - 25) * 60, targetType: 'ZONE', targetLow: 2, label: 'Endurance' }), B({ kind: 'COOLDOWN', measureValue: 600 })],
  bikeSweet: () => [B({ kind: 'WARMUP', measureValue: 900 }), B({ kind: 'SET', setMode: 'REPEAT', setCount: 3, children: [B({ measure: 'TIME', measureValue: 720, targetType: 'POWER', targetLow: 88, targetHigh: 93, relativeTo: 'FTP' }), B({ kind: 'RECOVERY', measure: 'TIME', measureValue: 300 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })],
  run: (min: number) => [B({ measure: 'TIME', measureValue: min * 60, targetType: 'HR', targetLow: 135, targetHigh: 148, label: 'Endurance fondamentale' })],
  strength: () => [B({ kind: 'WARMUP', measureValue: 480, label: 'Mobilité' }), B({ kind: 'SET', setMode: 'REPEAT', setCount: 3, children: [B({ measure: 'REPS', measureValue: 12, label: 'Squat gobelet', targetType: 'LOAD', targetLow: 16 }), B({ measure: 'REPS', measureValue: 10, label: 'Fentes' }), B({ measure: 'TIME', measureValue: 45, label: 'Gainage' })] })],
  brick: () => [B({ measure: 'TIME', measureValue: 5400, discipline: 'BIKE', label: 'Vélo tempo', targetType: 'ZONE', targetLow: 3 }), B({ kind: 'TRANSITION', measure: 'OPEN' }), B({ measure: 'TIME', measureValue: 1500, discipline: 'RUN', label: 'Course allure IM' })],
};

const days = dayRange(START, addDays(TODAY, 13));
let w = 0;
for (const day of days) {
  const wd = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  if (wd === 0) w++;
  const past = day < TODAY;
  const inTravel = day >= '2026-08-10' && day <= '2026-08-16';
  const block = w % 4 === 0 ? 0.7 : 1 + (w % 4) * 0.08;
  const vol = Math.min(1.35, 0.75 + w * 0.035) * block;
  // nuits et FC de repos
  if (day <= TODAY) {
    const sleep = Math.round((7.1 + (rnd() - 0.5) * 1.6 + (wd >= 5 ? 0.4 : 0)) * 3600);
    d.sleep[day] = { id: day, updatedAt: now, nightDate: day, startAt: addDays(day, -1) + 'T21:40:00.000Z', endAt: day + 'T05:30:00.000Z', zoneOffsetMinutes: 120, durationSec: sleep, sourceId: null };
    d.resting[day] = { id: day, updatedAt: now, day, bpm: Math.round(49 + (rnd() - 0.5) * 4 - Math.min(4, w * 0.2) + (day === addDays(TODAY, -1) ? 3 : 0)) };
  }
  if (day <= TODAY) {
    // poids (déterministe)
    if (wd % 2 === 0) d.weight[day] = { id: day, updatedAt: now, day, kg: Math.round((75.2 - w * 0.06 + 0.35 * Math.sin(wd + w)) * 10) / 10, source: 'health' };
  }
  if (inTravel) { if (past && wd === 3) session(day, 'RUN', 40, { km: 7.2, hr: 141, rpe: 4, comment: 'Footing en bord de mer' }); continue; }
  const plan: [PlannedDiscipline, string, Block[], () => void][] = [];
  const skip = rnd() < 0.06;
  if (wd === 0) plan.push(['SWIM', 'Technique + 8×100', plans.swim(), () => session(day, 'SWIM', 55 * vol, { km: 2.4 * vol, hr: 132, rpe: 5, hour: 6 })]);
  if (wd === 1) plan.push(['RUN', 'Fractionné 6×3 min', plans.runInt(), () => session(day, 'RUN', 55, { km: 10.6, hr: 158, rpe: pick([7, 7, 8]), hour: 18 })]);
  if (wd === 2) plan.push(['BIKE', 'Sweet spot 3×12', plans.bikeSweet(), () => session(day, 'BIKE', 80, { km: 38, hr: 145, rpe: 6, hour: 18 })]);
  if (wd === 3) { plan.push(['RUN', 'Footing', plans.run(45), () => session(day, 'RUN', 45 * vol, { km: 8.4 * vol, hr: 142, rpe: 4, hour: 7 })]); plan.push(['STRENGTH', 'Renforcement', plans.strength(), () => session(day, 'STRENGTH', 35, { hr: 112, rpe: 5, hour: 19, series: false })]); }
  if (wd === 4) { /* repos */ }
  if (wd === 5) {
    if (w % 3 === 2) plan.push(['BRICK', 'Enchaînement vélo-course', plans.brick(), () => { session(day, 'BIKE', 92, { km: 46, hr: 148, rpe: 7, hour: 8 }); session(day, 'RUN', 26, { km: 5.1, hr: 156, rpe: 7, hour: 10 }); }]);
    else plan.push(['BIKE', 'Sortie longue', plans.bike(Math.round(150 * vol)), () => session(day, 'BIKE', 150 * vol, { km: 72 * vol, hr: 138, rpe: 6, hour: 8 })]);
  }
  if (wd === 6) plan.push(['RUN', 'Sortie longue', plans.run(Math.round(80 * vol)), () => session(day, 'RUN', 80 * vol, { km: 15 * vol, hr: 144, rpe: pick([5, 6, null]), hour: 9 })]);
  for (const [disc, title, blocks, done] of plan) {
    if (day >= addDays(TODAY, -21)) planned(day, disc, title, blocks);
    if (past && !skip) done();
  }
}
// la dernière séance n'a pas encore son ressenti ; une séance « Autre »
const last = Object.values(d.actual).sort((a, b) => (a.startAt < b.startAt ? 1 : -1))[0];
last.rpe = null;
session(addDays(TODAY, -9), 'OTHER', 120, { hr: 108, rpe: 3, hour: 14, comment: 'Randonnée' });
const ex = 'x1';
d.exchanges[ex] = { id: ex, updatedAt: now, direction: 'import', schemaVersion: 'apogee/1', occurredAt: addDays(TODAY, -22) + 'T19:12:00.000Z', status: 'applied', operationCount: 18, payloadHash: 'demo', planValidUntil: addDays(TODAY, 13), importSummary: { created: [], updated: [], deleted: [], rejected: [], noop: [], malformedCount: 0 }, error: null };

const out: [string, unknown][] = [];
for (const [c, recs] of Object.entries(d)) { if (c === 'updatedAt') continue; for (const [k, v] of Object.entries(recs as Record<string, unknown>)) out.push([c + '/' + k, v]); }
process.stdout.write(JSON.stringify(out));
