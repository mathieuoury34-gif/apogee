// Cartes d'analyse — lectures dérivées des séances et du plan : bilan de semaine, respect du plan,
// zones de FC (80/20), forme de fond par discipline, records, efficacité, enchaînements vélo → course.
// Chaque carte dit comment elle calcule : aucun nombre sans sa méthode.
import { $t } from '../i18n';
import { Fragment, useState } from 'react';
import { AppHeader, Empty, ErrorBanner, OtherToggle, Segmented, Sheet, SubNav, showToast, useWithOther, Info } from '../ui/kit';
import { useLocalSheet } from '../ui/menu';
import { FITNESS_COLOR, FITNESS_LABEL, SplitBars, StackedFitness } from '../ui/charts2';
import { navigate } from '../ui/router';
import { Icon } from '../ui/icons';
import { useCalc } from '../data/store';
import { deleteWeight, restore, saveWeight } from '../data/actions';
import { sleepStats, weightTrend } from '../domain/body';
import { planCompliance, type Compliance } from '../domain/compliance';
import { addDays, mondayOf } from '../domain/dates';
import { fitnessByDiscipline, type LoadKey } from '../domain/loadByDiscipline';
import { brickAnalysis, efficiency, EF_BAND, EF_BAND_BIKE, EF_MAX_CLIMB, EF_MAX_CLIMB_BIKE, personalRecords, type PersonalRecord } from '../domain/records';
import { weekSummary, type WeekSummary } from '../domain/summary';
import { HR_ZONE_EDGES, polarSplit, weeklyZones } from '../domain/zones';
import { dateFr, dateShort, dayMonth, DISCIPLINE_LABEL, duration, mmss, monthLong, num, pct, signed, speedKmh, NBSP } from '../ui/format';

type CalcCtx = ReturnType<typeof useCalc>;
export type Props = { data: CalcCtx['data']; d: CalcCtx['d'] };

const hms = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0'); };

// ------------------------------------------------------------------ bilan de semaine
export function WeekCard({ data, d }: Props) {
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const start = which === 'this' ? mondayOf(d.today) : addDays(mondayOf(d.today), -7);
  const w = weekSummary(data, d, start);
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
          <Info>{$t("Les durées sont « réalisé / prévu » ; le prévu n’est compté que pour les séances dont la durée est connue.")}</Info>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ respect du plan
/** Vert : au moins 80 % des séances prévues faites ; orange : 50 à 79 % ; rouge : moins de la moitié. */
const rateTone = (r: number) => (r >= 0.8 ? 'success' : r >= 0.5 ? 'warning' : 'critical');

function rateBar(c: Compliance) {
  const r = c.planned ? c.done / c.planned : null;
  const tone = r === null ? null : rateTone(r);
  return (
    <li key={c.key} className="stack-4">
      <div className="between t-caption">
        <span className="t-caption-strong">{c.key.length === 7 ? monthLong(c.key) : $t("Semaine du {0}", { 0: dayMonth(c.key) })}</span>
        <span className="c-neutral">{r === null ? $t("rien de prévu") : <><span className="t-caption-strong" style={{ color: `var(--${tone}-text)` }}>{pct(r)}</span>{` · ${c.done}/${c.planned}`}</>}{c.plannedSec > 0 ? ` · ${duration(c.doneSec)} / ${duration(c.plannedSec)}` : ''}</span>
      </div>
      <div className="meter"><span style={{ width: r === null ? 0 : `${Math.round(Math.min(1, r) * 100)}%`, background: tone ? `var(--${tone})` : undefined }} /></div>
    </li>
  );
}

export function ComplianceCard({ d, data }: Props) {
  const [by, setBy] = useState<'week' | 'month'>('week');
  const rep = planCompliance(data, d.links, d.refs, d.today);
  if (!rep.weeks.length && !rep.months.length) {
    return <section className="card g12" aria-label={$t("Respect du plan")}><h2>{$t("Respect du plan")}</h2><Empty icon="calendrier" title={$t("Pas encore de séance prévue échue")} text={$t("Dès que des séances prévues sont passées, tu verras ici la part que tu as réalisée.")} /></section>;
  }
  // les 3 dernières semaines (ou les 3 derniers mois) civils, y compris celles où rien n'était prévu
  const wanted = by === 'week'
    ? [0, 1, 2].map((k) => addDays(mondayOf(d.today), -7 * k))
    : [0, 1, 2].map((k) => { const x = new Date(d.today + 'T00:00:00Z'); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - k); return x.toISOString().slice(0, 7); });
  const pool = by === 'week' ? rep.weeks : rep.months;
  const rows: Compliance[] = wanted.map((k) => pool.find((c) => c.key === k) ?? { key: k, planned: 0, done: 0, plannedSec: 0, doneSec: 0 });
  const tot = rows.reduce((t, c) => ({ planned: t.planned + c.planned, done: t.done + c.done, plannedSec: t.plannedSec + c.plannedSec, doneSec: t.doneSec + c.doneSec }), { planned: 0, done: 0, plannedSec: 0, doneSec: 0 });
  return (
    <section className="card g12" aria-label={$t("Respect du plan")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("Respect du plan")}</h2><Segmented label={$t("Regroupement")} value={by} onChange={setBy} options={[['week', $t("3 sem.")], ['month', $t("3 mois")]]} /></div>
      {tot.planned > 0 && (
        <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
          <span className="t-h2" style={{ color: `var(--${rateTone(tot.done / tot.planned)}-text)` }}>{pct(tot.done / tot.planned)}</span>
          <span className="t-caption c-neutral">{by === 'week' ? $t("des séances prévues sur ces 3 semaines ({0} sur {1}){2}", { 0: tot.done, 1: tot.planned, 2: tot.plannedSec > 0 ? $t(", soit {0} de temps réalisé sur {1} prévu", { 0: duration(tot.doneSec), 1: duration(tot.plannedSec) }) : '' }) : $t("des séances prévues sur ces 3 mois ({0} sur {1}){2}", { 0: tot.done, 1: tot.planned, 2: tot.plannedSec > 0 ? $t(", soit {0} de temps réalisé sur {1} prévu", { 0: duration(tot.doneSec), 1: duration(tot.plannedSec) }) : '' })}</span>
        </div>
      )}
      <ul className="stack" style={{ gap: 'var(--space-10)' }}>{rows.map(rateBar)}</ul>
      <div className="row t-legal c-moderate" style={{ gap: 'var(--space-12)', flexWrap: 'wrap' }}>
        <span><span className="dot s10" style={{ background: 'var(--success)' }} /> {$t("80 % ou plus")}</span>
        <span><span className="dot s10" style={{ background: 'var(--warning)' }} /> {$t("50 à 79 %")}</span>
        <span><span className="dot s10" style={{ background: 'var(--critical)' }} /> {$t("moins de 50 %")}</span>
      </div>
      <Info>{$t("Une séance prévue compte comme faite quand une séance réalisée lui est rattachée. Les jours couverts par une interruption ne comptent pas comme manqués. Le temps ne porte que sur les séances dont la durée prévue est connue. Le mois et la semaine en cours ne comptent que les jours déjà passés.")}</Info>
    </section>
  );
}

// ------------------------------------------------------------------ zones de FC
export function ZonesCard({ d, data }: Props) {
  const [n, setN] = useState<'4' | '8' | '12'>('4');
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
      {!hrMax || !rep.sessions ? <p className="t-caption c-moderate">{!hrMax ? $t("Il faut une FC max (déclarée ou calculée) : renseigne ta date de naissance ou une FC max dans Progression › Capacités.") : $t("Aucune séance de course, vélo ou natation avec une courbe cardiaque sur cette période.")}</p> : (
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
      <Info>{$t("Zones en % de ta FC max retenue ({0} bpm) : Z1 < 60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 %. Course, vélo et natation seulement (le renforcement est exclu). Le repère « 80/20 » est générique : sans test de seuil, la vraie frontière varie d’un sportif à l’autre. Les séances sans courbe cardiaque ne sont pas comptées{1}.", { 0: hrMax ? num(hrMax, 0) : '—', 1: rep.withoutHr ? $t(" ({0} sur la période)", { 0: rep.withoutHr }) : '' })}</Info>
    </section>
  );
}

// ------------------------------------------------------------------ forme de fond par discipline
export function FitnessCard({ d, data }: Props) {
  const [withOther] = useWithOther();
  const all = fitnessByDiscipline(data, d.loads, d.series).filter((s) => s.day >= addDays(d.today, -182));
  if (all.length < 2) return null;
  const keys = (['SWIM', 'BIKE', 'RUN', 'STRENGTH', 'OTHER', 'FORFAIT'] as LoadKey[]).filter((k) => (k !== 'OTHER' || withOther) && all.some((s) => s.byKey[k] > 0.5));
  const last = all[all.length - 1];
  const before = all.filter((s) => s.day <= addDays(last.day, -28)).pop() ?? null;
  const tot = keys.reduce((t, k) => t + last.byKey[k], 0);
  const totBefore = before ? keys.reduce((t, k) => t + before.byKey[k], 0) : null;
  return (
    <section className="card g12" aria-label={$t("Forme de fond par discipline")}>
      <h2>{$t("Forme de fond par discipline")}</h2>
      <Info>{$t("Ta forme de fond est ton niveau d’entraînement des dernières semaines : une moyenne de ta charge sur 6 semaines, sans unité. Plus elle est haute, plus tu t’entraînes régulièrement.")}</Info>
      <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
        <span className="t-h2">{num(tot, 0)}</span>
        <span className="t-caption c-neutral">{totBefore !== null ? $t("aujourd’hui, contre {0} il y a 4 semaines ({1})", { 0: num(totBefore, 0), 1: signed(tot - totBefore, 0) }) : $t("aujourd’hui")}</span>
      </div>
      <OtherToggle />
      <Info>{$t("Chaque barre est une semaine : sa hauteur est ta forme de fond ce jour-là, et ses couleurs montrent la part de chaque discipline.")}</Info>
      <StackedFitness slices={all} keys={keys} />
      <ul>
        {keys.map((k) => {
          const dv = before ? last.byKey[k] - before.byKey[k] : null;
          return (
            <li key={k} className="legend-row"><span className="dot s10" style={{ background: FITNESS_COLOR[k] }} /><span className="t-caption">{FITNESS_LABEL[k]}</span><span className="t-caption-strong">{num(last.byKey[k], 0)} · {pct(tot ? last.byKey[k] / tot : 0)}{dv !== null ? ` · ${signed(dv, 0)}` : ''}</span></li>
          );
        })}
      </ul>
      <Info>{$t("Pour chaque discipline : sa part de la forme de fond actuelle, puis son évolution depuis 4 semaines. « Interruption (forfait) » est la charge forfaitaire comptée pendant une blessure ou un voyage déclaré. Même calcul que la forme de fond de l’onglet Charge (moyenne exponentielle sur 42 jours) : la somme des disciplines redonne la forme de fond totale. Un point par semaine, sur 6 mois.")}</Info>
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

export function EfficiencyCard({ d, data }: Props) {
  const [disc, setDisc] = useState<'RUN' | 'BIKE'>('RUN');
  const hrMax = d.ctx.hrMax.bpm;
  const ef = efficiency(data, hrMax, disc, d.today);
  const fmt = (v: number | null) => (v === null ? '—' : disc === 'RUN' ? mmss(1000 / v) + NBSP + '/km' : speedKmh(v));
  const band = disc === 'BIKE' ? EF_BAND_BIKE : EF_BAND;
  const climb = disc === 'BIKE' ? EF_MAX_CLIMB_BIKE : EF_MAX_CLIMB;
  const recent = ef.points.slice(-5).reverse();
  return (
    <section className="card g12" aria-label={$t("Tendance d’efficacité")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Tendance d’efficacité")}</h2>
        <Segmented label={$t("Discipline")} value={disc} onChange={setDisc} options={[['RUN', DISCIPLINE_LABEL.RUN], ['BIKE', DISCIPLINE_LABEL.BIKE]]} />
      </div>
      {ef.points.length < 2 ? (
        <>
          <p className="t-caption c-moderate">{$t("Pas encore assez de séances comparables : il en faut au moins 2.")}</p>
          <dl className="kv">
            <dt>{$t("{0} de 20 min ou plus avec distance", { 0: DISCIPLINE_LABEL[disc] })}</dt><dd>{ef.diag.sessions}</dd>
            <dt>{$t("dont avec une FC moyenne")}</dt><dd>{ef.diag.withHr}</dd>
            <dt>{hrMax ? $t("dont FC moyenne entre {0} et {1} bpm", { 0: Math.round(band[0] * hrMax), 1: Math.round(band[1] * hrMax) }) : $t("dont FC moyenne dans la bonne zone")}</dt><dd>{ef.diag.inBand}</dd>
            <dt>{$t("dont relief inférieur à {0} %", { 0: climb * 100 })}</dt><dd>{ef.diag.flat}</dd>
          </dl>
        </>
      ) : (
        <>
          {ef.change !== null && ef.refHr ? (
            <div className="stack-4">
              <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{signed(ef.change * 100, 1)}{NBSP}%</span><span className="t-caption c-neutral">{$t("d’efficacité sur les 4 dernières semaines")}</span></div>
              <span className="t-caption c-neutral">{$t("À {0} bpm : {1} aujourd’hui, contre {2} il y a 4 semaines.", { 0: ef.refHr, 1: fmt(ef.speedNow), 2: fmt(ef.speedBefore) })}</span>
            </div>
          ) : ef.lastVsPrevious !== null ? (
            <div className="stack-4">
              <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{signed(ef.lastVsPrevious * 100, 1)}{NBSP}%</span><span className="t-caption c-neutral">{$t("d’efficacité par rapport à la séance comparable précédente")}</span></div>
              <span className="t-caption c-moderate">{$t("Pas encore 2 séances sur les 4 dernières semaines et 2 sur les 4 précédentes : on compare pour l’instant la dernière séance à la précédente.")}</span>
            </div>
          ) : null}
          {ef.weeks.length >= 2 && <Spark values={ef.weeks.map((w) => w.ef)} />}
          {ef.weeks.length >= 2 && <div className="between t-legal c-moderate"><span>{dateShort(ef.weeks[0].start)}</span><span>{$t("{0} séances comparables", { 0: ef.points.length })}</span><span>{dateShort(ef.weeks[ef.weeks.length - 1].start)}</span></div>}
          <h3 className="t-strong">{$t("Dernières séances comparables")}</h3>
          <ul>
            {recent.map((p) => (
              <li key={p.sessionId} className="rec-row">
                <button type="button" className="row-btn" style={{ padding: 0, textAlign: 'left' }} onClick={() => navigate('/seances/' + p.sessionId)}>
                  <span className="stack-4"><span className="t-label">{dateFr(p.day)}</span><span className="t-caption c-moderate">{$t("{0} en moyenne, FC {1} bpm", { 0: fmt(p.speedMs), 1: num(p.avgHr, 0) })}</span></span>
                </button>
                <span className="stack-4" style={{ textAlign: 'right' }}><span className="t-strong">{ef.refHr ? fmt((p.ef * ef.refHr) / 60) : '—'}</span><span className="t-caption c-moderate">{ef.refHr ? $t("à {0} bpm", { 0: ef.refHr }) : ''}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Info>{disc === 'RUN' ? $t("Efficacité = mètres parcourus par battement (vitesse ÷ FC moyenne). On compare des séances à effort égal : FC moyenne entre 65 et 85 % de ta FC max, 20 min minimum, dénivelé inférieur à 2 %. La colonne de droite ramène chaque séance à la même FC (la FC habituelle de ces séances) pour qu’elles soient comparables. Chaleur, fatigue, vent ou revêtement la font varier : lis une tendance, pas une séance.") : $t("Efficacité = mètres parcourus par battement (vitesse ÷ FC moyenne). À vélo : FC moyenne entre 55 et 85 % de ta FC max, 20 min minimum, dénivelé inférieur à 3 %. La colonne de droite ramène chaque sortie à la même FC (la FC habituelle de ces sorties) pour qu’elles soient comparables. Vent, relief, arrêts et groupe la font varier : lis une tendance, pas une sortie.")}</Info>
    </section>
  );
}

// ------------------------------------------------------------------ records
export function RecordsCard({ data }: Props) {
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
      <Info>{$t("Meilleur segment de la distance, lu dans la courbe de vitesse de la montre et recalé sur la distance enregistrée de la séance. Le temps est le temps de déplacement : les arrêts (pause automatique de la montre) ne comptent pas, comme dans Garmin. « Séance entière » : pas de courbe exploitable, et la distance de la séance est à 3 % près celle du record. Une vitesse physiquement impossible est écartée. Cliquer ouvre la séance.")}</Info>
    </section>
  );
}

// ------------------------------------------------------------------ poids
export function WeightCard({ data, d }: Props) {
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
      <Info>{$t("La moyenne sur 7 jours lisse les variations d’hydratation d’un jour à l’autre. Le poids est un simple suivi : il ne modifie aucune charge. Une pesée saisie à la main n’est jamais écrasée par Health Connect.")}</Info>
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
export function SleepCard({ data, d }: Props) {
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
      {st.staged14 < st.nights14 && <div className="note"><Icon name="info" size={20} /><span>{st.staged14 === 0 ? $t("Ces durées sont le temps passé au lit, éveils compris : Health Connect ne donne pas (encore) les étapes du sommeil. Avec la dernière version de l’APK, l’app compte le temps réellement endormi, comme Garmin Connect.") : $t("{0} nuit(s) sur {1} sont comptées en temps passé au lit (étapes du sommeil indisponibles), les autres en temps réellement endormi.", { 0: st.nights14 - st.staged14, 1: st.nights14 })}</span></div>}
      <Info>{$t("Lecture seule, sans objectif de sommeil imposé : on compare ta semaine à tes propres habitudes. La durée est le temps réellement endormi (éveils exclus) quand Health Connect donne les étapes du sommeil, comme dans Garmin Connect. Le coucher est l’heure de début de la nuit lue par Health Connect, sur les 14 dernières nuits (5 minimum). Plus l’écart-type est petit, plus tes nuits sont régulières. La durée de la nuit compte déjà dans la forme du jour.")}</Info>
    </section>
  );
}

// ------------------------------------------------------------------ enchaînements vélo → course
export function BricksCard({ d, data }: Props) {
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
      <Info>{$t("Pour chaque enchaînement confirmé ou rattaché à un BRICK prévu : durée de transition (fin du vélo → début de la course, au plus 45 min) et allure de la course comparée à la médiane de tes autres courses de 10 min ou plus des 90 jours précédents. Un écart positif signifie plus lent que d’habitude.")}</Info>
    </section>
  );
}
