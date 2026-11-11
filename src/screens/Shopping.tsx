// Liste de courses de la semaine : tout ce que les séances prévues demandent d'acheter (avant, pendant, après),
// regroupé par produit, avec le même défilement d'une semaine à l'autre que le calendrier.
import { $t } from '../i18n';
import { useState } from 'react';
import { Empty, Sheet, useSwipe } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useCalc } from '../data/store';
import { addDays, mondayOf } from '../domain/dates';
import { resolveBank, foodIcon, foodUnit } from '../domain/foods';
import { weekShopping, type ShopLine } from '../domain/nutrition';
import { dayMonth } from '../ui/format';
import type { useLocalSheet } from '../ui/menu';

const qty = (l: ShopLine) => (l.ml > 0 ? (l.ml >= 1000 ? String(Math.round(l.ml / 100) / 10).replace('.', ',') + ' L' : l.ml + ' ml') : l.grams > 0 ? String(l.grams).replace('.', ',') + ' g' : '× ' + l.units);

export function ShoppingSheet({ monday: m0, sh }: { monday: string; sh: ReturnType<typeof useLocalSheet> }) {
  const { data, d } = useCalc();
  const [monday, setMonday] = useState(m0);
  const go = (k: number) => setMonday(addDays(monday, 7 * k));
  const swipe = useSwipe(() => go(1), () => go(-1));
  const bank = resolveBank(data);
  const byId = new Map(resolveBank(data, true).map((f) => [f.id, f]));
  const { lines, sessions } = weekShopping(data, d.refsAt, bank, monday, d.today, (id) => d.links.byPlanned.has(id));
  const rel = (mondayOf(monday) === mondayOf(d.today)) ? $t("cette semaine") : '';
  return (
    <Sheet title={$t("Liste de courses")} onClose={sh.hide}>
      <div className="stack" style={{ gap: 'var(--space-12)', minHeight: 240 }} {...swipe}>
        <div className="period-nav">
          <button type="button" className="icon-btn" aria-label={$t("Semaine précédente")} onClick={() => go(-1)}><Icon name="back" /></button>
          <span className="stack center grow">
            <span className="t-amount-m">{dayMonth(monday)} – {dayMonth(addDays(monday, 6))}</span>
            {rel && <span className="t-caption c-moderate">{rel}</span>}
          </span>
          <button type="button" className="icon-btn" aria-label={$t("Semaine suivante")} onClick={() => go(1)}><Icon name="next" /></button>
        </div>
        {lines.length === 0 ? (
          <Empty icon="cart" title={$t("Rien à acheter")} text={$t("Aucune séance à venir cette semaine-là n’a besoin d’aliments.")} />
        ) : (
          <>
            <span className="t-caption c-moderate">{$t("{0} séance(s) à venir", { 0: sessions })}</span>
            <ul className="stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {lines.map((l) => {
                const f = byId.get(l.foodId);
                return (
                  <li key={l.foodId} className="between" style={{ gap: 'var(--space-12)', padding: 'var(--space-8) 0', borderTop: '1px solid var(--border)' }}>
                    <span className="row" style={{ gap: 'var(--space-8)' }}><span className="nico"><Icon name={f ? foodIcon(f) : 'f-utensils'} size={18} /></span><span className="stack"><span className="t-strong">{l.name}</span>{f && l.units > 0 && <span className="t-caption c-moderate">{foodUnit(f)}</span>}</span></span>
                    <span className="t-strong">{qty(l)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
