// Accueil — « suis-je frais ? » et « je fais quoi ? » (PRD §7, hiérarchie validée), dans la grammaire de
// l'écran Synthèse de PEAnalyze : carte héro, cartes, raccourci « assistant » vers le Coach, bouton +.
import { $t } from '../i18n';
import { AppHeader, DiscIcon, ErrorBanner, Fab } from '../ui/kit';
import { Icon } from '../ui/icons';
import { LoadChart, LoadLegend } from '../ui/charts';
import { navigate, openSheet } from '../ui/router';
import { useCalc } from '../data/store';
import { estimateDistance, estimateDuration } from '../domain/blocks';
import { addDays, daysBetween, mondayOf } from '../domain/dates';
import { FORM_LABEL, FORM_STEP_LABEL, FORM_STEPS, formStep } from '../domain/form';
import { liveRecords, sessionDay } from '../domain/load';
import { ALERT_TEXT, reviewSession, VERDICT_TEXT, type TrainingAlertCode } from '../domain/review';
import { lastPlanValidity } from '../domain/coach';
import { paceOf } from '../domain/stats';
import type { ActualSession, PlannedSession } from '../domain/types';
import { dateFr, dayLong, dayTitle, DISCIPLINE_LABEL, sessionLabel, distanceFor, duration, dvar, num, paceFor, relDays, signed, WD_LETTER, NBSP } from '../ui/format';
import { useActualMenu, usePlannedMenu } from '../ui/menu';
import { WelcomeCard } from './Welcome';
import { HealthCard } from './Health';
import { ActivityTiles } from './ActivityTiles';

/** Où mène chaque alerte de l'Accueil : directement à l'endroit qui permet d'agir. */
const ALERT_LINK: Record<TrainingAlertCode, string> = {
  PENDING_RPE: '/seances?filtre=ressenti',
  MISSED_SESSIONS: '/calendrier',
  RPE_HIGH_STREAK: '/seances',
  LOAD_RAMP: '/progression?ancre=charge-aigue',
  INJURY_LOAD: '/parametres/profil?ancre=blessures',
};

export function HomeScreen() {
  const { data, d } = useCalc();
  const today = d.today;
  const planned = liveRecords(data.planned);
  const actual = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  const empty = !planned.length && !actual.length;
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const phase = liveRecords(data.phases).find((p) => p.startDate <= today && today <= p.endDate) ?? null;
  const todayPlanned = planned.filter((p) => p.plannedDate === today && !d.links.byPlanned.has(p.id));
  const todayDone = actual.filter((s) => sessionDay(s) === today);
  const last = actual[0];
  const form = d.form ?? d.lastForm;
  const interruption = liveRecords(data.interruptions).find((i) => i.startDate <= today && today <= i.endDate);

  return (
    <div className="screen" data-screen="accueil">
      <AppHeader title={$t("Aujourd’hui")} />
      <ErrorBanner />
      <main className="content with-fab dgrid">
        {empty && <WelcomeCard className="dspan-12" />}
        <HealthCard compact />

        {race && <div className="dspan-12"><RaceCard name={race.name} date={race.raceDate} today={today} phase={phase ? { label: phase.label, start: phase.startDate, end: phase.endDate } : null} /></div>}
        {d.alerts.length > 0 && (
          <section aria-label={$t("À signaler")} className="stack-8 dspan-12">
            {d.alerts.map((a) => (
              <button key={a.code} type="button" className={'note' + (a.code === 'LOAD_RAMP' || a.code === 'RPE_HIGH_STREAK' ? ' note-warning' : '')} onClick={() => navigate(ALERT_LINK[a.code])}
                style={{ border: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <Icon name={a.code === 'PENDING_RPE' ? 'edit' : 'alert'} size={20} />
                <span>{ALERT_TEXT[a.code](a)}</span>
              </button>
            ))}
          </section>
        )}

        <div className="dmasonry">
        <FormHero form={form} isToday={!!d.form} constat={d.constat} priming={d.series.isPriming} firstDay={d.series.firstDay} />
        <ActivityTiles />
        <section className="stack-12 dspan-7">
          {interruption && (
            <div role="note" className="note"><Icon name="pause" size={20} /><span><strong>{$t("En interruption :")} {interruption.label}</strong> {$t("— jusqu’au")} {dateFr(interruption.endDate)}.{interruption.dailyLoadOverride !== null ? $t(" Charge forfaitaire de {0} par jour.", { 0: num(interruption.dailyLoadOverride, 0) }) : ''}</span></div>
          )}
          <TodayCard planned={todayPlanned} done={todayDone} today={today} />
        </section>


        <WeekCard />

        <section aria-labelledby="h-load" className="card dspan-7" onClick={() => navigate('/progression?ancre=charge-aigue')} style={{ cursor: 'pointer' }}>
          <div className="between"><h2 id="h-load">{$t("Charge — 4 semaines")}</h2><Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} /></div>
          <LoadChart days={d.series.days.slice(-28)} height={110} compact />
          <LoadLegend />
        </section>

        {last && <LastSessionCard s={last} />}
        </div>

      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ forme du jour (carte héro)
function FormHero({ form, isToday, constat, priming, firstDay }: { form: ReturnType<typeof useCalc>['d']['form']; isToday: boolean; constat: ReturnType<typeof useCalc>['d']['constat']; priming: boolean; firstDay: string | null }) {
  const step = form ? formStep(form.score) : null;
  return (
    <section aria-label={$t("Forme du jour")} className="hero" data-component="Card.hero" onClick={() => navigate('/progression?vue=forme&ancre=evolution')} style={{ cursor: 'pointer' }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <span className="overline">{$t("Forme du jour")}</span>
        {step && <span className="chip-reverse">{FORM_STEP_LABEL[step]}</span>}
      </div>
      {form ? (
        <div className="row baseline" style={{ gap: 'var(--space-6)' }}>
          <span className="t-hero">{num(form.score, 0)}</span>
          <span className="t-h3" style={{ color: 'var(--text-reverse-muted)' }}>/{NBSP}100</span>
        </div>
      ) : (
        <div className="stack-4"><span className="t-h1">{$t("Pas encore calculable")}</span><span className="t-caption c-reverse-muted">{$t("Il faut quelques nuits et quelques jours de FC de repos (ou de charge) pour comparer à tes propres habitudes.")}</span></div>
      )}
      <FormScale active={step} />
      {form && !isToday && <span className="t-caption c-reverse-muted">{$t("Calculée le")} {dateFr(form.day)} {$t(": la nuit dernière n’est pas encore remontée.")}</span>}
      {form && form.missing.length > 0 && <span className="t-caption c-reverse-muted">{$t("Sans")} {form.missing.map((k) => FORM_LABEL[k].replace(/^(Sommeil|Fraîcheur|FC)/, (m) => (m === 'FC' ? m : m.toLowerCase()))).join(', ')} {$t(": les poids sont répartis sur le reste.")}</span>}
      <div className="foot">
        <span><strong>{constat.fitness === null ? '—' : num(constat.fitness, 0)}</strong> {$t("fond")}</span>
        <span><strong>{constat.fatigue === null ? '—' : num(constat.fatigue, 0)}</strong> {$t("fatigue")}</span>
        <span><strong>{constat.freshness === null ? '—' : signed(constat.freshness, 0)}</strong> {$t("fraîcheur")}</span>
        {priming && firstDay && <span>{$t("amorçage depuis le")} {dateFr(firstDay)}</span>}
      </div>
    </section>
  );
}

export function FormScale({ active, onLight }: { active: string | null; onLight?: boolean }) {
  const idx = active ? FORM_STEPS.indexOf(active as never) : -1;
  return (
    <div className="form-scale" aria-hidden="true">
      {FORM_STEPS.map((s, i) => (
        <span key={s} className={'step' + (i === idx ? ' on' : '')} style={{ background: i <= idx ? `var(--form-${s})` : onLight ? 'var(--bg-grey-minimal)' : 'var(--bg-reverse-subtle)' }} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ course
function RaceCard({ name, date, today, phase }: { name: string; date: string; today: string; phase: { label: string; start: string; end: string } | null }) {
  const days = daysBetween(today, date);
  const week = phase ? Math.floor(daysBetween(phase.start, today) / 7) + 1 : 0;
  const weeks = phase ? Math.ceil((daysBetween(phase.start, phase.end) + 1) / 7) : 0;
  return (
    <button type="button" className="card list-card rowcard" onClick={() => navigate("/progression/objectif")} data-component="RaceCard">
      <span className="op-icon" style={{ background: 'var(--bg-brand-minimal)', color: 'var(--text)' }}><Icon name="flag" size={20} /></span>
      <span className="stack grow" style={{ minWidth: 0 }}>
        <span className="t-amount-m ellipsis">{days > 0 ? $t("J−{0}", { 0: days }) : days === 0 ? $t("C’est aujourd’hui") : $t("Course passée ({0} j)", { 0: -days })} · {name}</span>
        <span className="t-caption c-moderate">{dayTitle(date)} {date.slice(0, 4)}{phase ? $t(" · {0}, semaine {1} sur {2}", { 0: phase.label, 1: week, 2: weeks }) : ''}</span>
      </span>
      <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
    </button>
  );
}

// ------------------------------------------------------------------ séance du jour
function TodayCard({ planned, done, today }: { planned: PlannedSession[]; done: ActualSession[]; today: string }) {
  const { d } = useCalc();
  return (
    <section aria-labelledby="h-today" className="card g8" data-component="TodayCard">
      <div className="between baseline"><h2 id="h-today">{$t("Séance du jour")}</h2><span className="t-caption c-moderate">{dayLong(today)}</span></div>
      {!planned.length && !done.length && (
        <p className="c-neutral t-caption">{$t("Rien de prévu aujourd’hui. Le plan vient du coach — ou ajoute une séance avec le bouton +.")}</p>
      )}
      <ul className="divided">
        {planned.map((p) => <TodayPlannedRow key={p.id} p={p} />)}
        {done.map((s) => <TodayDoneRow key={s.id} s={s} />)}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ semaine en pastilles
function WeekCard() {
  const { data, d } = useCalc();
  const monday = mondayOf(d.today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const planned = liveRecords(data.planned);
  const actual = liveRecords(data.actual);
  let doneSec = 0, plannedSec = 0;
  const cols = days.map((day) => {
    const p = planned.filter((x) => x.plannedDate === day);
    const a = actual.filter((x) => sessionDay(x) === day);
    a.forEach((x) => (doneSec += x.durationSec));
    p.forEach((x) => (plannedSec += estimateDuration(x.blocks, x.discipline, d.refs).value));
    return { day, open: p.filter((x) => !d.links.byPlanned.has(x.id)), done: a };
  });
  return (
    <section aria-labelledby="h-week" className="card dspan-7" data-component="WeekStrip">
      <div className="between baseline">
        <h2 id="h-week">{$t("Cette semaine")}</h2>
        <span className="t-caption c-moderate right">{doneSec ? duration(doneSec) + $t(" faites") : $t("rien encore")}{plannedSec ? $t(" · {0} prévues", { 0: duration(plannedSec) }) : ''}</span>
      </div>
      <div className="week-strip">
        {cols.map((c, i) => {
          const isToday = c.day === d.today;
          return (
            <button key={c.day} type="button" className={'wday' + (isToday ? ' today' : '')} aria-label={dayLong(c.day)} onClick={() => navigate('/calendrier?jour=' + c.day)}>
              <span className="t-caption-strong">{WD_LETTER[i]}</span>
              <span className="t-caption c-moderate">{+c.day.slice(8, 10)}</span>
              <span className="wdots">
                {c.done.map((s) => <span key={s.id} className="wdot" style={{ background: dvar(s.discipline), borderColor: dvar(s.discipline) }} />)}
                {c.open.map((p) => <span key={p.id} className={'wdot' + (c.day < d.today ? ' missed' : '')} style={{ borderColor: dvar(p.discipline) }} />)}
                {!c.done.length && !c.open.length && <span className="wdot none" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="legend"><span><span className="wdot" style={{ background: 'var(--text-neutral)', borderColor: 'var(--text-neutral)' }} />{$t("réalisée")}</span><span><span className="wdot" style={{ borderColor: 'var(--text-neutral)' }} />{$t("prévue")}</span><span><span className="wdot missed" style={{ borderColor: 'var(--text-neutral)' }} />{$t("non réalisée")}</span></div>
    </section>
  );
}

function TodayPlannedRow({ p }: { p: PlannedSession }) {
  const { d } = useCalc();
  const dur = estimateDuration(p.blocks, p.discipline, d.refs);
  const dist = estimateDistance(p.blocks, p.discipline, d.refs);
  const { lp, sheet } = usePlannedMenu(p);
  return (
    <li>
      <button type="button" className="row-btn" {...lp} onClick={() => navigate('/calendrier/prevue/' + p.id)}>
        <DiscIcon d={p.discipline} />
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{p.title ?? DISCIPLINE_LABEL[p.discipline]}</span>
          <span className="t-caption c-moderate">{$t("Prévue ·")} {DISCIPLINE_LABEL[p.discipline]}</span>
        </span>
        <span className="stack right" style={{ alignItems: 'flex-end' }}>
          <span className={'t-amount-s' + (dur.certainty !== 'exact' ? ' est' : '')}>{dur.certainty === 'unknown' ? '—' : duration(dur.value)}</span>
          {dist.certainty !== 'unknown' && <span className="t-caption c-moderate">{distanceFor(dist.value, p.discipline)}</span>}
        </span>
      </button>
      {sheet}
    </li>
  );
}

function TodayDoneRow({ s }: { s: ActualSession }) {
  const { lp, sheet } = useActualMenu(s);
  return (
    <li>
      <button type="button" className="row-btn" {...lp} onClick={() => navigate('/seances/' + s.id)}>
        <DiscIcon d={s.discipline} sub={s.subSport} />
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{sessionLabel(s)}</span>
          <span className="t-caption" style={{ color: 'var(--success-text)' }}><Icon name="check" size={14} style={{ verticalAlign: '-2px' }} /> {$t("Réalisée")}{s.rpe ? $t(" · RPE {0}", { 0: s.rpe }) : ''}</span>
        </span>
        <span className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="t-amount-s">{duration(s.durationSec)}</span>
          {s.distanceM ? <span className="t-caption c-moderate">{distanceFor(s.distanceM, s.discipline)}</span> : null}
        </span>
      </button>
      {sheet}
    </li>
  );
}

// ------------------------------------------------------------------ dernière séance
function LastSessionCard({ s }: { s: ActualSession }) {
  const { data, d } = useCalc();
  const r = reviewSession(data, d.loads, d.links, d.refs, s);
  const pace = paceOf(s);
  const ago = daysBetween(sessionDay(s), d.today);
  const good = r.verdict === 'onPlan' || r.verdict === 'typical';
  const { lp, sheet } = useActualMenu(s);
  return (
    <section aria-labelledby="h-last" className="card dspan-5" data-component="LastSession">
      <div className="between baseline"><h2 id="h-last">{$t("Dernière séance")}</h2><span className="t-caption c-moderate">{relDays(-ago)}</span></div>
      <button type="button" className="row-btn" {...lp} onClick={() => navigate('/seances/' + s.id)}>
        <DiscIcon d={s.discipline} sub={s.subSport} />
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-strong">{sessionLabel(s)} · {duration(s.durationSec)}{s.distanceM ? ' · ' + distanceFor(s.distanceM, s.discipline) : ''}</span>
          <span className="t-caption c-moderate">{[pace ? paceFor(pace, s.discipline) : null, s.avgHrBpm ? num(s.avgHrBpm, 0) + NBSP + 'bpm' : null, d.loads.get(s.id)?.load != null ? $t("charge ") + num(d.loads.get(s.id)!.load!, 0) : null].filter(Boolean).join(' · ')}</span>
        </span>
        <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
      </button>
      {sheet}
      <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
        <span className={'var-chip' + (good ? '' : r.verdict === 'pending' ? ' flat' : ' warn')}>{VERDICT_TEXT[r.verdict]}</span>
        {!s.rpe && <button type="button" className="btn btn-secondary" style={{ height: 32 }} onClick={() => navigate('/seances/' + s.id + '?ressenti=1')}><Icon name="edit" size={16} />{$t("Noter mon ressenti")}</button>}
      </div>
    </section>
  );
}
