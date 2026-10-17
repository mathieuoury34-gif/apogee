// Progression › Analyse — lectures dérivées des séances et du plan : respect du plan, puis (lots suivants)
// zones de FC, charge par discipline, records et efficacité, enchaînements.
import { $t } from '../i18n';
import { useState } from 'react';
import { AppHeader, Empty, ErrorBanner, Segmented, SubNav } from '../ui/kit';
import { useCalc } from '../data/store';
import { planCompliance, type Compliance } from '../domain/compliance';
import { dayMonth, duration, monthLong, num, pct } from '../ui/format';
import { NAV } from './Progress';

export function AnalysisScreen() {
  const { data, d } = useCalc();
  return (
    <div className="screen" data-screen="analyse">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
          <ComplianceCard data={data} d={d} />
        </div>
      </main>
    </div>
  );
}

type CalcCtx = ReturnType<typeof useCalc>;

function rateBar(c: Compliance) {
  const r = c.planned ? c.done / c.planned : null;
  return (
    <li key={c.key} className="stack-4">
      <div className="between t-caption">
        <span className="t-caption-strong">{c.key.length === 7 ? monthLong(c.key) : $t("Semaine du {0}", { 0: dayMonth(c.key) })}</span>
        <span className="c-neutral">{r === null ? '—' : `${c.done}/${c.planned} · ${pct(r)}`}{c.plannedSec > 0 ? ` · ${duration(c.doneSec)} / ${duration(c.plannedSec)}` : ''}</span>
      </div>
      <div className="meter"><span style={{ width: r === null ? 0 : `${Math.round(Math.min(1, r) * 100)}%` }} /></div>
    </li>
  );
}

function ComplianceCard({ d, data }: { d: CalcCtx['d']; data: CalcCtx['data'] }) {
  const [by, setBy] = useState<'week' | 'month'>('week');
  const rep = planCompliance(data, d.links, d.refs, d.today);
  const l4 = rep.last4;
  if (!l4.planned && !rep.weeks.length && !rep.months.length) {
    return <section className="card g12" aria-label={$t("Respect du plan")}><h2>{$t("Respect du plan")}</h2><Empty icon="calendrier" title={$t("Pas encore de séance prévue échue")} text={$t("Dès que des séances prévues sont passées, tu verras ici la part que tu as réalisée.")} /></section>;
  }
  const rows = (by === 'week' ? rep.weeks : rep.months).slice().reverse();
  return (
    <section className="card g12" aria-label={$t("Respect du plan")}>
      <div className="between"><h2>{$t("Respect du plan")}</h2><Segmented label={$t("Regroupement")} value={by} onChange={setBy} options={[['week', $t("Semaine")], ['month', $t("Mois")]]} /></div>
      {l4.planned > 0 && (
        <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
          <span className="t-h2">{pct(l4.done / l4.planned)}</span>
          <span className="t-caption c-neutral">{$t("des séances prévues ces 4 dernières semaines ({0} sur {1}){2}", { 0: l4.done, 1: l4.planned, 2: l4.plannedSec > 0 ? $t(", soit {0} de temps réalisé sur {1} prévu", { 0: duration(l4.doneSec), 1: duration(l4.plannedSec) }) : '' })}</span>
        </div>
      )}
      <ul className="stack" style={{ gap: 'var(--space-10)' }}>{rows.map(rateBar)}</ul>
      <p className="t-legal c-moderate">{$t("Une séance prévue compte comme faite quand une séance réalisée lui est rattachée. Les jours couverts par une interruption ne comptent pas comme manqués. Le temps ne porte que sur les séances dont la durée prévue est connue.")}</p>
    </section>
  );
}
