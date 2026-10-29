// Progression — Charge | Objectif | Zones. Reprend la grammaire de l'écran Analyse de PEAnalyze :
// carte héro, graphiques plein cadre, puis cartes de détail. Aucun verdict de faisabilité sur l'objectif
// (décision du 31/08) : l'écran juxtapose les chiffres.
import { $t } from '../i18n';
import { useState } from 'react';
import { AppHeader, DatePicker, Empty, ErrorBanner, Hero, Segmented, Sheet, SubHeader, SubNav, showToast, OtherToggle, useWithOther, Info, InfoCard, InfoToggle } from '../ui/kit';
import { FormChart, LoadPanels, StackedWeeks, StepChart } from '../ui/charts';
import { FitnessCard, SleepCard, WeightCard } from './Analysis';
import { ActivityCard, CaloriesCard, CapacitiesTrendsCard } from './Wellness';
import { EnduranceHillCard, ReadinessCard, ReserveCard } from './Capacity';
import { AcuteLoadChart, FocusBars, RatioChart, STATUS_INFO, StatusStrip } from '../ui/loadkit';
import { DEFAULT_SPAN, PeriodBar, SPANS, usePeriod } from '../ui/period';
import { acuteSeries, dailyStatus, loadFocus, statusOf, weeklyStatus } from '../domain/loadStatus';
import { Icon } from '../ui/icons';
import { navigate, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { addZone, deleteZone, restore, saveRace } from '../data/actions';
import { addDays, dayRange, daysBetween } from '../domain/dates';
import { FORM_LABEL, FORM_STEP_LABEL, FORM_WEIGHTS, formStep, type FormKey } from '../domain/form';
import { latestZone, zoneHistory } from '../domain/load';
import { requiredPaces, type RequiredPace } from '../domain/objective';
import { weeklyVolume } from '../domain/stats';
import { forecastLoad } from '../domain/forecast';
import { suggestZones } from '../domain/records';
import type { DayLoad } from '../domain/load';
import type { ZoneKind, ZoneReading, ZoneSource } from '../domain/types';
import { DecField, DistanceField, DurationField, IntField, PaceField, numOf } from '../ui/wheels';
import { dateFr, dayMonth, dayTitle, DISCIPLINE_LABEL, duration, dvar, hhmm, km, mmss, num, parseMmss, parseNum, pct, signed, toInput, NBSP } from '../ui/format';

export const NAV = [{ to: '/progression', label: $t("Charge") }, { to: '/progression/sante', label: $t("Santé") }, { to: '/progression/capacites', label: $t("Capacités") }, { to: '/progression/objectif', label: $t("Objectif") }];

// ------------------------------------------------------------------ Charge
export function LoadScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const [view, setView] = useState<'charge' | 'forme'>(route.query.get('vue') === 'forme' ? 'forme' : 'charge');
  const pw = usePeriod();
  const fw = usePeriod();
  const c = d.constat;
  const total = d.series.days.length;
  const days = pw.slice(d.series.days);
  const formDays = days.map((x) => x.day);
  const winFrom = days[0]?.day, winTo = days[days.length - 1]?.day;
  const weeks = weeklyVolume(data, d.today, 12);
  const [withOther] = useWithOther();
  const form = d.form ?? d.lastForm;
  const acwr = c.acuteChronicRatio;
  const acutePts = acuteSeries(d.series.days);
  const statusEnd = addDays(d.today, -pw.offset);
  const statusCells = pw.span !== 0 && pw.span <= 31 ? dailyStatus(d.series.days, statusEnd, pw.span) : weeklyStatus(d.series.days, statusEnd, Math.max(1, Math.ceil((pw.span || total) / 7)));
  const curStatus = statusOf(acwr, c.fitnessDelta);
  const focusEnd = addDays(d.today, -fw.offset);
  const fspan = fw.span || Math.max(1, total);
  const focus = loadFocus(data, d.loads, d.ctx.hrMax.bpm, focusEnd, fspan);
  const acwrZone = acwr === null ? null : acwr > 1.5 ? 'critical' : acwr > 1.3 ? 'warning' : acwr < 0.8 ? 'low' : 'ok';
  if (!d.series.days.length) {
    return (
      <div className="screen" data-screen="charge"><AppHeader title={$t("Progression")} /><ErrorBanner /><SubNav items={NAV} label={$t("Sections Progression")} />
        <main className="content"><Empty icon="progression" title={$t("Pas encore de charge")} text={$t("La charge se calcule dès la première séance enregistrée (montre ou saisie).")} /></main></div>
    );
  }
  return (
    <div className="screen" data-screen="charge">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
        <Hero className="dspan-5" label={$t("Forme de fond")} value={c.fitness === null ? '—' : num(c.fitness, 0)} chip={c.fitnessDelta === null ? undefined : $t("{0} en 7 jours", { 0: signed(c.fitnessDelta, 0) })}>
          <div className="foot">
            <span>{$t("Fatigue")} <strong>{c.fatigue === null ? '—' : num(c.fatigue, 0)}</strong></span>
            <span>{$t("Fraîcheur")} <strong>{c.freshness === null ? '—' : signed(c.freshness, 0)}</strong></span>
            <span>{$t("Rampe")} <strong>{c.rampPerWeek === null ? '—' : signed(c.rampPerWeek, 1) + $t("/sem.")}</strong></span>
          </div>
        </Hero>

        <InfoCard className="card g12 dspan-7" aria-label={$t("Statut d’entraînement")} data-anchor="statut">
          <h2>{$t("Statut d’entraînement")}<InfoToggle /></h2>
          {!curStatus && <p className="t-caption c-moderate">{$t("Disponible après 28 jours d’historique")}{d.series.firstDay ? $t(" (dès le {0})", { 0: dateFr(addDays(d.series.firstDay, 28)) }) : ''}.</p>}
          <PeriodBar p={pw} total={total} from={winFrom} to={winTo} />
          <StatusStrip weeks={statusCells} />
          <Info>{$t("Chaque case est un jour (jusqu’à 1 mois) ou une semaine. Le statut croise ta charge des 7 jours avec ta charge habituelle (4 semaines) et la tendance de ta forme de fond. Touche une case pour le détail.")}</Info>
          <div className="stack-12" data-anchor="charge-aigue">
            <h3 className="t-strong">{$t("Charge aiguë et zone optimale")}</h3>
            <Info>{$t("Le trait noir est ta charge des 7 derniers jours. La bande verte est la zone où elle progresse sans excès : entre 0,8 et 1,3 fois ta charge hebdomadaire habituelle. Dans la bande orange, c’est élevé ; au-delà, le risque de blessure monte.")}</Info>
            <AcuteLoadChart points={pw.slice(acutePts)} today={d.today} />
            <h3 className="t-strong">{$t("Rapport de charge")}</h3>
            <Info>{$t("Charge des 7 jours divisée par ta charge hebdomadaire habituelle. Entre 0,8 et 1,3 (vert) : tu progresses sans te griller. Sous 0,8 (bleu) : semaine légère. Au-dessus de 1,3 : tu montes trop vite.")}</Info>
            <RatioChart points={pw.slice(acutePts)} today={d.today} />
            {c.heaviestDay && c.heaviestDay.share >= 0.2 && <div className="note"><Icon name="info" size={20} /><span>{$t("Une seule journée pèse beaucoup dans les 28 derniers jours : le {0} ({1}, soit {2} du total). Si cette charge est surévaluée, le rapport est écrasé. Vérifie-la dans le bilan de la séance (ressenti ou FC).", { 0: dayTitle(c.heaviestDay.day), 1: num(c.heaviestDay.load, 0), 2: pct(c.heaviestDay.share) })}</span></div>}
            {d.series.isPriming && <div className="note"><Icon name="info" size={20} /><span>{$t("Historique court : forme et fatigue sont amorcées sur ta charge habituelle des 14 premiers jours, et se stabilisent vers le")} {dateFr(d.series.primingEndsOn!)}.</span></div>}
          </div>
        </InfoCard>
        </div>

        <InfoCard className="card g12 dspan-12" aria-label={$t("Évolution")} data-anchor="evolution">
          <h2>{$t("Forme de fond, fatigue et fraîcheur")}<InfoToggle /></h2>
          <Segmented label={$t("Courbe")} value={view} onChange={setView} options={[['charge', $t("Charge")], ['forme', $t("Forme du jour")]]} />
          <PeriodBar p={pw} total={total} from={winFrom} to={winTo} />
          {view === 'charge' ? <LoadPanels days={days} today={d.today} /> : (
            <>
              <FormChart days={formDays} forms={d.formByDay} />
              <Info>{$t("Score sur 100, calculé chaque matin à partir de ta nuit, de ta FC de repos, de ta fraîcheur au réveil et du ressenti de la veille, comparés à tes 14 jours précédents.")}</Info>
            </>
          )}
        </InfoCard>

        <InfoCard className="card g12 dspan-12" aria-label={$t("Répartition de la charge")} data-anchor="repartition">
          <h2>{$t("Répartition de la charge")}<InfoToggle /></h2>
          <Info>{$t("D’où vient ta charge sur la période choisie (1 semaine par défaut) : sorties tranquilles, efforts soutenus ou intensité maximale, d’après ta fréquence cardiaque.")}</Info>
          <PeriodBar p={fw} total={total} from={addDays(focusEnd, -(fspan - 1))} to={focusEnd} />
          <FocusBars focus={focus} />
        </InfoCard>

        <ForecastCard />

        <div className="dmasonry">
        <FitnessCard data={data} d={d} />
        </div>

        <InfoCard className="card g8 dspan-12" aria-label={$t("Méthode")}>
          <h2>{$t("Comment la charge est calculée")}<InfoToggle /></h2>
          <Info><p>{$t("Chaque séance reçoit une charge, de la plus fiable à la moins fiable : effort mesuré sur la courbe cardiaque de la montre (modèle de type EPOC, calé sur Garmin Connect) ; le même modèle sur la FC moyenne ; ressenti × durée recalé sur la même échelle (coefficient")} {num(d.ctx.srpeFactor, 2)}, {d.ctx.srpeCalibrationPairs >= 5 ? $t("appris sur {0} de tes séances", { 0: d.ctx.srpeCalibrationPairs }) : $t("valeur type tant qu’il y a moins de 5 séances avec FC et ressenti")}{$t(") ; à défaut, une charge provisoire tirée de tes habitudes. Forme de fond = moyenne exponentielle sur 42 jours, fatigue = sur 7 jours, fraîcheur = forme − fatigue.")}</p>
          <p>{$t("FC max retenue :")} {d.ctx.hrMax.bpm ? $t("{0} bpm ({1})", { 0: num(d.ctx.hrMax.bpm, 0), 1: d.ctx.hrMax.origin === 'observed' ? $t("pic soutenu observé") : d.ctx.hrMax.origin === 'tanaka' ? $t("formule de Tanaka, faute de mieux") : $t("valeur déclarée") }) : $t("inconnue — renseigne ta date de naissance ou une FC max")}{$t(". FC de repos de référence :")} {d.ctx.resting.at(d.today) ? $t("{0} bpm", { 0: num(d.ctx.resting.at(d.today)!, 0) }) : '—'}.</p></Info>
        </InfoCard>
      </main>
    </div>
  );
}

export function FormDetailCard() {
  const { d } = useCalc();
  const form = d.form ?? d.lastForm;
  return (
        <section className="card g12" aria-label={$t("Forme du jour, détail")} data-anchor="forme-detail">
          <div className="between"><h2>{$t("Forme du jour, détail")}</h2>{form && <span className="t-caption c-moderate">{form.day === d.today ? $t("ce matin") : dayTitle(form.day)}</span>}</div>
          {form ? (
            <>
              <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{num(form.score, 0)}</span><span className="t-strong" style={{ color: `var(--form-${formStep(form.score)})` }}>{FORM_STEP_LABEL[formStep(form.score)]}</span></div>
              <ul className="stack" style={{ gap: 'var(--space-10)' }}>
                {(Object.keys(FORM_WEIGHTS) as FormKey[]).map((k) => {
                  const comp = form.components.find((x) => x.key === k);
                  return (
                    <li key={k} className="stack-4">
                      <div className="between t-caption"><span className="t-caption-strong">{FORM_LABEL[k]} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("· poids")} {pct(comp ? comp.effectiveWeight : 0)}</span></span><span className="c-neutral">{comp ? componentText(k, comp.value, comp.center) : $t("pas de donnée")}</span></div>
                      <div className="meter"><span style={{ width: comp ? `${comp.score}%` : 0, background: comp ? `var(--form-${formStep(comp.score)})` : undefined }} /></div>
                    </li>
                  );
                })}
              </ul>
              {form.missing.length > 0 && <p className="t-legal c-moderate">{$t("Le poids des données manquantes est réparti sur les autres.")}</p>}
            </>
          ) : <p className="t-caption c-moderate">{$t("Il faut au moins 3 jours de sommeil, de FC de repos ou de fraîcheur pour calculer un score. Avec une montre lue par Health Connect, il apparaît en quelques jours.")}</p>}
        </section>
  );
}

export function HealthScreen() {
  const { data, d } = useCalc();
  return (
    <div className="screen" data-screen="sante">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
          <ReadinessCard />
          <ReserveCard />
          <SleepCard data={data} d={d} />
          <ActivityCard />
          <CaloriesCard />
          <WeightCard data={data} d={d} />
          <FormDetailCard />
        </div>
      </main>
    </div>
  );
}

function componentText(k: FormKey, v: number, center: number) {
  if (k === 'sleep') return $t("{0} (habituel {1})", { 0: hhmm(v), 1: hhmm(center) });
  if (k === 'restingHr') return $t("{0} bpm (habituel {1})", { 0: num(v, 0), 1: num(center, 0) });
  if (k === 'freshness') return $t("{0} (habituel {1})", { 0: signed(v, 0), 1: signed(center, 0) });
  return $t("RPE {0} (habituel {1})", { 0: num(v, 0), 1: num(center, 1) });
}

// ------------------------------------------------------------------ Objectif
export function ObjectiveScreen() {
  const { data, d } = useCalc();
  const [editing, setEditing] = useState(false);
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  if (!race) {
    return (
      <div className="screen" data-screen="objectif"><AppHeader title={$t("Progression")} /><ErrorBanner /><SubNav items={NAV} label={$t("Sections Progression")} />
        <main className="content stack-16"><Empty icon="flag" title={$t("Aucune course objectif")} text={$t("Renseigne ta course : date, distances et chrono visé. L’écran décompose le chrono en allures et les met en face de tes indicateurs.")} action={<button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>{$t("Renseigner ma course")}</button>} /></main>
        {editing && <RaceSheet onClose={() => setEditing(false)} />}
      </div>
    );
  }
  const rp = requiredPaces(data, race);
  const left = daysBetween(d.today, race.raceDate);
  const total = race.targetTotalSeconds;
  const gap = total !== null && rp.allocatedTotal !== null ? total - rp.allocatedTotal : null;
  return (
    <div className="screen" data-screen="objectif">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
        <Hero className="dspan-5" label={race.name} value={left > 0 ? $t("J−{0}", { 0: left }) : left === 0 ? $t("Jour J") : $t("Passée")} chip={dateFr(race.raceDate)}>
          <div className="foot">
            <span>{$t("Chrono visé")} <strong>{total !== null ? hhmm(total) : '—'}</strong></span>
            <span>{left > 0 ? $t("{0} semaines", { 0: Math.floor(left / 7) }) : ''}</span>
            <button type="button" className="btn btn-tertiary on-hero" onClick={() => setEditing(true)}><Icon name="pencil" size={16} />{$t("Modifier")}</button>
          </div>
        </Hero>

        <section className="card g12 dspan-7" aria-label={$t("Décomposition du chrono")}>
          <h2>{$t("Décomposition du chrono")}</h2>
          {total !== null && <div className="split-bar" aria-hidden="true">
            {[['SWIM', race.targetSwimSeconds], ['BIKE', race.targetBikeSeconds], ['RUN', race.targetRunSeconds], ['OTHER', race.targetTransitionSeconds]].map(([k, v]) => v ? <span key={k as string} style={{ flex: v as number, background: dvar(k as never) }} /> : null)}
          </div>}
          <dl className="kv">
            <dt>{$t("Natation")}</dt><dd>{race.targetSwimSeconds !== null ? hhmm(race.targetSwimSeconds) : '—'}</dd>
            <dt>{$t("Vélo")}</dt><dd>{race.targetBikeSeconds !== null ? hhmm(race.targetBikeSeconds) : '—'}</dd>
            <dt>{$t("Course")}</dt><dd>{race.targetRunSeconds !== null ? hhmm(race.targetRunSeconds) : '—'}</dd>
            <dt>{$t("Transitions")}</dt><dd>{race.targetTransitionSeconds !== null ? mmss(race.targetTransitionSeconds) : '—'}</dd>
            <dt className="t-strong">{$t("Somme des parties")}</dt><dd className="t-strong">{rp.allocatedTotal !== null ? hhmm(rp.allocatedTotal) : '—'}</dd>
          </dl>
          {gap !== null && Math.abs(gap) >= 60 && <div className="note note-warning"><Icon name="alert" size={20} /><span>{$t("La somme des parties")} {gap > 0 ? $t("est inférieure") : $t("dépasse")} {$t("au chrono visé de")} {duration(Math.abs(gap))}.</span></div>}
          {race.targetRevisedAt && <p className="t-legal c-moderate">{$t("Chrono révisé le")} {dateFr(race.targetRevisedAt.slice(0, 10))}.</p>}
        </section>
          <PaceCard p={rp.swim} />
          <PaceCard p={rp.bike} />
          <PaceCard p={rp.run} />
        </div>
        <Info>{$t("Les allures requises et tes indicateurs sont mis côte à côte, sans jugement de faisabilité : c’est au coach d’en tirer un plan.")}</Info>
      </main>
      {editing && <RaceSheet onClose={() => setEditing(false)} />}
    </div>
  );
}

function PaceCard({ p }: { p: RequiredPace }) {
  const req = p.required === null ? '—' : p.discipline === 'RUN' ? mmss(p.required) + NBSP + '/km' : p.discipline === 'SWIM' ? mmss(p.required) + NBSP + '/100' + NBSP + 'm' : num(p.required, 1) + NBSP + $t("km/h");
  const ref = p.reference;
  const refLabel = p.discipline === 'RUN' ? $t("VMA") : p.discipline === 'SWIM' ? 'CSS' : 'FTP';
  const refText = !ref ? '—' : p.discipline === 'RUN' ? num(ref.value * 3.6, 1) + NBSP + $t("km/h") : p.discipline === 'SWIM' ? mmss(100 / ref.value) + NBSP + '/100' + NBSP + 'm' : num(ref.value, 0) + NBSP + 'W';
  return (
    <section className="card g8" style={{ borderTop: `3px solid ${dvar(p.discipline)}` }}>
      <span className="t-label">{DISCIPLINE_LABEL[p.discipline]}{p.distanceM ? ' · ' + (p.discipline === 'SWIM' ? num(p.distanceM, 0) + NBSP + 'm' : km(p.distanceM, 1)) : ''}</span>
      <span className="t-h3">{req}</span>
      <span className="t-caption c-moderate">{p.allocated ? $t("en ") + hhmm(p.allocated) : $t("temps non réparti")}</span>
      <div className="divider" />
      <div className="between t-caption"><span className="c-neutral">{refLabel}</span><span className="t-caption-strong">{refText}</span></div>
      {p.ofReference !== null && <div className="between t-caption"><span className="c-neutral">{$t("Allure requise")}</span><span className="t-caption-strong">{pct(p.ofReference)} {$t("de la")} {refLabel}</span></div>}
      {ref && <span className="t-legal c-moderate">{SOURCE_LABEL[ref.source]} {$t("du")} {dateFr(ref.measuredAt.slice(0, 10))}</span>}
    </section>
  );
}

function RaceSheet({ onClose }: { onClose: () => void }) {
  const { data } = useCalc();
  const r = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const [name, setName] = useState(r?.name ?? $t("Ironman"));
  const [date, setDate] = useState(r?.raceDate ?? addDays(new Date().toISOString().slice(0, 10), 180));
  const [cal, setCal] = useState(false);
  const [swim, setSwim] = useState(r?.swimDistanceM ? String(r.swimDistanceM) : '3800');
  const [bike, setBike] = useState(r?.bikeDistanceM ? toInput(r.bikeDistanceM / 1000, 1) : '180');
  const [run, setRun] = useState(r?.runDistanceM ? toInput(r.runDistanceM / 1000, 1) : '42,2');
  const t = (v: number | null | undefined) => (v ? hhmm(v) : '');
  const [total, setTotal] = useState(t(r?.targetTotalSeconds));
  const [ts, setTs] = useState(t(r?.targetSwimSeconds));
  const [tb, setTb] = useState(t(r?.targetBikeSeconds));
  const [tr, setTr] = useState(t(r?.targetRunSeconds));
  const [tt, setTt] = useState(r?.targetTransitionSeconds ? mmss(r.targetTransitionSeconds) : '');
  const hms = (s: string): number | null => { if (!s.trim()) return null; const m = s.trim().match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})(?:\s*[:']\s*(\d{1,2}))?$/); return m ? +m[1] * 3600 + +m[2] * 60 + (+(m[3] ?? 0)) : NaN; };
  const ms = (s: string): number | null => (s.trim() ? parseMmss(s) : null);
  const vals = { total: hms(total), ts: hms(ts), tb: hms(tb), tr: hms(tr), tt: ms(tt) };
  const nz = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);
  const bad = Object.values(vals).some((v) => v !== null && !Number.isFinite(v)) || !name.trim();
  const dist = (s: string, k: number) => { const v = parseNum(s); return Number.isFinite(v) && v > 0 ? Math.round(v * k) : null; };
  const save = () => {
    saveRace({ name: name.trim(), raceDate: date, swimDistanceM: dist(swim, 1), bikeDistanceM: dist(bike, 1000), runDistanceM: dist(run, 1000), targetTotalSeconds: vals.total, targetSwimSeconds: vals.ts, targetBikeSeconds: vals.tb, targetRunSeconds: vals.tr, targetTransitionSeconds: vals.tt, notes: r?.notes ?? null });
    onClose(); showToast($t("Course enregistrée"));
  };
  return (
    <Sheet title={$t("Course objectif")} onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <label className="field"><span className="lbl">{$t("Nom")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="field"><span className="lbl">{$t("Date")}</span>
          <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
          {cal && <DatePicker value={date} onChange={(v) => { setDate(v); setCal(false); }} />}
        </div>
        <div className="grid-3" style={{ gap: 'var(--space-12)' }}>
          <div className="field"><span className="lbl">{$t("Natation (m)")}</span><DistanceField label={$t("Natation (m)")} meters value={numOf(swim)} onChange={(m) => setSwim(m === null ? '' : String(m))} loStep={25} hiMax={30} clearable initial={1900} /></div>
          <div className="field"><span className="lbl">{$t("Vélo (km)")}</span><DistanceField label={$t("Vélo (km)")} value={numOf(bike) === null ? null : numOf(bike)! * 1000} onChange={(m) => setBike(m === null ? '' : toInput(m / 1000, 1))} hiMax={400} loStep={100} clearable initial={90000} /></div>
          <div className="field"><span className="lbl">{$t("Course (km)")}</span><DistanceField label={$t("Course (km)")} value={numOf(run) === null ? null : numOf(run)! * 1000} onChange={(m) => setRun(m === null ? '' : toInput(m / 1000, 1))} hiMax={250} loStep={100} clearable initial={21100} /></div>
        </div>
        <div className="field"><span className="lbl">{$t("Chrono visé (h:mm)")}</span><DurationField label={$t("Chrono visé (h:mm)")} seconds={false} value={nz(vals.total)} onChange={(v) => setTotal(v === null ? '' : hhmm(v))} clearable initial={41400} /></div>
        <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
          <div className="field"><span className="lbl">{$t("Natation (h:mm)")}</span><DurationField label={$t("Natation (h:mm)")} seconds={false} value={nz(vals.ts)} onChange={(v) => setTs(v === null ? '' : hhmm(v))} clearable initial={4500} /></div>
          <div className="field"><span className="lbl">{$t("Vélo (h:mm)")}</span><DurationField label={$t("Vélo (h:mm)")} seconds={false} value={nz(vals.tb)} onChange={(v) => setTb(v === null ? '' : hhmm(v))} clearable initial={20700} /></div>
          <div className="field"><span className="lbl">{$t("Course (h:mm)")}</span><DurationField label={$t("Course (h:mm)")} seconds={false} value={nz(vals.tr)} onChange={(v) => setTr(v === null ? '' : hhmm(v))} clearable initial={15300} /></div>
          <div className="field"><span className="lbl">{$t("Transitions (mm:ss)")}</span><DurationField label={$t("Transitions (mm:ss)")} hours={false} value={nz(vals.tt)} onChange={(v) => setTt(v === null ? '' : mmss(v))} clearable initial={900} /></div>
        </div>
        
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Zones
const SOURCE_LABEL: Record<ZoneSource, string> = { test: $t("Test"), estimation: $t("Estimation"), manual: $t("Saisie") };
const KIND_INFO: Record<ZoneKind, { label: string; long: string; unit: string; hint: string; color: string }> = {
  vma: { label: $t("VMA"), long: $t("Vitesse maximale aérobie"), unit: $t("km/h"), hint: '17,5', color: dvar('RUN') },
  ftp: { label: 'FTP', long: $t("Puissance seuil fonctionnelle"), unit: 'W', hint: '240', color: dvar('BIKE') },
  css: { label: 'CSS', long: $t("Vitesse critique de nage"), unit: $t("mm:ss /100 m"), hint: '1:45', color: dvar('SWIM') },
  hr_max: { label: $t("FC max"), long: $t("Fréquence cardiaque maximale"), unit: 'bpm', hint: '186', color: 'var(--critical)' },
};
export const zoneText = (k: ZoneKind, v: number) => (k === 'vma' ? num(v * 3.6, 1) + NBSP + $t("km/h") : k === 'css' ? mmss(100 / v) + NBSP + '/100' + NBSP + 'm' : num(v, 0) + NBSP + (k === 'ftp' ? 'W' : 'bpm'));
const ROUTE_KIND: Record<string, ZoneKind> = { vma: 'vma', ftp: 'ftp', css: 'css', fcmax: 'hr_max' };
const KIND_ROUTE: Record<ZoneKind, string> = { vma: 'vma', ftp: 'ftp', css: 'css', hr_max: 'fcmax' };

export function ZonesScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const ask = route.query.get('ajout');
  const [adding, setAdding] = useState<ZoneKind | null>(ask ? ROUTE_KIND[ask] ?? null : null);
  const hm = d.ctx.hrMax;
  return (
    <div className="screen" data-screen="zones">
      <AppHeader title={$t("Progression")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Progression")} />
      <main className="content dgrid">
        <div className="dmasonry">
          <CapacitiesTrendsCard />
          <EnduranceHillCard />
        </div>
        <ZoneSuggestions />
        {(['vma', 'ftp', 'css', 'hr_max'] as ZoneKind[]).map((k) => {
          const h = zoneHistory(data, k);
          const z = h[0];
          return (
            <section key={k} className="card g8 dspan-6 list-card" aria-label={KIND_INFO[k].long}>
              <div className="between">
                <button type="button" className="row-btn grow" style={{ padding: 0 }} onClick={() => navigate('/progression/capacites/' + KIND_ROUTE[k])}>
                  <span className="stack grow"><span className="t-label">{KIND_INFO[k].label}</span><span className="t-caption c-moderate">{KIND_INFO[k].long}</span></span>
                  <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
                </button>
                <button type="button" className="icon-btn" aria-label={$t("Nouvelle valeur de ") + KIND_INFO[k].label} onClick={() => setAdding(k)}><Icon name="plusCircle" /></button>
              </div>
              {k === 'hr_max' ? (
                <>
                  <span className="t-h2">{hm.bpm ? num(hm.bpm, 0) + NBSP + 'bpm' : '—'}</span>
                  <span className="t-caption c-moderate">{hm.origin === 'observed' ? $t("Pic soutenu observé en séance (au-dessus de la valeur déclarée{0})", { 0: hm.declared ? ' ' + num(hm.declared.value, 0) : '' }) : hm.origin === 'tanaka' ? $t("Formule de Tanaka (208 − 0,7 × âge) : déclare une valeur testée pour plus de justesse") : z ? `${SOURCE_LABEL[z.source]} du ${dateFr(z.measuredAt.slice(0, 10))}` : $t("Renseigne ta date de naissance ou une valeur testée")}</span>
                  <span className="t-legal c-moderate">{[hm.declared ? $t("déclarée {0}", { 0: num(hm.declared.value, 0) }) : null, hm.observed ? $t("pic observé {0}", { 0: num(hm.observed, 0) }) : null, hm.tanaka ? $t("Tanaka {0}", { 0: num(hm.tanaka, 0) }) : null].filter(Boolean).join(' · ')}</span>
                </>
              ) : z ? (
                <>
                  <span className="t-h2">{zoneText(k, z.value)}</span>
                  <span className="t-caption c-moderate">{SOURCE_LABEL[z.source]} {$t("du")} {dateFr(z.measuredAt.slice(0, 10))}{h[1] ? $t(" · précédente {0}", { 0: zoneText(k, h[1].value) }) : ''}</span>
                  {h.length > 1 && <StepChart history={h} format={(v) => zoneText(k, v)} color={KIND_INFO[k].color} />}
                </>
              ) : <span className="t-caption c-moderate">{$t("Aucune valeur. Le coach peut programmer un test.")}</span>}
            </section>
          );
        })}
        <Info>{$t("Chaque valeur est historisée, jamais écrasée. La plus récente sert aux cibles relatives des séances (% VMA, % FTP, % CSS) et au calcul de la charge.")}</Info>
      </main>
      {adding && <ZoneSheet kind={adding} onClose={() => { setAdding(null); if (ask) navigate('/progression/capacites', { replace: true }); }} />}
    </div>
  );
}

export function ZoneHistoryScreen({ kind: routeKind }: { kind: string }) {
  const { data } = useCalc();
  const kind = ROUTE_KIND[routeKind] ?? 'vma';
  const [adding, setAdding] = useState(false);
  const h = zoneHistory(data, kind);
  const remove = (z: ZoneReading) => { const snap = deleteZone(z.id); showToast($t("Valeur supprimée"), { undo: () => restore(snap) }); };
  return (
    <div className="screen" data-screen="zone-historique">
      <SubHeader title={KIND_INFO[kind].label} fallback="/progression/capacites" right={<button type="button" className="icon-btn" aria-label={$t("Nouvelle valeur")} onClick={() => setAdding(true)}><Icon name="plus" /></button>} />
      <main className="content stack-16 form-narrow-d">
        <p className="c-neutral">{KIND_INFO[kind].long}</p>
        {h.length > 1 && <section className="card"><StepChart history={h} format={(v) => zoneText(kind, v)} color={KIND_INFO[kind].color} /></section>}
        {!h.length ? <Empty icon="gauge" title={$t("Aucune valeur")} text={$t("Ajoute un résultat de test ou une estimation.")} /> : (
          <ul className="tile-list divided card" style={{ padding: '0 var(--space-16)' }}>
            {h.map((z, i) => (
              <li key={z.id} className="settings-row" style={{ cursor: 'default' }}>
                <span className="stack"><span className="t-strong">{zoneText(kind, z.value)}{i === 0 ? <span className="var-chip" style={{ marginLeft: 8 }}>{$t("en vigueur")}</span> : null}</span><span className="t-caption c-moderate">{SOURCE_LABEL[z.source]} · {dateFr(z.measuredAt.slice(0, 10))}{z.notes ? ' · ' + z.notes : ''}</span></span>
                <button type="button" className="icon-btn" aria-label={$t("Supprimer cette valeur")} onClick={() => remove(z)}><Icon name="trash" size={20} /></button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {adding && <ZoneSheet kind={kind} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ZoneSheet({ kind, onClose }: { kind: ZoneKind; onClose: () => void }) {
  const { d } = useCalc();
  const [v, setV] = useState('');
  const [date, setDate] = useState(d.today);
  const [cal, setCal] = useState(false);
  const [source, setSource] = useState<ZoneSource>('test');
  const [notes, setNotes] = useState('');
  const raw = kind === 'css' ? parseMmss(v) : parseNum(v);
  const si = !Number.isFinite(raw) || raw <= 0 ? NaN : kind === 'vma' ? raw / 3.6 : kind === 'css' ? 100 / raw : raw;
  const bounds: Record<ZoneKind, [number, number]> = { vma: [8 / 3.6, 26 / 3.6], ftp: [60, 600], css: [100 / 300, 100 / 50], hr_max: [120, 230] };
  const ok = Number.isFinite(si) && si >= bounds[kind][0] && si <= bounds[kind][1];
  const save = () => { addZone({ kind, value: si, measuredAt: date + 'T12:00:00.000Z', source, notes: notes.trim() || null }); onClose(); showToast(KIND_INFO[kind].label + $t(" enregistrée")); };
  return (
    <Sheet title={$t("Nouvelle valeur — ") + KIND_INFO[kind].label} onClose={onClose} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <div className="field"><span className="lbl">{KIND_INFO[kind].label} ({KIND_INFO[kind].unit})</span>
          {kind === 'css' ? <PaceField label={KIND_INFO[kind].label} unit={'/100' + NBSP + 'm'} value={v && Number.isFinite(raw) && raw > 0 ? raw : null} onChange={(s) => setV(s === null ? '' : mmss(s))} clearable initial={105} />
            : kind === 'vma' ? <DecField label={KIND_INFO[kind].label} unit="km/h" value={numOf(v)} onChange={(x) => setV(x === null ? '' : toInput(x, 1))} hiMax={30} clearable initial={16} />
            : <IntField label={KIND_INFO[kind].label} unit={kind === 'ftp' ? 'W' : 'bpm'} value={numOf(v)} onChange={(x) => setV(x === null ? '' : String(x))} min={kind === 'ftp' ? 60 : 120} max={kind === 'ftp' ? 600 : 230} clearable initial={kind === 'ftp' ? 220 : 185} />}
        </div>
        <div className="field"><span className="lbl">{$t("Source")}</span><Segmented label={$t("Source")} value={source} onChange={setSource} options={[['test', $t("Test")], ['estimation', $t("Estimation")], ['manual', $t("Saisie")]]} /></div>
        <div className="field"><span className="lbl">{$t("Date")}</span>
          <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
          {cal && <DatePicker value={date} onChange={(x) => { setDate(x); setCal(false); }} />}
        </div>
        <label className="field"><span className="lbl">{$t("Note")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input" value={notes} placeholder={$t("Test demi-Cooper, piste…")} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Prévisionnel de charge
function ForecastCard() {
  const { data, d } = useCalc();
  const [h, setH] = useState<number>(DEFAULT_SPAN);
  const f = forecastLoad(data, d.series, d.loads, d.links, d.refs, d.today, h === 0 ? 'plan' : h);
  const hasPlan = f.lastPlanned !== null;
  const past = d.series.days.slice(-15, -1);
  const days: DayLoad[] = [...past, ...f.days.map((x) => ({ day: x.day, load: x.load, estimated: true, interruptionFill: false, fitness: x.fitness, fatigue: x.fatigue, freshness: x.freshness }))];
  return (
    <InfoCard className="card g12 dspan-12" aria-label={$t("Prévisionnel de charge")} data-anchor="prevision">
      <div className="between">
        <h2>{$t("Prévisionnel de charge")}<InfoToggle /></h2>
      </div>
      <div role="group" aria-label={$t("Horizon")} className="period-spans">
        {SPANS.map(([n, l]) => <button key={n} type="button" className="chip" aria-pressed={h === n} onClick={() => setH(n)}>{n === 0 ? $t("Tout le plan") : l}</button>)}
      </div>
      {!hasPlan || d.series.days.length < 2 ? <p className="t-caption c-moderate">{$t("Aucune séance prévue à venir : importe un plan du coach ou ajoute des séances au calendrier pour voir la projection.")}</p> : (
        <>
          <Info>{$t("Ce que deviendraient ta forme de fond, ta fatigue et ta fraîcheur si tu réalisais tout le plan prévu. Les barres pâles à droite sont projetées ; celles de gauche sont réelles.")}</Info>
          <LoadPanels days={days} today={d.today} />
          <h3 className="t-strong">{$t("Semaine par semaine")}</h3>
          <ul>
            {f.weeks.map((w) => (
              <li key={w.start} className="rec-row">
                <span className="stack-4"><span className="t-label">{$t("Semaine du {0}", { 0: dayMonth(w.start) })}</span><span className="t-caption c-moderate">{w.plannedSessions} {$t("séance")}{w.plannedSessions > 1 ? 's' : ''} {$t("prévue")}{w.plannedSessions > 1 ? 's' : ''}{$t(" · charge ")}{num(w.load, 0)}</span></span>
                <span className="stack-4" style={{ textAlign: 'right' }}><span className="t-strong">{$t("Forme")} {num(w.endFitness, 0)} · {signed(w.endFreshness, 0)}</span><span className={'t-caption' + (w.endAcwr !== null && w.endAcwr > 1.3 ? ' c-critical' : ' c-moderate')}>{$t("Aigu/chronique")} {w.endAcwr === null ? '—' : num(w.endAcwr, 2)}</span></span>
              </li>
            ))}
          </ul>
          {f.skipped > 0 && <div className="note"><Icon name="info" size={20} /><span>{$t("{0} séance(s) prévue(s) ne sont pas comptées : durée ou habitude inconnue (blocs sans durée, ou aucune séance récente de cette discipline).", { 0: f.skipped })}</span></div>}
          <Info>{$t("Méthode : charge d’une séance prévue = durée estimée de ses blocs × ta charge par minute habituelle dans la discipline (médiane des 90 derniers jours). L’intensité prévue n’est pas modélisée : une séance de seuil et un footing de même durée valent pareil. Les valeurs sont celles du modèle (forme 42 jours, fatigue 7 jours) ; une projection sert à comparer des semaines, pas à prédire ta forme le jour J.")}</Info>
        </>
      )}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ Estimations suggérées (VMA, CSS)
function ZoneSuggestions() {
  const { data, d } = useCalc();
  const sugg = suggestZones(data, { vma: latestZone(data, 'vma'), css: latestZone(data, 'css') }, d.today);
  if (!sugg.length) return null;
  const show = (k: 'vma' | 'css', v: number) => (k === 'vma' ? num(v * 3.6, 1) + NBSP + $t("km/h") : mmss(100 / v) + NBSP + '/100' + NBSP + 'm');
  return (
    <InfoCard className="card g12 dspan-12" aria-label={$t("Estimations suggérées")}>
      <h2>{$t("Estimations suggérées")}<InfoToggle /></h2>
      {sugg.map((s) => (
        <div key={s.kind} className="between wrap" style={{ gap: 'var(--space-8)' }}>
          <span className="stack-4 grow">
            <span className="t-label">{s.kind === 'vma' ? $t("VMA") : $t("CSS")} : {show(s.kind, s.value)}</span>
            <span className="t-caption c-moderate">{s.current ? $t("Actuellement {0}. ", { 0: show(s.kind, s.current.value) }) : $t("Aucune valeur enregistrée. ")}{s.kind === 'vma' ? $t("Meilleur effort de 6 minutes sur 90 jours") : $t("Meilleurs 200 m et 400 m d’une même séance (méthode de Wakayoshi)")} · {dateFr(s.day)}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => { addZone({ kind: s.kind, value: s.value, measuredAt: new Date().toISOString(), source: 'estimation', notes: s.kind === 'vma' ? 'Meilleur effort de 6 minutes (90 j)' : 'Méthode 200/400 m' }); showToast($t("Estimation enregistrée")); }}>{$t("Adopter")}</button>
        </div>
      ))}
      <Info>{$t("Une estimation n’est jamais appliquée seule : tu l’adoptes, elle est enregistrée avec la source « estimation » et reste modifiable. Un effort de 6 minutes ne prouve qu’une VMA au moins égale ; elle n’est proposée que si elle dépasse ta valeur actuelle. Pour la CSS, il faut deux vrais efforts maximaux (200 m et 400 m) dans la même séance.")}</Info>
    </InfoCard>
  );
}
