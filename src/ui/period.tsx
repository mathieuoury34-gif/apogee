// Fenêtre de période commune à tous les graphes de Progression : on choisit la durée affichée (1 semaine, 1 mois…),
// on glisse vers les périodes précédentes avec les flèches (ou en balayant la barre), et on revient à aujourd'hui d'un appui.
// Les graphes eux-mêmes gardent leur curseur (toucher / survol) et reçoivent simplement la tranche de jours à tracer.
import { $t } from '../i18n';
import { useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { useSwipe } from './kit';
import { dateShort } from './format';

export type SpanOption = [days: number, label: string];

export const SPANS_SHORT: SpanOption[] = [[7, $t("1 sem.")], [14, $t("2 sem.")], [30, $t("1 mois")], [90, $t("3 mois")], [180, $t("6 mois")], [365, $t("1 an")]];
export const SPANS_LONG: SpanOption[] = [[28, $t("4 sem.")], [56, $t("8 sem.")], [91, $t("3 mois")], [182, $t("6 mois")], [365, $t("1 an")]];
export const SPANS_VERY_SHORT: SpanOption[] = [[7, $t("7 j")], [14, $t("14 j")], [30, $t("30 j")], [60, $t("2 mois")], [90, $t("3 mois")]];

export interface PeriodWindow {
  span: number; offset: number;
  setSpan: (n: number) => void;
  /** Tranche de `all` (triée du plus ancien au plus récent) visible : les `span` derniers éléments, décalés de `offset`. */
  slice: <T>(all: T[]) => T[];
  canPrev: (total: number) => boolean; canNext: boolean;
  prev: (total: number) => void; next: () => void; reset: () => void;
  atToday: boolean;
}

/** `offset` = nombre de jours entre la fin de la fenêtre et aujourd'hui. On avance par pas d'une fenêtre entière. */
export function usePeriod(defaultSpan: number): PeriodWindow {
  const [span, setSpanRaw] = useState(defaultSpan);
  const [offset, setOffset] = useState(0);
  const maxOffset = (total: number) => Math.max(0, total - span);
  return {
    span, offset,
    setSpan: (n) => { setSpanRaw(n); setOffset(0); },
    slice: <T,>(all: T[]) => {
      const end = Math.max(Math.min(span, all.length), all.length - Math.min(offset, maxOffset(all.length)));
      return all.slice(Math.max(0, end - span), end);
    },
    canPrev: (total) => offset < maxOffset(total), canNext: offset > 0,
    prev: (total) => setOffset((o) => Math.min(maxOffset(total), o + span)),
    next: () => setOffset((o) => Math.max(0, o - span)),
    reset: () => setOffset(0),
    atToday: offset === 0,
  };
}

/** Barre de période : choix de la durée, flèches ‹ ›, dates affichées et retour à aujourd'hui. Balayer la barre change aussi de période. */
export function PeriodBar({ p, options, total, from, to, label, children }: { p: PeriodWindow; options: SpanOption[]; total: number; from?: string; to?: string; label?: string; children?: ReactNode }) {
  const swipe = useSwipe(() => p.next(), () => p.prev(total));
  return (
    <div className="period-bar" data-component="PeriodBar" {...swipe}>
      <div role="group" aria-label={$t("Période")} className="period-spans">
        {options.map(([d, l]) => <button key={d} type="button" className="chip" aria-pressed={p.span === d} onClick={() => p.setSpan(d)}>{l}</button>)}
      </div>
      <div className="period-nav">
        <button type="button" className="icon-btn" aria-label={$t("Période précédente")} disabled={!p.canPrev(total)} onClick={() => p.prev(total)}><Icon name="back" size={20} /></button>
        <span className="when t-caption-strong" aria-live="polite">{label ?? (from && to ? (from === to ? dateShort(from) : dateShort(from) + ' → ' + dateShort(to)) : '')}</span>
        <button type="button" className="icon-btn" aria-label={$t("Période suivante")} disabled={!p.canNext} onClick={p.next}><Icon name="next" size={20} /></button>
        {!p.atToday && <button type="button" className="chip chip-small" onClick={p.reset}>{$t("Aujourd’hui")}</button>}
      </div>
      {children}
    </div>
  );
}

/** Jour lu par le curseur d'un graphe : mémorisé par date, donc il reste en place quand on change de fenêtre s'il y est encore, sinon retour au dernier jour. */
export function useDaySel(days: string[], hasData?: (day: string) => boolean): [number, (i: number) => void] {
  const [sel, setSel] = useState<string | null>(null);
  const i = sel === null ? -1 : days.indexOf(sel);
  let dflt = Math.max(0, days.length - 1);
  if (hasData) for (let k = days.length - 1; k >= 0; k--) if (hasData(days[k])) { dflt = k; break; }
  return [i >= 0 ? i : dflt, (k: number) => setSel(days[k] ?? null)];
}
