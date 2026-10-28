// Données Health Connect « annexes » : dépense énergétique du jour, VO₂max et variabilité cardiaque (HRV) quand la montre
// les dépose. Lecture seule ; chaque jour n'est réécrit que si la valeur a changé.
import { localDay, today } from './dates';
import type { AppData, EnergyDay, Vitals } from './types';
import { nowIso } from './ids';

export interface NativeEnergyDay { day: string; activeKcal: number | null; totalKcal: number | null }
export interface NativeVo2 { id: string; time: string; zoneOffsetSeconds: number | null; value: number }
export interface NativeHrv { id: string; time: string; zoneOffsetSeconds: number | null; ms: number }

const r1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));

export interface NativeActivityDay { day: string; steps?: number | null; floors?: number | null }

/** Jours à écrire : calories (actives, totales) puis pas et étages, fusionnés par jour ; un jour n'est réécrit que si une valeur a changé. */
export function ingestEnergy(data: AppData, rows: NativeEnergyDay[], activity: NativeActivityDay[] = []): EnergyDay[] {
  const out: EnergyDay[] = [];
  const now = nowIso();
  const days = new Map<string, { e?: NativeEnergyDay; a?: NativeActivityDay }>();
  for (const r of rows) days.set(r.day, { ...days.get(r.day), e: r });
  for (const a of activity) days.set(a.day, { ...days.get(a.day), a });
  for (const [day, { e, a }] of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today()) continue;
    const cur = data.energy[day] && !data.energy[day].deleted ? data.energy[day] : undefined;
    const active = e ? r1(e.activeKcal) : cur?.activeKcal ?? null, total = e ? r1(e.totalKcal) : cur?.totalKcal ?? null;
    const steps = a && a.steps !== undefined ? r1(a.steps) : cur?.steps ?? null, floors = a && a.floors !== undefined ? r1(a.floors) : cur?.floors ?? null;
    if (!active && !total && !steps && !floors) continue;
    if (cur && cur.activeKcal === active && cur.totalKcal === total && (cur.steps ?? null) === steps && (cur.floors ?? null) === floors) continue;
    out.push({ id: day, updatedAt: now, day, activeKcal: active, totalKcal: total, steps, floors, source: 'health' });
  }
  return out;
}

export function ingestVitals(data: AppData, vo2: NativeVo2[], hrv: NativeHrv[]): Vitals[] {
  const byDay = new Map<string, { vo2: { t: string; v: number } | null; hrv: number[] }>();
  const slot = (day: string) => { let s = byDay.get(day); if (!s) byDay.set(day, (s = { vo2: null, hrv: [] })); return s; };
  for (const v of vo2) if (v.value > 10 && v.value < 100) { const s = slot(localDay(v.time, v.zoneOffsetSeconds == null ? 0 : v.zoneOffsetSeconds / 60)); if (!s.vo2 || v.time > s.vo2.t) s.vo2 = { t: v.time, v: v.value }; }
  for (const h of hrv) if (h.ms > 0 && h.ms < 400) slot(localDay(h.time, h.zoneOffsetSeconds == null ? 0 : h.zoneOffsetSeconds / 60)).hrv.push(h.ms);
  const out: Vitals[] = [];
  const now = nowIso();
  for (const [day, s] of byDay) {
    const vo2max = s.vo2 ? Math.round(s.vo2.v * 10) / 10 : null;
    const hrvMs = s.hrv.length ? Math.round(s.hrv.reduce((a, b) => a + b, 0) / s.hrv.length) : null;
    const cur = data.vitals[day];
    if (cur && !cur.deleted && cur.vo2max === vo2max && cur.hrvMs === hrvMs) continue;
    out.push({ id: day, updatedAt: now, day, vo2max, hrvMs });
  }
  return out;
}
