// Roulettes de l'éditeur de bloc : durée, distance, répétitions et chaque sorte d'intensité.
// Les valeurs sont manipulées dans une unité entière d'affichage (secondes, dixièmes de km/h, dixièmes de kg, watts, bpm, %…) ;
// `toDisp` / `fromDisp` font le lien avec ce que stocke le bloc (m/s pour la vitesse, kg pour la charge).
import { $t } from '../i18n';
import { DurationWheel, IntWheel, SplitWheel, WheelField } from './kit';
import { NBSP, mmss, parseNum, toInput } from './format';
import type { Block, PlannedDiscipline } from '../domain/types';
export { defaultDisp, fromDisp, toDisp } from './targetUnits';

type Type = Block['targetType'];
/** Roulette de ce qui termine un bloc. */
export function MeasureWheel({ measure, value, onChange, discipline }: { measure: 'TIME' | 'DISTANCE' | 'REPS'; value: number; onChange: (v: number) => void; discipline: PlannedDiscipline | 'OTHER' }) {
  if (measure === 'TIME') return <DurationWheel value={value} onChange={onChange} label={$t("Durée")} />;
  if (measure === 'REPS') return <IntWheel value={value} onChange={onChange} label={$t("Répétitions")} min={1} max={100} unit={$t("rép.")} />;
  return <SplitWheel value={value} onChange={onChange} label={$t("Distance")} base={1000} hiMax={99} hiUnit="km" loUnit="m" loStep={discipline === 'SWIM' ? 25 : 10} loPad={1} />;
}

/** Roulette d'une valeur d'intensité (valeur ou borne). */
export function TargetWheel({ type, rel, value, onChange, label }: { type: Type; rel: Block['relativeTo']; value: number; onChange: (v: number) => void; label: string }) {
  if (rel !== null) return <IntWheel value={value} onChange={onChange} label={label} min={10} max={250} unit="%" />;
  switch (type) {
    case 'ZONE': return <IntWheel value={value} onChange={onChange} label={label} min={1} max={5} unit={$t("zone")} />;
    case 'RPE': return <IntWheel value={value} onChange={onChange} label={label} min={1} max={10} unit="/10" />;
    case 'HR': return <IntWheel value={value} onChange={onChange} label={label} min={30} max={230} unit="bpm" />;
    case 'PACE': return <SplitWheel value={value} onChange={onChange} label={label} base={60} hiMax={19} hiUnit="min" loUnit="s" />;
    case 'SPEED': return <SplitWheel value={value} onChange={onChange} label={label} base={10} hiMax={90} hiUnit="," loUnit={NBSP + 'km/h'} loPad={1} />;
    case 'POWER': return <SplitWheel value={value} onChange={onChange} label={label} base={100} hiMax={20} hiUnit="" loUnit="W" loStep={5} />;
    case 'LOAD': return <SplitWheel value={value} onChange={onChange} label={label} base={10} hiMax={300} hiUnit="," loUnit={NBSP + 'kg'} loStep={5} loPad={1} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ champs à roulette en fenêtre pop-up (valeur affichée, un appui ouvre la roulette)
// Une valeur absente vaut `null` : la case affiche « — » et, si `clearable`, un bouton « Effacer » la remet à vide.
const DASH = '—';
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Durée en texte : h:mm:ss, h:mm ou m:ss selon les colonnes affichées. */
export function durText(sec: number, hours = true, seconds = true): string {
  const v = Math.max(0, Math.round(sec));
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = v % 60;
  if (hours && seconds) return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  if (hours) return `${h}:${pad2(m)}`;
  return `${Math.floor(v / 60)}:${pad2(s)}`;
}

interface FieldBase<T> { label: string; value: T | null; onChange: (v: T | null) => void; clearable?: boolean }

export function DurationField({ label, value, onChange, clearable, hours = true, seconds = true, initial = 0 }: FieldBase<number> & { hours?: boolean; seconds?: boolean; initial?: number }) {
  return <WheelField<number> label={label} value={value ?? initial} onChange={onChange} text={value === null ? DASH : durText(value, hours, seconds)} onClear={clearable && value !== null ? () => onChange(null) : undefined}
    wheel={(d, set) => <DurationWheel value={d} onChange={set} label={label} hours={hours} seconds={seconds} />} />;
}

/** Heure du jour (HH:MM), en secondes depuis minuit : deux roulettes, heures et minutes. */
export function ClockField({ label, value, onChange, initial = 0 }: { label: string; value: number | null; onChange: (v: number) => void; initial?: number }) {
  const text = (v: number) => pad2(Math.floor(v / 3600) % 24) + ':' + pad2(Math.floor((v % 3600) / 60));
  return <WheelField<number> label={label} value={value ?? initial} onChange={onChange} text={value === null ? DASH : text(value)}
    wheel={(d, set) => <DurationWheel value={d} onChange={set} label={label} hours seconds={false} />} />;
}

export function IntField({ label, value, onChange, clearable, min, max, step = 1, unit = '', initial }: FieldBase<number> & { min: number; max: number; step?: number; unit?: string; initial?: number }) {
  return <WheelField<number> label={label} value={value ?? initial ?? min} onChange={onChange} text={value === null ? DASH : String(value) + (unit ? NBSP + unit : '')} onClear={clearable && value !== null ? () => onChange(null) : undefined}
    wheel={(d, set) => <IntWheel value={d} onChange={set} label={label} min={min} max={max} step={step} unit={unit} />} />;
}

/** Nombre à `decimals` décimales (km, kg, VO₂max, km/h…) : unités puis dixièmes (ou centièmes). */
export function DecField({ label, value, onChange, clearable, unit = '', hiMax = 99, decimals = 1, initial = 0 }: FieldBase<number> & { unit?: string; hiMax?: number; decimals?: number; initial?: number }) {
  const base = 10 ** decimals;
  return <WheelField<number> label={label} value={Math.round((value ?? initial) * base)} onChange={(t) => onChange(t / base)} text={value === null ? DASH : toInput(value, decimals) + (unit ? NBSP + unit : '')} onClear={clearable && value !== null ? () => onChange(null) : undefined}
    wheel={(d, set) => <SplitWheel value={d} onChange={set} label={label} base={base} hiMax={hiMax} hiUnit="," loUnit={unit ? NBSP + unit : ''} loPad={decimals} />} />;
}

/** Distance en mètres, à la roulette « km » + « m ». */
export function DistanceField({ label, value, onChange, clearable, hiMax = 99, loStep = 10, initial = 0, meters = false }: FieldBase<number> & { hiMax?: number; loStep?: number; initial?: number; meters?: boolean }) {
  const text = value === null ? DASH : meters ? Math.round(value).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, NBSP) + NBSP + 'm' : toInput(value / 1000, value % 1000 === 0 ? 0 : value % 100 === 0 ? 1 : 2) + NBSP + 'km';
  return <WheelField<number> label={label} value={value ?? initial} onChange={onChange} text={text} onClear={clearable && value !== null ? () => onChange(null) : undefined}
    wheel={(d, set) => <SplitWheel value={d} onChange={set} label={label} base={1000} hiMax={hiMax} hiUnit="km" loUnit="m" loStep={loStep} loPad={1} />} />;
}

/** Allure en secondes par km (ou par 100 m) : minutes + secondes. */
export function PaceField({ label, value, onChange, clearable, unit = '/km', initial = 300 }: FieldBase<number> & { unit?: string; initial?: number }) {
  return <WheelField<number> label={label} value={value ?? initial} onChange={onChange} text={value === null ? DASH : mmss(value) + NBSP + unit} onClear={clearable && value !== null ? () => onChange(null) : undefined}
    wheel={(d, set) => <SplitWheel value={d} onChange={set} label={label} base={60} hiMax={19} hiUnit="min" loUnit="s" />} />;
}

/** Texte saisi (« 12,5 ») → nombre, ou null s'il est vide ou illisible. */
export const numOf = (s: string): number | null => { const v = parseNum(s); return Number.isFinite(v) ? v : null; };

/** Texte d'une durée, d'une distance ou d'un nombre de répétitions de bloc. */
function measureText(measure: 'TIME' | 'DISTANCE' | 'REPS', v: number): string {
  if (measure === 'TIME') return durText(v);
  if (measure === 'REPS') return v + NBSP + $t("rép.");
  return toInput(v / 1000, v % 1000 === 0 ? 0 : v % 100 === 0 ? 1 : 2) + NBSP + 'km';
}
/** Ce qui termine un bloc : la case affiche la valeur, un appui ouvre la roulette. */
export function MeasureField({ measure, value, onChange, discipline }: { measure: 'TIME' | 'DISTANCE' | 'REPS'; value: number; onChange: (v: number) => void; discipline: PlannedDiscipline | 'OTHER' }) {
  const label = measure === 'TIME' ? $t("Durée") : measure === 'REPS' ? $t("Répétitions") : $t("Distance");
  return <WheelField<number> label={label} value={value} onChange={onChange} text={measureText(measure, value)} wheel={(d, set) => <MeasureWheel measure={measure} value={d} onChange={set} discipline={discipline} />} />;
}

/** Texte d'une valeur d'intensité (dans l'unité d'affichage de la roulette). */
export function targetText(type: Type, rel: Block['relativeTo'], v: number, swim = false): string {
  if (rel !== null) return v + NBSP + '%';
  switch (type) {
    case 'ZONE': return $t("Zone") + NBSP + v;
    case 'RPE': return v + '/10';
    case 'HR': return v + NBSP + 'bpm';
    case 'PACE': return mmss(v) + NBSP + (swim ? '/100' + NBSP + 'm' : '/km');
    case 'SPEED': return toInput(v / 10, 1) + NBSP + 'km/h';
    case 'POWER': return v + NBSP + 'W';
    case 'LOAD': return toInput(v / 10, 1) + NBSP + 'kg';
    default: return '—';
  }
}
/** Valeur (ou borne) d'intensité d'un bloc. */
export function TargetField({ type, rel, value, onChange, label, swim }: { type: Type; rel: Block['relativeTo']; value: number; onChange: (v: number) => void; label: string; swim?: boolean }) {
  return <WheelField<number> label={label} value={value} onChange={onChange} text={targetText(type, rel, value, swim)} wheel={(d, set) => <TargetWheel type={type} rel={rel} value={d} onChange={set} label={label} />} />;
}
