// Paramètres › Alimentation : la banque d'aliments (par catégorie) que le calcul de la carte « Alimentation » utilise.
// Produits par défaut (valeurs indicatives, à vérifier sur l'étiquette) + produits de l'athlète, qui passent en premier.
import { $t } from '../i18n';
import { useState } from 'react';
import { ChipGroup, Disclosure, Segmented, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useLocalSheet } from '../ui/menu';
import { useData } from '../data/store';
import { getData } from '../data/store';
import { hideDefaultFood, removeFood, resetFoods, restore, saveFood, setNutriMain } from '../data/actions';
import { CATEGORIES, DIETS, carbsOf, foodIcon, foodName, foodNote, foodUnit, kcalOf, resolveBank, type BankFood } from '../domain/foods';
import { liveRecords } from '../domain/load';
import type { FoodCategory } from '../domain/types';
import { num, parseNum, toInput } from '../ui/format';

const opt = (s: string): number | null => { const v = parseNum(s); return isNaN(v) ? null : v; };

function FoodSheet({ cat: cat0, food, sh, fav: fav0 }: { cat: FoodCategory; food: BankFood | null; sh: ReturnType<typeof useLocalSheet>; fav: boolean }) {
  const [cat, setCat] = useState<FoodCategory>(cat0);
  const [fav, setFav] = useState(fav0);
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
    const saved = saveFood({
      id: food && !food.builtin ? food.id : undefined, base: food?.builtin ? food.id : null, category: cat, name: name.trim(), unit: unit.trim() || $t("1 portion"),
      massG: m, liquid, kcal100: opt(kcal), carbs100: c, protein100: opt(prot), salt100: opt(salt), caffeineMg: opt(caf), mixed,
    });
    const cur = getData().nutri.main?.favorites ?? [];
    const rest = cur.filter((x) => x !== saved.id && x !== food?.id);
    setNutriMain({ favorites: fav ? [...rest, saved.id] : rest });
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
      head={food ? <span className="t-caption c-moderate">{CATEGORIES().find((x) => x.id === cat)?.label}</span> : undefined}
      footer={<button type="button" className="btn btn-primary block" disabled={!valid} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
        {!food && <ChipGroup<FoodCategory> label={$t("Catégorie")} value={cat} options={CATEGORIES().map((c) => [c.id, c.label] as [FoodCategory, string])} onChange={(v) => { setCat(v); setLiquid(v === 'drink'); }} />}
        <div className="between" style={{ gap: 'var(--space-12)' }}>
          <span className="t-strong" id="lbl-fav">{$t("Favori")}</span>
          <Switch checked={fav} labelledBy="lbl-fav" onChange={setFav} />
        </div>
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
            const cur = getData().nutri.main?.favorites ?? [];
            if (cur.includes(food.id)) setNutriMain({ favorites: cur.filter((x) => x !== food.id) });
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
  const bank = resolveBank(data, true);
  const main = data.nutri.main && !data.nutri.main.deleted ? data.nutri.main : undefined;
  const caffeine = !!main?.caffeine;
  const diet = main?.diet ?? [];
  const favs = main?.favorites ?? [];
  const favList = bank.filter((f) => favs.includes(f.id));
  const toggleFav = (id: string) => setNutriMain({ favorites: favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id] });
  const modified = liveRecords(data.foods).filter((r) => r.base).length;
  const open = (cat: FoodCategory, food: BankFood | null) => { setTarget({ cat, food }); sh.show(); };
  const heart = (f: BankFood) => (
    <button type="button" className="icon-btn" aria-pressed={favs.includes(f.id)} aria-label={favs.includes(f.id) ? $t("Retirer des favoris") : $t("Mettre en favori")} onClick={() => toggleFav(f.id)} style={favs.includes(f.id) ? { color: 'var(--critical)' } : { color: 'var(--text-moderate)' }}><Icon name="heart" size={20} style={favs.includes(f.id) ? { fill: 'currentColor' } : undefined} /></button>
  );
  const row = (f: BankFood) => (
    <li key={f.id} className="row" style={{ gap: 0 }}>
      <span className="nico" style={{ marginRight: 'var(--space-8)' }}><Icon name={foodIcon(f)} size={18} /></span>
      <button type="button" className="settings-row grow" onClick={() => open(f.category, f)}>
        <span className="stack grow">
          <span className="t-strong">{foodName(f)}</span>
          <span className="t-caption c-moderate">{foodUnit(f)} · {$t("{0} g de glucides", { 0: num(carbsOf(f), 0, 1) })}</span>
        </span>
      </button>
      {heart(f)}
    </li>
  );
  return (
    <div className="screen" data-screen="alimentation">
      <SubHeader title={$t("Ma banque d’aliments")} fallback="/parametres" />
      <main className="content form-narrow" style={{ gap: 'var(--space-24)' }}>
        <section aria-labelledby="fb-prefs" className="stack-8">
          <h2 id="fb-prefs" className="overline c-neutral" style={{ padding: '0 var(--space-4)' }}>{$t("Préférences")}</h2>
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="field">
              <span className="t-strong">{$t("Régime")}</span>
              <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
                {DIETS().map(([k, l]) => (
                  <button key={k} type="button" className="chip" aria-pressed={diet.includes(k)} onClick={() => setNutriMain({ diet: diet.includes(k) ? diet.filter((x) => x !== k) : [...diet, k] })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="t-strong">{$t("Niveau de détail")}</span>
              <Segmented<'simple' | 'full'> label={$t("Niveau de détail")} value={main?.detail ?? 'simple'} options={[['simple', $t("Simple")], ['full', $t("Complet")]]} onChange={(v) => setNutriMain({ detail: v })} />
            </div>
            <div className="between" style={{ gap: 'var(--space-12)' }}>
              <span className="t-strong" id="lbl-caf">{$t("Proposer de la caféine")}</span>
              <Switch checked={caffeine} labelledBy="lbl-caf" onChange={(v) => setNutriMain({ caffeine: v })} />
            </div>
          </div>
        </section>
        <section aria-labelledby="fb-favs" className="stack-8">
          <h2 id="fb-favs" className="overline c-neutral" style={{ padding: '0 var(--space-4)' }}>{$t("Favoris")}</h2>
          {favList.length > 0
            ? <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>{favList.map(row)}</ul>
            : <p className="t-caption c-moderate" style={{ padding: '0 var(--space-4)', margin: 0 }}>{$t("Aucun favori : tous les produits sont utilisés. Dès qu’il y en a un, seuls tes favoris le sont.")}</p>}
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => open('drink', null)}><Icon name="plus" size={18} />{$t("Ajouter un produit")}</button>
        </section>
        <Disclosure title={$t("Tous les produits")}>
          <div className="stack" style={{ gap: 'var(--space-16)' }}>
            {CATEGORIES().map((c) => {
              const list = bank.filter((f) => f.category === c.id);
              return (
                <section key={c.id} aria-labelledby={'fb-' + c.id} className="stack-8">
                  <h3 id={'fb-' + c.id} className="overline c-neutral">{c.label}</h3>
                  {list.length > 0 ? <ul className="tile-list divided" style={{ padding: 0 }}>{list.map(row)}</ul> : <span className="t-caption c-moderate">{$t("Aucun produit dans cette catégorie.")}</span>}
                </section>
              );
            })}
            {modified > 0 && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => { resetFoods(); showToast($t("Produits par défaut rétablis")); }}>{$t("Rétablir les produits par défaut ({0} masqué(s) ou adapté(s))", { 0: modified })}</button>}
          </div>
        </Disclosure>
      </main>
      {sh.open && target && <FoodSheet cat={target.cat} food={target.food} sh={sh} fav={target.food ? favs.includes(target.food.id) : true} />}
    </div>
  );
}
