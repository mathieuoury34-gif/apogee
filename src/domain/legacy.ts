// Reprise de la base de l'ancienne application Android (fichier `.db` partagé depuis Paramètres › Export).
// Les identifiants d'origine sont conservés : les clés `session:482` / `phase:12` déjà connues du coach
// restent valables. Ce qui est un CACHE dans l'ancienne base (daily_load, charges des séances, estimations
// automatiques de FC max) n'est pas repris : la nouvelle app le recalcule.
import { $t } from '../i18n';
import { readSqlite, type SqlValue } from './sqlite';
import { nowIso } from './ids';
import type { ActualSession, AppData, Athlete, Block, BrickPair, CoachExchange, Interruption, PlannedSession, Race, RestingHr, SessionSeries, SleepNight, TrainingPhase, ZoneReading } from './types';
import { COLLECTIONS, ZONE_KINDS } from './types';

export interface LegacyReport { counts: Record<string, number>; skipped: string[]; lastActual: string | null; lastPlanned: string | null }

const s = (v: SqlValue | undefined): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : String(v));
const n = (v: SqlValue | undefined): number | null => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null);
const json = <T>(v: SqlValue | undefined, fallback: T): T => { try { const t = s(v); return t ? (JSON.parse(t) as T) : fallback; } catch { return fallback; } };

export function emptyData(): AppData {
  const d = { updatedAt: '' } as AppData;
  for (const c of COLLECTIONS) (d as unknown as Record<string, unknown>)[c] = {};
  return d;
}

export function importLegacyDb(bytes: Uint8Array): { data: AppData; report: LegacyReport } {
  const t = readSqlite(bytes);
  const rows = (name: string) => t.get(name)?.rows ?? [];
  if (!t.has('actual_session') || !t.has('planned_session')) throw new Error($t("ce fichier ne ressemble pas à une base Apogée"));
  const now = nowIso();
  const d = emptyData();
  const skipped: string[] = [];

  const a = rows('athlete')[0];
  if (a) {
    const ath: Athlete = { id: 'main', updatedAt: now, displayName: s(a.display_name), birthDate: s(a.birth_date), sex: s(a.sex) === 'F' ? 'F' : s(a.sex) === 'M' ? 'M' : null, availability: json(a.availability, []), equipment: json(a.equipment, []), injuries: json(a.injuries, []) };
    d.athlete.main = ath;
  }
  const races = rows('race').filter((r) => n(r.is_primary) !== 0).sort((x, y) => (n(y.id) ?? 0) - (n(x.id) ?? 0));
  const r0 = races[0];
  if (r0) {
    const race: Race = {
      id: 'main', updatedAt: now, name: s(r0.name) ?? 'Course', raceDate: s(r0.race_date) ?? '', swimDistanceM: n(r0.swim_distance_m), bikeDistanceM: n(r0.bike_distance_m), runDistanceM: n(r0.run_distance_m),
      targetTotalSeconds: n(r0.target_total_seconds), targetSwimSeconds: n(r0.target_swim_seconds), targetBikeSeconds: n(r0.target_bike_seconds), targetRunSeconds: n(r0.target_run_seconds), targetTransitionSeconds: n(r0.target_transition_seconds),
      targetRevisedAt: s(r0.target_revised_at), notes: s(r0.notes),
    };
    d.race.main = race;
  }
  for (const z of rows('zone')) {
    const kind = s(z.kind) as ZoneReading['kind'];
    if (!(ZONE_KINDS as readonly string[]).includes(kind)) { skipped.push($t("relevé ") + kind); continue; }
    const notes = s(z.notes);
    // estimations automatiques de l'ancienne app : recalculées désormais, pas reprises comme saisies
    if (kind === 'hr_max' && s(z.source) === 'estimation' && notes && /^(Pic observé|Estimation de Tanaka)/.test(notes)) continue;
    const id = String(z.id);
    d.zones[id] = { id, updatedAt: now, kind, value: n(z.value) ?? 0, measuredAt: s(z.measured_at) ?? now, source: (s(z.source) as ZoneReading['source']) ?? 'manual', notes };
  }
  for (const p of rows('training_phase')) {
    const id = String(p.id);
    const ph: TrainingPhase = { id, updatedAt: s(p.updated_at) ?? now, label: s(p.label) ?? '', phase: s(p.phase), startDate: s(p.start_date) ?? '', endDate: s(p.end_date) ?? '', intent: s(p.intent), objective: s(p.objective), notes: s(p.notes), idempotencyKey: s(p.idempotency_key), coachExchangeId: p.coach_exchange_id === null ? null : String(p.coach_exchange_id) };
    d.phases[id] = ph;
  }
  // séances prévues + blocs (profondeur 1)
  const blocksBy = new Map<string, Record<string, SqlValue>[]>();
  for (const b of rows('planned_block')) {
    const k = String(b.planned_session_id);
    if (!blocksBy.has(k)) blocksBy.set(k, []);
    blocksBy.get(k)!.push(b);
  }
  const toBlock = (b: Record<string, SqlValue>, children: Block[]): Block => ({
    kind: s(b.kind) as Block['kind'], measure: s(b.measure) as Block['measure'], measureValue: n(b.measure_value), setMode: s(b.set_mode) as Block['setMode'], setCount: n(b.set_count), setWindowS: n(b.set_window_s),
    targetType: (s(b.target_type) as Block['targetType']) ?? 'NONE', targetLow: n(b.target_low), targetHigh: n(b.target_high), relativeTo: s(b.relative_to) as Block['relativeTo'], label: s(b.label), notes: s(b.notes), discipline: s(b.discipline) as Block['discipline'], children,
  });
  for (const p of rows('planned_session')) {
    const id = String(p.id);
    const list = blocksBy.get(id) ?? [];
    const byPos = (x: Record<string, SqlValue>, y: Record<string, SqlValue>) => (n(x.position) ?? 0) - (n(y.position) ?? 0);
    const roots = list.filter((b) => b.parent_block_id === null).sort(byPos);
    const blocks = roots.map((r) => toBlock(r, list.filter((c) => c.parent_block_id !== null && String(c.parent_block_id) === String(r.id)).sort(byPos).map((c) => toBlock(c, []))));
    const ps: PlannedSession = { id, updatedAt: s(p.updated_at) ?? now, discipline: s(p.discipline) as PlannedSession['discipline'], plannedDate: s(p.planned_date) ?? '', title: s(p.title), notes: s(p.notes), origin: s(p.origin) === 'coach' ? 'coach' : 'manual', idempotencyKey: s(p.idempotency_key), coachExchangeId: p.coach_exchange_id === null ? null : String(p.coach_exchange_id), blocks, createdAt: s(p.created_at) ?? now };
    d.planned[id] = ps;
  }
  // ressentis et rattachements manuels
  const fb = new Map<string, Record<string, SqlValue>>();
  for (const f of rows('feedback')) {
    if (f.actual_session_id === null) continue;
    const k = String(f.actual_session_id);
    const cur = fb.get(k);
    if (!cur || (s(f.updated_at) ?? '') > (s(cur.updated_at) ?? '')) fb.set(k, f);
  }
  const manualLink = new Map<string, string | null>();
  for (const l of rows('session_link')) {
    if (s(l.link_type) !== 'manual' || l.actual_session_id === null) continue;
    manualLink.set(String(l.actual_session_id), l.planned_session_id === null ? null : String(l.planned_session_id));
  }
  for (const r of rows('actual_session')) {
    const id = String(r.id);
    const garmin = s(r.garmin_activity_id) ?? 'legacy:' + id;
    const hr = json<[number, number][]>(r.hr_series, []);
    const speed = json<[number, number][]>(r.speed_series, []);
    const f = fb.get(id);
    const raw = s(r.raw_exercise_type);
    const act: ActualSession = {
      id, updatedAt: s(r.updated_at) ?? now, sourceId: garmin, source: raw === 'manual' || garmin.startsWith('manual:') ? 'manual' : 'health',
      discipline: s(r.discipline) as ActualSession['discipline'], rawExerciseType: raw, startAt: s(r.start_at) ?? now, endAt: s(r.end_at) ?? now, zoneOffsetMinutes: n(r.zone_offset_minutes),
      durationSec: n(r.duration_sec) ?? 0, distanceM: n(r.distance_m), activeCaloriesJ: n(r.active_calories_j), totalCaloriesJ: n(r.total_calories_j), elevationGainM: n(r.elevation_gain_m),
      avgHrBpm: n(r.avg_hr_bpm), maxHrBpm: n(r.max_hr_bpm), minHrBpm: n(r.min_hr_bpm), hrCoverageRatio: n(r.hr_coverage_ratio), hrSampleCount: n(r.hr_sample_count), avgSpeedMs: n(r.avg_speed_ms), maxSpeedMs: n(r.max_speed_ms),
      hasSeries: hr.length > 0 || speed.length > 0, edited: [], rpe: f ? n(f.rpe) : null, comment: f ? s(f.comment) : null, ingestedAt: s(r.ingested_at) ?? now,
    };
    if (manualLink.has(id)) act.manualPlannedId = manualLink.get(id)!;
    d.actual[id] = act;
    if (act.hasSeries) { const ser: SessionSeries = { id, updatedAt: now, hr, speed }; d.series[id] = ser; }
  }
  for (const b of rows('brick_pair')) {
    const id = String(b.id);
    const bp: BrickPair = { id, updatedAt: now, firstId: String(b.first_actual_session_id), secondId: String(b.second_actual_session_id), day: s(b.day) ?? '', status: s(b.status) === 'declined' ? 'declined' : 'confirmed' };
    d.bricks[id] = bp;
  }
  for (const i of rows('interruption')) {
    const id = String(i.id);
    const it: Interruption = { id, updatedAt: now, label: s(i.label) ?? '', startDate: s(i.start_date) ?? '', endDate: s(i.end_date) ?? '', reason: (s(i.reason) as Interruption['reason']) ?? 'other', dailyLoadOverride: n(i.daily_load_override), suspendsReminders: n(i.suspends_reminders) !== 0, notes: s(i.notes) };
    d.interruptions[id] = it;
  }
  for (const sl of rows('sleep_night')) {
    const day = s(sl.night_date);
    if (!day) continue;
    const night: SleepNight = { id: day, updatedAt: now, nightDate: day, startAt: s(sl.start_at) ?? '', endAt: s(sl.end_at) ?? '', zoneOffsetMinutes: n(sl.zone_offset_minutes), durationSec: n(sl.duration_sec) ?? 0, sourceId: s(sl.external_id) };
    d.sleep[day] = night;
  }
  for (const rh of rows('resting_hr')) {
    const day = s(rh.day);
    if (!day) continue;
    const r: RestingHr = { id: day, updatedAt: now, day, bpm: n(rh.bpm) ?? 0 };
    d.resting[day] = r;
  }
  for (const e of rows('coach_exchange')) {
    const id = String(e.id);
    const notes = json<{ kind?: string; sessions?: { discipline: string; day: string }[]; created?: []; updated?: []; deleted?: []; rejected?: []; noop?: []; malformedCount?: number } | null>(e.notes, null);
    const ex: CoachExchange = {
      id, updatedAt: now, direction: s(e.direction) === 'export' ? 'export' : 'import', schemaVersion: s(e.exchange_schema_version) ?? 'apogee/1', occurredAt: s(e.occurred_at) ?? now,
      status: s(e.status) === 'rejected' ? 'rejected' : s(e.status) === 'cancelled' ? 'cancelled' : 'applied', operationCount: n(e.operation_count) ?? 0, payloadHash: s(e.payload_hash), planValidUntil: s(e.plan_valid_until), error: s(e.error),
    };
    if (notes?.kind === 'export') ex.exportSessions = notes.sessions ?? [];
    if (notes?.kind === 'import') ex.importSummary = { created: notes.created ?? [], updated: notes.updated ?? [], deleted: notes.deleted ?? [], rejected: notes.rejected ?? [], noop: notes.noop ?? [], malformedCount: notes.malformedCount ?? 0 };
    d.exchanges[id] = ex;
  }
  const overrides = rows('manual_override').length;
  if (overrides) skipped.push(overrides + $t(" correction(s) manuelle(s) de charge quotidienne (jamais utilisées par l’ancienne interface)"));
  d.updatedAt = now;
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) counts[c] = Object.keys(d[c]).length;
  const lastActual = Object.values(d.actual).map((x) => x.startAt).sort().pop() ?? null;
  const lastPlanned = Object.values(d.planned).map((x) => x.plannedDate).sort().pop() ?? null;
  return { data: d, report: { counts, skipped, lastActual, lastPlanned } };
}
