// Recommandations d'alimentation avant / pendant / après une séance prévue — algorithme du guide nutrition du 11/11/2026
// (consensus ACSM / Académie de nutrition / Diététiciens du Canada 2016, Jeukendrup 2014 ; le sodium en mg/h est une règle de terrain).
// Tout est recalculé à l'affichage, rien n'est stocké : les séances passées ont donc aussi leurs recommandations.
import { $t } from '../i18n';
import { estimateDuration } from './blocks';
import type { RefValues } from './blocks';
import { addDays } from './dates';
import { carbsOf, foodName, foodUnit, mlOf, NA_PER_SALT_G, proteinOf, resolveBank, sodiumOf, type BankFood } from './foods';
import { liveRecords } from './load';
import { FOOD_CATEGORIES, type AppData, type Block, type PlannedDiscipline, type PlannedSession } from './types';

export type Level = 'easy' | 'moderate' | 'quality';
export const REF_KG = 75;

// ------------------------------------------------------------------ intensité estimée
export interface IntensityGuess { level: Level; basis: string; source: 'targets' | 'structure' | 'title' | 'default' }

const flat = (blocks: Block[]): Block[] => blocks.flatMap((b) => (b.kind === 'SET' ? flat(b.children) : [b]));
const mid = (b: Block): number | null => (b.targetLow === null ? null : b.targetHigh !== null ? (b.targetLow + b.targetHigh) / 2 : b.targetLow);
const pct = (r: number) => Math.round(r * 100) + ' %';

/** Niveau d'un bloc d'après sa cible (0 facile, 1 soutenu, 2 intense = seuil et au-delà) ; null si la cible ne dit rien. */
export function blockLevel(b: Block, disc: PlannedDiscipline, refs: RefValues): { n: 0 | 1 | 2; basis: string } | null {
  const v = mid(b);
  if (v === null || v <= 0) return null;
  const eff = b.discipline ?? disc;
  switch (b.targetType) {
    case 'ZONE': return { n: v <= 2.5 ? 0 : v < 3.5 ? 1 : 2, basis: $t("zone {0}", { 0: Math.round(v) }) };
    case 'RPE': return { n: v <= 4 ? 0 : v < 7 ? 1 : 2, basis: $t("RPE {0}", { 0: Math.round(v) }) };
    case 'HR': {
      const r = b.relativeTo === 'HRMAX' ? v / 100 : refs.hrMax ? v / refs.hrMax : null;
      return r === null ? null : { n: r < 0.78 ? 0 : r < 0.86 ? 1 : 2, basis: $t("FC ≈ {0} de ta FC max", { 0: pct(r) }) };
    }
    case 'POWER': {
      const r = b.relativeTo === 'FTP' ? v / 100 : refs.ftp ? v / refs.ftp : null;
      return r === null ? null : { n: r < 0.75 ? 0 : r < 0.9 ? 1 : 2, basis: $t("puissance ≈ {0} de ta FTP", { 0: pct(r) }) };
    }
    case 'PACE': case 'SPEED': {
      if (eff === 'SWIM') {
        const ms = b.relativeTo === null ? (b.targetType === 'PACE' ? 100 / v : v) : null;
        const r = b.relativeTo === 'CSS' ? v / 100 : ms && refs.css ? ms / refs.css : null;
        return r === null ? null : { n: r < 0.93 ? 0 : r < 0.99 ? 1 : 2, basis: $t("allure ≈ {0} de ta vitesse de CSS", { 0: pct(r) }) };
      }
      if (eff === 'RUN' || eff === 'BRICK') {
        const ms = b.relativeTo === null ? (b.targetType === 'PACE' ? 1000 / v : v) : null;
        const r = b.relativeTo === 'VMA' ? v / 100 : ms && refs.vma ? ms / refs.vma : null;
        return r === null ? null : { n: r < 0.72 ? 0 : r < 0.85 ? 1 : 2, basis: $t("allure ≈ {0} de ta VMA", { 0: pct(r) }) };
      }
      return null;
    }
    default: return null;
  }
}

const QUALITY_TITLE = /seuil|threshold|vma|fraction|interval|tempo|test|css|ftp|comp[ée]tition|course\b|race|piste|côtes?|cotes?/i;
const EASY_TITLE = /facile|footing|r[ée]cup|endurance|souplesse|d[ée]contraction|zone ?2|z2|\bef\b|aérobie|aerobie/i;

/** Estime l'intensité d'une séance prévue : cibles des blocs de travail (FC, zone, allure, puissance, RPE), sinon structure en intervalles, sinon titre. */
export function estimateIntensity(p: Pick<PlannedSession, 'blocks' | 'discipline' | 'title'>, refs: RefValues): IntensityGuess {
  const work = flat(p.blocks).filter((b) => b.kind === 'WORK' || (b.kind !== 'WARMUP' && b.kind !== 'COOLDOWN' && b.kind !== 'RECOVERY' && b.kind !== 'REST' && b.kind !== 'TRANSITION'));
  let best: { n: 0 | 1 | 2; basis: string } | null = null;
  for (const b of work) { const l = blockLevel(b, p.discipline, refs); if (l && (!best || l.n > best.n)) best = l; }
  if (best) return { level: (['easy', 'moderate', 'quality'] as const)[best.n], basis: $t("d’après la cible : {0}", { 0: best.basis }), source: 'targets' };
  const hasIntervals = p.blocks.some((b) => b.kind === 'SET' && (b.setCount ?? 1) >= 2 && b.children.some((c) => c.kind === 'WORK') && b.children.some((c) => c.kind === 'RECOVERY' || c.kind === 'REST'));
  if (hasIntervals) return { level: 'quality', basis: $t("séance en intervalles, sans cible chiffrée"), source: 'structure' };
  const t = p.title ?? '';
  if (QUALITY_TITLE.test(t)) return { level: 'quality', basis: $t("d’après le titre de la séance"), source: 'title' };
  if (EASY_TITLE.test(t)) return { level: 'easy', basis: $t("d’après le titre de la séance"), source: 'title' };
  return { level: 'easy', basis: $t("aucune cible : estimée facile (à corriger si besoin)"), source: 'default' };
}

// ------------------------------------------------------------------ entrées et sorties du calcul
export interface NutriInput {
  discipline: PlannedDiscipline;
  minutes: number;
  level: Level;
  hot: boolean;
  weightKg: number;
  /** Séance de test (même repas à chaque test). */
  test: boolean;
  /** Une autre séance prévue plus tard le même jour (reprise rapide < 8 h). */
  laterToday: boolean;
  /** Séance de qualité le lendemain. */
  nextDayQuality: boolean;
  daysToRace: number | null;
  caffeine: boolean;
  /** Récupération rapide : complète (4 h, guide) ou allégée (2 h). */
  recovery?: 'full' | 'light';
  /** Aliments choisis par l'athlète (identifiant du moment → liste). */
  edits?: Record<string, { foodId: string; qty: number }[]>;
}

/** `qty` = nombre de portions (voir `unit`) ; `amount` = quantité totale en g ou ml ; `liquid` pour un liquide. */
export interface Intake { foodId: string; name: string; unit: string; qty: number; amount: number; liquid: boolean; carbsG: number; sodiumMg: number; proteinG: number; ml: number }
export type Range = [number, number];

/** Moment du plan (avant, pendant, après) : `atMin` = minutes depuis le début de la séance (négatif avant). */
export interface NutriEvent {
  id: string;
  phase: 'before' | 'during' | 'after';
  atMin: number;
  /** Fin de la fenêtre (minutes depuis le début), pour « entre 3 h et 2 h avant ». */
  toMin?: number;
  title: string;
  items: Intake[];
  /** Texte libre (eau, pesée…), quand il n'y a pas d'aliment précis. */
  text?: string;
  /** Clé de la cloche de rappel (si ce moment peut être notifié). */
  bell?: string;
  /** Nombre de fois (récupération rapide : toutes les heures, 4 fois). */
  times?: number;
  /** Aliments choisis par l'athlète à la place du calcul. */
  edited?: boolean;
  carbsG: number;
  proteinG: number;
}

export interface NutriPlan {
  minutes: number;
  level: Level;
  weightKg: number;
  /** Poids de référence utilisé par les règles (75 kg tant que le poids ne s'écarte pas de plus de 3 kg). */
  rulesKg: number;
  before: { carbs: Range | null; fluidMl: Range | null; atMin: Range | null; caffeineMg: number | null };
  during: { carbsPerH: Range | null; fluidPerH: Range | null; sodiumPerH: Range | null; carbsPerHActual: number; sodiumPerHActual: number; fluidPerHPlanned: number; totalCarbs: number; shopping: Intake[]; intervalMin: number | null; cappedBy: string | null };
  after: { fast: boolean; carbsPerH: Range | null; hours: number; carbs: Range | null; protein: Range | null };
  events: NutriEvent[];
  notes: string[];
}

const round5 = (v: number) => Math.round(v / 5) * 5;
const lerp = (a: number, b: number) => (a + b) / 2;
const scale = (g: number, w: number) => round5((g * w) / REF_KG);

function intake(f: BankFood, qty: number, withSodium = true): Intake {
  return { foodId: f.id, name: foodName(f), unit: foodUnit(f), qty, amount: f.massG * qty, liquid: f.liquid, carbsG: carbsOf(f) * qty, sodiumMg: withSodium ? sodiumOf(f) * qty : 0, proteinG: proteinOf(f) * qty, ml: mlOf(f) * qty };
}
const sum = (xs: Intake[], k: 'carbsG' | 'sodiumMg' | 'proteinG' | 'ml') => xs.reduce((a, x) => a + x[k], 0);
const maxQty = (f: BankFood) => { const c = carbsOf(f); return f.liquid ? 4 : c < 12 ? 6 : c < 20 ? 3 : 2; };
/** Produits qui se mangent en moitiés (une barre en deux, une demi-banane) : les prises sont plus fréquentes et plus simples. */
const splittable = (f: BankFood) => f.category === 'bar' || f.id === 'd:banana';
/** Produits qu'on ne mange pas pendant l'effort (risque d'étouffement) : fruits secs en mélange, fruits à coque, graines. */
export const chokeRisk = (f: Pick<BankFood, 'name'>) => /fruits?\s+secs?|m[eé]lange.*(sec|noix|fruit)|noix|amande|noisette|cacahu[eè]te|cajou|pistache|pignon|graines/i.test(f.name);
/** Charge qu'un cycliste peut porter en boisson (bidons + poche). */
export const BIKE_CARRY_ML = 1600;
interface FillOpts { max?: (f: BankFood) => number; half?: boolean; tol?: number }

/** Remplit `target` g de glucides avec les produits de `list` (dans l'ordre) : le premier pour environ 60 %, les suivants pour le reste. Quantités entières. */
function fill(target: number, list: BankFood[], maxItems = 3, firstShare = 0.6, o: FillOpts = {}): Intake[] {
  const out: Intake[] = [];
  let rem = target;
  for (const f of list) {
    if (out.length >= maxItems || rem < 5) break;
    const c = carbsOf(f);
    if (c < 3) continue;
    const ideal = (out.length === 0 ? rem * firstShare : rem) / c;
    const halves = !!o.half && splittable(f);
    let n = halves ? Math.round(ideal * 2) / 2 : Math.round(ideal);
    if (out.length === 0) n = Math.max(halves ? 0.5 : 1, n);
    n = Math.min(n, (o.max ?? maxQty)(f));
    if (n < (halves ? 0.5 : 1) || c * n > rem + (o.tol ?? 0.25) * c) continue;
    out.push(intake(f, n));
    rem -= c * n;
  }
  return out;
}
/** Comme `fill`, mais quand le pain de mie et le miel sont tous deux disponibles, le miel apporte environ le double de glucides du pain (jamais moins). Le reste est complété avec les autres produits. */
function fillWithHoney(target: number, list: BankFood[], maxItems = 3, firstShare = 0.6, o: FillOpts = {}): Intake[] {
  const bread = list.find((f) => f.id === 'd:bread'), honey = list.find((f) => f.id === 'd:honey');
  if (!bread || !honey || maxItems < 2) return fill(target, list, maxItems, firstShare, o);
  const others = list.filter((f) => f !== bread && f !== honey);
  const cb = carbsOf(bread), ch = carbsOf(honey);
  const pairT = others.length && maxItems > 2 ? target * 0.85 : target;
  // trop peu de glucides pour du pain avec le double de miel : du miel seul (jamais plus de pain que de miel)
  if (pairT < cb + 1.6 * ch) {
    const nH = Math.min(6, Math.round(pairT / ch));
    if (nH < 1) return fill(target, others, maxItems, firstShare, o);
    const honeyOnly = [intake(honey, nH)];
    const r = target - sum(honeyOnly, 'carbsG');
    return [...honeyOnly, ...(r >= 5 && maxItems > 1 ? fill(r, others, maxItems - 1, firstShare, o) : [])];
  }
  let best: { nB: number; nH: number; score: number } | null = null;
  for (let nB = 1; nB <= 4; nB++) for (let nH = 1; nH <= 6; nH++) {
    const ratio = (ch * nH) / (cb * nB);
    if (ratio < 1.2) continue;
    const score = Math.abs(cb * nB + ch * nH - pairT) / pairT + Math.abs(ratio - 2) / 2;
    if (!best || score < best.score) best = { nB, nH, score };
  }
  if (!best) return fill(target, list, maxItems, firstShare, o);
  const pair = [intake(bread, best.nB), intake(honey, best.nH)];
  const rem = target - sum(pair, 'carbsG');
  return [...pair, ...(rem >= 5 && maxItems > 2 ? fill(rem, others, maxItems - 2, firstShare, o) : [])];
}
/** Même chose pour les protéines : à chaque tour, le produit (1 ou 2 portions) qui se rapproche le plus de ce qui reste à couvrir. */
function fillProtein(target: number, list: BankFood[]): Intake[] {
  const out: Intake[] = [];
  let rem = target;
  for (let round = 0; round < 2 && rem >= 4; round++) {
    let best: { f: BankFood; n: number; gap: number } | null = null;
    for (const f of list) {
      const p = proteinOf(f);
      if (p < 5 || out.some((x) => x.foodId === f.id)) continue;
      for (const n of [1, 2]) {
        const gap = Math.abs(p * n - rem);
        if (round > 0 && p * n > rem + 0.35 * rem + 2) continue;
        if (!best || gap < best.gap) best = { f, n, gap };
      }
    }
    if (!best) break;
    out.push(intake(best.f, best.n));
    rem -= proteinOf(best.f) * best.n;
  }
  return out;
}

const inCat = (bank: BankFood[], ...cats: string[]) => bank.filter((f) => (cats as string[]).includes(f.category));
const pick = (bank: BankFood[], id: string) => bank.find((f) => f.id === id);
const own = (list: BankFood[]) => [...list.filter((f) => f.fav), ...list.filter((f) => !f.fav && !f.builtin), ...list.filter((f) => !f.fav && f.builtin)];

/** Plafond de glucides/h de l'entraînement digestif, selon le temps qui reste avant la course (progression proposée dans le guide, pas un protocole publié). */
export function gutCap(daysToRace: number | null, disc: PlannedDiscipline): { cap: Range; label: string } | null {
  if (daysToRace === null || daysToRace < 24) return null;
  const bike = disc === 'BIKE' || disc === 'BRICK';
  let cap: Range;
  if (daysToRace >= 185) cap = bike ? [60, 65] : [30, 30];
  else if (daysToRace >= 169) cap = bike ? [65, 70] : [30, 30];
  else if (daysToRace >= 150) cap = bike ? [70, 80] : [40, 50];
  else if (daysToRace >= 84) cap = bike ? [75, 85] : [40, 50];
  else cap = bike ? [80, 90] : [50, 60];
  return { cap, label: $t("entraînement digestif : {0} g/h au plus à cette période", { 0: cap[0] === cap[1] ? cap[0] : cap[0] + '–' + cap[1] }) };
}

// ------------------------------------------------------------------ le calcul
export function buildNutrition(i: NutriInput, bankAll: BankFood[], lookup: BankFood[] = bankAll): NutriPlan {
  const D = i.minutes;
  const disc = i.discipline;
  const bike = disc === 'BIKE' || disc === 'BRICK';
  const run = disc === 'RUN';
  const swim = disc === 'SWIM';
  const strength = disc === 'STRENGTH';
  const quality = i.level === 'quality';
  const rulesKg = Math.abs(i.weightKg - REF_KG) <= 3 ? REF_KG : i.weightKg;
  const kg = rulesKg;
  // l'intensité place la quantité dans la fourchette du guide : bas = facile, milieu = modérée, haut = intense
  const lv = i.level === 'easy' ? 0 : i.level === 'moderate' ? 0.5 : 1;
  const pickIn = (r: Range) => r[0] + (r[1] - r[0]) * lv;
  const favMode = bankAll.some((f) => f.fav);
  const noFav = $t("Aucun favori adapté : ajoute-en un dans ta banque d’aliments.");
  const notes: string[] = [];
  const events: NutriEvent[] = [];
  const bank = bankAll;

  // ================= AVANT
  let bCarbs: Range | null = null, bAt: Range | null = null, bFluid: Range | null = null;
  if (i.test) { bCarbs = [kg, kg]; bAt = [120, 180]; notes.push($t("Test : prends le même repas avant chaque test, pour comparer les résultats.")); }
  else if (strength) { if (D >= 20) { bCarbs = [scale(20, kg), scale(30, kg)]; bAt = [45, 60]; } }
  else if (swim && D >= 30 && D < 60) { bCarbs = [scale(30, kg), scale(40, kg)]; bAt = [60, 60]; notes.push($t("Natation courte : 30–40 g de glucides 1 h avant si la séance est tôt le matin, sinon un repas normal 2 h avant suffit.")); }
  else if (D < 45 && !quality) { /* rien de spécial */ }
  else if (D < 60) { bCarbs = [scale(30, kg), scale(40, kg)]; bAt = [45, 60]; }
  else if (D < 90) { bCarbs = [scale(75, kg), scale(quality ? 75 : 100, kg)]; bAt = [120, 120]; }
  else if (D < 150) { bCarbs = [scale(100, kg), scale(150, kg)]; bAt = [120, 180]; }
  else { bCarbs = [scale(150, kg), scale(150, kg)]; bAt = [180, 180]; }
  if (D >= 45 && !strength) bFluid = [Math.round((5 * kg) / 25) * 25, Math.round((10 * kg) / 25) * 25];
  const caffeineMg = i.caffeine && !strength && D >= 45 && (quality || D >= 90) ? Math.round((3 * kg) / 25) * 25 : null;

  if (bCarbs && bAt) {
    const target = pickIn(bCarbs);
    const starch = own(inCat(bank, 'before')).filter((f) => !f.liquid);
    const extras = [...own(inCat(bank, 'sugar')).filter((f) => f.id === 'd:honey' || !f.builtin), ...own(inCat(bank, 'fruit')).filter((f) => f.id === 'd:banana' || !f.builtin), ...inCat(bank, 'before').filter((f) => f.builtin && f.id === 'd:compote')];
    const small = D < 60;
    const bcap = (f: BankFood) => (f.builtin && f.id === 'd:honey' ? 1 : f.builtin && (f.id === 'd:banana' || f.id === 'd:compote') ? 2 : f.category === 'before' ? 4 : maxQty(f));
    const items = small ? fill(target, [...own(inCat(bank, 'fruit')), ...own(inCat(bank, 'sugar')), ...starch], 2, 0.8, { max: bcap }) : fillWithHoney(target, [...starch.slice(0, 1), ...extras, ...starch.slice(1)], 3, 0.6, { max: bcap, tol: 0.4 });
    events.push({ id: 'b-meal', phase: 'before', atMin: -bAt[1], toMin: -bAt[0], title: $t("Repas ou collation"), items, bell: 'meal', carbsG: sum(items, 'carbsG'), proteinG: sum(items, 'proteinG') });
  }
  if (bFluid && D >= 60) events.push({ id: 'b-fluid', phase: 'before', atMin: -240, toMin: -120, title: $t("Boire"), items: [], text: $t("{0}–{1} ml d’eau", { 0: bFluid[0], 1: bFluid[1] }), carbsG: 0, proteinG: 0 });
  if (caffeineMg) notes.push($t("Caféine : jamais après 16 h, elle coûte plus en sommeil qu’elle ne rapporte."));
  if (caffeineMg) events.push({ id: 'b-caf', phase: 'before', atMin: -60, toMin: -45, title: $t("Caféine (option)"), items: [], text: $t("{0} mg de caféine", { 0: caffeineMg }), bell: 'caf', carbsG: 0, proteinG: 0 });

  // ================= PENDANT
  let dCarbs: Range | null = null, cappedBy: string | null = null;
  if (swim) { if (D >= 60) dCarbs = [20, 30]; }
  else if (strength) { /* eau */ }
  else if (D < 45) { /* eau */ }
  else if (D < 75 && quality) dCarbs = [0, 30];
  else if (D < 60) { /* eau */ }
  else if (D < 90) dCarbs = [30, 30];
  else if (D < 150) dCarbs = bike && D >= 120 ? [50, 75] : [40, 60];
  else dCarbs = bike ? (D >= 180 ? [70, 90] : [50, 75]) : [60, 90];
  if (dCarbs && run) dCarbs = [Math.min(dCarbs[0], 60), Math.min(dCarbs[1], 60)]; // course : 60 g/h au plus à l'entraînement (confort digestif)
  if (dCarbs && dCarbs[1] > 0) {
    const g = gutCap(i.daysToRace, disc);
    if (g && (disc === 'RUN' || bike) && D >= 60 && (dCarbs[1] > g.cap[1] || dCarbs[0] > g.cap[0])) {
      dCarbs = [Math.min(dCarbs[0], g.cap[0]), Math.min(dCarbs[1], g.cap[1])]; cappedBy = g.label;
    }
  }
  const needSodium = !swim && !strength && (D >= 120 || (i.hot && D >= 45));
  let dSodium: Range | null = null;
  if (needSodium) {
    dSodium = bike && D >= 180 ? [500, 800] : [300, 600];
    if (i.hot) dSodium = [Math.max(dSodium[0], 400), dSodium[1] + 200];
  }
  let dFluid: Range | null = null;
  if (!strength && D >= 20) dFluid = swim ? [300, 500] : i.hot ? [600, 800] : [400, 800];

  const hours = D / 60;
  let carbsPerHActual = 0, sodiumPerHActual = 0, fluidPerHPlanned = 0, intervalMin: number | null = null, boostLimited = false;
  let shopping: Intake[] = [];
  let totalCarbs = 0;
  if (dCarbs && dCarbs[1] > 0 && !strength) {
    const T = dCarbs[0] === 0 ? Math.min(dCarbs[1], 20) : Math.round(pickIn(dCarbs));
    const drinks = own(inCat(bank, 'drink')).filter((f) => f.liquid && f.carbs100 > 0);
    const wantMixed = T > 60;
    const defaultDrink = (id: string) => pick(drinks, id);
    const drink: BankFood | undefined = drinks.find((f) => !f.builtin || f.fav) ?? (swim ? defaultDrink('d:drink6') : wantMixed ? defaultDrink('d:drinkmix') : T > 45 ? defaultDrink('d:drink6') : defaultDrink('d:drink6')) ?? drinks[0];
    const fluidMid = dFluid ? lerp(dFluid[0], dFluid[1]) : 500;
    // jamais de fruits secs ni de fruits à coque pendant l'effort (étouffement)
    const solids = (ids: string[], cats: string[]) => [
      ...own(inCat(bank, ...cats)).filter((f) => !f.builtin || f.fav),
      ...ids.map((id) => pick(bank, id)).filter((f): f is BankFood => !!f),
    ].filter((f, k, a) => a.indexOf(f) === k && !chokeRisk(f));
    let hour: Intake[] = [];
    if (swim) {
      if (drink) { const c = drink.carbs100 / 100; const v = Math.min(500, Math.max(200, Math.round(T / c / 50) * 50)); hour = [intake(drink, v / drink.massG)]; }
    } else if (bike) {
      let Vd = fluidMid;
      // on ne porte que 1,6 L sur le vélo : la boisson est plafonnée, les glucides manquants viennent des barres
      const carryPerH = Math.max(200, Math.floor(BIKE_CARRY_ML / hours / 50) * 50);
      if (Vd > carryPerH) { Vd = carryPerH; boostLimited = !!dFluid && carryPerH < dFluid[0]; }
      if (drink) { const c = drink.carbs100 / 100; if (Vd * c > T) Vd = Math.round(T / c / 50) * 50; hour.push(intake(drink, Vd / drink.massG)); }
      const R = T - sum(hour, 'carbsG');
      // à vélo : barres d'abord (faciles à manger), gels seulement si le reste est vraiment à combler, puis fruit, pâte de fruits, bonbons
      hour.push(...fill(R, solids(['d:bar', 'd:gel', 'd:banana', 'd:paste', 'd:candy'], ['bar', 'gel', 'fruit', 'paste', 'candy']), 3, 1, { half: true, max: (f) => (f.category === 'bar' ? 3 : maxQty(f)) }));
    } else { // course (et reste) : gels, pâtes de fruits, bonbons ; quelques gorgées de boisson si l'effort est de qualité et court
      const sips = quality && D < 75 && drink;
      if (sips) hour.push(intake(drink!, Math.min(250, fluidMid / 2) / drink!.massG));
      const R = T - sum(hour, 'carbsG');
      hour.push(...fill(R, solids(['d:bar', 'd:gel', 'd:paste', 'd:candy'], ['bar', 'gel', 'paste', 'candy']), 3, 0.65));
    }
    // sodium : ce que les produits n'apportent pas est comblé par du sel dans la boisson ou un comprimé
    if (dSodium) {
      const covered = sum(hour, 'sodiumMg');
      if (covered < dSodium[0] - 25) {
        const hasDrink = hour.some((x) => x.ml > 0);
        const saltList = own(inCat(bank, 'salt'));
        const tab = saltList.find((f) => f.massG > 1) ?? saltList[0];
        const salt = hasDrink ? saltList.find((f) => f.massG === 1) ?? saltList[0] : tab;
        if (salt && sodiumOf(salt) > 0) {
          const need = (dSodium[0] + dSodium[1]) / 2 - covered;
          const n = salt.massG === 1 ? Math.max(0.5, Math.round((need / sodiumOf(salt)) * 2) / 2) : Math.max(1, Math.round(need / sodiumOf(salt)));
          hour.push(intake(salt, n));
        }
      }
    }
    carbsPerHActual = sum(hour, 'carbsG');
    sodiumPerHActual = sum(hour, 'sodiumMg');
    fluidPerHPlanned = Math.round(sum(hour, 'ml'));
    // calendrier : une prise toutes les 15–20 min à vélo, 20–30 min à pied ; rien dans les 10 dernières minutes
    const solidsHour = hour.filter((x) => x.ml === 0 && !isSaltId(bank, x.foodId));
    const unitOf = (x: Intake) => { const f = pick(bank, x.foodId); return f && splittable(f) && bike ? 0.5 : 1; };
    const portions: Intake[] = solidsHour.flatMap((x) => { const u = unitOf(x); const n = Math.max(1, Math.round(x.qty / u)); return Array.from({ length: n }, () => ({ ...x, qty: u, amount: x.amount / x.qty * u, carbsG: x.carbsG / x.qty * u, sodiumMg: x.sodiumMg / x.qty * u, proteinG: x.proteinG / x.qty * u, ml: 0 })); });
    const slotsPerH = bike ? 2 : Math.min(3, Math.max(2, portions.length));
    if (portions.length || bike) {
      intervalMin = Math.round(60 / slotsPerH);
      const first = bike ? 20 : intervalMin <= 20 ? 20 : 30;
      const slots: { at: number; items: Intake[] }[] = [];
      for (let t = first, k = 0; t <= D - 10; t += intervalMin, k++) {
        const items = portions.filter((_, idx) => idx % slotsPerH === k % slotsPerH);
        // portions identiques regroupées
        const merged: Intake[] = [];
        for (const it of items) { const m = merged.find((y) => y.foodId === it.foodId); if (m) { m.qty += it.qty; m.amount += it.amount; m.carbsG += it.carbsG; m.sodiumMg += it.sodiumMg; m.proteinG += it.proteinG; } else merged.push({ ...it }); }
        slots.push({ at: t, items: merged });
      }
      for (const s of slots.filter((x) => x.items.length)) events.push({ id: 'd-' + s.at, phase: 'during', atMin: s.at, title: $t("Prise"), items: s.items, carbsG: sum(s.items, 'carbsG'), proteinG: 0 });
      const agg = new Map<string, Intake>();
      for (const s of slots) for (const it of s.items) { const a = agg.get(it.foodId); if (a) { a.qty += it.qty; a.amount += it.amount; a.carbsG += it.carbsG; a.sodiumMg += it.sodiumMg; } else agg.set(it.foodId, { ...it }); }
      shopping = [...agg.values()];
      totalCarbs = sum(shopping, 'carbsG');
    }
    // boissons et sel : quantités pour toute la séance
    const liquids = hour.filter((x) => x.ml > 0 || x.foodId === 'd:salt' || (inCat(bank, 'salt').some((f) => f.id === x.foodId)));
    for (const l of liquids) {
      const isSalt = inCat(bank, 'salt').some((f) => f.id === l.foodId);
      const total = Math.max(isSalt ? 0.5 : 0.1, l.qty * hours);
      const q = isSalt ? Math.round(total * 2) / 2 : Math.ceil(total * 2) / 2;
      shopping.push({ ...l, qty: q, amount: (l.amount / l.qty) * q, carbsG: (l.carbsG / l.qty) * q, sodiumMg: (l.sodiumMg / l.qty) * q, ml: (l.ml / l.qty) * q });
    }
    totalCarbs += sum(liquids.filter((x) => x.ml > 0), 'carbsG') * hours;
    // le moment « boire » pendant la séance
    events.push({ id: 'd-drink', phase: 'during', atMin: 0, toMin: D, title: swim ? $t("Au bord du bassin") : $t("Boire"), items: liquids, text: liquids.some((x) => x.ml > 0) ? undefined : $t("Eau : {0}–{1} ml par heure.", { 0: dFluid?.[0] ?? 400, 1: dFluid?.[1] ?? 800 }), carbsG: sum(liquids, 'carbsG') * hours, proteinG: 0 });
    if (T > 60) notes.push($t("Au-delà de 60 g/h, un seul sucre sature l’intestin : mélange glucose et fructose (le sucre blanc est moitié-moitié)."));
  } else if (!strength) {
    events.push({ id: 'd-water', phase: 'during', atMin: 0, toMin: D, title: $t("Boire"), items: [], text: dFluid ? $t("Eau : {0}–{1} ml par heure.", { 0: dFluid[0], 1: dFluid[1] }) : $t("Eau à volonté."), carbsG: 0, proteinG: 0 });
    if (swim) notes.push($t("Natation : rien à manger pendant la séance, un bidon au bord du bassin."));
  } else {
    events.push({ id: 'd-water', phase: 'during', atMin: 0, toMin: D, title: $t("Boire"), items: [], text: $t("Eau à volonté."), carbsG: 0, proteinG: 0 });
  }
  if (boostLimited && dFluid) notes.push($t("À vélo, tu ne portes que {0} ml : la boisson est limitée à ce que tu emportes, les barres complètent les glucides. Recharge tes bidons en route pour boire {1}–{2} ml par heure.", { 0: BIKE_CARRY_ML, 1: dFluid[0], 2: dFluid[1] }));
  if (cappedBy) notes.push(cappedBy.charAt(0).toUpperCase() + cappedBy.slice(1) + '.');
  if (dFluid && D >= 90) notes.push($t("Au-delà de 700 ml/h, le risque d’hyponatrémie augmente sur les efforts très longs : le sodium ne protège pas d’un excès d’eau. Bois à ta soif sans te forcer : urine jaune pâle, ventre non ballonné."));

  // ================= APRÈS
  const fast = !strength && D >= 45 && (i.laterToday || (D >= 150 && i.nextDayQuality)) || (strength && i.laterToday);
  const stdProtein: Range = [scale(20, kg), scale(25, kg)];
  let aCarbsPerH: Range | null = null, aHours = 0, aCarbs: Range | null = null, aProt: Range | null = null;
  if (fast) {
    aCarbsPerH = [Math.round(1.0 * kg), Math.round(1.2 * kg)]; aHours = i.recovery === 'full' ? 4 : 2; aProt = [Math.round(0.25 * kg), Math.round(0.3 * kg)];
  } else if (strength) {
    aProt = stdProtein;
  } else if (D >= 90 || (D >= 60 && quality)) {
    aCarbs = [Math.round(kg), Math.round(kg)]; aProt = stdProtein;
  }
  const carbsLike = [...own(inCat(bank, 'before')).filter((f) => !f.liquid), ...own(inCat(bank, 'sugar')).filter((f) => f.id === 'd:honey' || !f.builtin), ...own(inCat(bank, 'fruit')).filter((f) => f.id === 'd:banana' || !f.builtin), ...own(inCat(bank, 'after')).filter((f) => f.liquid)];
  const protLike = own(inCat(bank, 'after')).filter((f) => proteinOf(f) >= 5).sort((a, b) => proteinOf(b) / (b.massG / 100 + 1) - proteinOf(a) / (a.massG / 100 + 1));
  if (fast && aCarbsPerH && aProt) {
    const target = lerp(aCarbsPerH[0], aCarbsPerH[1]);
    const choc = own(inCat(bank, 'after')).filter((f) => f.liquid && carbsOf(f) > 10);
    const hourItems = fillWithHoney(target, [...choc, ...carbsLike.filter((f) => !choc.includes(f))], 3, 0.35);
    const protItems = fillProtein(lerp(aProt[0], aProt[1]), protLike.filter((f) => carbsOf(f) < 15));
    events.push({ id: 'a-prot', phase: 'after', atMin: D, toMin: D + 120, title: $t("Protéines"), items: protItems, bell: 'after', carbsG: 0, proteinG: sum(protItems, 'proteinG') });
    events.push({ id: 'a-fast', phase: 'after', atMin: D, toMin: D + aHours * 60, title: $t("Toutes les heures"), items: hourItems, times: aHours, carbsG: sum(hourItems, 'carbsG') * aHours, proteinG: 0 });
    notes.push($t("Une autre séance dure ou intense suit dans la journée : reprise rapide, 1,0–1,2 g/kg/h de glucides pendant {0} h.", { 0: aHours }));
  } else if (aProt) {
    // les produits protéinés (lait chocolaté…) apportent aussi des glucides : on les décompte avant de composer le reste
    const protPre = fillProtein(lerp(aProt[0], aProt[1]), protLike);
    const target = aCarbs ? Math.max(0, aCarbs[0] - sum(protPre, 'carbsG')) : 0;
    const carbItems = target ? fillWithHoney(target, carbsLike, 3, 0.6) : [];
    const protAdj = fillProtein(Math.max(0, lerp(aProt[0], aProt[1]) - sum(carbItems, 'proteinG')), protLike);
    const protItems = sum(protAdj, 'carbsG') <= sum(protPre, 'carbsG') + 8 ? protAdj : protPre;
    const items = [...carbItems, ...protItems];
    events.push({ id: 'a-meal', phase: 'after', atMin: D, toMin: D + 120, title: strength ? $t("Protéines et repas") : $t("Repas de récupération"), items, bell: 'after', carbsG: sum(items, 'carbsG'), proteinG: sum(items, 'proteinG') });
  } else {
    events.push({ id: 'a-meal', phase: 'after', atMin: D, toMin: D + 120, title: $t("Repas normal"), items: [], text: $t("Repas normal dans les 2 h."), bell: 'after', carbsG: 0, proteinG: 0 });
  }
  if (!strength && D >= 60) events.push({ id: 'a-fluid', phase: 'after', atMin: D, toMin: D + 120, title: $t("Boire"), items: [], text: $t("Eau : ≈ {0} ml dans l’heure, puis à ta soif (urine jaune pâle).", { 0: D >= 150 || i.hot ? 750 : 500 }), carbsG: 0, proteinG: 0 });

  // favoris seuls utilisés : un temps qui a besoin d'aliments mais qu'aucun favori ne peut composer le dit
  if (favMode) {
    const need: [NutriEvent['phase'], boolean][] = [['before', !!bCarbs && bCarbs[1] > 0], ['during', !!dCarbs && dCarbs[1] > 0 && !swim], ['after', !!aCarbs || !!aProt || fast]];
    for (const [ph, wanted] of need) if (wanted && !events.some((e) => e.phase === ph && e.items.length)) events.push({ id: ph[0] + '-nofav', phase: ph, atMin: ph === 'before' ? -(bAt ? bAt[1] : 60) : ph === 'during' ? 0 : D, toMin: ph === 'during' ? D : undefined, title: '', items: [], text: noFav, carbsG: 0, proteinG: 0 });
  }
  // ================= CHOIX DE L'ATHLÈTE : ses aliments remplacent ceux du calcul, les totaux sont recalculés
  if (i.edits) {
    const perHourEv = (e: NutriEvent) => e.id === 'd-drink' || e.id === 'd-water';
    for (const e of events) {
      const ed = i.edits[e.id];
      if (!ed) continue;
      e.items = ed.flatMap((x) => { const f = lookup.find((b) => b.id === x.foodId); return f && x.qty > 0 ? [intake(f, x.qty)] : []; });
      e.edited = true;
      if (e.items.length) e.text = undefined;
      e.carbsG = sum(e.items, 'carbsG') * (perHourEv(e) ? hours : e.times ?? 1);
      e.proteinG = sum(e.items, 'proteinG') * (e.times ?? 1);
    }
    if (events.some((e) => e.edited && e.phase === 'during')) {
      const liq = events.filter(perHourEv).flatMap((e) => e.items);
      const slotItems = events.filter((e) => e.phase === 'during' && /^d-\d+$/.test(e.id)).flatMap((e) => e.items);
      carbsPerHActual = (sum(liq, 'carbsG') * hours + sum(slotItems, 'carbsG')) / hours;
      sodiumPerHActual = (sum(liq, 'sodiumMg') * hours + sum(slotItems, 'sodiumMg')) / hours;
      fluidPerHPlanned = Math.round(sum(liq, 'ml'));
      const agg = new Map<string, Intake>();
      const add = (x: Intake, q: number) => { const r = q / x.qty; const a = agg.get(x.foodId); const y = { ...x, qty: q, amount: x.amount * r, carbsG: x.carbsG * r, sodiumMg: x.sodiumMg * r, proteinG: x.proteinG * r, ml: x.ml * r }; if (a) { a.qty += y.qty; a.amount += y.amount; a.carbsG += y.carbsG; a.sodiumMg += y.sodiumMg; a.proteinG += y.proteinG; a.ml += y.ml; } else agg.set(x.foodId, y); };
      for (const x of slotItems) add(x, x.qty);
      for (const x of liq) add(x, Math.ceil(x.qty * hours * 2) / 2);
      shopping = [...agg.values()];
      totalCarbs = sum(shopping, 'carbsG');
    }
  }
  events.sort((a, b) => (a.phase === b.phase ? a.atMin - b.atMin : ['before', 'during', 'after'].indexOf(a.phase) - ['before', 'during', 'after'].indexOf(b.phase)));
  return {
    minutes: D, level: i.level, weightKg: i.weightKg, rulesKg,
    before: { carbs: bCarbs, fluidMl: bFluid, atMin: bAt, caffeineMg },
    during: { carbsPerH: dCarbs, fluidPerH: dFluid, sodiumPerH: dSodium, carbsPerHActual: Math.round(carbsPerHActual), sodiumPerHActual: Math.round(sodiumPerHActual), fluidPerHPlanned, totalCarbs: Math.round(totalCarbs), shopping, intervalMin, cappedBy },
    after: { fast, carbsPerH: aCarbsPerH, hours: aHours, carbs: aCarbs, protein: aProt },
    events, notes,
  };
}
const isSaltId = (bank: BankFood[], id: string) => bank.some((f) => f.id === id && f.category === 'salt');

// ------------------------------------------------------------------ à partir d'une séance prévue
export interface PlannedNutri { plan: NutriPlan | null; guess: IntensityGuess; level: Level; hot: boolean; reason: string | null }

export function nutritionForSession(data: AppData, refs: RefValues, p: PlannedSession, bank: BankFood[], todayDay: string, done: (plannedId: string) => boolean = () => false): PlannedNutri {
  const guess = estimateIntensity(p, refs);
  const opt = data.nutri[p.id];
  const o = opt && !opt.deleted ? opt : undefined;
  const level: Level = o?.intensity ?? guess.level;
  const hot = !!o?.hot;
  const dur = estimateDuration(p.blocks, p.discipline, refs);
  const minutes = Math.round(dur.value / 60);
  if (dur.certainty === 'unknown' || minutes < 1) return { plan: null, guess, level, hot, reason: $t("Durée inconnue : ajoute des durées (ou des distances avec une allure) aux blocs pour calculer l’alimentation.") };
  // poids : dernière pesée à la date de la séance (une nouvelle pesée ne change pas les séances d'avant) ; à défaut, la plus ancienne
  const ws = liveRecords(data.weight).sort((a, b) => (a.day < b.day ? 1 : -1));
  const w = ws.find((x) => x.day <= p.plannedDate) ?? ws[ws.length - 1];
  const main = data.nutri.main && !data.nutri.main.deleted ? data.nutri.main : undefined;
  const others = liveRecords(data.planned).filter((x) => x.id !== p.id);
  // « plus tard dans la journée » : une séance non faite, rangée après celle-ci dans le jour (les séances n'ont pas d'heure : l'ordre du calendrier fait foi)
  const sameDay = liveRecords(data.planned).filter((x) => x.plannedDate === p.plannedDate);
  const laterToday = sameDay.slice(sameDay.findIndex((x) => x.id === p.id) + 1).some((x) => x.id !== p.id && !done(x.id) && (x.discipline === 'STRENGTH' || estimateIntensity(x, refs).level !== 'easy'));
  const nextDay = others.filter((x) => x.plannedDate === addDays(p.plannedDate, 1));
  const nextDayQuality = nextDay.some((x) => estimateIntensity(x, refs).level === 'quality');
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const daysToRace = race ? Math.round((Date.parse(race.raceDate + 'T12:00:00Z') - Date.parse(p.plannedDate + 'T12:00:00Z')) / 86400000) : null;
  const test = /\btest\b|\bcss\b/i.test(p.title ?? '') && minutes <= 60;
  void todayDay;
  const plan = buildNutrition({ discipline: p.discipline, minutes, level, hot, weightKg: w?.kg ?? REF_KG, test, laterToday, nextDayQuality, daysToRace: daysToRace !== null && daysToRace > 0 ? daysToRace : null, caffeine: !!main?.caffeine, recovery: main?.recovery, edits: o?.edits }, bank, resolveBank(data, true));
  return { plan, guess, level, hot, reason: null };
}

// ------------------------------------------------------------------ liste de courses de la semaine
export interface ShopLine { foodId: string; name: string; category: string; /** unités à acheter (arrondies au-dessus) ; 0 pour un liquide ou du sel */ units: number; ml: number; grams: number; sessions: number; /** d'où vient la quantité : une entrée par séance (quantité en portions, ml ou g, avant arrondi) */ parts: { plannedId: string; day: string; qty: number; ml: number; grams: number }[] }

/** Tout ce que les séances prévues (pas encore faites, aujourd'hui ou après) de la semaine demandent d'acheter. */
export function weekShopping(data: AppData, refsAt: (day: string) => RefValues, bank: BankFood[], monday: string, todayDay: string, done: (plannedId: string) => boolean): { lines: ShopLine[]; sessions: number; used: { plannedId: string; day: string }[] } {
  const end = addDays(monday, 6);
  const ps = liveRecords(data.planned).filter((p) => p.plannedDate >= monday && p.plannedDate <= end && p.plannedDate >= todayDay && p.blocks.length > 0 && !done(p.id));
  const byId = new Map(bank.map((f) => [f.id, f]));
  const agg = new Map<string, { qty: number; ml: number; grams: number; sessions: Set<string>; parts: ShopLine['parts'] }>();
  let sessions = 0;
  const used: { plannedId: string; day: string }[] = [];
  for (const p of ps) {
    const plan = nutritionForSession(data, refsAt(p.plannedDate), p, bank, todayDay, done).plan;
    if (!plan) continue;
    const list: Intake[] = [...plan.during.shopping];
    for (const e of plan.events) if (e.phase !== 'during') for (const x of e.items) list.push({ ...x, qty: x.qty * (e.times ?? 1), amount: x.amount * (e.times ?? 1), ml: x.ml * (e.times ?? 1) });
    if (!list.length) continue;
    sessions++; used.push({ plannedId: p.id, day: p.plannedDate });
    for (const x of list) {
      const a = agg.get(x.foodId) ?? { qty: 0, ml: 0, grams: 0, sessions: new Set<string>(), parts: [] };
      const g = /^1 g$/.test(x.unit) ? x.amount : 0;
      a.qty += x.qty; a.ml += x.ml; a.grams += g; a.sessions.add(p.id);
      const part = a.parts.find((y) => y.plannedId === p.id);
      if (part) { part.qty += x.qty; part.ml += x.ml; part.grams += g; } else a.parts.push({ plannedId: p.id, day: p.plannedDate, qty: x.qty, ml: x.ml, grams: g });
      agg.set(x.foodId, a);
    }
  }
  const lines: ShopLine[] = [];
  for (const [id, a] of agg) {
    const f = byId.get(id);
    if (!f) continue;
    const isG = a.grams > 0, isMl = f.liquid && a.ml > 0;
    lines.push({ foodId: id, name: foodName(f), category: f.category, units: isG || isMl ? 0 : Math.ceil(a.qty - 0.001), ml: isMl ? Math.round(a.ml / 10) * 10 : 0, grams: isG ? Math.round(a.grams * 10) / 10 : 0, sessions: a.sessions.size, parts: a.parts });
  }
  const order: string[] = [...FOOD_CATEGORIES];
  lines.sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category) || x.name.localeCompare(y.name));
  return { lines, sessions, used };
}

// ------------------------------------------------------------------ texte court (notifications, résumés)
export function itemsText(items: Intake[]): string {
  return items.map((x) => (x.qty === 1 || x.foodId === 'd:salt' ? '' : Math.round(x.qty * 10) / 10 + ' × ') + x.name).join(' + ');
}
export { NA_PER_SALT_G };

// ------------------------------------------------------------------ libellés partagés (carte et notifications)
/** « 2 h », « 1 h 30 », « 45 min ». */
export function leadText(min: number): string {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return $t("{0} min", { 0: r });
  return r ? $t("{0} h {1}", { 0: h, 1: String(r).padStart(2, '0') }) : $t("{0} h", { 0: h });
}
/** Quantité lisible : demi-portions en ½, liquides en ml. */
/** Produit vendu « par portion de plusieurs pièces » (« 2 tranches ») : on compte les pièces, pas les portions. */
export function piecesOf(x: Pick<Intake, 'unit' | 'liquid' | 'ml'>): { n: number; noun: string } | null {
  if (x.liquid && x.ml > 0) return null;
  const m = /^(\d+)\s+([^\d].*)$/.exec(x.unit.trim());
  if (!m || Number(m[1]) < 2 || Number(m[1]) > 6 || /^(g|kg|mg|ml|l|cl)\b/i.test(m[2])) return null;
  return { n: Number(m[1]), noun: m[2] };
}
const half = (q: number) => { const r = Math.round(q * 2) / 2; return r === Math.floor(r) ? String(r) : (Math.floor(r) ? String(Math.floor(r)) : '') + '½'; };
/** Mêmes aliments, quantité multipliée (ex. « toutes les heures, 2 fois » → total). */
export function scaleIntake(x: Intake, k: number): Intake { return { ...x, qty: x.qty * k, amount: x.amount * k, ml: x.ml * k, carbsG: x.carbsG * k, sodiumMg: x.sodiumMg * k, proteinG: x.proteinG * k }; }

export function intakeText(x: Intake): string {
  if (x.liquid && x.ml > 0) return $t("{0} ml de {1}", { 0: Math.round(x.ml / 10) * 10, 1: x.name });
  const pc = piecesOf(x);
  if (pc) return half(x.qty * pc.n) + ' ' + pc.noun + ' ' + x.name;
  const q = Math.round(x.qty * 2) / 2;
  const frac = q === Math.floor(q) ? String(q) : (Math.floor(q) ? String(Math.floor(q)) : '') + '½';
  const approx = Math.abs(q - x.qty) > 0.05 && !(x.qty < 0.5);
  return (q === 1 && !approx ? '' : (approx ? '≈ ' : '') + frac + ' × ') + x.name;
}

// ------------------------------------------------------------------ validation : les apports du plan (calculé ou modifié) couvrent-ils le conseil ?
export interface Check { phase: NutriEvent['phase']; key: string; label: string; got: number; lo: number; hi: number; unit: string; state: 'ok' | 'low' | 'high' }
const state = (got: number, lo: number, hi: number): Check['state'] => (got < lo * 0.88 ? 'low' : got > hi * 1.15 ? 'high' : 'ok');

export function checkPlan(plan: NutriPlan): Check[] {
  const out: Check[] = [];
  const push = (phase: Check['phase'], key: string, label: string, got: number, r: Range | null, unit: string) => { if (r && r[1] > 0) out.push({ phase, key, label, got: Math.round(got), lo: r[0], hi: r[1], unit, state: state(got, r[0], r[1]) }); };
  const ev = (id: string) => plan.events.find((e) => e.id === id);
  const meal = ev('b-meal');
  if (plan.before.carbs && (meal || plan.before.carbs[1] > 0)) push('before', 'b-carbs', $t("Glucides"), meal?.carbsG ?? 0, plan.before.carbs, 'g');
  if (plan.during.carbsPerH) push('during', 'd-carbs', $t("Glucides par heure"), plan.during.carbsPerHActual, plan.during.carbsPerH, 'g');
  if (plan.during.sodiumPerH) push('during', 'd-sodium', $t("Sodium par heure"), plan.during.sodiumPerHActual, plan.during.sodiumPerH, 'mg');
  const fast = ev('a-fast'), prot = ev('a-prot'), am = ev('a-meal');
  if (plan.after.fast) {
    push('after', 'a-carbs', $t("Glucides par heure"), fast ? fast.carbsG / (fast.times ?? 1) : 0, plan.after.carbsPerH, 'g');
    push('after', 'a-prot', $t("Protéines"), prot?.proteinG ?? 0, plan.after.protein, 'g');
  } else {
    if (plan.after.carbs) push('after', 'a-carbs', $t("Glucides"), am?.carbsG ?? 0, plan.after.carbs, 'g');
    if (plan.after.protein) push('after', 'a-prot', $t("Protéines"), am?.proteinG ?? 0, plan.after.protein, 'g');
  }
  return out;
}
/** Pire état des contrôles d'une phase (`null` = rien à contrôler). */
export function phaseState(checks: Check[], phase: Check['phase']): Check['state'] | null {
  const l = checks.filter((c) => c.phase === phase);
  return l.length === 0 ? null : l.some((c) => c.state === 'low') ? 'low' : l.some((c) => c.state === 'high') ? 'high' : 'ok';
}

/** Quantité en une ligne courte : « 3× », « ½ », « 600 ml ». */
export function qtyText(x: Intake): string {
  if (x.liquid && x.ml > 0) return Math.round(x.ml / 10) * 10 + ' ml';
  if (/^1 g$/.test(x.unit)) return Math.round(x.amount * 10) / 10 + ' g';
  const pc = piecesOf(x);
  if (pc) return half(x.qty * pc.n) + ' ' + pc.noun;
  const q = Math.round(x.qty * 2) / 2;
  const f = q === Math.floor(q) ? String(q) : (Math.floor(q) ? String(Math.floor(q)) : '') + '½';
  return q === 1 ? '1' : f + (q >= 2 ? '×' : '');
}
