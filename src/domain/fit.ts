// Export d'une séance prévue en fichier d'entraînement structuré .FIT (montre Garmin).
// Le fichier décrit les étapes (durée ou distance, cible d'allure / de puissance / de FC, répétitions) :
// copié en USB dans GARMIN/NewFiles (ou GARMIN/Workouts) de la montre, il apparaît dans Entraînement › Séances. Garmin Connect (site) ne l'importe pas : « Importer des données » ne prend que des séances faites.
// Format : FIT SDK (en-tête 14 octets, messages file_id / workout / workout_step, CRC-16). Aucune bibliothèque.
import type { RefValues } from './blocks';
import type { Block, PlannedDiscipline, PlannedSession } from './types';

// ------------------------------------------------------------------ constantes du profil FIT
const FIT_EPOCH_OFFSET = 631065600; // 1989-12-31T00:00:00Z en secondes Unix
const T = { enum: 0x00, uint8: 0x02, uint16: 0x84, uint32: 0x86, string: 0x07, uint32z: 0x8c } as const;
const SPORT: Record<string, number> = { RUN: 1, BIKE: 2, SWIM: 5, STRENGTH: 10 };
const SUB_SPORT: Record<string, number> = { RUN: 0, BIKE: 0, SWIM: 17 /* lap_swimming */, STRENGTH: 20 };
const DUR = { time: 0, distance: 1, open: 5, repeat: 6, reps: 29 } as const;
const TGT = { speed: 0, hr: 1, open: 2, power: 4 } as const;
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4, interval: 5, other: 6 } as const;
export const FIT_MAX_STEPS = 50;

// ------------------------------------------------------------------ CRC-16 FIT
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
export function fitCrc(bytes: Uint8Array | number[], start = 0, end = bytes.length, crc = 0): number {
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

// ------------------------------------------------------------------ étapes
export interface FitStep {
  name: string;
  durationType: number;
  durationValue: number;
  targetType: number;
  targetValue: number;
  low: number;
  high: number;
  intensity: number;
}
export interface FitWorkout { name: string; discipline: 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH'; steps: FitStep[]; warnings: string[] }

const INTENSITY_OF: Record<string, number> = { WARMUP: INTENSITY.warmup, WORK: INTENSITY.active, RECOVERY: INTENSITY.recovery, REST: INTENSITY.rest, COOLDOWN: INTENSITY.cooldown, TRANSITION: INTENSITY.other };

/** Fenêtre de ± 3 % quand la cible n'est qu'une valeur. */
const WINDOW = 0.03;
function range(low: number, high: number | null): [number, number] {
  if (high !== null && high > 0 && high !== low) return low < high ? [low, high] : [high, low];
  return [low * (1 - WINDOW), low * (1 + WINDOW)];
}

/** Cible FIT d'un bloc : vitesse (mm/s), puissance (W + 1000), FC (bpm + 100) ; sinon ouverte. */
function targetOf(b: Block, d: PlannedDiscipline | null, refs: RefValues, warnings: string[]): { type: number; low: number; high: number } {
  const open = { type: TGT.open, low: 0, high: 0 };
  if ((b.targetType === 'NONE' && !b.relativeTo) || b.targetLow === null || b.targetLow <= 0) return open;
  if (b.targetType === 'PACE' || b.targetType === 'SPEED' || (b.targetType === 'NONE' && b.relativeTo !== null)) {
    // vitesse minimale et maximale : une allure basse (secondes) est une vitesse haute
    let lo: number | null = null, hi: number | null = null;
    if (b.relativeTo === null) {
      const unit = d === 'SWIM' ? 100 : 1000;
      const [a, c] = range(b.targetLow, b.targetHigh);
      if (b.targetType === 'PACE') { lo = unit / c; hi = unit / a; } else { lo = a; hi = c; }
    } else {
      const ref = b.relativeTo === 'VMA' ? refs.vma : b.relativeTo === 'CSS' ? refs.css : null;
      if (ref) { const [a, c] = range(b.targetLow, b.targetHigh); lo = (ref * a) / 100; hi = (ref * c) / 100; }
    }
    if (lo === null || hi === null) { warnings.push('cible d’allure sans référence connue : étape ouverte'); return open; }
    return { type: TGT.speed, low: Math.round(lo * 1000), high: Math.round(hi * 1000) };
  }
  if (b.targetType === 'POWER') {
    const [a, c] = range(b.targetLow, b.targetHigh);
    const k = b.relativeTo === 'FTP' ? (refs.ftp ? refs.ftp / 100 : null) : 1;
    if (k === null) { warnings.push('cible de puissance en % de la FTP sans FTP connue : étape ouverte'); return open; }
    return { type: TGT.power, low: Math.round(a * k) + 1000, high: Math.round(c * k) + 1000 };
  }
  if (b.targetType === 'HR') {
    const [a, c] = range(b.targetLow, b.targetHigh);
    const k = b.relativeTo === 'HRMAX' ? (refs.hrMax ? refs.hrMax / 100 : null) : 1;
    if (k === null) { warnings.push('cible de FC en % de la FC max sans FC max connue : étape ouverte'); return open; }
    return { type: TGT.hr, low: Math.round(a * k) + 100, high: Math.round(c * k) + 100 };
  }
  // ZONE, LOAD, RPE : pas d'équivalent exact dans le fichier ; l'étape reste ouverte
  if (b.targetType !== 'NONE') warnings.push('cible « ' + b.targetType + ' » non transmissible : étape ouverte');
  return open;
}

function stepName(b: Block, fallback: string): string {
  return (b.label || fallback).replace(/\s+/g, ' ').trim();
}
const KIND_NAME: Record<string, string> = { WARMUP: 'Échauffement', WORK: 'Effort', RECOVERY: 'Récupération', REST: 'Repos', COOLDOWN: 'Retour au calme', TRANSITION: 'Transition' };

function pushBlocks(blocks: Block[], d: PlannedDiscipline | null, refs: RefValues, out: FitStep[], warnings: string[]): void {
  for (const b of blocks) {
    const bd = b.discipline ?? d;
    if (b.kind === 'SET') {
      if (b.setMode === 'AMRAP') {
        if (b.setWindowS === null) { warnings.push('AMRAP sans durée ignoré'); continue; }
        out.push({ name: stepName(b, 'AMRAP'), durationType: DUR.time, durationValue: b.setWindowS * 1000, targetType: TGT.open, targetValue: 0, low: 0, high: 0, intensity: INTENSITY.active });
        continue;
      }
      const first = out.length;
      pushBlocks(b.children, bd, refs, out, warnings);
      const n = b.setCount ?? 1;
      if (out.length > first && n > 1) out.push({ name: stepName(b, 'Répéter'), durationType: DUR.repeat, durationValue: first, targetType: TGT.open, targetValue: n, low: 0, high: 0, intensity: INTENSITY.active });
      continue;
    }
    const tg = targetOf(b, bd, refs, warnings);
    let dt: number = DUR.open, dv = 0;
    if (b.measure === 'TIME' && b.measureValue !== null) { dt = DUR.time; dv = Math.round(b.measureValue * 1000); }
    else if (b.measure === 'DISTANCE' && b.measureValue !== null) { dt = DUR.distance; dv = Math.round(b.measureValue * 100); }
    else if (b.measure === 'REPS' && b.measureValue !== null) { dt = DUR.reps; dv = Math.round(b.measureValue); }
    out.push({ name: stepName(b, KIND_NAME[b.kind] ?? 'Étape'), durationType: dt, durationValue: dv, targetType: tg.type, targetValue: 0, low: tg.low, high: tg.high, intensity: INTENSITY_OF[b.kind] ?? INTENSITY.active });
  }
}

/** Séance prévue → un ou plusieurs entraînements (un BRICK donne un fichier par discipline : une montre ne lit qu'un sport par entraînement). */
export function toFitWorkouts(p: PlannedSession, refs: RefValues): FitWorkout[] {
  const title = p.title || { RUN: 'Course', BIKE: 'Vélo', SWIM: 'Natation', STRENGTH: 'Renforcement', BRICK: 'Enchaînement' }[p.discipline];
  const groups: { d: 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH'; blocks: Block[] }[] = [];
  if (p.discipline === 'BRICK') {
    let cur: 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | null = null;
    for (const b of p.blocks) {
      if (b.kind === 'TRANSITION') { cur = null; continue; }
      const bd = (b.discipline && b.discipline !== 'BRICK' ? b.discipline : null) as 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | null;
      const dd: 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | null = bd ?? cur;
      if (!dd) continue;
      if (!groups.length || groups[groups.length - 1].d !== dd || cur === null) groups.push({ d: dd, blocks: [] });
      groups[groups.length - 1].blocks.push(b);
      cur = dd;
    }
  } else groups.push({ d: p.discipline, blocks: p.blocks });
  const SUFFIX = { RUN: 'course', BIKE: 'vélo', SWIM: 'natation', STRENGTH: 'renfo' };
  return groups.map((g) => {
    const warnings: string[] = [];
    const steps: FitStep[] = [];
    pushBlocks(g.blocks, g.d, refs, steps, warnings);
    if (steps.length > FIT_MAX_STEPS) warnings.push(`${steps.length} étapes : les montres Garmin en acceptent environ ${FIT_MAX_STEPS}`);
    return { name: groups.length > 1 ? `${title} — ${SUFFIX[g.d]}` : title, discipline: g.d, steps, warnings };
  });
}

// ------------------------------------------------------------------ encodage binaire
class Writer {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u32(v: number) { this.u16(v & 0xffff); this.u16(Math.floor(v / 65536) & 0xffff); }
  str(s: string, size: number) {
    const enc = new TextEncoder().encode(s);
    let n = Math.min(enc.length, size - 1);
    while (n > 0 && (enc[n] & 0xc0) === 0x80) n--; // ne coupe pas un caractère UTF-8 en deux
    for (let i = 0; i < size; i++) this.u8(i < n ? enc[i] : 0);
  }
}
type Field = [number, number, number]; // numéro, taille, type de base
function definition(w: Writer, local: number, global: number, fields: Field[]) {
  w.u8(0x40 | local); w.u8(0); w.u8(0); w.u16(global); w.u8(fields.length);
  for (const [n, size, t] of fields) { w.u8(n); w.u8(size); w.u8(t); }
}

const NAME_SIZE = 32, STEP_SIZE = 20;

export function encodeFit(wk: FitWorkout, now: Date = new Date()): Uint8Array {
  const body = new Writer();
  // file_id : fichier d'entraînement ; fabricant « développement » (255)
  definition(body, 0, 0, [[0, 1, T.enum], [1, 2, T.uint16], [2, 2, T.uint16], [3, 4, T.uint32z], [4, 4, T.uint32]]);
  body.u8(0); body.u8(5); body.u16(255); body.u16(0); body.u32(0x0a90ee01); body.u32(Math.floor(now.getTime() / 1000) - FIT_EPOCH_OFFSET);
  // workout
  definition(body, 1, 26, [[4, 1, T.enum], [6, 2, T.uint16], [8, NAME_SIZE, T.string], [11, 1, T.enum]]);
  body.u8(1); body.u8(SPORT[wk.discipline]); body.u16(wk.steps.length); body.str(wk.name, NAME_SIZE); body.u8(SUB_SPORT[wk.discipline]);
  // workout_step
  definition(body, 2, 27, [[254, 2, T.uint16], [0, STEP_SIZE, T.string], [1, 1, T.enum], [2, 4, T.uint32], [3, 1, T.enum], [4, 4, T.uint32], [5, 4, T.uint32], [6, 4, T.uint32], [7, 1, T.enum]]);
  wk.steps.forEach((s, i) => {
    body.u8(2); body.u16(i); body.str(s.name, STEP_SIZE); body.u8(s.durationType); body.u32(s.durationValue);
    body.u8(s.targetType); body.u32(s.targetValue); body.u32(s.low); body.u32(s.high); body.u8(s.intensity);
  });
  const head = new Writer();
  head.u8(14); head.u8(0x20); head.u16(2132); head.u32(body.bytes.length);
  for (const c of '.FIT') head.u8(c.charCodeAt(0));
  head.u16(fitCrc(head.bytes, 0, 12));
  const all = [...head.bytes, ...body.bytes];
  const crc = fitCrc(all, 0, all.length);
  all.push(crc & 0xff, crc >> 8);
  return Uint8Array.from(all);
}

/** Nom de fichier sûr (8 caractères suffisent à la montre, mais elle accepte plus long). */
export function fitFileName(name: string, day: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'seance';
  return `${day}-${base}.fit`;
}
