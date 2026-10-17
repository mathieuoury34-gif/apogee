// Séances — Journal | Statistiques, bilan d'une séance, saisie manuelle (une séance ou un lot).
// Le Journal reprend celui de PEAnalyze : regroupement par mois avec total, balayage à gauche pour
// Modifier / Supprimer (avec « Annuler »), filtres en pastilles.
import { $t } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, ChipGroup, DatePicker, DiscIcon, Empty, ErrorBanner, Fab, Hero, Sheet, SportPicker, SubHeader, SubNav, showToast, useWidth, OtherToggle, useWithOther } from '../ui/kit';
import { Donut, StepChart, WeekBars } from '../ui/charts';
import { Icon } from '../ui/icons';
import { useActualMenu } from '../ui/menu';
import { back, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { addManualSessions, addPlannedBulk, brickDecision, deleteActual, editActual, restore, setFeedback, setManualLink } from '../data/actions';
import { addDays, daysBetween, monthOf } from '../domain/dates';
import { exerciseLabel } from '../domain/health';
import { linkCandidates, findBrickSibling } from '../domain/links';
import { liveRecords, METHOD_LABEL, sessionDay } from '../domain/load';
import { parseBulkActual, parseBulkPlanned, parseManualFields, type ManualInput } from '../domain/manual';
import { DRIFT_REASON_TEXT, reviewSession, VERDICT_TEXT } from '../domain/review';
import { disciplineStats, overview, paceOf, weeklyVolume } from '../domain/stats';
import type { ActualDiscipline, ActualSession, PlannedDiscipline } from '../domain/types';
import { ACTUAL_DISCIPLINES } from '../domain/types';
import { DISCIPLINE_SHORT, bpm, dateFr, dateTimeFr, dayMonth, dayTitle, DISCIPLINE_LABEL, sessionLabel, distanceFor, duration, dvar, hours, km, mmss, monthLong, num, paceFor, parseNum, pct, pctSigned, signed, speedKmh, timeOf, toInput, NBSP } from '../ui/format';
import { cleanHr } from '../domain/hr';

const NAV = [{ to: '/seances', label: $t("Journal") }, { to: '/seances/stats', label: $t("Statistiques") }];

// ------------------------------------------------------------------ Journal
export function JournalScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const [filter, setFilter] = useState<'all' | ActualDiscipline | 'rpe'>(route.query.get('filtre') === 'ressenti' ? 'rpe' : 'all');
  const [months, setMonths] = useState(3);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<'all' | '30' | '90' | '365'>('all');
  const [swiped, setSwiped] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const all = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  const q = query.trim().toLowerCase();
  const since = period === 'all' ? null : addDays(d.today, -Number(period));
  const list = all.filter((s) => {
    if (!(filter === 'all' || (filter === 'rpe' ? !s.rpe : s.discipline === filter))) return false;
    if (since && sessionDay(s) < since) return false;
    if (!q) return true;
    const hay = [s.title, s.comment, s.subSport, DISCIPLINE_LABEL[s.discipline], sessionDay(s), dateFr(sessionDay(s))].filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const groups: { key: string; items: ActualSession[] }[] = [];
  for (const s of list) {
    const k = monthOf(sessionDay(s));
    let g = groups.find((x) => x.key === k);
    if (!g) groups.push((g = { key: k, items: [] }));
    g.items.push(s);
  }
  const shown = groups.slice(0, months);
  const present = ACTUAL_DISCIPLINES.filter((x) => all.some((s) => s.discipline === x));
  const remove = (s: ActualSession) => {
    const snap = deleteActual(s.id);
    setSwiped(null); setConfirm(null);
    showToast($t("Séance supprimée"), { undo: () => restore(snap) });
  };
  return (
    <div className="screen" data-screen="journal">
      <AppHeader title={$t("Séances")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Séances")}>
        <div className="chips g6" role="group" aria-label={$t("Filtrer")}>
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{$t("Toutes")}</button>
          {present.map((x) => <button key={x} type="button" className="chip" aria-pressed={filter === x} onClick={() => setFilter(x)}>{DISCIPLINE_LABEL[x]}</button>)}
          <button type="button" className="chip" aria-pressed={filter === 'rpe'} onClick={() => setFilter('rpe')}>{$t("Ressenti à noter")}</button>
        </div>
        <div className="chips g6" role="group" aria-label={$t("Période")}>
          {([['all', $t("Tout")], ['30', $t("30 jours")], ['90', $t("90 jours")], ['365', $t("1 an")]] as const).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        <input className="input" type="search" value={query} placeholder={$t("Rechercher : titre, sport, commentaire, date…")} aria-label={$t("Rechercher une séance")} onChange={(e) => setQuery(e.target.value)} />
      </SubNav>
      <main className="content with-fab journal">
        {!list.length && <Empty icon="seances" title={filter === 'rpe' ? $t("Tout est noté") : (q || period !== 'all') && all.length ? $t("Aucun résultat") : $t("Aucune séance pour l’instant")} text={filter === 'rpe' ? $t("Chaque séance a son ressenti.") : (q || period !== 'all') && all.length ? $t("Aucune séance ne correspond à cette recherche.") : $t("Les séances de ta montre arrivent ici. Utilise le bouton + pour en saisir une.")} />}
        {shown.map((g) => {
          const vol = g.items.reduce((t, s) => t + s.durationSec, 0);
          return (
            <section key={g.key} className="stack">
              <h2 className="month-header"><span>{monthLong(g.key)}</span><span className="total c-neutral">{g.items.length} {$t("séance")}{g.items.length > 1 ? 's' : ''} · {duration(vol)}</span></h2>
              <ul className="op-list">
                {g.items.map((s) => (
                  <SessionItem key={s.id} s={s} load={d.loads.get(s.id)?.load ?? null} swiped={swiped === s.id} confirming={confirm === s.id}
                    onSwipe={(v) => { setSwiped(v ? s.id : null); setConfirm(null); }} onOpen={() => navigate('/seances/' + s.id)}
                    onEdit={() => navigate('/seances/' + s.id + '?modifier=1')} onDelete={() => (confirm === s.id ? remove(s) : setConfirm(s.id))} />
                ))}
              </ul>
            </section>
          );
        })}
        {groups.length > months && <button type="button" className="btn btn-secondary" style={{ alignSelf: 'center', marginTop: 'var(--space-16)' }} onClick={() => setMonths(months + 6)}>{$t("Afficher les mois précédents")}</button>}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function SessionItem({ s, load, swiped, confirming, onSwipe, onOpen, onEdit, onDelete }: { s: ActualSession; load: number | null; swiped: boolean; confirming: boolean; onSwipe: (v: boolean) => void; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const pace = paceOf(s);
  const { lp, sheet } = useActualMenu(s);
  return (
    <li className={'op-item' + (swiped ? ' swiped' : '')}>
      {swiped && (
        <span className="op-actions">
          <button type="button" className="edit" onClick={onEdit}><Icon name="pencil" size={20} />{$t("Modifier")}</button>
          <button type="button" className="del" onClick={onDelete}><Icon name={confirming ? 'check' : 'trash'} size={20} />{confirming ? $t("Confirmer") : $t("Supprimer")}</button>
        </span>
      )}
      <button type="button" className="op-row" aria-label={`${sessionLabel(s)} du ${dateFr(sessionDay(s))}, ${duration(s.durationSec)}`}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; lp.onPointerDown(e); }}
        onPointerUp={lp.onPointerUp} onPointerCancel={lp.onPointerCancel} onPointerLeave={lp.onPointerLeave} onContextMenu={lp.onContextMenu} onClickCapture={lp.onClickCapture}
        onPointerMove={(e) => { lp.onPointerMove(e); if (!start.current) return; const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { moved.current = true; onSwipe(dx < 0); start.current = null; } }}
        onClick={() => { if (moved.current) { moved.current = false; return; } if (swiped) onSwipe(false); else onOpen(); }}>
        <DiscIcon d={s.discipline} sub={s.subSport} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{sessionLabel(s)} · {dayTitle(sessionDay(s))}</span>
          <span className="t-caption c-moderate ellipsis">{[s.distanceM && s.discipline !== 'STRENGTH' ? distanceFor(s.distanceM, s.discipline) : null, pace ? paceFor(pace, s.discipline) : null, s.avgHrBpm ? num(s.avgHrBpm, 0) + NBSP + 'bpm' : null, s.source === 'manual' ? 'saisie' : null].filter(Boolean).join(' · ') || exerciseLabel(s.rawExerciseType)}</span>
          {!s.rpe && <span className="t-legal" style={{ color: 'var(--warning-text)' }}>{$t("Ressenti à noter")}</span>}
        </span>
        <span className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="t-amount-s nowrap">{duration(s.durationSec)}</span>
          <span className="t-caption c-moderate nowrap">{load !== null ? $t("charge ") + num(load, 0) : ''}</span>
        </span>
      </button>
      {sheet}
    </li>
  );
}

// ------------------------------------------------------------------ Bilan d'une séance
export function ReviewScreen({ id }: { id: string }) {
  const route = useRoute();
  const { data, d } = useCalc();
  const s = data.actual[id];
  const [editing, setEditing] = useState(route.query.get('modifier') === '1');
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const rpeRef = useRef<HTMLElement>(null);
  useEffect(() => { if (route.query.get('ressenti') && rpeRef.current) setTimeout(() => rpeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }, [route.query]);
  if (!s || s.deleted) return (<div className="screen"><SubHeader title={$t("Séance")} fallback="/seances" /><main className="content"><p className="c-neutral">{$t("Cette séance n’existe plus.")}</p></main></div>);
  const day = sessionDay(s);
  const r = reviewSession(data, d.loads, d.links, d.refs, s);
  const l = d.loads.get(s.id)!;
  const link = d.links.byActual.get(s.id);
  const pace = paceOf(s);
  const sibling = findBrickSibling(data, s, d.links);
  const ed = new Set(s.edited);
  const mark = (f: string) => (ed.has(f as never) ? $t(" ent") : '');
  const remove = () => { const snap = deleteActual(s.id); back('/seances'); showToast($t("Séance supprimée"), { undo: () => restore(snap) }); };
  const good = r.verdict === 'onPlan' || r.verdict === 'typical';
  return (
    <div className="screen" data-screen="bilan">
      <SubHeader title={$t("Bilan de séance")} fallback="/seances" right={<button type="button" className="icon-btn" aria-label={$t("Modifier la séance")} onClick={() => setEditing(true)}><Icon name="pencil" /></button>} />
      <main className="content dgrid">
        <div className="dmasonry">
        <section className="card g16 dspan-7" aria-label={$t("Mesures")}>
          <div className="row" style={{ gap: 'var(--space-12)' }}>
            <DiscIcon d={s.discipline} sub={s.subSport} size={48} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="t-h3">{sessionLabel(s)}</span>
              <span className="t-caption c-moderate">{dayTitle(day)} {day.slice(0, 4)}{s.source === 'health' ? ' · ' + timeOf(s.startAt, s.zoneOffsetMinutes) : ''} · {s.source === 'manual' ? $t("saisie à la main") : $t("montre · ") + exerciseLabel(s.rawExerciseType)}</span>
            </span>
          </div>
          <div className="grid-3 kpi-grid">
            <Kpi label={$t("Durée")} value={duration(s.durationSec)} cls={mark('durationSec')} />
            <Kpi label={$t("Distance")} value={s.distanceM && s.discipline !== 'STRENGTH' ? distanceFor(s.distanceM, s.discipline) : '—'} cls={mark('distanceM')} />
            <Kpi label={s.discipline === 'BIKE' ? $t("Vitesse") : $t("Allure")} value={pace ? paceFor(pace, s.discipline) : '—'} cls={mark('distanceM')} />
            <Kpi label={$t("FC moyenne")} value={bpm(s.avgHrBpm)} cls={mark('avgHrBpm')} />
            <Kpi label={$t("FC max")} value={bpm(s.maxHrBpm)} />
            <Kpi label={$t("Charge")} value={l.load === null ? '—' : num(l.load, 0)} cls={l.assise === 'estimated' ? $t(" est") : ''} />
          </div>
          <p className="t-caption c-moderate">{$t("Charge")} {METHOD_LABEL[l.method]}{l.method === 'srpe' ? $t(" (RPE × minutes × {0}, coefficient appris sur {1})", { 0: num(d.ctx.srpeFactor, 2), 1: d.ctx.srpeCalibrationPairs >= 5 ? $t("tes séances") : $t("une valeur type") }) : ''}.{s.edited.length ? $t(" Valeurs soulignées : corrigées à la main.") : ''}{s.elevationGainM ? $t(" Dénivelé {0} m.", { 0: num(s.elevationGainM, 0) }) : ''}{s.activeCaloriesJ ? $t(" {0} kcal actives.", { 0: num(s.activeCaloriesJ / 4184, 0) }) : ''}</p>
          <HrTrace id={s.id} />
        </section>

        <section className="card g12 dspan-5" aria-label={$t("Verdict")}>
          <h2>{$t("Verdict")}</h2>
          <span className={'var-chip big' + (good ? '' : r.verdict === 'pending' ? ' flat' : ' warn')} style={{ alignSelf: 'flex-start' }}>{VERDICT_TEXT[r.verdict]}</span>
          {r.basis === 'plan' && r.plan && (
            <p className="t-caption c-neutral">{$t("Comparé au prévu — écart de")} {r.plan.axis === 'distance' ? 'distance' : $t("durée")} : {r.plan.axis === 'distance' ? (r.plan.distanceDelta! >= 0 ? '+' : '−') + km(Math.abs(r.plan.distanceDelta!)) : (r.plan.durationDelta! >= 0 ? '+' : '−') + duration(Math.abs(r.plan.durationDelta!))} ({pctSigned(r.plan.ratio! - 1)}).</p>
          )}
          {r.basis === 'habits' && <p className="t-caption c-neutral">{$t("Comparé à la médiane de tes séances de")} {DISCIPLINE_LABEL[s.discipline].toLowerCase()} {$t("des 8 dernières semaines (")}{pctSigned((r.habit ?? 1) - 1)}).</p>}
          {r.alerts.map((a) => <div key={a.code} className="note note-warning"><Icon name="alert" size={20} /><span>{a.code === 'HR_DRIFT_HIGH' ? $t("Dérive cardiaque marquée : {0} entre les deux moitiés.", { 0: pctSigned(a.value, 1) }) : $t("Écart important par rapport au plan : {0} du prévu.", { 0: pct(a.value) })}</span></div>)}
          <div className="stack-4">
            <span className="t-label">{$t("Dérive cardiaque")}</span>
            <span className="t-caption c-neutral">{r.drift.value === null ? '—' : pctSigned(r.drift.value, 1)} · {DRIFT_REASON_TEXT[r.drift.reason]}</span>
          </div>
        </section>

        <section ref={rpeRef as never} className="card g12 dspan-7" aria-label={$t("Ressenti")}>
          <h2>{$t("Ressenti")}</h2>
          <RpeScale value={s.rpe} onChange={(v) => { setFeedback(s.id, v, s.comment); if (v) showToast($t("Ressenti enregistré : la charge est recalculée")); }} />
          <Comment value={s.comment ?? ''} onSave={(c) => setFeedback(s.id, s.rpe, c)} />
        </section>

        <section className="card g12 dspan-5" aria-label={$t("Séance prévue")}>
          <h2>{$t("Séance prévue")}</h2>
          {r.plan ? (
            <>
              <button type="button" className="row-btn" onClick={() => navigate('/calendrier/prevue/' + r.plan!.planned.id)}>
                <DiscIcon d={r.plan.planned.discipline} size={36} />
                <span className="stack grow"><span className="t-strong">{r.plan.planned.title ?? DISCIPLINE_LABEL[r.plan.planned.discipline]}</span><span className="t-caption c-moderate">{r.plan.planned.plannedDate !== day ? $t("Prévue le ") + dateFr(r.plan.planned.plannedDate) : $t("Prévue ce jour")} · {link?.type === 'manual' ? $t("rattachée à la main") : $t("rattachement automatique ({0})", { 0: pct(link?.confidence ?? 0) })}</span></span>
                <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
              </button>
              <dl className="dl">
                <dt>{r.plan.part ? $t("Prévu (partie ") + DISCIPLINE_LABEL[s.discipline].toLowerCase() + ')' : $t("Prévu")}</dt><dd>{[r.plan.expectedDuration !== null ? duration(r.plan.expectedDuration) : null, r.plan.expectedDistance ? distanceFor(r.plan.expectedDistance, s.discipline) : null].filter(Boolean).join(' · ') || '—'}</dd>
                <dt>{$t("Réalisé")}</dt><dd>{[duration(s.durationSec), s.distanceM && s.discipline !== 'STRENGTH' ? distanceFor(s.distanceM, s.discipline) : null].filter(Boolean).join(' · ')}</dd>
              </dl>
            </>
          ) : <p className="t-caption c-moderate">{link?.type === 'none' ? $t("Marquée comme non prévue.") : $t("Aucune séance prévue rattachée.")}</p>}
          <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
            <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => setLinkOpen(true)}><Icon name="link" size={16} />{r.plan ? $t("Changer") : $t("Choisir la séance prévue")}</button>
            {link?.type === 'manual' || link?.type === 'none' ? <button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setManualLink(s.id, undefined)}>{$t("Revenir à l’automatique")}</button>
              : <button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setManualLink(s.id, null)}>{$t("Ce n’était pas prévu")}</button>}
          </div>
        </section>
        </div>

        {sibling && (
          <section className="card g12 dspan-12 highlight" aria-label={$t("Regroupement BRICK")}>
            <h2>{$t("Enchaînement ?")}</h2>
            <p className="c-neutral">{$t("Regrouper avec la séance de")} {DISCIPLINE_LABEL[sibling.discipline].toLowerCase()} {$t("du même jour en BRICK ? Les deux séances gardent leur propre rattachement.")}</p>
            <div className="row wrap">
              <button type="button" className="btn btn-primary" onClick={() => { brickDecision(s, sibling, 'confirmed'); showToast($t("Regroupées en BRICK")); }}>{$t("Regrouper en BRICK")}</button>
              <button type="button" className="btn btn-tertiary" onClick={() => brickDecision(s, sibling, 'declined')}>{$t("Non, séances séparées")}</button>
            </div>
            <p className="t-legal c-moderate">{$t("Un refus n’est jamais reproposé.")}</p>
          </section>
        )}

        <div className="stack-8 dspan-12" style={{ alignItems: 'center' }}>
          {!confirm ? <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={() => setConfirm(true)}><Icon name="trash" size={18} />{$t("Supprimer cette séance")}</button> : (
            <div className="row wrap" style={{ justifyContent: 'center' }}><button type="button" className="btn btn-danger" onClick={remove}>{$t("Supprimer")}</button><button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{$t("Annuler")}</button></div>
          )}
          <span className="t-legal c-moderate">{s.source === 'health' ? $t("Identifiant Garmin ") + s.sourceId : $t("Saisie le ") + dateTimeFr(s.ingestedAt)}</span>
        </div>
      </main>
      {editing && <EditSheet s={s} onClose={() => setEditing(false)} />}
      {linkOpen && <LinkSheet s={s} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function Kpi({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className="kpi"><span className="label">{label}</span><span className={'value' + cls}>{value}</span></div>;
}

function HrTrace({ id }: { id: string }) {
  const { data } = useCalc();
  const [ref, w] = useWidth<HTMLDivElement>();
  const ser = data.series[id];
  const hr = ser && !ser.deleted ? cleanHr(ser.hr) : [];
  if (hr.length < 20) return null;
  const t0 = hr[0][0], t1 = hr[hr.length - 1][0];
  const lo = Math.min(...hr.map((p) => p[1])), hi = Math.max(...hr.map((p) => p[1]));
  const H = 70;
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (w - 36);
  const Y = (v: number) => 4 + H - ((v - lo) / (hi - lo || 1)) * H;
  const step = Math.max(1, Math.round(hr.length / 300));
  const dpath = hr.filter((_, i) => i % step === 0).map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');
  return (
    <div ref={ref} className="chart" style={{ height: H + 26 }} aria-label={$t("Fréquence cardiaque pendant la séance")}>
      <svg width={w} height={H + 26} viewBox={`0 0 ${w} ${H + 26}`} role="img" aria-label={$t("FC de {0} à {1} bpm", { 0: num(lo, 0), 1: num(hi, 0) })}>
        <path d={dpath} fill="none" strokeWidth="1.75" strokeLinejoin="round" style={{ stroke: 'var(--critical)' }} />
      </svg>
      <span className="tick" style={{ left: w - 30, top: Y(hi) - 9 }}>{num(hi, 0)}</span>
      <span className="tick" style={{ left: w - 30, top: Y(lo) - 9 }}>{num(lo, 0)}</span>
      <span className="tick" style={{ left: 0, top: H + 8 }}>{$t("FC (bpm) ·")} {duration(t1 - t0)}</span>
    </div>
  );
}

export function RpeScale({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="stack-8" data-component="RpeScale">
      <div className="rpe-scale" role="radiogroup" aria-label={$t("Ressenti de l’effort, de 1 à 10")}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={'rpe' + (value === v ? ' on' : '') + (value !== null && v <= value ? ' fill' : '')} style={{ ['--rpe' as string]: `var(--form-${v <= 3 ? 'fresh' : v <= 5 ? 'ready' : v <= 7 ? 'steady' : v <= 8 ? 'strained' : 'depleted'})` }} onClick={() => onChange(value === v ? null : v)}>{v}</button>
        ))}
      </div>
      <div className="between t-caption c-moderate"><span>{$t("Très facile")}</span><span>{value ? $t("RPE ") + value + $t(" · toucher à nouveau pour retirer") : $t("RPE, saisi après séance")}</span><span>{$t("Maximal")}</span></div>
    </div>
  );
}

function Comment({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">
      <span className="lbl">{$t("Commentaire")}</span>
      <textarea className="input textarea" rows={2} value={v} placeholder={$t("Sensations, contexte, météo…")} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) { onSave(v); showToast($t("Commentaire enregistré")); } }} />
    </label>
  );
}

function EditSheet({ s, onClose }: { s: ActualSession; onClose: () => void }) {
  const [date, setDate] = useState(sessionDay(s));
  const [disc, setDisc] = useState<ActualDiscipline>(s.discipline);
  const [title, setTitle] = useState(s.title ?? '');
  const [sub, setSub] = useState<string | null>(s.subSport ?? null);
  const [dur, setDur] = useState(toInput(s.durationSec / 60, 1).replace(/,0$/, ''));
  const [dist, setDist] = useState(s.distanceM ? toInput(s.distanceM / 1000, 2) : '');
  const [hr, setHr] = useState(s.avgHrBpm ? String(Math.round(s.avgHrBpm)) : '');
  const [cal, setCal] = useState(false);
  const r = parseManualFields({ date, discipline: disc, durationMin: dur, distanceKm: dist, avgHrBpm: hr });
  const save = () => {
    if ('error' in r) return;
    const snap = editActual(s.id, { ...r.input, rpe: s.rpe, comment: s.comment, subSport: disc === 'OTHER' ? sub : null, title });
    onClose();
    showToast($t("Séance modifiée"), { undo: () => restore(snap) });
  };
  return (
    <Sheet title={$t("Modifier la séance")} onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={'error' in r} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        {s.source === 'health' && <div className="note"><Icon name="info" size={20} /><span>{$t("Une valeur mesurée par la montre que tu corriges passe en « saisie », pour de bon. La séance reste la même (aucun doublon à la prochaine lecture).")}</span></div>}
        <div className="field"><span className="lbl">{$t("Date")}</span>
          <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
          {cal && <DatePicker value={date} onChange={(v) => { setDate(v); setCal(false); }} />}
        </div>
        <div className="field"><span className="lbl">{$t("Discipline")}</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{ACTUAL_DISCIPLINES.map((x) => <button key={x} type="button" className="chip" aria-pressed={disc === x} onClick={() => setDisc(x)}>{DISCIPLINE_LABEL[x]}</button>)}</div>
        </div>
        {disc === 'OTHER' && <div className="field"><span className="lbl">{$t("Pictogramme de l’activité")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><SportPicker value={sub} onChange={setSub} /></div>}
        <label className="field"><span className="lbl">{$t("Titre")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
          <input className="input" value={title} maxLength={80} placeholder={disc === 'OTHER' ? $t("Nom de l’activité : GR20 étape 3, kayak, balade…") : $t("Sortie avec Paul, vélo de nuit…")} onChange={(e) => setTitle(e.target.value)} />
          <span className="hint">{$t("Remplace le nom de la discipline dans les listes. Ne change aucun calcul.")}</span></label>
        <div className="grid-3" style={{ gap: 'var(--space-12)' }}>
          <label className="field"><span className="lbl">{$t("Durée (min)")}</span><input className="input num" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} /></label>
          <label className="field"><span className="lbl">{$t("Distance (km)")}</span><input className="input num" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} /></label>
          <label className="field"><span className="lbl">{$t("FC moy.")}</span><input className="input num" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} /></label>
        </div>
        {'error' in r && <span className="err t-caption-strong c-critical">{r.error}</span>}
      </div>
    </Sheet>
  );
}

function LinkSheet({ s, onClose }: { s: ActualSession; onClose: () => void }) {
  const { data, d } = useCalc();
  const cands = linkCandidates(data, d.links, s);
  const cur = d.links.byActual.get(s.id)?.plannedId ?? null;
  return (
    <Sheet title={$t("Rattacher la séance")} onClose={onClose}>
      <div className="stack-12" style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <p className="t-caption c-neutral">{$t("Séances prévues entre le")} {dateFr(addDays(sessionDay(s), -3))} {$t("et le")} {dateFr(addDays(sessionDay(s), 3))}{$t(". Réversible à tout moment.")}</p>
        <ul className="tile-list divided" style={{ padding: '0 var(--space-12)' }}>
          {cands.map(({ planned: p, taken }) => (
            <li key={p.id}>
              <button type="button" className="settings-row" onClick={() => { setManualLink(s.id, p.id); onClose(); showToast($t("Séance rattachée")); }}>
                <DiscIcon d={p.discipline} size={32} />
                <span className="stack"><span className="t-strong">{p.title ?? DISCIPLINE_LABEL[p.discipline]}</span><span className="t-caption c-moderate">{dayTitle(p.plannedDate)}{taken ? $t(" · déjà rattachée à une autre séance") : ''}</span></span>
                {cur === p.id ? <Icon name="check" size={20} style={{ color: 'var(--success-text)' }} /> : <span />}
              </button>
            </li>
          ))}
          {!cands.length && <li className="t-caption c-moderate" style={{ padding: 'var(--space-12) 0' }}>{$t("Aucune séance prévue dans les jours voisins.")}</li>}
          <li>
            <button type="button" className="settings-row" onClick={() => { setManualLink(s.id, null); onClose(); }}>
              <Icon name="close" style={{ color: 'var(--text-neutral)' }} />
              <span className="stack"><span className="t-strong">{$t("Ne rattacher à rien")}</span><span className="t-caption c-moderate">{$t("reste au journal, hors comparaison")}</span></span><span />
            </button>
          </li>
        </ul>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Saisie manuelle
export function ManualEntryScreen() {
  const route = useRoute();
  const { d } = useCalc();
  const initial = route.query.get('mode') === 'lot' ? 'bulk' : route.query.get('mode') === 'prevues' ? 'planned' : 'single';
  const [mode, setMode] = useState<'single' | 'bulk' | 'planned'>(initial);
  const [date, setDate] = useState(route.query.get('date') || d.today);
  const [cal, setCal] = useState(false);
  const [disc, setDisc] = useState<ActualDiscipline>('RUN');
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState<string | null>(null);
  const [dur, setDur] = useState('');
  const [dist, setDist] = useState('');
  const [hr, setHr] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [text, setText] = useState('');
  const r = parseManualFields({ date, discipline: disc, durationMin: dur.replace(/^(\d+)h(\d+)$/, (_m, h, m) => String(+h * 60 + +m)), distanceKm: dist, avgHrBpm: hr });
  const parsed = useMemo(() => (mode === 'bulk' ? parseBulkActual(text) : mode === 'planned' ? parseBulkPlanned(text) : null), [mode, text]);
  const durMin = parseNum(dur), distKm = parseNum(dist);
  const submitSingle = () => {
    if ('error' in r) return;
    const input: ManualInput = { ...r.input, rpe, comment: comment.trim() || null, title: title.trim() || null, subSport: disc === 'OTHER' ? sub : null };
    const res = addManualSessions([input]);
    if (!res.inserted.length) { showToast($t("Cette séance existe déjà (même date, discipline, durée, distance et FC)."), { error: true }); return; }
    const created = res.inserted[0];
    navigate('/seances/' + created.id, { replace: true });
    showToast($t("Séance ajoutée"), { undo: () => restore([{ coll: 'actual', id: created.id, rec: undefined }]) });
  };
  const submitBulk = () => {
    if (!parsed) return;
    if (mode === 'bulk') {
      const res = addManualSessions((parsed as ReturnType<typeof parseBulkActual>).valid);
      showToast($t("{0} séance(s) ajoutée(s), {1} déjà existante(s)", { 0: res.inserted.length, 1: res.duplicates }), { undo: res.inserted.length ? () => restore(res.inserted.map((x) => ({ coll: 'actual' as const, id: x.id, rec: undefined }))) : undefined });
    } else {
      const list = (parsed as ReturnType<typeof parseBulkPlanned>).valid;
      addPlannedBulk(list);
      showToast($t("{0} séance(s) planifiée(s) ajoutée(s)", { 0: list.length }), { undo: () => restore(list.map((x) => ({ coll: 'planned' as const, id: x.id, rec: undefined }))) });
    }
    back(mode === 'planned' ? '/calendrier' : '/seances');
  };
  return (
    <div className="screen screen-white" data-screen="saisie">
      <SubHeader title={$t("Ajouter une séance")} fallback="/seances" close bordered />
      <div className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-16) var(--screen-margin) var(--space-24)' }}>
          <div className="seg" role="group" aria-label={$t("Mode de saisie")}>
            <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>{$t("Une séance")}</button>
            <button type="button" aria-pressed={mode === 'bulk'} onClick={() => setMode('bulk')}>{$t("Lot fait")}</button>
            <button type="button" aria-pressed={mode === 'planned'} onClick={() => setMode('planned')}>{$t("Lot prévu")}</button>
          </div>
          {mode === 'single' ? (
            <>
              <div className="field"><span className="lbl">{$t("Date")}</span>
                <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
                {cal && <DatePicker value={date} onChange={(v) => { setDate(v); setCal(false); }} />}
              </div>
              <div className="field"><span className="lbl">{$t("Discipline")}</span>
                <div className="disc-picker" role="radiogroup" aria-label={$t("Discipline")}>
                  {ACTUAL_DISCIPLINES.map((x) => <button key={x} type="button" role="radio" aria-checked={disc === x} className={'disc-pick' + (disc === x ? ' on' : '')} style={{ ['--c' as string]: dvar(x) }} onClick={() => setDisc(x)}><DiscIcon d={x} size={36} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span></button>)}
                </div>
              </div>
        {disc === 'OTHER' && <div className="field"><span className="lbl">{$t("Pictogramme de l’activité")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><SportPicker value={sub} onChange={setSub} /></div>}
        <label className="field"><span className="lbl">{$t("Titre")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
          <input className="input" value={title} maxLength={80} placeholder={disc === 'OTHER' ? $t("Nom de l’activité : GR20 étape 3, kayak, balade…") : $t("Sortie avec Paul, vélo de nuit…")} onChange={(e) => setTitle(e.target.value)} />
          <span className="hint">{$t("Remplace le nom de la discipline dans les listes. Ne change aucun calcul.")}</span></label>
              <div className="grid-3" style={{ gap: 'var(--space-12)' }}>
                <label className="field"><span className="lbl">{$t("Durée (min)")}</span><input className="input num" inputMode="decimal" value={dur} placeholder="45" onChange={(e) => setDur(e.target.value)} /></label>
                <label className="field"><span className="lbl">{$t("Distance (km)")}</span><input className="input num" inputMode="decimal" value={dist} placeholder="—" onChange={(e) => setDist(e.target.value)} /></label>
                <label className="field"><span className="lbl">{$t("FC moy.")}</span><input className="input num" inputMode="numeric" value={hr} placeholder="—" onChange={(e) => setHr(e.target.value)} /></label>
              </div>
              <div className="field"><span className="lbl">{$t("Ressenti")}</span><RpeScale value={rpe} onChange={setRpe} /></div>
              <label className="field"><span className="lbl">{$t("Commentaire")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><textarea className="input textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
              <section className="calc-box" aria-live="polite">
                <div className="between"><span className="c-neutral">{disc === 'BIKE' ? $t("Vitesse") : $t("Allure")}</span><strong className="t-amount-s">{isFinite(durMin) && isFinite(distKm) && distKm > 0 ? paceFor(disc === 'SWIM' ? (durMin * 60) / (distKm * 10) : (durMin * 60) / distKm, disc) : '—'}</strong></div>
                <span className="t-caption c-moderate">{hr ? $t("La charge sera estimée sur ta FC moyenne.") : rpe ? $t("La charge sera estimée depuis ton ressenti, recalée sur l’échelle du cardio.") : $t("Sans FC ni ressenti, la charge restera provisoire (tes habitudes × durée).")} {$t("Une saisie manuelle n’est jamais présentée comme une mesure.")}</span>
              </section>
            </>
          ) : (
            <>
              <div className="note"><Icon name="info" size={20} /><span>{mode === 'bulk' ? <>{$t("Une ligne par séance :")} <code>{$t("AAAA-MM-JJ;DISCIPLINE;durée_min;distance_km;FC_moyenne;RPE")}</code>{$t(". Les trois derniers champs peuvent rester vides. Coller deux fois la même ligne ne crée pas de doublon.")}</> : <>{$t("Une ligne par séance prévue :")} <code>{$t("AAAA-MM-JJ;DISCIPLINE;durée_min;titre")}</code>{$t(". Disciplines : RUN, BIKE, SWIM, STRENGTH, BRICK (ou Course, Vélo, Natation, Renfo).")}</>}</span></div>
              <label className="field"><span className="lbl">{$t("Séances")}</span><textarea className="input textarea mono" rows={9} value={text} placeholder={mode === 'bulk' ? '2026-10-05;RUN;45;8,5;148;5\n2026-10-06;SWIM;40;1,8;;6' : $t("2026-10-20;BIKE;90;Sortie longue\n2026-10-21;RUN;45;Footing")} onChange={(e) => setText(e.target.value)} /></label>
              {parsed && text.trim() && (
                <div className="stack-4 t-caption">
                  <span className="t-caption-strong" style={{ color: 'var(--success-text)' }}>{parsed.valid.length} {$t("ligne(s) prête(s)")}</span>
                  {parsed.issues.map((x) => <span key={x.line} className="c-critical">{$t("Ligne")} {x.line} {$t("ignorée —")} {x.message}</span>)}
                </div>
              )}
            </>
          )}
        </div>
        <div className="sticky-foot">
          <div className="form-narrow">
            {mode === 'single'
              ? <button type="button" className="btn btn-primary block" disabled={'error' in r} onClick={submitSingle}>{$t("Ajouter la séance")}</button>
              : <button type="button" className="btn btn-primary block" disabled={!parsed?.valid.length} onClick={submitBulk}>{mode === 'bulk' ? $t("Importer {0} séance(s)", { 0: parsed?.valid.length || '' }) : $t("Planifier {0} séance(s)", { 0: parsed?.valid.length || '' })}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Statistiques
const STATS_DISC: PlannedDiscipline[] = ['RUN', 'BIKE', 'SWIM', 'STRENGTH', 'BRICK'];

export function StatsScreen() {
  const { data, d } = useCalc();
  const [disc, setDisc] = useState<PlannedDiscipline>('RUN');
  const [period, setPeriod] = useState<'4' | '12' | 'all'>('12');
  const ov = overview(data, d.today);
  const st = disciplineStats(data, d.loads, disc, d.today, d.links);
  const weeks = period === 'all' ? 520 : +period;
  const share = weeklyVolume(data, d.today, Math.min(weeks, Math.max(1, ov.weeks)));
  const totals: Record<string, number> = {};
  share.forEach((w) => Object.entries(w.byDiscipline).forEach(([k, v]) => (totals[k] = (totals[k] ?? 0) + v)));
  const [withOther] = useWithOther();
  const sum = Object.entries(totals).reduce((a, [k, v]) => a + (k === 'OTHER' && !withOther ? 0 : v), 0);
  const order = ['RUN', 'BIKE', 'SWIM', 'STRENGTH', ...(withOther ? ['OTHER'] : [])].filter((k) => totals[k]);
  const ref = st.reference;
  const refText = (v: number) => (disc === 'RUN' ? num(v * 3.6, 1) + NBSP + $t("km/h") : disc === 'SWIM' ? mmss(100 / v) + NBSP + '/100' + NBSP + 'm' : num(v, 0) + NBSP + 'W');
  return (
    <div className="screen" data-screen="stats">
      <AppHeader title={$t("Séances")} />
      <ErrorBanner />
      <SubNav items={NAV} label={$t("Sections Séances")} />
      <main className="content with-fab dgrid">
        <div className="dmasonry">
        <Hero className="dspan-5" label={ov.firstDay ? $t("Bilan depuis le ") + dateFr(ov.firstDay) : $t("Bilan global")} value={hours(ov.seconds)} chip={$t("{0} séances · {1} semaines · {2}", { 0: ov.sessions, 1: ov.weeks, 2: km(ov.metres, 0) })}>
          <div className="foot">
            <span><strong>{ov.weeks ? duration(ov.seconds / ov.weeks) : '—'}</strong> {$t("par semaine")}</span>
            <span><strong>{ov.weeks ? num(ov.sessions / ov.weeks, 1) : '—'}</strong> {$t("séances / sem.")}</span>
            <span>{$t("hors « Autre »")}</span>
          </div>
        </Hero>
        <section className="card g12 dspan-7" aria-labelledby="h-share">
          <h2 id="h-share">{$t("Répartition du temps")}</h2>
          <ChipGroup label={$t("Période")} value={period} onChange={setPeriod} options={[['4', $t("4 sem.")], ['12', $t("12 sem.")], ['all', $t("Tout")]]} />
          <OtherToggle />
          <div className="row" style={{ gap: 'var(--space-16)', alignItems: 'center' }}>
            <Donut size={136} ring={20} label={$t("Répartition du temps par discipline")} slices={order.map((k) => ({ value: totals[k], color: dvar(k as ActualDiscipline) }))}>
              <span className="t-caption c-moderate">{$t("Total")}</span><span className="t-amount-s">{duration(sum)}</span>
            </Donut>
            <ul className="grow stack t-caption" style={{ gap: 'var(--space-6)' }}>
              {order.map((k) => <li key={k} className="legend-row" style={{ padding: 0, border: 0 }}><span className="dot s10" style={{ background: dvar(k as ActualDiscipline) }} /><span>{DISCIPLINE_LABEL[k as ActualDiscipline]}</span><span className="t-strong right">{pct(totals[k] / (sum || 1))}</span></li>)}
              {!order.length && <li className="c-moderate">{$t("Aucune séance sur la période.")}</li>}
            </ul>
          </div>
        </section>
        </div>

        <div className="disc-select dspan-12" role="tablist" aria-label={$t("Discipline")}>
          {STATS_DISC.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={disc === x} className={'disc-tab' + (disc === x ? ' on' : '')} style={{ ['--c' as string]: dvar(x) }} onClick={() => setDisc(x)}>
              <DiscIcon d={x} size={32} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span>
            </button>
          ))}
        </div>

        {disc === 'BRICK' && !st.sessions.length ? (
          <section className="card dspan-12"><Empty icon="brick" title={$t("Aucun enchaînement confirmé")} text={$t("Planifie une séance qui mélange deux disciplines, ou confirme la proposition de regroupement que le bilan affiche quand deux séances du même jour forment un enchaînement.")} /></section>
        ) : (
          <>
            <div className="dmasonry">
            <section className="card g12 dspan-5" aria-label={$t("Totaux")}>
              <h2>{DISCIPLINE_LABEL[disc]}</h2>
              <div className="grid-3">
                <Kpi label={$t("Séances")} value={String(st.totals.sessions)} />
                <Kpi label={$t("Volume")} value={hours(st.totals.seconds)} />
                <Kpi label={$t("Distance")} value={disc === 'STRENGTH' || disc === 'BRICK' ? '—' : distanceFor(st.totals.metres, disc)} />
              </div>
              <dl className="kv">
                {disc !== 'STRENGTH' && disc !== 'BRICK' && <><dt>{disc === 'BIKE' ? $t("Vitesse moyenne") : $t("Allure moyenne")}</dt><dd>{paceFor(st.avgPaceSec, disc)}</dd>
                  <dt>{disc === 'BIKE' ? $t("Meilleure vitesse") : $t("Meilleure allure")} <span className="t-legal c-moderate">{$t("(≥ 20 min)")}</span></dt><dd>{paceFor(st.bestPaceSec, disc)}</dd>
                  <dt>{$t("Plus longue")}</dt><dd>{st.longestMetres ? distanceFor(st.longestMetres, disc) : '—'}</dd></>}
                <dt>{$t("Séance la plus longue")}</dt><dd>{duration(st.longestSeconds)}</dd>
                <dt>{$t("FC moyenne")}</dt><dd>{bpm(st.avgHr)}</dd>
                {st.totals.elevation > 0 && <><dt>{$t("Dénivelé cumulé")}</dt><dd>{num(st.totals.elevation, 0)} m</dd></>}
                <dt>{$t("Charge de la semaine")}</dt><dd>{st.weekLoad === null ? '—' : num(st.weekLoad, 0)}</dd>
              </dl>
            </section>
            <section className="card g12 dspan-7" aria-label={$t("12 dernières semaines")}>
              <div className="between baseline"><h2>{$t("12 dernières semaines")}</h2><span className="t-caption c-moderate">{$t("chiffre = séances")}</span></div>
              <WeekBars weeks={st.weeks} color={dvar(disc)} label={$t("Volume hebdomadaire de {0}", { 0: DISCIPLINE_LABEL[disc].toLowerCase() })} />
            </section>
            {(disc === 'RUN' || disc === 'BIKE' || disc === 'SWIM') && (
              <section className="card g8 dspan-5" aria-label={$t("Indicateur de référence")}>
                <div className="between"><h2>{disc === 'RUN' ? $t("VMA") : disc === 'BIKE' ? 'FTP' : 'CSS'}</h2><button type="button" className="icon-btn" aria-label={$t("Ajouter un relevé")} onClick={() => navigate('/progression/zones?ajout=' + (disc === 'RUN' ? 'vma' : disc === 'BIKE' ? 'ftp' : 'css'))}><Icon name="plusCircle" /></button></div>
                {ref ? (<>
                  <span className="t-h2">{refText(ref.value)}</span>
                  <span className="t-caption c-moderate">{{ test: $t("Test"), estimation: $t("Estimation"), manual: $t("Saisie") }[ref.source]} {$t("du")} {dateFr(ref.measuredAt.slice(0, 10))}{st.referenceHistory[1] ? $t(" · {0}{1} depuis le {2}", { 0: signed(disc === 'SWIM' ? 100 / st.referenceHistory[1].value - 100 / ref.value : (ref.value - st.referenceHistory[1].value) * (disc === 'RUN' ? 3.6 : 1), disc === 'RUN' ? 1 : 0), 1: disc === 'SWIM' ? ' s/100 m' : disc === 'RUN' ? $t(" km/h") : ' W', 2: dateFr(st.referenceHistory[1].measuredAt.slice(0, 10)) }) : ''}</span>
                  <StepChart history={st.referenceHistory} format={refText} color={dvar(disc)} />
                </>) : <p className="t-caption c-moderate">{$t("Aucune valeur enregistrée. Le coach peut programmer un test.")}</p>}
              </section>
            )}
            <section className="stack-8 dspan-7" aria-label={$t("Journal de la discipline")}>
              <h2 className="t-h3">{$t("Dernières séances")}</h2>
              <ul className="op-list" style={{ margin: 0 }}>
                {st.sessions.slice(0, 8).map((s) => (
                  <li key={s.id} className="op-item">
                    <button type="button" className="op-row" onClick={() => navigate('/seances/' + s.id)}>
                      <DiscIcon d={s.discipline} sub={s.subSport} />
                      <span className="stack" style={{ minWidth: 0 }}><span className="t-strong">{dayTitle(sessionDay(s))}</span><span className="t-caption c-moderate">{[s.distanceM && s.discipline !== 'STRENGTH' ? distanceFor(s.distanceM, s.discipline) : null, paceOf(s) ? paceFor(paceOf(s), s.discipline) : null, s.avgHrBpm ? bpm(s.avgHrBpm) : null].filter(Boolean).join(' · ')}</span></span>
                      <span className="t-amount-s nowrap">{duration(s.durationSec)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {st.sessions.length > 8 && <button type="button" className="btn btn-tertiary" onClick={() => navigate('/seances')}>{$t("Tout le journal")}</button>}
            </section>
            </div>
          </>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

export { speedKmh, daysBetween, dayMonth };
