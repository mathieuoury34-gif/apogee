// Cartes d'analyse — lectures dérivées des séances et du plan : bilan de semaine, respect du plan,
// zones de FC (80/20), forme de fond par discipline, records, efficacité, enchaînements vélo → course.
// Chaque carte dit comment elle calcule : aucun nombre sans sa méthode.
import { $t } from '../i18n';
import { Fragment, useState } from 'react';
import { AppHeader, Disclosure, Empty, ErrorBanner, OtherToggle, Segmented, Sheet, SubNav, showToast, useWithOther, Info, InfoCard, InfoToggle } from '../ui/kit';
import { useLocalSheet } from '../ui/menu';
import { FITNESS_COLOR, FITNESS_LABEL, SplitBars, StackedFitness } from '../ui/charts2';
import { navigate } from '../ui/router';
import { Icon } from '../ui/icons';
import { ClockField, DecField, numOf } from '../ui/wheels';
import { DayChart } from '../ui/daychart';
import { PeriodBar, useDaySel, usePeriod } from '../ui/period';
import { Readout } from '../ui/readout';
import { liveRecords } from '../domain/load';
import { useCalc } from '../data/store';
import { deleteWeight, resetSleepNight, restore, saveSleepNight, saveWeight } from '../data/actions';
import { recentNights, sleepStats, weightTrend } from '../domain/body';
import { planCompliance, type Compliance } from '../domain/compliance';
import { addDays, dayRange, mondayOf } from '../domain/dates';
import { fitnessByDiscipline, type LoadKey } from '../domain/loadByDiscipline';
import { brickAnalysis, efficiency, EF_BAND, EF_BAND_BIKE, EF_MAX_CLIMB, EF_MAX_CLIMB_BIKE, personalRecords, type PersonalRecord } from '../domain/records';
import { weekSummary, type WeekSummary } from '../domain/summary';
import { HR_ZONE_EDGES, polarSplit, weeklyZones } from '../domain/zones';
import { dayTitle, timeOf, dateFr, dateShort, dayMonth, DISCIPLINE_LABEL, duration, mmss, monthLong, num, pct, signed, speedKmh, NBSP } from '../ui/format';

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
    <InfoCard className="card g12" aria-label={$t("Bilan de semaine")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Bilan de semaine")}<InfoToggle /></h2>
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
    </InfoCard>
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
  const pw = usePeriod();
  const end = addDays(d.today, -pw.offset);
  const rep = planCompliance(data, d.links, d.refs, end, 60, 36);
  if (!rep.weeks.length && !rep.months.length) {
    return <section className="card g12" aria-label={$t("Respect du plan")}><h2>{$t("Respect du plan")}</h2><Empty icon="calendrier" title={$t("Pas encore de séance prévue échue")} text={$t("Dès que des séances prévues sont passées, tu verras ici la part que tu as réalisée.")} /></section>;
  }
  // semaines civiles jusqu'à 3 mois, mois civils au-delà (y compris ceux où rien n'était prévu)
  const by: 'week' | 'month' = pw.span !== 0 && pw.span <= 90 ? 'week' : 'month';
  const firstKey = rep.months[0]?.key ?? end.slice(0, 7);
  const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;
  const count = by === 'week' ? Math.max(1, Math.ceil(pw.span / 7)) : pw.span === 0 ? Math.min(36, Math.max(1, monthsBetween(firstKey, end.slice(0, 7)))) : Math.round(pw.span / 30.4);
  const wanted = by === 'week'
    ? Array.from({ length: count }, (_, k) => addDays(mondayOf(end), -7 * k))
    : Array.from({ length: count }, (_, k) => { const x = new Date(end + 'T00:00:00Z'); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - k); return x.toISOString().slice(0, 7); });
  const pool = by === 'week' ? rep.weeks : rep.months;
  const rows: Compliance[] = wanted.map((k) => pool.find((c) => c.key === k) ?? { key: k, planned: 0, done: 0, plannedSec: 0, doneSec: 0 });
  const tot = rows.reduce((t, c) => ({ planned: t.planned + c.planned, done: t.done + c.done, plannedSec: t.plannedSec + c.plannedSec, doneSec: t.doneSec + c.doneSec }), { planned: 0, done: 0, plannedSec: 0, doneSec: 0 });
  return (
    <InfoCard className="card g12" aria-label={$t("Respect du plan")}>
      <h2>{$t("Respect du plan")}<InfoToggle /></h2>
      <PeriodBar p={pw} total={d.series.days.length} from={by === 'week' ? wanted[wanted.length - 1] : wanted[wanted.length - 1] + '-01'} to={end} />
      {tot.planned > 0 && (
        <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
          <span className="t-h2" style={{ color: `var(--${rateTone(tot.done / tot.planned)}-text)` }}>{pct(tot.done / tot.planned)}</span>
          <span className="t-caption c-neutral">{$t("des séances prévues sur la période ({0} sur {1}){2}", { 0: tot.done, 1: tot.planned, 2: tot.plannedSec > 0 ? $t(", soit {0} de temps réalisé sur {1} prévu", { 0: duration(tot.doneSec), 1: duration(tot.plannedSec) }) : '' })}</span>
        </div>
      )}
      <ul className="stack" style={{ gap: 'var(--space-10)' }}>{rows.map(rateBar)}</ul>
      <div className="row t-legal c-moderate" style={{ gap: 'var(--space-12)', flexWrap: 'wrap' }}>
        <span><span className="dot s10" style={{ background: 'var(--success)' }} /> {$t("80 % ou plus")}</span>
        <span><span className="dot s10" style={{ background: 'var(--warning)' }} /> {$t("50 à 79 %")}</span>
        <span><span className="dot s10" style={{ background: 'var(--critical)' }} /> {$t("moins de 50 %")}</span>
      </div>
      <Info>{$t("Une séance prévue compte comme faite quand une séance réalisée lui est rattachée. Les jours couverts par une interruption ne comptent pas comme manqués. Le temps ne porte que sur les séances dont la durée prévue est connue. Le mois et la semaine en cours ne comptent que les jours déjà passés.")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ zones de FC
export function ZonesCard({ d, data }: Props) {
  const pw = usePeriod();
  const [withOther] = useWithOther();
  const hrMax = d.ctx.hrMax.bpm;
  const end = addDays(d.today, -pw.offset);
  const from = pw.span === 0 ? (d.series.firstDay ?? end) : addDays(end, -(pw.span - 1));
  const nWeeks = Math.min(160, Math.max(1, Math.round((Date.parse(mondayOf(end)) - Date.parse(mondayOf(from))) / (7 * 86400_000)) + 1));
  const rep = weeklyZones(data, hrMax, end, nWeeks, withOther, from);
  const p = polarSplit(rep.total);
  const edges = HR_ZONE_EDGES.map((e) => (hrMax ? Math.round(e * hrMax) : null));
  const range = [`< ${edges[0]}`, `${edges[0]}–${edges[1]}`, `${edges[1]}–${edges[2]}`, `${edges[2]}–${edges[3]}`, `≥ ${edges[3]}`];
  return (
    <InfoCard className="card g12" aria-label={$t("Temps par zone de FC")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Temps par zone de FC")}<InfoToggle /></h2>
      </div>
      <PeriodBar p={pw} total={d.series.days.length} from={from} to={end} />
      <OtherToggle />
      {!hrMax || !rep.sessions ? <><p className="t-caption c-moderate">{!hrMax ? $t("Il faut une FC max (déclarée ou calculée) : renseigne ta date de naissance ou une FC max dans Progression › Capacités.") : $t("Aucune séance de course, vélo ou natation avec une courbe cardiaque sur cette période.")}</p>{!hrMax && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/progression/capacites')}>{$t("Ouvrir les capacités")}</button>}</> : (
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
    </InfoCard>
  );
}

// ------------------------------------------------------------------ forme de fond par discipline
export function FitnessCard({ d, data }: Props) {
  const [withOther] = useWithOther();
  const fp = usePeriod();
  const full = fitnessByDiscipline(data, d.loads, d.series);
  const fEnd = addDays(d.today, -fp.offset), fStart = fp.span === 0 ? '' : addDays(fEnd, -fp.span);
  const all = full.filter((s) => s.day > fStart && s.day <= fEnd);
  if (full.length < 2 || all.length < 1) return null;
  const keys = (['SWIM', 'BIKE', 'RUN', 'STRENGTH', 'OTHER', 'FORFAIT'] as LoadKey[]).filter((k) => (k !== 'OTHER' || withOther) && all.some((s) => s.byKey[k] > 0.5));
  const last = all[all.length - 1];
  const before = full.filter((s) => s.day <= addDays(last.day, -28)).pop() ?? null;
  const tot = keys.reduce((t, k) => t + last.byKey[k], 0);
  const totBefore = before ? keys.reduce((t, k) => t + before.byKey[k], 0) : null;
  return (
    <InfoCard className="card g12" aria-label={$t("Forme de fond par discipline")}>
      <h2>{$t("Forme de fond par discipline")}<InfoToggle /></h2>
      <Info>{$t("Ta forme de fond est ton niveau d’entraînement des dernières semaines : une moyenne de ta charge sur 6 semaines, sans unité. Plus elle est haute, plus tu t’entraînes régulièrement.")}</Info>
      <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
        <span className="t-h2">{num(tot, 0)}</span>
        <span className="t-caption c-neutral">{totBefore !== null ? $t("aujourd’hui, contre {0} il y a 4 semaines ({1})", { 0: num(totBefore, 0), 1: signed(tot - totBefore, 0) }) : $t("aujourd’hui")}</span>
      </div>
      <OtherToggle />
      <Info>{$t("Chaque barre est un jour : sa hauteur est ta forme de fond ce jour-là, et ses couleurs montrent la part de chaque discipline.")}</Info>
      <PeriodBar p={fp} total={Math.max(365, d.series.days.length)} from={all[0]?.day} to={fEnd} />
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
    </InfoCard>
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
    <InfoCard className="card g12" aria-label={$t("Tendance d’efficacité")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Tendance d’efficacité")}<InfoToggle /></h2>
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
          <Disclosure title={$t("Dernières séances comparables")}>
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
          </Disclosure>
        </>
      )}
      <Info>{disc === 'RUN' ? $t("Efficacité = mètres parcourus par battement (vitesse ÷ FC moyenne). On compare des séances à effort égal : FC moyenne entre 65 et 85 % de ta FC max, 20 min minimum, dénivelé inférieur à 2 %. La colonne de droite ramène chaque séance à la même FC (la FC habituelle de ces séances) pour qu’elles soient comparables. Chaleur, fatigue, vent ou revêtement la font varier : lis une tendance, pas une séance.") : $t("Efficacité = mètres parcourus par battement (vitesse ÷ FC moyenne). À vélo : FC moyenne entre 55 et 85 % de ta FC max, 20 min minimum, dénivelé inférieur à 3 %. La colonne de droite ramène chaque sortie à la même FC (la FC habituelle de ces sorties) pour qu’elles soient comparables. Vent, relief, arrêts et groupe la font varier : lis une tendance, pas une sortie.")}</Info>
    </InfoCard>
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
    <InfoCard className="card g12" aria-label={$t("Records personnels")}>
      <h2>{$t("Records personnels")}<InfoToggle /></h2>
      <ul>{recs.map(line)}</ul>
      <Info>{$t("Meilleur segment de la distance, lu dans la courbe de vitesse de la montre et recalé sur la distance enregistrée de la séance. Le temps est le temps de déplacement : les arrêts (pause automatique de la montre) ne comptent pas, comme dans Garmin. « Séance entière » : pas de courbe exploitable, et la distance de la séance est à 3 % près celle du record. Une vitesse physiquement impossible est écartée. Cliquer ouvre la séance.")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ poids
export function WeightCard({ data, d }: Props) {
  const t = weightTrend(data, d.today);
  const wAll = liveRecords(data.weight);
  const wFirst = wAll.reduce((m, w) => (w.day < m ? w.day : m), d.today);
  const wDays = dayRange(wFirst < addDays(d.today, -364) ? wFirst : addDays(d.today, -364), d.today);
  const wp = usePeriod();
  const wWin = wp.slice(wDays);
  const [wsi, setWsi] = useDaySel(wWin, (x) => !!data.weight[x] && !data.weight[x].deleted);
  const wDay = wWin[wsi] ?? d.today;
  const wAt = (x: string) => { const r = data.weight[x]; return r && !r.deleted ? r.kg : null; };
  const wAvg = (() => { const v = Array.from({ length: 7 }, (_, k) => wAt(addDays(wDay, -k))).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })();
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
    <InfoCard className="card g12" aria-label={$t("Poids")} data-anchor="poids">
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Poids")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => { setVal(t.latest ? String(t.latest.kg).replace('.', ',') : ''); sheet.show(); }}>{$t("Saisir une pesée")}</button>
      </div>
      {!t.latest ? <p className="t-caption c-moderate">{$t("Aucune pesée. Saisis-la à la main ; elle vient aussi de Health Connect si une balance connectée l’y dépose (Garmin ne l’envoie pas).")}</p> : (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
            <span className="t-h2">{num(t.avg7 ?? t.latest.kg, 1)}{NBSP}kg</span>
            <span className="t-caption c-neutral">{t.avg7 !== null ? $t("moyenne des 7 derniers jours") : $t("dernière pesée le {0}", { 0: dateFr(t.latest.day) })}</span>
          </div>
          {t.change !== null && <span className="t-caption c-neutral">{signed(t.change, 1)}{NBSP}kg {$t("par rapport à il y a 4 semaines")}</span>}
          <PeriodBar p={wp} total={wDays.length} from={wWin[0]} to={wWin[wWin.length - 1]} />
          <Readout when={wDay === d.today ? $t("Aujourd’hui") : dayTitle(wDay)} cells={[
            { label: $t("Pesée du jour"), value: wAt(wDay) === null ? '—' : num(wAt(wDay)!, 1) + NBSP + 'kg', color: 'var(--chart-value)', key: true },
            { label: $t("Moyenne 7 jours"), value: wAvg === null ? '—' : num(wAvg, 1) + NBSP + 'kg' },
          ]} />
          <DayChart points={wWin.map((x) => ({ day: x, v: wAt(x) }))} kind="line" connect sel={wsi} onSel={setWsi} height={110} fmtTick={(v) => num(v, 1)} label={$t("Poids par jour")} dots />
        </>
      )}
      <Info>{$t("La moyenne sur 7 jours lisse les variations d’hydratation d’un jour à l’autre. Le poids est un simple suivi : il ne modifie aucune charge. Une pesée saisie à la main n’est jamais écrasée par Health Connect.")}</Info>
      {sheet.open && (
        <Sheet title={$t("Saisir une pesée")} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <div className="field"><span className="lbl">{$t("Poids (kg), aujourd’hui")}</span><DecField label={$t("Poids (kg), aujourd’hui")} unit="kg" value={numOf(val)} onChange={(x) => setVal(x === null ? '' : String(x).replace('.', ','))} hiMax={200} initial={t.latest ? t.latest.kg : 70} /></div>
            {t.latest?.day === d.today && t.latest.source === 'manual' && <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={() => { const snap = deleteWeight(d.today); sheet.hide(); showToast($t("Pesée supprimée"), { undo: () => restore(snap) }); }}>{$t("Supprimer la pesée d’aujourd’hui")}</button>}
          </div>
        </Sheet>
      )}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ sommeil
const hhSleep = (sec: number) => Math.floor(sec / 3600) + NBSP + 'h' + String(Math.round((sec % 3600) / 60)).padStart(2, '0');
const clockSec = (iso: string, off: number | null) => { const [h, m] = timeOf(iso, off).split(':').map(Number); return h * 3600 + m * 60; };

export function SleepCard({ data, d }: Props) {
  const st = sleepStats(data, d.today);
  const sheet = useLocalSheet();
  const pw = usePeriod();
  const nightsAll = liveRecords(data.sleep);
  const first = nightsAll.reduce((m, n) => (n.nightDate < m ? n.nightDate : m), d.today);
  const all = dayRange(first < addDays(d.today, -364) ? first : addDays(d.today, -364), d.today);
  const days = pw.slice(all);
  const [si, setSi] = useDaySel(days, (x) => !!data.sleep[x] && !data.sleep[x].deleted);
  const [bed, setBed] = useState<number | null>(null);
  const [wake, setWake] = useState<number | null>(null);
  if (nightsAll.length === 0) return null;
  const day = days[si] ?? d.today;
  const n = data.sleep[day] && !data.sleep[day].deleted ? data.sleep[day] : null;
  const offset = n?.zoneOffsetMinutes ?? -new Date().getTimezoneOffset();
  const diff = st.avg7 !== null && st.avgBefore !== null ? st.avg7 - st.avgBefore : null;
  const clock = (m: number) => { const x = Math.round(m) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + NBSP + 'h' + String(x % 60).padStart(2, '0'); };
  const bedS = bed ?? (n ? clockSec(n.startAt, n.zoneOffsetMinutes) : 23 * 3600);
  const wakeS = wake ?? (n ? clockSec(n.endAt, n.zoneOffsetMinutes) : 7 * 3600);
  const durS = (bedS <= wakeS ? wakeS - bedS : 86400 - bedS + wakeS);
  const ok = durS >= 3600 && durS <= 16 * 3600;
  const openEdit = () => { setBed(null); setWake(null); sheet.show(); };
  const save = () => {
    if (!ok) return;
    const snap = saveSleepNight(day, bedS, wakeS, offset);
    sheet.hide();
    showToast($t("Nuit enregistrée"), { undo: () => restore(snap) });
  };
  const reset = () => { const snap = resetSleepNight(day); sheet.hide(); showToast($t("Nuit rendue à la montre"), { undo: () => restore(snap) }); };
  return (
    <InfoCard className="card g12" aria-label={$t("Sommeil")} data-anchor="sommeil">
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Sommeil")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={openEdit}>{n ? $t("Modifier la nuit") : $t("Saisir la nuit")}</button>
      </div>
      <PeriodBar p={pw} total={all.length} from={days[0]} to={days[days.length - 1]} />
      <Readout when={<>{day === d.today ? $t("Cette nuit (réveil aujourd’hui)") : $t("Réveil le {0}", { 0: dayTitle(day) })}{n?.edited ? <span className="var-chip flat" style={{ marginLeft: 'var(--space-8)' }}>{$t("validée")}</span> : null}</>} cells={[
        { label: $t("Durée"), value: n ? hhSleep(n.durationSec) : '—', color: 'var(--chart-value)', key: true },
        { label: $t("Coucher → lever"), value: n ? timeOf(n.startAt, n.zoneOffsetMinutes) + ' → ' + timeOf(n.endAt, n.zoneOffsetMinutes) : '—' },
      ]} />
      <DayChart points={days.map((x) => { const r = data.sleep[x]; return { day: x, v: r && !r.deleted ? r.durationSec / 3600 : null, faint: !!r && !r.deleted && !r.fromStages }; })} kind="bars" min={0} max={10} ticks={[0, 2, 4, 6, 8, 10]} fmtTick={(v) => v + ' h'} sel={si} onSel={setSi} height={110} color="var(--chart-value)" label={$t("Durée de sommeil par nuit")} />
      <dl className="kv">
        <dt>{$t("Durée moyenne, 7 dernières nuits")}</dt><dd>{st.avg7 === null ? '—' : hhSleep(st.avg7)}</dd>
        <dt>{$t("Écart avec les 3 semaines précédentes")}</dt><dd>{diff === null ? '—' : (diff >= 0 ? '+' : '−') + Math.round(Math.abs(diff) / 60) + NBSP + 'min'}</dd>
        <dt>{$t("Heure de coucher habituelle")}</dt><dd>{st.bedtimeMedian === null ? '—' : clock(st.bedtimeMedian)}</dd>
        <dt>{$t("Régularité du coucher (écart-type)")}</dt><dd>{st.bedtimeSd === null ? '—' : '± ' + Math.round(st.bedtimeSd) + NBSP + 'min'}</dd>
      </dl>
      <Info>{$t("Jour de réveil, comme dans Garmin Connect. Touche une nuit du graphe pour la lire ; « Modifier la nuit » corrige le coucher et le lever (par exemple si tu n’avais pas la montre au poignet) : la nuit corrigée n’est plus écrasée par la montre. Un rappel le matin te propose de la valider (réglable dans Paramètres). La durée est le temps réellement endormi (éveils exclus) quand Health Connect donne les étapes du sommeil ; une barre pâle est un temps passé au lit. Le coucher habituel se calcule sur les 14 dernières nuits (5 minimum) ; plus l’écart-type est petit, plus tes nuits sont régulières. La durée de la nuit compte déjà dans la forme du jour.")}</Info>
      {sheet.open && (
        <Sheet title={$t("Nuit du réveil du {0}", { 0: dayMonth(day) })} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <div className="grid-2">
              <div className="field"><span className="lbl">{$t("Coucher")}</span><ClockField label={$t("Coucher")} value={bedS} onChange={setBed} /></div>
              <div className="field"><span className="lbl">{$t("Lever")}</span><ClockField label={$t("Lever")} value={wakeS} onChange={setWake} /></div>
            </div>
            <span className="t-caption c-neutral">{ok ? $t("Durée : {0}", { 0: hhSleep(durS) }) : $t("Durée improbable : entre 1 h et 16 h.")}</span>
            {n?.edited && d.today <= addDays(day, 2) && <button type="button" className="btn btn-tertiary" onClick={reset}>{$t("Rétablir la valeur de la montre")}</button>}
          </div>
        </Sheet>
      )}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ enchaînements vélo → course
export function BricksCard({ d, data }: Props) {
  const rows = brickAnalysis(data, d.links, d.today).slice(0, 10);
  if (!rows.length) return null;
  const pace = (v: number | null) => (v === null ? '—' : mmss(v) + NBSP + '/km');
  return (
    <InfoCard className="card g12" aria-label={$t("Enchaînements vélo → course")}>
      <h2>{$t("Enchaînements vélo → course")}<InfoToggle /></h2>
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
    </InfoCard>
  );
}
