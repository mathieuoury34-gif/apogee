// Paramètres › Alimentation : la banque d'aliments (par catégorie) que le calcul de la carte « Alimentation » utilise.
// Produits par défaut (valeurs indicatives, à vérifier sur l'étiquette) + produits de l'athlète, qui passent en premier.
import { $t } from '../i18n';
import { useState } from 'react';
import { Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useLocalSheet } from '../ui/menu';
import { useData } from '../data/store';
import { hideDefaultFood, removeFood, resetFoods, restore, saveFood, setNutriMain } from '../data/actions';
import { CATEGORIES, carbsOf, foodName, foodNote, foodUnit, kcalOf, resolveBank, type BankFood } from '../domain/foods';
import { liveRecords } from '../domain/load';
import type { FoodCategory } from '../domain/types';
import { num, parseNum, toInput } from '../ui/format';

const opt = (s: string): number | null => { const v = parseNum(s); return isNaN(v) ? null : v; };

function FoodSheet({ cat, food, sh }: { cat: FoodCategory; food: BankFood | null; sh: ReturnType<typeof useLocalSheet> }) {
  const [name, setName] = useState(food ? foodName(food) : '');
  const [unit, setUnit] = useState(food ? foodUnit(food) : '');
  const [mass, setMass] = useState(food ? toInput(food.massG, 1).replace(/[.,]0$/, '') : '');
  const [liquid, setLiquid] = useState(food?.liquid ?? cat === 'drink');
  const [kcal, setKcal] = useState(toInput(food?.kcal100, 1).replace(/[.,]0$/, ''));
  const [carbs, setCarbs] = useState(toInput(food?.carbs100, 1).replace(/[.,]0$/, ''));
  const [prot, setProt] = useState(toInput(food?.protein100, 1).replace(/[.,]0$/, ''));
  const [salt, setSalt] = useState(toInput(food?.salt100, 2).replace(/[.,]?0+$/, ''));
  const [caf, setCaf] = useState(toInput(food?.caffeineMg, 0));
  const [mixed, setMixed] = useState(food?.mixed ?? false);
  const m = parseNum(mass), c = parseNum(carbs);
  const valid = name.trim().length > 0 && m > 0 && !isNaN(c) && c >= 0 && c <= 100 && (!opt(prot) || (opt(prot) as number) <= 100);
  const per = valid ? (c * m) / 100 : null;
  const L = liquid ? $t("100 ml") : $t("100 g");
  const save = () => {
    saveFood({
      id: food && !food.builtin ? food.id : undefined, base: food?.builtin ? food.id : null, category: cat, name: name.trim(), unit: unit.trim() || $t("1 portion"),
      massG: m, liquid, kcal100: opt(kcal), carbs100: c, protein100: opt(prot), salt100: opt(salt), caffeineMg: opt(caf), mixed,
    });
    sh.hide();
    showToast($t("Produit enregistré"));
  };
  const f = (label: string, v: string, set: (s: string) => void, hint?: string, ph?: string) => (
    <label className="field"><span className="lbl">{label}</span>
      <input className="input" inputMode="decimal" value={v} placeholder={ph} onChange={(e) => set(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}</label>
  );
  return (
    <Sheet title={food ? (food.builtin ? $t("Adapter ce produit") : $t("Modifier le produit")) : $t("Ajouter un produit")} onClose={sh.hide}
      head={<span className="t-caption c-moderate">{CATEGORIES().find((x) => x.id === cat)?.label}</span>}
      footer={<button type="button" className="btn btn-primary block" disabled={!valid} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
        {food?.builtin && <div className="note"><Icon name="info" size={20} /><span>{$t("Ta version remplace le produit par défaut. Tu pourras revenir à l’original en la supprimant.")}</span></div>}
        <label className="field"><span className="lbl">{$t("Nom du produit")}</span>
          <input className="input" value={name} maxLength={60} autoFocus={!food} placeholder={$t("Barre de la marque…")} onChange={(e) => setName(e.target.value)} /></label>
        <div className="between" style={{ gap: 'var(--space-12)' }}>
          <span className="stack"><span className="t-strong" id="lbl-liquid">{$t("Liquide")}</span><span className="t-caption c-moderate">{$t("Les valeurs sont alors données pour 100 ml.")}</span></span>
          <Switch checked={liquid} labelledBy="lbl-liquid" onChange={setLiquid} />
        </div>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
          {f(liquid ? $t("Volume d’une portion (ml)") : $t("Poids d’une portion (g)"), mass, setMass, undefined, '40')}
          <label className="field"><span className="lbl">{$t("Nom de la portion")}</span>
            <input className="input" value={unit} maxLength={30} placeholder={$t("1 barre")} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <span className="overline c-neutral">{$t("Valeurs pour {0} (étiquette)", { 0: L })}</span>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
          {f($t("Glucides (g)"), carbs, setCarbs, undefined, '65')}
          {f($t("Énergie (kcal)"), kcal, setKcal, undefined, '380')}
          {f($t("Protéines (g)"), prot, setProt)}
          {f($t("Sel (g)"), salt, setSalt, $t("Ligne « sel » de l’étiquette. 1 g de sel ≈ 393 mg de sodium."))}
        </div>
        {f($t("Caféine par portion (mg)"), caf, setCaf, $t("Laisse vide s’il n’y en a pas."))}
        <div className="between" style={{ gap: 'var(--space-12)' }}>
          <span className="stack"><span className="t-strong" id="lbl-mixed">{$t("Glucose + fructose")}</span><span className="t-caption c-moderate">{$t("Sucres mélangés : l’intestin en absorbe davantage (au-delà de 60 g/h).")}</span></span>
          <Switch checked={mixed} labelledBy="lbl-mixed" onChange={setMixed} />
        </div>
        {per !== null && <span className="t-caption c-moderate">{$t("Une portion : ≈ {0} g de glucides", { 0: num(per, 0, 1) })}{opt(kcal) !== null ? $t(" et ≈ {0} kcal", { 0: num(((opt(kcal) as number) * m) / 100, 0) }) : ''}.</span>}
        {food && (
          <button type="button" className="btn btn-secondary" style={{ color: 'var(--critical-text)', alignSelf: 'flex-start' }} onClick={() => {
            if (food.builtin) { const snap = hideDefaultFood(food.id); sh.hide(); showToast($t("Produit masqué"), { undo: () => restore(snap) }); }
            else { const snap = removeFood(food.id); sh.hide(); showToast($t("Produit supprimé"), { undo: () => restore(snap) }); }
          }}><Icon name="trash" size={18} />{food.builtin ? $t("Masquer ce produit") : $t("Supprimer")}</button>
        )}
      </div>
    </Sheet>
  );
}

export function FoodBankScreen() {
  const data = useData();
  const sh = useLocalSheet();
  const [target, setTarget] = useState<{ cat: FoodCategory; food: BankFood | null } | null>(null);
  const bank = resolveBank(data);
  const caffeine = !!(data.nutri.main && !data.nutri.main.deleted && data.nutri.main.caffeine);
  const modified = liveRecords(data.foods).filter((r) => r.base).length;
  const open = (cat: FoodCategory, food: BankFood | null) => { setTarget({ cat, food }); sh.show(); };
  return (
    <div className="screen" data-screen="alimentation">
      <SubHeader title={$t("Ma banque d’aliments")} fallback="/parametres" />
      <main className="content form-narrow" style={{ gap: 'var(--space-24)' }}>
        <div className="note"><Icon name="info" size={20} /><span>{$t("Les cartes « Alimentation » des séances composent leurs repas et leurs prises avec ces produits : ceux que tu ajoutes passent en premier. Les valeurs par défaut sont des ordres de grandeur (≈) : vérifie l’étiquette de ton produit et adapte-le si besoin.")}</span></div>
        <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
          <div className="between" style={{ gap: 'var(--space-12)' }}>
            <span className="stack"><span className="t-strong" id="lbl-caf">{$t("Proposer de la caféine")}</span><span className="t-caption c-moderate">{$t("Avant les séances de qualité et les longues sorties, jamais après 16 h. À essayer à l’entraînement avant une course.")}</span></span>
            <Switch checked={caffeine} labelledBy="lbl-caf" onChange={(v) => setNutriMain({ caffeine: v })} />
          </div>
        </div>
        {CATEGORIES().map((c) => {
          const list = bank.filter((f) => f.category === c.id);
          return (
            <section key={c.id} aria-labelledby={'fb-' + c.id} className="stack-8">
              <h2 id={'fb-' + c.id} className="overline c-neutral" style={{ padding: '0 var(--space-4)' }}>{c.label}</h2>
              <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
                {list.map((f) => {
                  const kc = kcalOf(f);
                  return (
                    <li key={f.id}>
                      <button type="button" className="settings-row" onClick={() => open(c.id, f)}>
                        <span className="stack grow">
                          <span className="t-strong">{foodName(f)}{!f.builtin && <span className="t-caption" style={{ marginLeft: 'var(--space-8)', color: 'var(--primary-fg)' }}>{$t("à toi")}</span>}</span>
                          <span className="t-caption c-moderate">{foodUnit(f)} · {$t("{0} g de glucides", { 0: num(carbsOf(f), 0, 1) })}{kc !== null ? ' · ' + $t("{0} kcal", { 0: num(kc, 0) }) : ''}{f.approx ? ' · ' + $t("≈ à vérifier sur l’étiquette") : ''}</span>
                          {foodNote(f) && <span className="t-caption c-neutral">{foodNote(f)}</span>}
                        </span>
                        <Icon name="pencil" size={18} style={{ color: 'var(--text-moderate)' }} />
                      </button>
                    </li>
                  );
                })}
                {list.length === 0 && <li className="t-caption c-moderate" style={{ padding: 'var(--space-12) 0' }}>{$t("Aucun produit dans cette catégorie.")}</li>}
              </ul>
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => open(c.id, null)}><Icon name="plus" size={18} />{$t("Ajouter un produit")}</button>
            </section>
          );
        })}
        {modified > 0 && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => { resetFoods(); showToast($t("Produits par défaut rétablis")); }}>{$t("Rétablir les produits par défaut ({0} masqué(s) ou adapté(s))", { 0: modified })}</button>}
      </main>
      {sh.open && target && <FoodSheet cat={target.cat} food={target.food} sh={sh} />}
    </div>
  );
}
