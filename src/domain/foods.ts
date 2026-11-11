// Banque d'aliments : produits par défaut (guide nutrition du 11/11/2026 : Ciqual 2013 pour les aliments courants, ordres de grandeur « ≈ » pour les
// produits du commerce) + produits de l'athlète. Les valeurs sont pour 100 g (100 ml pour un liquide) ; une portion = `massG`.
import { $t } from '../i18n';
import { liveRecords } from './load';
import type { AppData, Food, FoodCategory } from './types';

/** 1 g de sel de table (NaCl) = 393 mg de sodium (23 / 58,44). */
export const NA_PER_SALT_G = 393;

/** Produit tel qu'utilisé par le calcul : un défaut ou un produit de l'athlète. */
export interface BankFood {
  id: string;
  category: FoodCategory;
  name: string;
  unit: string;
  massG: number;
  liquid: boolean;
  kcal100: number | null;
  carbs100: number;
  protein100: number | null;
  salt100: number | null;
  caffeineMg: number | null;
  mixed: boolean;
  /** Produit livré avec l'application (non modifiable tel quel) ; faux = ajouté ou modifié par l'athlète. */
  builtin: boolean;
  /** Valeur indicative : à vérifier sur l'étiquette du produit acheté. */
  approx: boolean;
  /** Remarque d'usage affichée dans la banque. */
  note?: string;
}

type Def = Omit<BankFood, 'builtin' | 'approx'> & { approx?: boolean };
const D = (d: Def): BankFood => ({ ...d, builtin: true, approx: !!d.approx });

export const DEFAULT_FOODS: BankFood[] = [
  // ---- boissons (liquides, pour 100 ml) — recettes maison du guide : 1 g de sel/l = 0,1 g/100 ml
  D({ id: 'd:drink4', category: 'drink', name: 'Boisson maison 4 %', unit: '500 ml', massG: 500, liquid: true, kcal100: 16, carbs100: 4, protein100: null, salt100: 0.1, caffeineMg: null, mixed: true, note: '40 g de sucre + 1 g de sel + citron par litre : natation, séances de 60–90 min' }),
  D({ id: 'd:drink6', category: 'drink', name: 'Boisson maison 6 %', unit: '500 ml', massG: 500, liquid: true, kcal100: 24, carbs100: 6, protein100: null, salt100: 0.13, caffeineMg: null, mixed: true, note: '60 g de sucre + 1,3 g de sel + citron par litre : course longue, vélo' }),
  D({ id: 'd:drink8', category: 'drink', name: 'Boisson maison 8 %', unit: '500 ml', massG: 500, liquid: true, kcal100: 32, carbs100: 8, protein100: null, salt100: 0.13, caffeineMg: null, mixed: true, note: '80 g de sucre + 1,3 g de sel par litre : vélo de plus de 2 h' }),
  D({ id: 'd:drinkmix', category: 'drink', name: 'Boisson glucose + fructose', unit: '500 ml', massG: 500, liquid: true, kcal100: 32, carbs100: 7.9, protein100: null, salt100: 0.13, caffeineMg: null, mixed: true, note: '20 g de maltodextrine + 60 g de sucre + 1,3 g de sel par litre : vélo de plus de 3 h' }),
  D({ id: 'd:isotonic', category: 'drink', name: 'Boisson électrolyte du commerce', unit: '500 ml', massG: 500, liquid: true, kcal100: 24, carbs100: 6, protein100: null, salt100: 0.1, caffeineMg: null, mixed: true, approx: true }),
  // ---- gels
  D({ id: 'd:gel', category: 'gel', name: 'Gel énergétique', unit: '1 sachet', massG: 38, liquid: false, kcal100: 240, carbs100: 60, protein100: null, salt100: 0.23, caffeineMg: null, mixed: true, approx: true }),
  D({ id: 'd:gelmix', category: 'gel', name: 'Gel double sucre (maltodextrine + fructose)', unit: '1 sachet', massG: 60, liquid: false, kcal100: 200, carbs100: 50, protein100: null, salt100: 0.3, caffeineMg: null, mixed: true, approx: true }),
  D({ id: 'd:gelcaf', category: 'gel', name: 'Gel énergétique à la caféine', unit: '1 sachet', massG: 38, liquid: false, kcal100: 240, carbs100: 60, protein100: null, salt100: 0.23, caffeineMg: 50, mixed: true, approx: true }),
  // ---- pâtes de fruits (Ciqual)
  D({ id: 'd:paste', category: 'paste', name: 'Pâte de fruits', unit: '1 carré', massG: 12, liquid: false, kcal100: 290, carbs100: 71.1, protein100: null, salt100: 0.13, caffeineMg: null, mixed: true }),
  // ---- bonbons
  D({ id: 'd:candy', category: 'candy', name: 'Bonbons gélifiés', unit: '40 g', massG: 40, liquid: false, kcal100: 330, carbs100: 75, protein100: null, salt100: 0.06, caffeineMg: null, mixed: true, approx: true }),
  // ---- barres
  D({ id: 'd:bar', category: 'bar', name: 'Barre céréales / fruits', unit: '1 barre', massG: 40, liquid: false, kcal100: 380, carbs100: 68, protein100: 5, salt100: 0.4, caffeineMg: null, mixed: false, approx: true, note: 'graisses et fibres à limiter en course à pied' }),
  D({ id: 'd:barsoft', category: 'bar', name: 'Barre moelleuse aux dattes', unit: '1 barre', massG: 45, liquid: false, kcal100: 340, carbs100: 62, protein100: 4, salt100: 0.1, caffeineMg: null, mixed: true, approx: true }),
  // ---- fruits (Ciqual)
  D({ id: 'd:banana', category: 'fruit', name: 'Banane', unit: '1 moyenne', massG: 110, liquid: false, kcal100: 90, carbs100: 20.5, protein100: 1.2, salt100: 0.003, caffeineMg: null, mixed: true, note: 'vélo uniquement' }),
  D({ id: 'd:date', category: 'fruit', name: 'Datte séchée', unit: '1 datte', massG: 20, liquid: false, kcal100: 280, carbs100: 62.5, protein100: 2, salt100: 0.01, caffeineMg: null, mixed: true, note: 'à manger avec de l’eau' }),
  D({ id: 'd:raisin', category: 'fruit', name: 'Raisins secs', unit: '30 g', massG: 30, liquid: false, kcal100: 300, carbs100: 66.4, protein100: 2.5, salt100: 0.015, caffeineMg: null, mixed: true }),
  // ---- sucres et sirops
  D({ id: 'd:honey', category: 'sugar', name: 'Miel', unit: '1 c. à soupe', massG: 20, liquid: false, kcal100: 330, carbs100: 81.1, protein100: 0.4, salt100: 0.003, caffeineMg: null, mixed: true }),
  D({ id: 'd:sugar', category: 'sugar', name: 'Sucre blanc', unit: '1 morceau', massG: 6, liquid: false, kcal100: 400, carbs100: 99.6, protein100: null, salt100: 0, caffeineMg: null, mixed: true, note: 'moitié glucose, moitié fructose' }),
  D({ id: 'd:syrup', category: 'sugar', name: 'Sirop (grenadine, menthe)', unit: '4 cl', massG: 40, liquid: true, kcal100: 250, carbs100: 62, protein100: null, salt100: 0.0125, caffeineMg: null, mixed: true, approx: true }),
  // ---- salé
  D({ id: 'd:pretzel', category: 'salty', name: 'Bretzel de boulangerie', unit: '1 pièce', massG: 80, liquid: false, kcal100: 330, carbs100: 50, protein100: 8, salt100: 1.9, caffeineMg: null, mixed: false, approx: true, note: 'utile pour le sodium, vélo seulement' }),
  // ---- sodium
  D({ id: 'd:salt', category: 'salt', name: 'Sel de table', unit: '1 g', massG: 1, liquid: false, kcal100: null, carbs100: 0, protein100: null, salt100: 100, caffeineMg: null, mixed: false, note: '¼ de c. à c. rase ≈ 1,4 g ≈ 550 mg de sodium' }),
  D({ id: 'd:saltab', category: 'salt', name: 'Comprimé d’électrolytes', unit: '1 comprimé', massG: 4, liquid: false, kcal100: null, carbs100: 0, protein100: null, salt100: 12.7, caffeineMg: null, mixed: false, approx: true }),
  // ---- avant la séance (peu de fibres, peu de graisses)
  D({ id: 'd:bread', category: 'before', name: 'Pain de mie blanc', unit: '2 tranches', massG: 50, liquid: false, kcal100: 265, carbs100: 54, protein100: 8, salt100: 1.27, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:rice', category: 'before', name: 'Riz blanc cuit', unit: '150 g', massG: 150, liquid: false, kcal100: 130, carbs100: 28, protein100: 2.7, salt100: 0.02, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:pasta', category: 'before', name: 'Pâtes blanches cuites', unit: '150 g', massG: 150, liquid: false, kcal100: 158, carbs100: 30, protein100: 5.8, salt100: 0.02, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:oats', category: 'before', name: 'Flocons d’avoine', unit: '60 g', massG: 60, liquid: false, kcal100: 370, carbs100: 60, protein100: 13, salt100: 0.02, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:compote', category: 'before', name: 'Compote sans sucre ajouté', unit: '1 pot 100 g', massG: 100, liquid: false, kcal100: 55, carbs100: 12, protein100: 0.3, salt100: 0.01, caffeineMg: null, mixed: true, approx: true }),
  // ---- après la séance
  D({ id: 'd:chocmilk', category: 'after', name: 'Lait chocolaté', unit: '250 ml', massG: 250, liquid: true, kcal100: 70, carbs100: 10.5, protein100: 3.4, salt100: 0.12, caffeineMg: null, mixed: true, approx: true }),
  D({ id: 'd:skyr', category: 'after', name: 'Fromage blanc 0 %', unit: '1 pot 150 g', massG: 150, liquid: false, kcal100: 48, carbs100: 4, protein100: 8, salt100: 0.1, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:egg', category: 'after', name: 'Œufs durs', unit: '2 œufs', massG: 100, liquid: false, kcal100: 150, carbs100: 0.6, protein100: 13, salt100: 0.35, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:ham', category: 'after', name: 'Jambon blanc', unit: '2 tranches', massG: 80, liquid: false, kcal100: 110, carbs100: 0.5, protein100: 21, salt100: 1.9, caffeineMg: null, mixed: false, approx: true }),
  D({ id: 'd:whey', category: 'after', name: 'Boisson protéinée (whey)', unit: '1 dose 30 g', massG: 30, liquid: false, kcal100: 380, carbs100: 6, protein100: 80, salt100: 0.5, caffeineMg: null, mixed: false, approx: true }),
];

export interface CategoryInfo { id: FoodCategory; label: string; hint: string }
/** Catégories de la banque, dans l'ordre d'affichage. */
export const CATEGORIES = (): CategoryInfo[] => [
  { id: 'drink', label: $t("Boissons d’effort"), hint: $t("Boisson électrolyte, boisson énergétique, recettes maison") },
  { id: 'gel', label: $t("Gels"), hint: $t("Gels énergétiques") },
  { id: 'paste', label: $t("Pâtes de fruits"), hint: $t("Pâtes de fruits, fruits gélifiés") },
  { id: 'candy', label: $t("Bonbons"), hint: $t("Bonbons gélifiés, bonbons énergétiques") },
  { id: 'bar', label: $t("Barres"), hint: $t("Barres de céréales, de fruits, énergétiques") },
  { id: 'fruit', label: $t("Fruits et fruits secs"), hint: $t("Banane, dattes, raisins secs…") },
  { id: 'sugar', label: $t("Sucres et sirops"), hint: $t("Miel, sucre, sirop") },
  { id: 'salty', label: $t("Salé"), hint: $t("Bretzel, biscuits salés…") },
  { id: 'salt', label: $t("Sodium"), hint: $t("Sel, comprimés d’électrolytes") },
  { id: 'before', label: $t("Avant la séance"), hint: $t("Peu de fibres, peu de graisses : pain, riz, pâtes, flocons…") },
  { id: 'after', label: $t("Après la séance"), hint: $t("Protéines et glucides de récupération") },
];

const fromRec = (f: Food): BankFood => ({ id: f.id, category: f.category, name: f.name, unit: f.unit, massG: f.massG, liquid: f.liquid, kcal100: f.kcal100, carbs100: f.carbs100, protein100: f.protein100, salt100: f.salt100, caffeineMg: f.caffeineMg, mixed: f.mixed, builtin: false, approx: false });

/**
 * Banque telle que l'athlète la voit : produits par défaut (sauf ceux qu'il a masqués ou remplacés par sa version) puis ses propres produits.
 * Les produits de l'athlète passent en premier : ce sont eux que le calcul choisit d'abord dans une catégorie.
 */
export function resolveBank(data: Pick<AppData, 'foods'>): BankFood[] {
  const recs = liveRecords(data.foods);
  const gone = new Set(recs.filter((r) => r.base).map((r) => r.base as string));
  const own = recs.filter((r) => !r.hidden).map(fromRec);
  return [...own, ...DEFAULT_FOODS.filter((f) => !gone.has(f.id))];
}

// ------------------------------------------------------------------ apports d'une portion
export const carbsOf = (f: BankFood): number => (f.carbs100 * f.massG) / 100;
export const proteinOf = (f: BankFood): number => ((f.protein100 ?? 0) * f.massG) / 100;
export const sodiumOf = (f: BankFood): number => (((f.salt100 ?? 0) * f.massG) / 100) * NA_PER_SALT_G;
export const kcalOf = (f: BankFood): number | null => (f.kcal100 === null ? null : (f.kcal100 * f.massG) / 100);
/** Volume de liquide d'une portion (ml), 0 pour un solide. */
export const mlOf = (f: BankFood): number => (f.liquid ? f.massG : 0);

/** Nom affiché : les produits livrés sont traduits, ceux de l'athlète s'affichent tels qu'il les a écrits. */
export const foodName = (f: Pick<BankFood, 'name' | 'builtin'>): string => (f.builtin ? $t(f.name) : f.name);
export const foodUnit = (f: Pick<BankFood, 'unit' | 'builtin'>): string => (f.builtin ? $t(f.unit) : f.unit);
export const foodNote = (f: BankFood): string | null => (f.builtin && f.note ? $t(f.note) : null);
