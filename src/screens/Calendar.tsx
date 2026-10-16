// Calendrier — Semaine | Mois (sous-navigation de PEAnalyze), fiche d'une séance prévue, feuille « Ajouter ».
// Ergonomie revue : chaque jour a son « + », une séance non réalisée se lit d'un coup d'œil, la séance
// réalisée qui l'honore s'affiche à sa place (plus de doublon prévu/réalisé), déplacer ou dupliquer une
// séance se fait depuis sa fiche avec le calendrier, l'interruption en cours est marquée sur les jours.
import { $t } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader, DatePicker, DiscIcon, ErrorBanner, Fab, Sheet, SubHeader, SubNav, showToast, useSwipe } from '../ui/kit';
import { Icon } from '../ui/icons';
import { back, closeSheet, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { deletePlanned, duplicatePlanned, movePlanned, restore } from '../data/actions';
import { estimateDistance, estimateDuration } from '../domain/blocks';
import { addDays, daysBetween, mondayOf, weeksOfMonth } from '../domain/dates';
import { liveRecords, sessionDay } from '../domain/load';
import type { ActualSession, PlannedSession } from '../domain/types';
import { DISCIPLINE_ICON, blockDetail, blockHead, dateFr, dayLong, dayMonth, dayTitle, DISCIPLINE_LABEL, sessionLabel, distanceFor, duration, dvar, MONTHS_TITLE, num, WD_LETTER, KIND_LABEL, phaseLabel } from '../ui/format';
import { refKeyOfSession } from '../domain/coach';

const NAV = [{ to: '/calendrier', label: $t("Semaine") }, { to: '/calendrier/mois', label: $t("Mois") }];

interface DayItems { planned: PlannedSession[]; done: ActualSession[] }

function useDayIndex() {
  const { data, d } = useCalc();
  return useMemo(() => {
    const map = new Map<string, DayItems>();
    const get = (k: string) => { let v = map.get(k); if (!v) map.set(k, (v = { planned: [], done: [] })); return v; };
    for (const p of liveRecords(data.planned)) get(p.plannedDate).planned.push(p);
    for (const s of liveRecords(data.actual)) get(sessionDay(s)).done.push(s);
    for (const v of map.values()) v.done.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
    return { map, links: d.links };
  }, [data, d]);
}

function PhaseRibbon({ day }: { day: string }) {
  const { data } = useCalc();
  const phases = liveRecords(data.phases).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const p = phases.find((x) => x.startDate <= day && day <= x.endDate);
  const idx = p ? phases.indexOf(p) + 1 : 0;
  return (
    <button type="button" className="phase-ribbon" onClick={() => navigate('/calendrier/periodisation')}>
      <Icon name="layers" size={18} />
      {p ? (
        <span className="grow ellipsis"><strong>{p.label}</strong>{p.phase ? ' · ' + phaseLabel(p.phase) : ''} {$t("· bloc")} {idx}/{phases.length} {$t("· jusqu’au")} {dayMonth(p.endDate)}</span>
      ) : <span className="grow">{$t("Aucun bloc de préparation en cours · Périodisation")}</span>}
      <Icon name="next" size={18} />
    </button>
  );
}

// ------------------------------------------------------------------ Semaine
export function CalendarWeekScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const focus = route.query.get('jour') || d.today;
  const [monday, setMonday] = useState(mondayOf(focus));
  useEffect(() => { setMonday(mondayOf(focus)); }, [focus]);
  useEffect(() => {
    if (!route.query.get('jour')) return;
    const el = document.getElementById('jour-' + focus);
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }, [focus, route.query]);
  const { map, links } = useDayIndex();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  let done = 0, total = 0, vol = 0, load = 0;
  for (const day of days) {
    const it = map.get(day);
    if (!it) continue;
    total += it.planned.length;
    done += it.planned.filter((p) => links.byPlanned.has(p.id)).length;
    it.done.forEach((s) => { vol += s.durationSec; load += d.loads.get(s.id)?.load ?? 0; });
  }
  const ints = liveRecords(data.interruptions);
  const isThisWeek = monday === mondayOf(d.today);
  const [dir, setDir] = useState<'l' | 'r' | ''>('');
  const go = (k: number) => { setDir(k > 0 ? 'l' : 'r'); setMonday(addDays(monday, 7 * k)); };
  const swipe = useSwipe(() => go(1), () => go(-1));
  return (
    <div className="screen" data-screen="calendrier-semaine">
      <AppHeader title={$t("Calendrier")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Vue du calendrier")}>
        <div className="period-nav">
          <button type="button" className="icon-btn" aria-label={$t("Semaine précédente")} onClick={() => go(-1)}><Icon name="back" /></button>
          <span className="stack center grow">
            <span className="t-amount-m">{dayMonth(monday)} – {dayMonth(addDays(monday, 6))}</span>
            <span className="t-caption c-moderate">{isThisWeek ? $t("cette semaine") : daysBetween(mondayOf(d.today), monday) > 0 ? $t("dans {0} sem.", { 0: daysBetween(mondayOf(d.today), monday) / 7 }) : $t("il y a {0} sem.", { 0: -daysBetween(mondayOf(d.today), monday) / 7 })}</span>
          </span>
          <button type="button" className="icon-btn" aria-label={$t("Semaine suivante")} onClick={() => go(1)}><Icon name="next" /></button>
        </div>
      </SubNav>
      <main key={monday} className={'content with-fab gap-12' + (dir ? ' slide-' + dir : '')} {...swipe}>
        <div className="cal-top dgrid" style={{ gap: 'var(--space-12)' }}>
          <div className="dspan-6"><PhaseRibbon day={isThisWeek ? d.today : monday} /></div>
          <div className="grid-3 dspan-6">
            <div className="kpi"><span className="label">{$t("Séances")}</span><span className="value">{done}/{total}</span></div>
            <div className="kpi"><span className="label">{$t("Volume")}</span><span className="value">{duration(vol)}</span></div>
            <div className="kpi"><span className="label">{$t("Charge")}</span><span className="value">{num(load, 0)}</span></div>
          </div>
        </div>
        {!isThisWeek && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center', minHeight: 32 }} onClick={() => setMonday(mondayOf(d.today))}>{$t("Revenir à cette semaine")}</button>}
        <div className="stack dcols-days" style={{ gap: 0 }}>
          {days.map((day) => {
            const it = map.get(day) ?? { planned: [], done: [] };
            const intr = ints.find((i) => i.startDate <= day && day <= i.endDate);
            const openPlanned = it.planned.filter((p) => !links.byPlanned.has(p.id));
            return (
              <section key={day} id={'jour-' + day} className={'day-block' + (day === focus && route.query.get('jour') ? ' focused' : '')}>
                <h2 className="month-header day-header">
                  <span>{day === d.today ? $t("Aujourd’hui · ") : ''}{dayLong(day)}</span>
                  <button type="button" className="icon-btn" aria-label={$t("Ajouter une séance le ") + dayLong(day)} onClick={() => openSheet('ajouter', { date: day })}><Icon name="plus" size={20} /></button>
                </h2>
                {intr && <div className="intr-chip"><Icon name="pause" size={14} /> {intr.label}</div>}
                {it.done.length + openPlanned.length === 0 ? (
                  <p className="t-caption c-moderate day-empty">{day < d.today ? $t("Repos") : $t("Rien de prévu")}</p>
                ) : (
                  <ul className="op-list">
                    {it.done.map((s) => <ActualRow key={s.id} s={s} />)}
                    {openPlanned.map((p) => <PlannedRow key={p.id} p={p} missed={day < d.today} />)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </main>
      <Fab onClick={() => openSheet('ajouter', { date: days.includes(d.today) ? d.today : monday })} />
    </div>
  );
}

function ActualRow({ s }: { s: ActualSession }) {
  const { data, d } = useCalc();
  const link = d.links.byActual.get(s.id);
  const p = link?.plannedId ? data.planned[link.plannedId] : undefined;
  const l = d.loads.get(s.id);
  return (
    <li className="op-item">
      <button type="button" className="op-row" onClick={() => navigate('/seances/' + s.id)}>
        <DiscIcon d={s.discipline} sub={s.subSport} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{p?.title ?? sessionLabel(s)}</span>
          <span className="t-caption" style={{ color: 'var(--success-text)' }}><Icon name="check" size={14} style={{ verticalAlign: '-2px' }} /> {$t("Réalisée")}{p ? $t(" · prévue") : ''}{s.rpe ? $t(" · RPE ") + s.rpe : ''}</span>
        </span>
        <span className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="t-amount-s nowrap">{duration(s.durationSec)}</span>
          <span className="t-caption c-moderate nowrap">{s.distanceM && s.discipline !== 'STRENGTH' ? distanceFor(s.distanceM, s.discipline) : l?.load != null ? $t("charge ") + num(l.load, 0) : ''}</span>
        </span>
      </button>
    </li>
  );
}

function PlannedRow({ p, missed }: { p: PlannedSession; missed: boolean }) {
  const { d } = useCalc();
  const dur = estimateDuration(p.blocks, p.discipline, d.refs);
  return (
    <li className="op-item">
      <button type="button" className="op-row" onClick={() => navigate('/calendrier/prevue/' + p.id)}>
        <span className="disc-icon outline" style={{ borderColor: dvar(p.discipline), color: dvar(p.discipline) }}><DiscGlyph d={p.discipline} /></span>
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{p.title ?? DISCIPLINE_LABEL[p.discipline]}</span>
          <span className="t-caption" style={{ color: missed ? 'var(--critical-text)' : 'var(--text-moderate)' }}>{missed ? $t("Non réalisée") : $t("Prévue")} · {DISCIPLINE_LABEL[p.discipline]}{p.origin === 'coach' ? $t(" · coach") : ''}</span>
        </span>
        <span className={'t-amount-s nowrap' + (dur.certainty !== 'exact' ? ' est' : '')}>{dur.certainty === 'unknown' ? '—' : duration(dur.value)}</span>
      </button>
    </li>
  );
}

function DiscGlyph({ d }: { d: PlannedSession['discipline'] }) {
  return <Icon name={DISCIPLINE_ICON[d]} size={20} />;
}

// ------------------------------------------------------------------ Mois
export function CalendarMonthScreen() {
  const { data, d } = useCalc();
  const [month, setMonth] = useState(d.today.slice(0, 7));
  const [sel, setSel] = useState(d.today);
  const { map, links } = useDayIndex();
  const weeks = weeksOfMonth(month);
  const [dir, setDir] = useState<'l' | 'r' | ''>('');
  const shift = (k: number) => { setDir(k > 0 ? 'l' : 'r'); let [y, m] = month.split('-').map(Number); m += k; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setMonth(y + '-' + String(m).padStart(2, '0')); };
  const swipe = useSwipe(() => shift(1), () => shift(-1));
  const ints = liveRecords(data.interruptions);
  let done = 0, total = 0, vol = 0;
  for (const [day, it] of map) {
    if (day.slice(0, 7) !== month) continue;
    total += it.planned.length; done += it.planned.filter((p) => links.byPlanned.has(p.id)).length;
    it.done.forEach((s) => (vol += s.durationSec));
  }
  const selItems = map.get(sel) ?? { planned: [], done: [] };
  const selOpen = selItems.planned.filter((p) => !links.byPlanned.has(p.id));
  return (
    <div className="screen" data-screen="calendrier-mois">
      <AppHeader title={$t("Calendrier")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Vue du calendrier")}>
        <div className="period-nav">
          <button type="button" className="icon-btn" aria-label={$t("Mois précédent")} onClick={() => shift(-1)}><Icon name="back" /></button>
          <span className="stack center grow"><span className="t-amount-m">{MONTHS_TITLE[+month.slice(5, 7) - 1]} {month.slice(0, 4)}</span><span className="t-caption c-moderate">{done}/{total} {$t("séances prévues réalisées ·")} {duration(vol)}</span></span>
          <button type="button" className="icon-btn" aria-label={$t("Mois suivant")} onClick={() => shift(1)}><Icon name="next" /></button>
        </div>
      </SubNav>
      <main key={month} className={'content with-fab dgrid' + (dir ? ' slide-' + dir : '')} {...swipe}>
        <section className="card g8 dspan-7" aria-label={$t("Mois")}>
          <div className="month-grid">
            {WD_LETTER.map((l, i) => <span key={i} className="mg-head">{l}</span>)}
            {weeks.flatMap((w) => Array.from({ length: 7 }, (_, i) => addDays(w, i))).map((day) => {
              const it = map.get(day);
              const out = day.slice(0, 7) !== month;
              const intr = ints.some((x) => x.startDate <= day && day <= x.endDate);
              const open = (it?.planned ?? []).filter((p) => !links.byPlanned.has(p.id));
              return (
                <button key={day} type="button" className={'mg-day' + (out ? ' out' : '') + (day === d.today ? ' today' : '') + (day === sel ? ' sel' : '') + (intr ? ' intr' : '')} aria-pressed={day === sel} aria-label={dayLong(day)} onClick={() => setSel(day)}>
                  <span className="mg-num">{+day.slice(8, 10)}</span>
                  <span className="wdots">
                    {(it?.done ?? []).slice(0, 3).map((s) => <span key={s.id} className="wdot" style={{ background: dvar(s.discipline), borderColor: dvar(s.discipline) }} />)}
                    {open.slice(0, 3 - Math.min(3, it?.done.length ?? 0)).map((p) => <span key={p.id} className={'wdot' + (day < d.today ? ' missed' : '')} style={{ borderColor: dvar(p.discipline) }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="stack-8 dspan-5" aria-label={dayLong(sel)}>
          <div className="between"><h2 className="t-h3">{dayTitle(sel)}</h2><button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => openSheet('ajouter', { date: sel })}><Icon name="plus" size={18} />{$t("Ajouter")}</button></div>
          {selItems.done.length + selOpen.length === 0 ? <p className="t-caption c-moderate">{sel < d.today ? $t("Repos") : $t("Rien de prévu ce jour-là.")}</p> : (
            <ul className="op-list" style={{ margin: 0 }}>
              {selItems.done.map((s) => <ActualRow key={s.id} s={s} />)}
              {selOpen.map((p) => <PlannedRow key={p.id} p={p} missed={sel < d.today} />)}
            </ul>
          )}
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/calendrier?jour=' + sel)}>{$t("Voir la semaine")}<Icon name="next" size={18} /></button>
        </section>
      </main>
      <Fab onClick={() => openSheet('ajouter', { date: sel })} />
    </div>
  );
}

// ------------------------------------------------------------------ fiche d'une séance prévue
export function PlannedDetailScreen({ id }: { id: string }) {
  const { data, d } = useCalc();
  const p = data.planned[id];
  const [picker, setPicker] = useState<'move' | 'copy' | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!p || p.deleted) {
    return (<div className="screen"><SubHeader title={$t("Séance prévue")} fallback="/calendrier" /><main className="content"><p className="c-neutral">{$t("Cette séance n’existe plus.")}</p></main></div>);
  }
  const dur = estimateDuration(p.blocks, p.discipline, d.refs);
  const dist = estimateDistance(p.blocks, p.discipline, d.refs);
  const done = (d.links.byPlanned.get(p.id) ?? []).map((x) => data.actual[x]).filter(Boolean);
  const remove = () => {
    const snap = deletePlanned(p.id);
    back('/calendrier');
    showToast($t("Séance supprimée"), { undo: () => restore(snap) });
  };
  return (
    <div className="screen" data-screen="seance-prevue">
      <SubHeader title={DISCIPLINE_LABEL[p.discipline]} fallback={'/calendrier?jour=' + p.plannedDate} right={<button type="button" className="icon-btn" aria-label={$t("Modifier")} onClick={() => navigate('/calendrier/editer/' + p.id)}><Icon name="pencil" /></button>} />
      <main className="content dgrid form-narrow-d">
        <section className="card g12 dspan-12">
          <div className="row" style={{ gap: 'var(--space-12)' }}>
            <DiscIcon d={p.discipline} size={48} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="t-h3">{p.title ?? DISCIPLINE_LABEL[p.discipline]}</span>
              <span className="t-caption c-moderate">{dayTitle(p.plannedDate)} {p.plannedDate.slice(0, 4)} · {p.origin === 'coach' ? $t("proposée par le coach") : $t("saisie à la main")}</span>
            </span>
          </div>
          <div className="grid-2">
            <div className="kpi"><span className="label">{$t("Durée estimée")}</span><span className={'value' + (dur.certainty !== 'exact' ? ' est' : '')}>{dur.certainty === 'unknown' ? '—' : duration(dur.value)}</span></div>
            <div className="kpi"><span className="label">{$t("Distance estimée")}</span><span className={'value' + (dist.certainty !== 'exact' ? ' est' : '')}>{dist.certainty === 'unknown' ? '—' : distanceFor(dist.value, p.discipline)}</span></div>
          </div>
          {(dur.usedRefs || dist.usedRefs) && <p className="t-caption c-moderate">{$t("Estimation à partir de ta dernière VMA / CSS pour les cibles en pourcentage.")}</p>}
          {(dur.untimed > 0 || dur.approx > 0) && <p className="t-caption c-moderate">{dur.untimed > 0 ? $t("{0} bloc(s) sans durée connue, non compté(s). ", { 0: dur.untimed }) : ''}{dur.approx > 0 ? $t("Blocs sans cible estimés à ton allure d’endurance (70 % VMA, 90 % CSS).") : ''}</p>}
          {p.notes && <p className="note"><Icon name="info" size={20} /><span>{p.notes}</span></p>}
        </section>
        <section className="card g4 dspan-12" aria-label={$t("Blocs")}>
          <h2>{$t("Blocs")}</h2>
          <BlockList p={p} />
        </section>
        <section className="card g8 dspan-12" aria-label={$t("Réalisation")}>
          <h2>{$t("Réalisation")}</h2>
          {done.length ? done.map((s) => (
            <button key={s.id} type="button" className="row-btn" onClick={() => navigate('/seances/' + s.id)}>
              <DiscIcon d={s.discipline} sub={s.subSport} size={36} />
              <span className="stack grow"><span className="t-strong">{$t("Réalisée le")} {dateFr(sessionDay(s))}</span><span className="t-caption c-moderate">{duration(s.durationSec)}{s.distanceM ? ' · ' + distanceFor(s.distanceM, s.discipline) : ''} {$t("· voir le bilan")}</span></span>
              <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
            </button>
          )) : <p className="t-caption c-moderate">{p.plannedDate < d.today ? $t("Aucune séance réalisée rattachée. Si tu l’as faite, ouvre son bilan pour la rattacher.") : $t("À venir. La séance de ta montre s’y rattachera automatiquement.")}</p>}
        </section>
        <div className="stack-8 dspan-12">
          <div className="grid-2">
            <button type="button" className="btn btn-secondary block" onClick={() => setPicker(picker === 'move' ? null : 'move')}><Icon name="calendar" size={18} />{$t("Déplacer")}</button>
            <button type="button" className="btn btn-secondary block" onClick={() => setPicker(picker === 'copy' ? null : 'copy')}><Icon name="copy" size={18} />{$t("Dupliquer")}</button>
          </div>
          {picker && <DatePicker value={p.plannedDate} label={picker === 'move' ? $t("Déplacer au") : $t("Dupliquer vers")} onChange={(date) => {
            if (picker === 'move') { const snap = movePlanned(p.id, date); showToast($t("Séance déplacée au ") + dateFr(date), { undo: () => restore(snap) }); }
            else { const c = duplicatePlanned(p.id, date); if (c) showToast($t("Séance dupliquée au ") + dateFr(date), { undo: () => restore([{ coll: 'planned', id: c.id, rec: undefined }]) }); }
            setPicker(null);
          }} />}
          {!confirm ? <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)', alignSelf: 'center' }} onClick={() => setConfirm(true)}><Icon name="trash" size={18} />{$t("Supprimer la séance")}</button> : (
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-danger" onClick={remove}>{$t("Supprimer")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{$t("Annuler")}</button>
            </div>
          )}
          <p className="t-legal c-moderate center">{$t("Clé d’échange coach :")} {refKeyOfSession(p)}</p>
        </div>
      </main>
    </div>
  );
}

export function BlockList({ p }: { p: PlannedSession }) {
  if (!p.blocks.length) return <p className="t-caption c-moderate">{$t("Aucun bloc.")}</p>;
  return (
    <ol className="block-list">
      {p.blocks.map((b, i) => (
        <li key={i} className={'block-item k-' + b.kind}>
          <span className="block-role">{KIND_LABEL[b.kind]}</span>
          <span className="stack grow">
            <span className="t-strong">{blockHead(b).replace(KIND_LABEL[b.kind] + ' — ', '').replace(KIND_LABEL[b.kind], b.kind === 'SET' ? '' : KIND_LABEL[b.kind])}</span>
            {b.kind !== 'SET' && <span className="t-caption c-neutral">{blockDetail(b, p.discipline)}{b.discipline ? ' · ' + DISCIPLINE_LABEL[b.discipline] : ''}</span>}
            {b.notes && <span className="t-caption c-moderate">{b.notes}</span>}
            {b.kind === 'SET' && (
              <ol className="block-children">
                {b.children.map((c, k) => (
                  <li key={k}><span className="t-caption-strong">{blockHead(c)}</span> <span className="t-caption c-neutral">{blockDetail(c, p.discipline)}</span>{c.notes && <span className="t-caption c-moderate"> — {c.notes}</span>}</li>
                ))}
              </ol>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ feuille « Ajouter » (bouton +)
export function AddSheet() {
  const route = useRoute();
  const { d } = useCalc();
  const date = route.query.get('date') || d.today;
  const go = (to: string) => navigate(to, { replace: true });
  return (
    <Sheet title={$t("Ajouter")} head={date !== d.today ? <span className="t-caption c-moderate">{dayTitle(date)}</span> : undefined}>
      <div className="stack-12" style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
          <button type="button" className="tile" style={{ background: 'var(--bg-brand-minimal)' }} onClick={() => go('/calendrier/editer/nouvelle?date=' + date)} data-component="Tile">
            <span className="tile-icon"><Icon name="calendar" /></span>
            <span className="stack" style={{ gap: 'var(--space-2)' }}><span className="t-amount-m">{$t("Planifier")}</span><span className="t-caption c-neutral">{$t("Une séance à venir, bloc par bloc")}</span></span>
          </button>
          <button type="button" className="tile" style={{ background: 'var(--bg-blue-minimal)' }} onClick={() => go('/seances/saisie?date=' + (date > d.today ? d.today : date))} data-component="Tile">
            <span className="tile-icon" style={{ color: 'var(--text-blue)' }}><Icon name="seances" /></span>
            <span className="stack" style={{ gap: 'var(--space-2)' }}><span className="t-amount-m">{$t("Séance faite")}</span><span className="t-caption c-neutral">{$t("Saisie à la main, sans la montre")}</span></span>
          </button>
        </div>
        <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
          <SheetRow icon="clipboard" title={$t("Coller un lot de séances faites")} sub={$t("Une ligne par séance, depuis tes notes")} onClick={() => go('/seances/saisie?mode=lot')} />
          <SheetRow icon="clipboard" title={$t("Coller un lot de séances prévues")} sub={$t("Date ; discipline ; durée ; titre")} onClick={() => go('/seances/saisie?mode=prevues')} />
          <SheetRow icon="pause" title={$t("Déclarer une interruption")} sub={$t("Blessure, déplacement, bivouac…")} onClick={() => go('/parametres/interruptions?nouvelle=' + date)} />
          <SheetRow icon="coach" title={$t("Importer un plan du coach")} sub={$t("Fichier JSON ironapp/1")} onClick={() => go('/coach?importer=1')} />
        </ul>
      </div>
    </Sheet>
  );
}

function SheetRow({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="settings-row" onClick={onClick}>
        <Icon name={icon} style={{ color: 'var(--primary-fg)' }} />
        <span className="stack"><span className="t-strong">{title}</span><span className="t-caption c-moderate">{sub}</span></span>
        <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
      </button>
    </li>
  );
}
export { SheetRow, closeSheet };
