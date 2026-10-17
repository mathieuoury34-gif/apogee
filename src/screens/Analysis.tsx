// Progression › Analyse — lectures dérivées des séances et du plan : bilan de semaine, respect du plan,
// zones de FC (80/20), forme de fond par discipline, records, efficacité, enchaînements vélo → course.
// Chaque carte dit comment elle calcule : aucun nombre sans sa méthode.
import { $t } from '../i18n';
import { Fragment, useState } from 'react';
import { AppHeader, Empty, ErrorBanner, OtherToggle, Segmented, Sheet, SubNav, showToast, useWithOther } from '../ui/kit';
import { useLocalSheet } from '../ui/menu';
import { FITNESS_COLOR, FITNESS_LABEL, SplitBars, StackedFitness } from '../ui/charts2';
import { navigate } from '../ui/router';
import { useCalc } from '../data/store';
import { deleteWeight, restore, saveWeight } from '../data/actions';
import { sleepStats, weightTrend } from '../domain/body';
import { planCompliance, type Compliance } from '../domain/compliance';
import { addDays, mondayOf } from '../domain/dates';
import { fitnessByDiscipline, type LoadKey } from '../domain/loadByDiscipline';
import { brickAnalysis, efficiency, personalRecords, type PersonalRecord } from '../domain/records';
import { weekSummary, type WeekSummary } from '../domain/summary';
import { HR_ZONE_EDGES, polarSplit, weeklyZones } from '../domain/zones';
import { dateFr, dateShort, dayMonth, DISCIPLINE_LABEL, duration, mmss, monthLong, num, pct, signed, speedKmh, NBSP } from '../ui/format';
import { NAV } from './Progress';

type CalcCtx = ReturnType<typeof useCalc>;
type Props = { data: CalcCtx['data']; d: CalcCtx['d'] };

export function AnalysisScreen() {
  const { data, d } = useCalc();
  return (
    <div className="screen" data-screen="analyse">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
          <WeekCard data={data} d={d} />
          <ComplianceCard data={data} d={d} />
          <ZonesCard data={data} d={d} />
          <FitnessCard data={data} d={d} />
          <EfficiencyCard data={data} d={d} />
          <RecordsCard data={data} d={d} />
          <WeightCard data={data} d={d} />
          <SleepCard data={data} d={d} />
          <BricksCard data={data} d={d} />
        </div>
      </main>
    </div>
  );
}

const hms = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0'); };

// ------------------------------------------------------------------ bilan de semaine
function weekText(w: WeekSummary): string {
  const lines = [`Bilan de la semaine du ${dateFr(w.start)} au ${dateFr(w.end)}${w.partial ? ' (en cours)' : ''}`];
  lines.push(`Séances : ${w.doneSessions} réalisées sur ${w.plannedSessions} prévues.`);
  for (const r of w.disciplines) lines.push(`- ${DISCIPLINE_LABEL[r.key as 'RUN']} : ${duration(r.doneSec)} réalisé${r.plannedSec ? ` pour ${duration(r.plannedSec)} prévu` : ''}`);
  lines.push(`Charge de la semaine : ${num(w.load, 0)}${w.previousLoad !== null ? ` (semaine précédente : ${num(w.previousLoad, 0)})` : ''}.`);
  if (w.fitness !== null) lines.push(`Forme de fond : ${num(w.fitness, 0)}${w.fitnessDelta !== null ? ` (${signed(w.fitnessDelta, 1)} sur 7 jours)` : ''} ; fraîcheur : ${w.freshness === null ? '—' : signed(w.freshness, 0)}${w.acwr !== null ? ` ; rapport aigu/chronique : ${num(w.acwr, 2)}` : ''}.`);
  if (w.interruption) lines.push(`Interruption déclarée : ${w.interruption}.`);
  return lines.join('\n');
}

function WeekCard({ data, d }: Props) {
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const start = which === 'this' ? mondayOf(d.today) : addDays(mondayOf(d.today), -7);
  const w = weekSummary(data, d, start);
  const copy = async () => {
    try { await navigator.clipboard.writeText(weekText(w)); showToast($t("Bilan copié")); } catch { showToast($t("Copie impossible sur cet appareil"), { error: true }); }
  };
  const diff = w.previousLoad && w.previousLoad > 0 ? w.load / w.previousLoad - 1 : null;
  return (
    <section className="card g12" aria-label={$t("Bilan de semaine")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Bilan de semaine")}</h2>
        <Segmented label={$t("Semaine")} value={which} onChange={setWhich} options={[['this', $t("En cours")], ['last', $t("Dernière")]]} />
      </div>
      <p className="t-caption c-moderate">{$t("Du {0} au {1}", { 0: dateFr(w.start), 1: dateFr(w.end) })}{w.partial ? $t(" · semaine en cours") : ''}{w.interruption ? ` · ${w.interruption}` : ''}</p>
      {!w.disciplines.length && !w.plannedSessions ? <p className="t-caption c-moderate">{$t("Rien de prévu ni de réalisé cette semaine.")}</p> : (
        <>
          <dl className="kv">
            <dt>{$t("Séances réalisées / prévues")}</dt><dd>{w.doneSessions} / {w.plannedSessions}</dd>
            {w.disciplines.map((r) => <Fragment key={r.key}><dt>{DISCIPLINE_LABEL[r.key as 'RUN']}</dt><dd>{duration(r.doneSec)}{r.plannedSec ? ` / ${duration(r.plannedSec)}` : ''}</dd></Fragment>)}
            <dt>{$t("Charge de la semaine")}</dt><dd>{num(w.load, 0)}{diff !== null ? ` (${signed(diff * 100, 0)}${NBSP}%)` : ''}</dd>
            {w.fitness !== null && <><dt>{$t("Forme de fond")}</dt><dd>{num(w.fitness, 0)}{w.fitnessDelta !== null ? ` (${signed(w.fitnessDelta, 1)})` : ''}</dd></>}
            {w.freshness !== null && <><dt>{$t("Fraîcheur")}</dt><dd>{signed(w.freshness, 0)}</dd></>}
            {w.acwr !== null && <><dt>{$t("Aigu / chronique")}</dt><dd>{num(w.acwr, 2)}</dd></>}
          </dl>
          <p className="t-legal c-moderate">{$t("Les durées sont « réalisé / prévu » ; le prévu n’est compté que pour les séances dont la durée est connue.")}</p>
        </>
      )}
      <button type="button" className="btn btn-secondary" onClick={copy}>{$t("Copier le bilan pour mon coach")}</button>
    </section>
  );
}

// ------------------------------------------------------------------ respect du plan
function rateBar(c: Compliance) {
  const r = c.planned ? c.done / c.planned : null;
  return (
    <li key={c.key} className="stack-4">
      <div className="between t-caption">
        <span className="t-caption-strong">{c.key.length === 7 ? monthLong(c.key) : $t("Semaine du {0}", { 0: dayMonth(c.key) })}</span>
        <span className="c-neutral">{r === null ? '—' : `${c.done}/${c.planned} · ${pct(r)}`}{c.plannedSec > 0 ? ` · ${duration(c.doneSec)} / ${duration(c.plannedSec)}` : ''}</span>
      </div>
      <div className="meter"><span style={{ width: r === null ? 0 : `${Math.round(Math.min(1, r) * 100)}%`, background: "var(--brand-primary)" }} /></div>
    </li>
  );
}

function ComplianceCard({ d, data }: Props) {
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

// ------------------------------------------------------------------ zones de FC
function ZonesCard({ d, data }: Props) {
  const [n, setN] = useState<'4' | '8' | '12'>('8');
  const [withOther] = useWithOther();
  const hrMax = d.ctx.hrMax.bpm;
  const rep = weeklyZones(data, hrMax, d.today, +n, withOther);
  const p = polarSplit(rep.total);
  const edges = HR_ZONE_EDGES.map((e) => (hrMax ? Math.round(e * hrMax) : null));
  const range = [`< ${edges[0]}`, `${edges[0]}–${edges[1]}`, `${edges[1]}–${edges[2]}`, `${edges[2]}–${edges[3]}`, `≥ ${edges[3]}`];
  return (
    <section className="card g12" aria-label={$t("Temps par zone de FC")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Temps par zone de FC")}</h2>
        <Segmented label={$t("Période")} value={n} onChange={setN} options={[['4', $t("4 sem.")], ['8', $t("8 sem.")], ['12', $t("12 sem.")]]} />
      </div>
      <OtherToggle />
      {!hrMax || !rep.sessions ? <p className="t-caption c-moderate">{!hrMax ? $t("Il faut une FC max (déclarée ou calculée) : renseigne ta date de naissance ou une FC max dans Progression › Zones.") : $t("Aucune séance de course, vélo ou natation avec une courbe cardiaque sur cette période.")}</p> : (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
            <span className="t-h2">{pct(p.total ? p.easy / p.total : 0)}</span>
            <span className="t-caption c-neutral">{$t("du temps en zone facile (moins de 80 % de ta FC max), sur {0} séances ({1})", { 0: rep.sessions, 1: duration(p.total) })}</span>
          </div>
          <SplitBars rows={[{ label: $t("Total sur la période"), easy: p.easy, hard: p.hard, intense: p.intense }]} />
          <div className="legend">
            <span><span className="dot s10" style={{ background: 'var(--zone-easy)' }} />{$t("Facile < 80 %")}</span>
            <span><span className="dot s10" style={{ background: 'var(--zone-hard)' }} />{$t("Soutenue 80–90 %")}</span>
            <span><span className="dot s10" style={{ background: 'var(--zone-intense)' }} />{$t("Intense ≥ 90 %")}</span>
          </div>
          <h3 className="t-strong">{$t("Semaine par semaine")}</h3>
          <SplitBars rows={rep.weeks.slice().reverse().filter((w) => w.sessions).map((w) => { const q = polarSplit(w.zones); return { label: $t("Semaine du {0}", { 0: dayMonth(w.start) }), easy: q.easy, hard: q.hard, intense: q.intense }; })} />
          <h3 className="t-strong">{$t("Détail par zone")}</h3>
          <ul>
            {rep.total.map((sec, i) => (
              <li key={i} className="legend-row">
                <span className="dot s10" style={{ background: i < 3 ? 'var(--zone-easy)' : i === 3 ? 'var(--zone-hard)' : 'var(--zone-intense)', opacity: i < 3 ? 0.45 + i * 0.25 : 1 }} />
                <span className="t-caption">Z{i + 1} · {range[i]} bpm</span>
                <span className="t-caption-strong">{duration(sec)} · {pct(p.total ? sec / p.total : 0)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="t-legal c-moderate">{$t("Zones en % de ta FC max retenue ({0} bpm) : Z1 < 60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 %. Course, vélo et natation seulement (le renforcement est exclu). Le repère « 80/20 » est générique : sans test de seuil, la vraie frontière varie d’un sportif à l’autre. Les séances sans courbe cardiaque ne sont pas comptées{1}.", { 0: hrMax ? num(hrMax, 0) : '—', 1: rep.withoutHr ? $t(" ({0} sur la période)", { 0: rep.withoutHr }) : '' })}</p>
    </section>
  );
}

// ------------------------------------------------------------------ forme de fond par discipline
function FitnessCard({ d, data }: Props) {
  const [withOther] = useWithOther();
  const all = fitnessByDiscipline(data, d.loads, d.series).filter((s) => s.day >= addDays(d.today, -182));
  if (all.length < 2) return null;
  const keys = (['SWIM', 'BIKE', 'RUN', 'STRENGTH', 'OTHER', 'FORFAIT'] as LoadKey[]).filter((k) => (k !== 'OTHER' || withOther) && all.some((s) => s.byKey[k] > 0.5));
  const last = all[all.length - 1];
  const tot = keys.reduce((t, k) => t + last.byKey[k], 0);
  return (
    <section className="card g12" aria-label={$t("Forme de fond par discipline")}>
      <h2>{$t("Forme de fond par discipline")}</h2>
      <OtherToggle />
      <StackedFitness slices={all} keys={keys} />
      <ul>
        {keys.map((k) => (
          <li key={k} className="legend-row"><span className="dot s10" style={{ background: FITNESS_COLOR[k] }} /><span className="t-caption">{FITNESS_LABEL[k]}</span><span className="t-caption-strong">{num(last.byKey[k], 0)} · {pct(tot ? last.byKey[k] / tot : 0)}</span></li>
        ))}
      </ul>
      <p className="t-legal c-moderate">{$t("Le même calcul que la forme de fond (moyenne exponentielle sur 42 jours), appliqué séparément à la charge de chaque discipline ; la somme redonne la forme de fond totale. Un point par semaine, sur 6 mois.")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ efficacité
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.15 || hi * 0.02;
  const W = 300, H = 56;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--chart-fitness)' }} /></svg>;
}

function EfficiencyCard({ d, data }: Props) {
  const [disc, setDisc] = useState<'RUN' | 'BIKE'>('RUN');
  const ef = efficiency(data, d.ctx.hrMax.bpm, disc, d.today);
  const fmt = (v: number | null) => (v === null ? '—' : disc === 'RUN' ? mmss(1000 / v) + NBSP + '/km' : speedKmh(v));
  return (
    <section className="card g12" aria-label={$t("Tendance d’efficacité")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Tendance d’efficacité")}</h2>
        <Segmented label={$t("Discipline")} value={disc} onChange={setDisc} options={[['RUN', DISCIPLINE_LABEL.RUN], ['BIKE', DISCIPLINE_LABEL.BIKE]]} />
      </div>
      {ef.points.length < 4 ? <p className="t-caption c-moderate">{$t("Pas assez de séances comparables : il faut des séances d’au moins 20 minutes, à une FC moyenne entre 65 et 85 % de ta FC max, sur terrain peu pentu, avec distance et FC moyenne.")}</p> : (
        <>
          {ef.change !== null && ef.refHr ? (
            <div className="stack-4">
              <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{signed(ef.change * 100, 1)}{NBSP}%</span><span className="t-caption c-neutral">{$t("d’efficacité sur les 4 dernières semaines")}</span></div>
              <span className="t-caption c-neutral">{$t("À {0} bpm : {1} aujourd’hui, contre {2} il y a 4 semaines.", { 0: ef.refHr, 1: fmt(ef.speedNow), 2: fmt(ef.speedBefore) })}</span>
            </div>
          ) : <p className="t-caption c-moderate">{$t("Il faut au moins 2 séances comparables sur les 4 dernières semaines et 2 sur les 4 précédentes pour afficher une évolution.")}</p>}
          <Spark values={ef.weeks.map((w) => w.ef)} />
          <div className="between t-legal c-moderate"><span>{dateShort(ef.weeks[0].start)}</span><span>{$t("{0} séances comparables", { 0: ef.points.length })}</span><span>{dateShort(ef.weeks[ef.weeks.length - 1].start)}</span></div>
        </>
      )}
      <p className="t-legal c-moderate">{$t("Efficacité = mètres parcourus par battement (vitesse ÷ FC moyenne), médiane par semaine, sur 26 semaines. On compare des séances à effort égal (FC moyenne entre 65 et 85 % de ta FC max, 20 min minimum, dénivelé inférieur à 2 %). Chaleur, fatigue, vent ou revêtement la font varier : lis une tendance, pas une séance.")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ records
function RecordsCard({ data }: Props) {
  const recs = personalRecords(data);
  if (!recs.length) return null;
  const line = (r: PersonalRecord) => {
    const v = r.spec.distanceM / r.timeSec;
    const rate = r.spec.discipline === 'RUN' ? mmss(1000 / v) + NBSP + '/km' : r.spec.discipline === 'BIKE' ? speedKmh(v) : mmss(100 / v) + NBSP + '/100' + NBSP + 'm';
    return (
      <li key={r.spec.label} className="rec-row">
        <button type="button" className="row-btn" style={{ padding: 0, textAlign: 'left' }} onClick={() => navigate('/seances/' + r.sessionId)}>
          <span className="stack-4"><span className="t-label">{DISCIPLINE_LABEL[r.spec.discipline]} · {r.spec.label}</span><span className="t-caption c-moderate">{dateFr(r.day)}{r.basis === 'session' ? $t(" · séance entière") : ''}{r.previous ? $t(" · avant : {0}", { 0: hms(r.previous.timeSec) }) : ''}</span></span>
        </button>
        <span className="stack-4" style={{ textAlign: 'right' }}><span className="t-strong">{hms(r.timeSec)}</span><span className="t-caption c-moderate">{rate}</span></span>
      </li>
    );
  };
  return (
    <section className="card g12" aria-label={$t("Records personnels")}>
      <h2>{$t("Records personnels")}</h2>
      <ul>{recs.map(line)}</ul>
      <p className="t-legal c-moderate">{$t("Meilleur segment continu de la distance, lu dans la courbe de vitesse de la montre ; « séance entière » quand il n’y a pas de courbe et que la distance de la séance est à 3 % près celle du record. Une vitesse physiquement impossible est écartée. Cliquer ouvre la séance.")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ poids
function WeightCard({ data, d }: Props) {
  const t = weightTrend(data, d.today);
  const sheet = useLocalSheet();
  const [val, setVal] = useState('');
  const kg = Number(val.replace(',', '.'));
  const ok = Number.isFinite(kg) && kg >= 25 && kg <= 300;
  const save = () => {
    if (!ok) return;
    const snap = saveWeight(d.today, kg);
    sheet.hide();
    showToast($t("Pesée enregistrée"), { undo: () => restore(snap) });
  };
  return (
    <section className="card g12" aria-label={$t("Poids")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Poids")}</h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => { setVal(t.latest ? String(t.latest.kg).replace('.', ',') : ''); sheet.show(); }}>{$t("Saisir une pesée")}</button>
      </div>
      {!t.latest ? <p className="t-caption c-moderate">{$t("Aucune pesée. Saisis-la à la main ; elle vient aussi de Health Connect si une balance connectée l’y dépose (Garmin ne l’envoie pas).")}</p> : (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
            <span className="t-h2">{num(t.avg7 ?? t.latest.kg, 1)}{NBSP}kg</span>
            <span className="t-caption c-neutral">{t.avg7 !== null ? $t("moyenne des 7 derniers jours") : $t("dernière pesée le {0}", { 0: dateFr(t.latest.day) })}</span>
          </div>
          {t.change !== null && <span className="t-caption c-neutral">{signed(t.change, 1)}{NBSP}kg {$t("par rapport à il y a 4 semaines")}</span>}
          <Spark values={t.points.map((p) => p.kg)} />
          <div className="between t-legal c-moderate"><span>{t.points.length ? dateShort(t.points[0].day) : ''}</span><span>{$t("{0} pesées sur 90 jours", { 0: t.points.length })}</span><span>{t.points.length ? dateShort(t.points[t.points.length - 1].day) : ''}</span></div>
        </>
      )}
      <p className="t-legal c-moderate">{$t("La moyenne sur 7 jours lisse les variations d’hydratation d’un jour à l’autre. Le poids est un simple suivi : il ne modifie aucune charge. Une pesée saisie à la main n’est jamais écrasée par Health Connect.")}</p>
      {sheet.open && (
        <Sheet title={$t("Saisir une pesée")} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <label className="field"><span className="lbl">{$t("Poids (kg), aujourd’hui")}</span><input className="input num" inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)} /></label>
            {t.latest?.day === d.today && t.latest.source === 'manual' && <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={() => { const snap = deleteWeight(d.today); sheet.hide(); showToast($t("Pesée supprimée"), { undo: () => restore(snap) }); }}>{$t("Supprimer la pesée d’aujourd’hui")}</button>}
          </div>
        </Sheet>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ sommeil
function SleepCard({ data, d }: Props) {
  const st = sleepStats(data, d.today);
  if (st.nights14 === 0) return null;
  const hh = (sec: number) => Math.floor(sec / 3600) + NBSP + 'h' + String(Math.round((sec % 3600) / 60)).padStart(2, '0');
  const clock = (m: number) => { const x = Math.round(m) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + NBSP + 'h' + String(x % 60).padStart(2, '0'); };
  const diff = st.avg7 !== null && st.avgBefore !== null ? st.avg7 - st.avgBefore : null;
  return (
    <section className="card g12" aria-label={$t("Sommeil")}>
      <h2>{$t("Sommeil")}</h2>
      <dl className="kv">
        <dt>{$t("Durée moyenne, 7 dernières nuits")}</dt><dd>{st.avg7 === null ? '—' : hh(st.avg7)}</dd>
        <dt>{$t("Écart avec les 3 semaines précédentes")}</dt><dd>{diff === null ? '—' : (diff >= 0 ? '+' : '−') + Math.round(Math.abs(diff) / 60) + NBSP + 'min'}</dd>
        <dt>{$t("Heure de coucher habituelle")}</dt><dd>{st.bedtimeMedian === null ? '—' : clock(st.bedtimeMedian)}</dd>
        <dt>{$t("Régularité du coucher (écart-type)")}</dt><dd>{st.bedtimeSd === null ? '—' : '± ' + Math.round(st.bedtimeSd) + NBSP + 'min'}</dd>
      </dl>
      <p className="t-legal c-moderate">{$t("Lecture seule, sans objectif de sommeil imposé : on compare ta semaine à tes propres habitudes. Le coucher est l’heure de début de la nuit lue par Health Connect, sur les 14 dernières nuits (5 minimum). Plus l’écart-type est petit, plus tes nuits sont régulières. La durée de la nuit compte déjà dans la forme du jour.")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ enchaînements vélo → course
function BricksCard({ d, data }: Props) {
  const rows = brickAnalysis(data, d.links, d.today).slice(0, 10);
  if (!rows.length) return null;
  const pace = (v: number | null) => (v === null ? '—' : mmss(v) + NBSP + '/km');
  return (
    <section className="card g12" aria-label={$t("Enchaînements vélo → course")}>
      <h2>{$t("Enchaînements vélo → course")}</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.runId} className="rec-row">
            <button type="button" className="row-btn" style={{ padding: 0, textAlign: 'left' }} onClick={() => navigate('/seances/' + r.runId)}>
              <span className="stack-4"><span className="t-label">{dateFr(r.day)}</span><span className="t-caption c-moderate">{$t("Transition")} {r.transitionSec === null ? '—' : mmss(r.transitionSec)}{r.runHr ? ` · ${num(r.runHr, 0)} bpm` : ''}</span></span>
            </button>
            <span className="stack-4" style={{ textAlign: 'right' }}><span className="t-strong">{pace(r.runPace)}</span><span className="t-caption c-moderate">{r.paceDelta === null ? $t("pas de référence") : $t("{0} % vs ton habituel {1}", { 0: signed(r.paceDelta * 100, 1), 1: pace(r.usualPace) })}</span></span>
          </li>
        ))}
      </ul>
      <p className="t-legal c-moderate">{$t("Pour chaque enchaînement confirmé ou rattaché à un BRICK prévu : durée de transition (fin du vélo → début de la course, au plus 45 min) et allure de la course comparée à la médiane de tes autres courses de 10 min ou plus des 90 jours précédents. Un écart positif signifie plus lent que d’habitude.")}</p>
    </section>
  );
}
