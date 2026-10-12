// Formatage français (règles de PEAnalyze : espace fine insécable pour les milliers, espace insécable
// avant l'unité, signe moins typographique, virgule décimale).
import type { Block, Discipline, PlannedDiscipline } from '../domain/types';

export const NBSP = ' ';
export const MINUS = '−';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number) {
  const k = min + ':' + max;
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max }); cache.set(k, f); }
  return f;
}
export function num(v: number, min = 0, max = min): string {
  const s = nf(min, max).format(Math.abs(v));
  return (v < 0 && Math.abs(v) >= Math.pow(10, -max) / 2 ? MINUS : '') + s;
}
export function signed(v: number, min = 0, max = min): string {
  const r = Math.round(v * Math.pow(10, max));
  return (r > 0 ? '+' : '') + num(v, min, max);
}
export function pct(ratio: number, d = 0): string { return num(ratio * 100, d) + NBSP + '%'; }
export function pctSigned(ratio: number, d = 0): string { const r = Math.round(ratio * 100 * Math.pow(10, d)); return (r > 0 ? '+' : '') + pct(ratio, d); }

// ------------------------------------------------------------------ disciplines
export const DISCIPLINE_LABEL: Record<Discipline, string> = { RUN: 'Course', BIKE: 'Vélo', SWIM: 'Natation', STRENGTH: 'Renforcement', BRICK: 'Enchaînement', OTHER: 'Autre' };
export const DISCIPLINE_SHORT: Record<Discipline, string> = { RUN: 'Course', BIKE: 'Vélo', SWIM: 'Natation', STRENGTH: 'Renfo', BRICK: 'Enchaîn.', OTHER: 'Autre' };
export const DISCIPLINE_ICON: Record<Discipline, string> = { RUN: 'run', BIKE: 'bike', SWIM: 'swim', STRENGTH: 'strength', BRICK: 'brick', OTHER: 'other' };
export const dvar = (d: Discipline) => `var(--d-${d})`;

// ------------------------------------------------------------------ durées, distances, allures
/** « 1 h 05 », « 45 min », « 40 s » */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s === 0) return `0${NBSP}min`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`;
  if (m) return r && m < 10 ? `${m}${NBSP}min${NBSP}${String(r).padStart(2, '0')}` : `${m}${NBSP}min`;
  return `${r}${NBSP}s`;
}
/** « 5h45 » (chrono d'objectif) */
export function hhmm(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
/** Heures décimales : « 12,4 h » */
export function hours(sec: number): string { return num(sec / 3600, 1) + NBSP + 'h'; }

export function km(m: number | null | undefined, d = 1): string {
  if (m === null || m === undefined) return '—';
  if (m < 1000 && d > 0) return num(m, 0) + NBSP + 'm';
  return num(m / 1000, d) + NBSP + 'km';
}
export function distanceFor(m: number | null | undefined, discipline: string): string {
  if (m === null || m === undefined || m <= 0) return '—';
  return discipline === 'SWIM' ? num(m, 0) + NBSP + 'm' : km(m);
}
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** Allure lisible selon la discipline : « 5:12 /km », « 1:52 /100 m », « 28,4 km/h » */
export function paceFor(secPerUnit: number | null, discipline: string): string {
  if (secPerUnit === null || !isFinite(secPerUnit) || secPerUnit <= 0) return '—';
  if (discipline === 'BIKE') return num((discipline === 'BIKE' ? 3600 / secPerUnit : 0), 1) + NBSP + 'km/h';
  return mmss(secPerUnit) + NBSP + (discipline === 'SWIM' ? '/100' + NBSP + 'm' : '/km');
}
export function speedKmh(ms: number | null): string { return ms ? num(ms * 3.6, 1) + NBSP + 'km/h' : '—'; }
export function bpm(v: number | null | undefined): string { return v ? num(v, 0) + NBSP + 'bpm' : '—'; }

// ------------------------------------------------------------------ dates
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const WD_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const WD_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const wd = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();
export const MONTHS_TITLE = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));

export function dateFr(iso: string | null | undefined): string { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
export function dateShort(iso: string): string { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
/** « mardi 13 oct. » */
export function dayLong(iso: string): string { return WEEKDAYS[wd(iso)] + ' ' + +iso.slice(8, 10) + ' ' + MONTHS_SHORT[+iso.slice(5, 7) - 1]; }
export function dayTitle(iso: string): string { const s = dayLong(iso); return s[0].toUpperCase() + s.slice(1); }
/** « 13 oct. » */
export function dayMonth(iso: string): string { return +iso.slice(8, 10) + ' ' + MONTHS_SHORT[+iso.slice(5, 7) - 1]; }
export function monthLong(ym: string): string { return MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
export function monthShort(ym: string): string { return MONTHS_SHORT[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4); }
export function weekdayShort(iso: string): string { return WD_SHORT[(wd(iso) + 6) % 7]; }
export function dateTimeFr(isoDateTime: string): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' à ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
export function timeOf(isoDateTime: string, offsetMin: number | null): string {
  const d = new Date(Date.parse(isoDateTime) + (offsetMin ?? 0) * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
export function parseDateFr(s: string): string {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(s);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : '';
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export function parseNum(s: string): number {
  const t = String(s).replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return NaN;
  const v = Number(t);
  return isFinite(v) ? v : NaN;
}
export function toInput(v: number | null | undefined, d = 0): string {
  if (v === null || v === undefined || !isFinite(v)) return '';
  const s = d ? v.toFixed(d) : String(Math.round(v));
  return s.replace('.', ',');
}
/** « 4:30 » ou « 4'30 » → secondes */
export function parseMmss(s: string): number {
  const m = /^\s*(\d{1,2})\s*[:'’h.]\s*(\d{1,2})\s*$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  const v = parseNum(s);
  return isFinite(v) ? v * 60 : NaN;
}
export function relDays(n: number): string {
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${n}${NBSP}j` : `il y a ${-n}${NBSP}j`;
}

// ------------------------------------------------------------------ blocs (repris de planning/blockText.ts)
export const KIND_LABEL: Record<Block['kind'], string> = { WARMUP: 'Échauffement', WORK: 'Effort', RECOVERY: 'Récup. active', REST: 'Repos', COOLDOWN: 'Retour au calme', TRANSITION: 'Transition', SET: 'Série' };
export const MEASURE_LABEL: Record<NonNullable<Block['measure']>, string> = { TIME: 'Temps', DISTANCE: 'Distance', REPS: 'Répétitions', OPEN: 'Libre' };
export const SETMODE_LABEL: Record<NonNullable<Block['setMode']>, string> = { REPEAT: 'Répétitions', AMRAP: 'AMRAP', EVERY: 'Départ fixe' };
export const TARGET_LABEL: Record<Block['targetType'], string> = { NONE: 'Aucune', ZONE: 'Zone', PACE: 'Allure', SPEED: 'Vitesse', POWER: 'Puissance', HR: 'FC', LOAD: 'Charge', RPE: 'RPE' };
export const REL_LABEL: Record<NonNullable<Block['relativeTo']>, string> = { FTP: 'FTP', VMA: 'VMA', CSS: 'CSS', HRMAX: 'FC max', ONE_RM: '1RM' };

export function measureText(b: Block): string {
  if (b.measure === null) return '';
  if (b.measure === 'OPEN') return 'libre';
  if (b.measureValue === null) return '';
  if (b.measure === 'TIME') return duration(b.measureValue);
  if (b.measure === 'DISTANCE') return b.measureValue >= 1000 ? km(b.measureValue) : num(b.measureValue, 0) + NBSP + 'm';
  return num(b.measureValue, 0) + NBSP + 'rép.';
}

function targetDigits(v: number, b: Block): string {
  if (b.relativeTo !== null) return num(v, 0);
  switch (b.targetType) {
    case 'PACE': return mmss(v);
    case 'SPEED': return num(v * 3.6, 1);
    case 'LOAD': return num(v, 1);
    default: return num(v, 0);
  }
}
export function targetText(b: Block, d: PlannedDiscipline): string {
  if (b.targetType === 'NONE' || b.targetLow === null) return '';
  const eff = b.discipline ?? d;
  const unit = b.relativeTo !== null ? '%' + NBSP + REL_LABEL[b.relativeTo]
    : b.targetType === 'PACE' ? (eff === 'SWIM' ? '/100' + NBSP + 'm' : '/km')
      : b.targetType === 'SPEED' ? 'km/h' : b.targetType === 'POWER' ? 'W' : b.targetType === 'HR' ? 'bpm' : b.targetType === 'LOAD' ? 'kg' : '';
  const prefix = b.relativeTo === null && (b.targetType === 'ZONE' || b.targetType === 'RPE') ? TARGET_LABEL[b.targetType] + ' ' : b.relativeTo !== null ? TARGET_LABEL[b.targetType] === 'Aucune' ? '' : TARGET_LABEL[b.targetType].toLowerCase() + ' ' : '';
  const digits = targetDigits(b.targetLow, b) + (b.targetHigh !== null ? '–' + targetDigits(b.targetHigh, b) : '');
  return (prefix + digits + (unit ? NBSP + unit : '')).trim();
}
export function blockHead(b: Block): string {
  if (b.kind === 'SET') {
    const w = b.setWindowS !== null ? duration(b.setWindowS) : '';
    const h = b.setMode === 'AMRAP' ? `AMRAP ${w}` : b.setMode === 'EVERY' ? `${b.setCount ?? '?'} × départ toutes les ${w}` : `${b.setCount ?? '?'} ×`;
    return (b.label ? h + ' — ' + b.label : h).trim();
  }
  return b.label ? KIND_LABEL[b.kind] + ' — ' + b.label : KIND_LABEL[b.kind];
}
export function blockDetail(b: Block, d: PlannedDiscipline): string {
  return [measureText(b), targetText(b, d)].filter(Boolean).join(' · ');
}
/** Résumé d'une ligne : « 10 min · 4 × (400 m · 4:00 /km + 1 min 30) · 10 min » */
export function blocksSummary(blocks: Block[], d: PlannedDiscipline): string {
  return blocks.map((b) => {
    if (b.kind === 'SET') return `${b.setMode === 'AMRAP' ? 'AMRAP' : (b.setCount ?? '?') + ' ×'} (${b.children.map((c) => [measureText(c), targetText(c, d)].filter(Boolean).join(' ')).join(' + ')})`;
    return [measureText(b), targetText(b, d)].filter(Boolean).join(' ');
  }).filter(Boolean).join(' · ');
}

/** Types de bloc de périodisation (vocabulaire libre du coach ; les valeurs connues sont traduites). */
export const PHASE_TYPES: [string, string][] = [['base', 'Foncier'], ['build', 'Développement'], ['peak', 'Spécifique'], ['taper', 'Affûtage'], ['recovery', 'Récupération'], ['race', 'Course'], ['transition', 'Transition']];
export const phaseLabel = (p: string | null | undefined) => (p ? (Object.fromEntries(PHASE_TYPES) as Record<string, string>)[p] ?? p : '');
