// Accueil : quatre tuiles sous « Forme du jour » — pas, étages, calories du jour et rapport de charge.
// Pas, étages et calories viennent de Health Connect (rien n'est calculé) ; le rapport de charge est celui de l'onglet Charge.
import { $t } from '../i18n';
import type { ReactNode } from 'react';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../data/store';
import { addDays } from '../domain/dates';
import { dayEnergy } from '../domain/energy';
import { RATIO_HIGH, RATIO_LOW, RATIO_OPT_HIGH } from '../domain/loadStatus';
import { NBSP, num } from '../ui/format';

function Tile({ icon, label, value, unit, sub, color, to }: { icon: string; label: string; value: ReactNode; unit?: string; sub?: ReactNode; color: string; to: string }) {
  return (
    <button type="button" className="act-tile" style={{ ['--ac' as string]: color }} onClick={() => navigate(to)}>
      <span className="ico"><Icon name={icon} size={20} /></span>
      <span className="lbl">{label}</span>
      <span className="val"><strong>{value}</strong>{unit && <span>{NBSP}{unit}</span>}</span>
      {sub && <span className="sub">{sub}</span>}
    </button>
  );
}

export function ActivityTiles({ className }: { className?: string }) {
  const { data, d } = useCalc();
  const today = d.today;
  const cur = data.energy[today] && !data.energy[today].deleted ? data.energy[today] : null;
  const avg = (k: 'steps' | 'floors') => {
    const v = Array.from({ length: 7 }, (_, i) => data.energy[addDays(today, -(i + 1))]).map((e) => (e && !e.deleted ? e[k] ?? null : null)).filter((x): x is number => !!x);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const e = dayEnergy(data, today);
  const ratio = d.constat.acuteChronicRatio;
  const rColor = ratio === null ? 'var(--text-moderate)' : ratio > RATIO_HIGH ? 'var(--critical)' : ratio > RATIO_OPT_HIGH ? 'var(--warning)' : ratio >= RATIO_LOW ? 'var(--success)' : 'var(--form-strained)';
  const rLabel = ratio === null ? $t("28 jours d’historique requis") : ratio > RATIO_HIGH ? $t("Très élevé") : ratio > RATIO_OPT_HIGH ? $t("Élevé") : ratio >= RATIO_LOW ? $t("Optimal") : $t("Bas");
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : num(v, 0));
  const a7s = avg('steps'), a7f = avg('floors');
  const noneYet = !cur?.steps && !cur?.floors;
  return (
    <section aria-label={$t("Activité du jour")} className={'act-tiles ' + (className ?? '')} data-component="ActivityTiles">
      <Tile icon="run" label={$t("Pas")} value={fmt(cur?.steps)} sub={a7s === null ? undefined : $t("moy. 7 j : {0}", { 0: num(a7s, 0) })} color="var(--chart-7)" to="/progression/sante?ancre=pas-etages&mesure=steps" />
      <Tile icon="stairs" label={$t("Étages")} value={fmt(cur?.floors)} sub={a7f === null ? undefined : $t("moy. 7 j : {0}", { 0: num(a7f, 0) })} color="var(--chart-4)" to="/progression/sante?ancre=pas-etages&mesure=floors" />
      <Tile icon="flame" label={$t("Calories")} value={fmt(e.total)} unit="kcal" sub={e.active === null ? undefined : $t("dont {0} actives", { 0: num(e.active, 0) })} color="var(--chart-1)" to="/progression/sante?ancre=calories" />
      <Tile icon="gauge" label={$t("Rapport de charge")} value={ratio === null ? '—' : num(ratio, 2)} sub={rLabel} color={rColor} to="/progression?ancre=charge-aigue" />
      {noneYet && <p className="t-legal c-moderate act-note">{$t("Pas et étages arrivent de Health Connect : mets l’APK à jour et accepte les nouvelles autorisations « Pas » et « Étages ».")}</p>}
    </section>
  );
}
