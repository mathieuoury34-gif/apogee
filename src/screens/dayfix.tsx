// Correction d'un jour d'après Garmin Connect : pas, étages, calories, sommeil. Le même éditeur sert les boutons « Saisir / Modifier »
// des cartes (une ou deux parties) et le formulaire du point de la semaine (les quatre). Seules les valeurs changées sont écrites ;
// une valeur saisie n'est plus écrasée par la montre, et « Rétablir » la lui rend.
import { $t } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { ClockField } from '../ui/wheels';
import { useCalc } from '../data/store';
import { dayEnergy } from '../domain/energy';
import { resetEnergyDay, resetSleepNight, saveEnergyDay, saveSleepNight, type EnergyEdit } from '../data/actions';
import type { EnergyPart } from '../domain/types';
import { dateFr, NBSP, timeOf } from '../ui/format';
import type { Snapshot } from '../data/actions';

export type FixPart = EnergyPart | 'sleep';

const intOf = (t: string | undefined): number | null => { const x = (t ?? '').trim(); if (!x) return null; const v = Number(x.replace(',', '.').replace(/[\s  ]/g, '')); return Number.isFinite(v) ? Math.round(v) : NaN; };
const clockSec = (iso: string, off: number | null) => { const [h, m] = timeOf(iso, off).split(':').map(Number); return h * 3600 + m * 60; };
const hhmm = (sec: number) => Math.floor(sec / 3600) + NBSP + 'h' + String(Math.round((sec % 3600) / 60)).padStart(2, '0');

export function useDayFix(day0: string, parts: FixPart[], pick = false) {
  const { data, d } = useCalc();
  const [day, setDay] = useState(day0);
  const cur = data.energy[day] && !data.energy[day].deleted ? data.energy[day] : null;
  const e = dayEnergy(data, day);
  const night = data.sleep[day] && !data.sleep[day].deleted ? data.sleep[day] : null;
  const [f, setF] = useState<Record<string, string>>({});
  const [bed, setBed] = useState<number | null>(null);
  const [wake, setWake] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setTouched(false); setBed(null); setWake(null);
    const en = dayEnergy(data, day);
    const c = data.energy[day] && !data.energy[day].deleted ? data.energy[day] : null;
    setF({ steps: c?.steps ? String(c.steps) : '', floors: c?.floors ? String(c.floors) : '', active: en.active !== null ? String(Math.round(en.active)) : '', total: en.total !== null ? String(Math.round(en.total)) : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  const has = (p: FixPart) => parts.includes(p);
  const steps = intOf(f.steps), floors = intOf(f.floors), active = intOf(f.active), total = intOf(f.total);
  const kcalBad = has('kcal') && ((active === null) !== (total === null) || (active !== null && total !== null && (Number.isNaN(active) || Number.isNaN(total) || active < 0 || total < 100 || total > 12000 || active > total)));
  const bedS = bed ?? (night ? clockSec(night.startAt, night.zoneOffsetMinutes) : 23 * 3600);
  const wakeS = wake ?? (night ? clockSec(night.endAt, night.zoneOffsetMinutes) : 7 * 3600);
  const durS = bedS <= wakeS ? wakeS - bedS : 86400 - bedS + wakeS;
  const sleepEdited = has('sleep') && (bed !== null || wake !== null);
  const sleepBad = sleepEdited && (durS < 3600 || durS > 16 * 3600);
  const bad = (has('steps') && steps !== null && (Number.isNaN(steps) || steps < 0 || steps > 100000)) || (has('floors') && floors !== null && (Number.isNaN(floors) || floors < 0 || floors > 600)) || kcalBad || sleepBad;
  const patch: EnergyEdit = {};
  if (has('steps') && steps !== null && !Number.isNaN(steps) && steps !== (cur?.steps ?? null)) patch.steps = steps;
  if (has('floors') && floors !== null && !Number.isNaN(floors) && floors !== (cur?.floors ?? null)) patch.floors = floors;
  if (has('kcal') && !kcalBad && active !== null && total !== null && (active !== Math.round(e.active ?? -1) || total !== Math.round(e.total ?? -1))) { patch.activeKcal = active; patch.totalKcal = total; }
  const changed = Object.keys(patch).length > 0 || (sleepEdited && !sleepBad);
  /** Écrit les valeurs changées ; renvoie les instantanés à rétablir pour annuler. */
  const save = (): Snapshot[] => {
    const snaps: Snapshot[] = [];
    if (Object.keys(patch).length) snaps.push(saveEnergyDay(day, patch));
    if (sleepEdited && !sleepBad) snaps.push(saveSleepNight(day, bedS, wakeS, night?.zoneOffsetMinutes ?? -new Date().getTimezoneOffset()));
    return snaps;
  };
  const handParts = (cur?.edited ?? []).filter((p) => parts.includes(p));
  const sleepHand = has('sleep') && !!night?.edited;
  const canReset = handParts.length > 0 || sleepHand;
  const reset = (): Snapshot[] => {
    const snaps: Snapshot[] = [];
    if (handParts.length) snaps.push(resetEnergyDay(day, handParts));
    if (sleepHand) snaps.push(resetSleepNight(day));
    return snaps;
  };
  const num2 = (label: string, k: string, unit: string) => (
    <label className="field"><span className="lbl">{label}</span><input className="input" inputMode="numeric" value={f[k] ?? ''} placeholder={unit} aria-label={label} onChange={(ev) => { setTouched(true); setF({ ...f, [k]: ev.target.value }); }} /></label>
  );
  const node: ReactNode = (
    <div className="stack" style={{ gap: 'var(--space-16)' }}>
      {pick
        ? <label className="field"><span className="lbl">{$t("Jour à corriger")}</span><input className="input" type="date" value={day} max={d.today} onChange={(ev) => { const v = ev.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= d.today) setDay(v); }} /></label>
        : <span className="t-strong">{day === d.today ? $t("Aujourd’hui") : dateFr(day)}</span>}
      {(has('steps') || has('floors')) && (
        <div className="grid-2">
          {has('steps') && num2($t("Pas"), 'steps', 'pas')}
          {has('floors') && num2($t("Étages"), 'floors', $t("étages"))}
        </div>
      )}
      {has('kcal') && (
        <>
          <div className="grid-2">
            {num2($t("Calories actives"), 'active', 'kcal')}
            {num2($t("Calories totales"), 'total', 'kcal')}
          </div>
          {kcalBad && touched && <span className="t-caption" style={{ color: 'var(--critical-text)' }}>{$t("Renseigne les deux, avec des actives inférieures au total.")}</span>}
        </>
      )}
      {has('sleep') && (
        <>
          <span className="lbl">{$t("Nuit du réveil de ce jour")}</span>
          <div className="grid-2">
            <div className="field"><span className="lbl">{$t("Coucher")}</span><ClockField label={$t("Coucher")} value={bedS} onChange={setBed} /></div>
            <div className="field"><span className="lbl">{$t("Lever")}</span><ClockField label={$t("Lever")} value={wakeS} onChange={setWake} /></div>
          </div>
          <span className="t-caption c-neutral">{sleepBad ? $t("Durée improbable : entre 1 h et 16 h.") : $t("Durée : {0}", { 0: hhmm(durS) })}{!night && !sleepEdited ? ' · ' + $t("Pas de nuit lue : règle le coucher et le lever pour la saisir.") : ''}</span>
        </>
      )}
      <span className="t-caption c-neutral">{$t("Recopie ce qu’affiche Garmin Connect. Une valeur saisie n’est plus écrasée par la montre.")}</span>
    </div>
  );
  return { day, node, bad, changed, save, canReset, reset };
}
