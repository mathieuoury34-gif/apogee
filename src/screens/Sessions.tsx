// Séances — Journal | Statistiques, bilan d'une séance, saisie manuelle (une séance ou un lot).
// Le Journal reprend celui de PEAnalyze : regroupement par mois avec total, balayage à gauche pour
// Modifier / Supprimer (avec « Annuler »), filtres en pastilles.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, ChipGroup, DatePicker, DiscIcon, Empty, ErrorBanner, Fab, Hero, Sheet, SubHeader, SubNav, showToast, useWidth } from '../ui/kit';
import { Donut, StepChart, WeekBars } from '../ui/charts';
import { Icon } from '../ui/icons';
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
import { DISCIPLINE_SHORT, bpm, dateFr, dateTimeFr, dayMonth, dayTitle, DISCIPLINE_LABEL, distanceFor, duration, dvar, hours, km, mmss, monthLong, num, paceFor, parseNum, pct, pctSigned, signed, speedKmh, timeOf, toInput, NBSP } from '../ui/format';
import { cleanHr } from '../domain/hr';

const NAV = [{ to: '/seances', label: 'Journal' }, { to: '/seances/stats', label: 'Statistiques' }];

// ------------------------------------------------------------------ Journal
export function JournalScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const [filter, setFilter] = useState<'all' | ActualDiscipline | 'rpe'>(route.query.get('filtre') === 'ressenti' ? 'rpe' : 'all');
  const [months, setMonths] = useState(3);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const all = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  const list = all.filter((s) => filter === 'all' || (filter === 'rpe' ? !s.rpe : s.discipline === filter));
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
    showToast('Séance supprimée', { undo: () => restore(snap) });
  };
  return (
    <div className="screen" data-screen="journal">
      <AppHeader title="Séances" />
      <ErrorBanner />
      <SubNav items={NAV} label="Sections Séances">
        <div className="chips g6" role="group" aria-label="Filtrer">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Toutes</button>
          {present.map((x) => <button key={x} type="button" className="chip" aria-pressed={filter === x} onClick={() => setFilter(x)}>{DISCIPLINE_LABEL[x]}</button>)}
          <button type="button" className="chip" aria-pressed={filter === 'rpe'} onClick={() => setFilter('rpe')}>Ressenti à noter</button>
        </div>
      </SubNav>
      <main className="content with-fab journal">
        {!list.length && <Empty icon="seances" title={filter === 'rpe' ? 'Tout est noté' : 'Aucune séance pour l’instant'} text={filter === 'rpe' ? 'Chaque séance a son ressenti.' : 'Les séances de ta montre arrivent ici. Utilise le bouton + pour en saisir une.'} />}
        {shown.map((g) => {
          const vol = g.items.reduce((t, s) => t + s.durationSec, 0);
          return (
            <section key={g.key} className="stack">
              <h2 className="month-header"><span>{monthLong(g.key)}</span><span className="total c-neutral">{g.items.length} séance{g.items.length > 1 ? 's' : ''} · {duration(vol)}</span></h2>
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
        {groups.length > months && <button type="button" className="btn btn-secondary" style={{ alignSelf: 'center', marginTop: 'var(--space-16)' }} onClick={() => setMonths(months + 6)}>Afficher les mois précédents</button>}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function SessionItem({ s, load, swiped, confirming, onSwipe, onOpen, onEdit, onDelete }: { s: ActualSession; load: number | null; swiped: boolean; confirming: boolean; onSwipe: (v: boolean) => void; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const pace = paceOf(s);
  return (
    <li className={'op-item' + (swiped ? ' swiped' : '')}>
      {swiped && (
        <span className="op-actions">
          <button type="button" className="edit" onClick={onEdit}><Icon name="pencil" size={20} />Modifier</button>
          <button type="button" className="del" onClick={onDelete}><Icon name={confirming ? 'check' : 'trash'} size={20} />{confirming ? 'Confirmer' : 'Supprimer'}</button>
        </span>
      )}
      <button type="button" className="op-row" aria-label={`${DISCIPLINE_LABEL[s.discipline]} du ${dateFr(sessionDay(s))}, ${duration(s.durationSec)}`}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; }}
        onPointerMove={(e) => { if (!start.current) return; const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { moved.current = true; onSwipe(dx < 0); start.current = null; } }}
        onClick={() => { if (moved.current) { moved.current = false; return; } if (swiped) onSwipe(false); else onOpen(); }}>
        <DiscIcon d={s.discipline} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{DISCIPLINE_LABEL[s.discipline]} · {dayTitle(sessionDay(s))}</span>
          <span className="t-caption c-moderate ellipsis">{[s.distanceM ? distanceFor(s.distanceM, s.discipline) : null, pace ? paceFor(pace, s.discipline) : null, s.avgHrBpm ? num(s.avgHrBpm, 0) + NBSP + 'bpm' : null, s.source === 'manual' ? 'saisie' : null].filter(Boolean).join(' · ') || exerciseLabel(s.rawExerciseType)}</span>
          {!s.rpe && <span className="t-legal" style={{ color: 'var(--warning-text)' }}>Ressenti à noter</span>}
        </span>
        <span className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="t-amount-s nowrap">{duration(s.durationSec)}</span>
          <span className="t-caption c-moderate nowrap">{load !== null ? 'charge ' + num(load, 0) : ''}</span>
        </span>
      </button>
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
  if (!s || s.deleted) return (<div className="screen"><SubHeader title="Séance" fallback="/seances" /><main className="content"><p className="c-neutral">Cette séance n’existe plus.</p></main></div>);
  const day = sessionDay(s);
  const r = reviewSession(data, d.loads, d.links, d.refs, s);
  const l = d.loads.get(s.id)!;
  const link = d.links.byActual.get(s.id);
  const pace = paceOf(s);
  const sibling = findBrickSibling(data, s, d.links);
  const ed = new Set(s.edited);
  const mark = (f: string) => (ed.has(f as never) ? ' ent' : '');
  const remove = () => { const snap = deleteActual(s.id); back('/seances'); showToast('Séance supprimée', { undo: () => restore(snap) }); };
  const good = r.verdict === 'onPlan' || r.verdict === 'typical';
  return (
    <div className="screen" data-screen="bilan">
      <SubHeader title="Bilan de séance" fallback="/seances" right={<button type="button" className="icon-btn" aria-label="Modifier la séance" onClick={() => setEditing(true)}><Icon name="pencil" /></button>} />
      <main className="content dgrid">
        <section className="card g16 dspan-7" aria-label="Mesures">
          <div className="row" style={{ gap: 'var(--space-12)' }}>
            <DiscIcon d={s.discipline} size={48} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="t-h3">{DISCIPLINE_LABEL[s.discipline]}</span>
              <span className="t-caption c-moderate">{dayTitle(day)} {day.slice(0, 4)}{s.source === 'health' ? ' · ' + timeOf(s.startAt, s.zoneOffsetMinutes) : ''} · {s.source === 'manual' ? 'saisie à la main' : 'montre · ' + exerciseLabel(s.rawExerciseType)}</span>
            </span>
          </div>
          <div className="grid-3 kpi-grid">
            <Kpi label="Durée" value={duration(s.durationSec)} cls={mark('durationSec')} />
            <Kpi label="Distance" value={s.distanceM ? distanceFor(s.distanceM, s.discipline) : '—'} cls={mark('distanceM')} />
            <Kpi label={s.discipline === 'BIKE' ? 'Vitesse' : 'Allure'} value={pace ? paceFor(pace, s.discipline) : '—'} cls={mark('distanceM')} />
            <Kpi label="FC moyenne" value={bpm(s.avgHrBpm)} cls={mark('avgHrBpm')} />
            <Kpi label="FC max" value={bpm(s.maxHrBpm)} />
            <Kpi label="Charge" value={l.load === null ? '—' : num(l.load, 0)} cls={l.assise === 'estimated' ? ' est' : ''} />
          </div>
          <p className="t-caption c-moderate">Charge {METHOD_LABEL[l.method]}{l.method === 'srpe' ? ` (RPE × minutes × ${num(d.ctx.srpeFactor, 2)}, coefficient appris sur ${d.ctx.srpeCalibrationPairs >= 5 ? 'tes séances' : 'une valeur type'})` : ''}.{s.edited.length ? ' Valeurs soulignées : corrigées à la main.' : ''}{s.elevationGainM ? ` Dénivelé ${num(s.elevationGainM, 0)} m.` : ''}{s.activeCaloriesJ ? ` ${num(s.activeCaloriesJ / 4184, 0)} kcal actives.` : ''}</p>
          <HrTrace id={s.id} />
        </section>

        <section className="card g12 dspan-5" aria-label="Verdict">
          <h2>Verdict</h2>
          <span className={'var-chip big' + (good ? '' : r.verdict === 'pending' ? ' flat' : ' warn')} style={{ alignSelf: 'flex-start' }}>{VERDICT_TEXT[r.verdict]}</span>
          {r.basis === 'plan' && r.plan && (
            <p className="t-caption c-neutral">Comparé au prévu — écart de {r.plan.axis === 'distance' ? 'distance' : 'durée'} : {r.plan.axis === 'distance' ? (r.plan.distanceDelta! >= 0 ? '+' : '−') + km(Math.abs(r.plan.distanceDelta!)) : (r.plan.durationDelta! >= 0 ? '+' : '−') + duration(Math.abs(r.plan.durationDelta!))} ({pctSigned(r.plan.ratio! - 1)}).</p>
          )}
          {r.basis === 'habits' && <p className="t-caption c-neutral">Comparé à la médiane de tes séances de {DISCIPLINE_LABEL[s.discipline].toLowerCase()} des 8 dernières semaines ({pctSigned((r.habit ?? 1) - 1)}).</p>}
          {r.alerts.map((a) => <div key={a.code} className="note note-warning"><Icon name="alert" size={20} /><span>{a.code === 'HR_DRIFT_HIGH' ? `Dérive cardiaque marquée : ${pctSigned(a.value, 1)} entre les deux moitiés.` : `Écart important par rapport au plan : ${pct(a.value)} du prévu.`}</span></div>)}
          <div className="stack-4">
            <span className="t-label">Dérive cardiaque</span>
            <span className="t-caption c-neutral">{r.drift.value === null ? '—' : pctSigned(r.drift.value, 1)} · {DRIFT_REASON_TEXT[r.drift.reason]}</span>
          </div>
        </section>

        <section ref={rpeRef as never} className="card g12 dspan-7" aria-label="Ressenti">
          <h2>Ressenti</h2>
          <RpeScale value={s.rpe} onChange={(v) => { setFeedback(s.id, v, s.comment); if (v) showToast('Ressenti enregistré : la charge est recalculée'); }} />
          <Comment value={s.comment ?? ''} onSave={(c) => setFeedback(s.id, s.rpe, c)} />
        </section>

        <section className="card g12 dspan-5" aria-label="Séance prévue">
          <h2>Séance prévue</h2>
          {r.plan ? (
            <>
              <button type="button" className="row-btn" onClick={() => navigate('/calendrier/prevue/' + r.plan!.planned.id)}>
                <DiscIcon d={r.plan.planned.discipline} size={36} />
                <span className="stack grow"><span className="t-strong">{r.plan.planned.title ?? DISCIPLINE_LABEL[r.plan.planned.discipline]}</span><span className="t-caption c-moderate">{r.plan.planned.plannedDate !== day ? 'Prévue le ' + dateFr(r.plan.planned.plannedDate) : 'Prévue ce jour'} · {link?.type === 'manual' ? 'rattachée à la main' : `rattachement automatique (${pct(link?.confidence ?? 0)})`}</span></span>
                <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
              </button>
              <dl className="dl">
                <dt>{r.plan.part ? 'Prévu (partie ' + DISCIPLINE_LABEL[s.discipline].toLowerCase() + ')' : 'Prévu'}</dt><dd>{[r.plan.expectedDuration !== null ? duration(r.plan.expectedDuration) : null, r.plan.expectedDistance ? distanceFor(r.plan.expectedDistance, s.discipline) : null].filter(Boolean).join(' · ') || '—'}</dd>
                <dt>Réalisé</dt><dd>{[duration(s.durationSec), s.distanceM ? distanceFor(s.distanceM, s.discipline) : null].filter(Boolean).join(' · ')}</dd>
              </dl>
            </>
          ) : <p className="t-caption c-moderate">{link?.type === 'none' ? 'Marquée comme non prévue.' : 'Aucune séance prévue rattachée.'}</p>}
          <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
            <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => setLinkOpen(true)}><Icon name="link" size={16} />{r.plan ? 'Changer' : 'Choisir la séance prévue'}</button>
            {link?.type === 'manual' || link?.type === 'none' ? <button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setManualLink(s.id, undefined)}>Revenir à l’automatique</button>
              : <button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setManualLink(s.id, null)}>Ce n’était pas prévu</button>}
          </div>
        </section>

        {sibling && (
          <section className="card g12 dspan-12 highlight" aria-label="Regroupement BRICK">
            <h2>Enchaînement ?</h2>
            <p className="c-neutral">Regrouper avec la séance de {DISCIPLINE_LABEL[sibling.discipline].toLowerCase()} du même jour en BRICK ? Les deux séances gardent leur propre rattachement.</p>
            <div className="row wrap">
              <button type="button" className="btn btn-primary" onClick={() => { brickDecision(s, sibling, 'confirmed'); showToast('Regroupées en BRICK'); }}>Regrouper en BRICK</button>
              <button type="button" className="btn btn-tertiary" onClick={() => brickDecision(s, sibling, 'declined')}>Non, séances séparées</button>
            </div>
            <p className="t-legal c-moderate">Un refus n’est jamais reproposé.</p>
          </section>
        )}

        <div className="stack-8 dspan-12" style={{ alignItems: 'center' }}>
          {!confirm ? <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={() => setConfirm(true)}><Icon name="trash" size={18} />Supprimer cette séance</button> : (
            <div className="row wrap" style={{ justifyContent: 'center' }}><button type="button" className="btn btn-danger" onClick={remove}>Supprimer</button><button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Annuler</button></div>
          )}
          <span className="t-legal c-moderate">{s.source === 'health' ? 'Identifiant Garmin ' + s.sourceId : 'Saisie le ' + dateTimeFr(s.ingestedAt)}</span>
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
    <div ref={ref} className="chart" style={{ height: H + 26 }} aria-label="Fréquence cardiaque pendant la séance">
      <svg width={w} height={H + 26} viewBox={`0 0 ${w} ${H + 26}`} role="img" aria-label={`FC de ${num(lo, 0)} à ${num(hi, 0)} bpm`}>
        <path d={dpath} fill="none" strokeWidth="1.75" strokeLinejoin="round" style={{ stroke: 'var(--critical)' }} />
      </svg>
      <span className="tick" style={{ left: w - 30, top: Y(hi) - 9 }}>{num(hi, 0)}</span>
      <span className="tick" style={{ left: w - 30, top: Y(lo) - 9 }}>{num(lo, 0)}</span>
      <span className="tick" style={{ left: 0, top: H + 8 }}>FC (bpm) · {duration(t1 - t0)}</span>
    </div>
  );
}

export function RpeScale({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="stack-8" data-component="RpeScale">
      <div className="rpe-scale" role="radiogroup" aria-label="Ressenti de l’effort, de 1 à 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={'rpe' + (value === v ? ' on' : '') + (value !== null && v <= value ? ' fill' : '')} style={{ ['--rpe' as string]: `var(--form-${v <= 3 ? 'fresh' : v <= 5 ? 'ready' : v <= 7 ? 'steady' : v <= 8 ? 'strained' : 'depleted'})` }} onClick={() => onChange(value === v ? null : v)}>{v}</button>
        ))}
      </div>
      <div className="between t-caption c-moderate"><span>Très facile</span><span>{value ? 'RPE ' + value + ' · toucher à nouveau pour retirer' : 'RPE, saisi après séance'}</span><span>Maximal</span></div>
    </div>
  );
}

function Comment({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">
      <span className="lbl">Commentaire</span>
      <textarea className="input textarea" rows={2} value={v} placeholder="Sensations, contexte, météo…" onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) { onSave(v); showToast('Commentaire enregistré'); } }} />
    </label>
  );
}

function EditSheet({ s, onClose }: { s: ActualSession; onClose: () => void }) {
  const [date, setDate] = useState(sessionDay(s));
  const [disc, setDisc] = useState<ActualDiscipline>(s.discipline);
  const [dur, setDur] = useState(toInput(s.durationSec / 60, 1).replace(/,0$/, ''));
  const [dist, setDist] = useState(s.distanceM ? toInput(s.distanceM / 1000, 2) : '');
  const [hr, setHr] = useState(s.avgHrBpm ? String(Math.round(s.avgHrBpm)) : '');
  const [cal, setCal] = useState(false);
  const r = parseManualFields({ date, discipline: disc, durationMin: dur, distanceKm: dist, avgHrBpm: hr });
  const save = () => {
    if ('error' in r) return;
    const snap = editActual(s.id, { ...r.input, rpe: s.rpe, comment: s.comment });
    onClose();
    showToast('Séance modifiée', { undo: () => restore(snap) });
  };
  return (
    <Sheet title="Modifier la séance" onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={'error' in r} onClick={save}>Enregistrer</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        {s.source === 'health' && <div className="note"><Icon name="info" size={20} /><span>Une valeur mesurée par la montre que tu corriges passe en « saisie », pour de bon. La séance reste la même (aucun doublon à la prochaine lecture).</span></div>}
        <div className="field"><span className="lbl">Date</span>
          <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
          {cal && <DatePicker value={date} onChange={(v) => { setDate(v); setCal(false); }} />}
        </div>
        <div className="field"><span className="lbl">Discipline</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{ACTUAL_DISCIPLINES.map((x) => <button key={x} type="button" className="chip" aria-pressed={disc === x} onClick={() => setDisc(x)}>{DISCIPLINE_LABEL[x]}</button>)}</div>
        </div>
        <div className="grid-3" style={{ gap: 'var(--space-12)' }}>
          <label className="field"><span className="lbl">Durée (min)</span><input className="input num" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} /></label>
          <label className="field"><span className="lbl">Distance (km)</span><input className="input num" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} /></label>
          <label className="field"><span className="lbl">FC moy.</span><input className="input num" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} /></label>
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
    <Sheet title="Rattacher la séance" onClose={onClose}>
      <div className="stack-12" style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <p className="t-caption c-neutral">Séances prévues entre le {dateFr(addDays(sessionDay(s), -3))} et le {dateFr(addDays(sessionDay(s), 3))}. Réversible à tout moment.</p>
        <ul className="tile-list divided" style={{ padding: '0 var(--space-12)' }}>
          {cands.map(({ planned: p, taken }) => (
            <li key={p.id}>
              <button type="button" className="settings-row" onClick={() => { setManualLink(s.id, p.id); onClose(); showToast('Séance rattachée'); }}>
                <DiscIcon d={p.discipline} size={32} />
                <span className="stack"><span className="t-strong">{p.title ?? DISCIPLINE_LABEL[p.discipline]}</span><span className="t-caption c-moderate">{dayTitle(p.plannedDate)}{taken ? ' · déjà rattachée à une autre séance' : ''}</span></span>
                {cur === p.id ? <Icon name="check" size={20} style={{ color: 'var(--success-text)' }} /> : <span />}
              </button>
            </li>
          ))}
          {!cands.length && <li className="t-caption c-moderate" style={{ padding: 'var(--space-12) 0' }}>Aucune séance prévue dans les jours voisins.</li>}
          <li>
            <button type="button" className="settings-row" onClick={() => { setManualLink(s.id, null); onClose(); }}>
              <Icon name="close" style={{ color: 'var(--text-neutral)' }} />
              <span className="stack"><span className="t-strong">Ne rattacher à rien</span><span className="t-caption c-moderate">reste au journal, hors comparaison</span></span><span />
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
    const input: ManualInput = { ...r.input, rpe, comment: comment.trim() || null };
    const res = addManualSessions([input]);
    if (!res.inserted.length) { showToast('Cette séance existe déjà (même date, discipline, durée, distance et FC).', { error: true }); return; }
    const created = res.inserted[0];
    navigate('/seances/' + created.id, { replace: true });
    showToast('Séance ajoutée', { undo: () => restore([{ coll: 'actual', id: created.id, rec: undefined }]) });
  };
  const submitBulk = () => {
    if (!parsed) return;
    if (mode === 'bulk') {
      const res = addManualSessions((parsed as ReturnType<typeof parseBulkActual>).valid);
      showToast(`${res.inserted.length} séance(s) ajoutée(s), ${res.duplicates} déjà existante(s)`, { undo: res.inserted.length ? () => restore(res.inserted.map((x) => ({ coll: 'actual' as const, id: x.id, rec: undefined }))) : undefined });
    } else {
      const list = (parsed as ReturnType<typeof parseBulkPlanned>).valid;
      addPlannedBulk(list);
      showToast(`${list.length} séance(s) planifiée(s) ajoutée(s)`, { undo: () => restore(list.map((x) => ({ coll: 'planned' as const, id: x.id, rec: undefined }))) });
    }
    back(mode === 'planned' ? '/calendrier' : '/seances');
  };
  return (
    <div className="screen screen-white" data-screen="saisie">
      <SubHeader title="Ajouter une séance" fallback="/seances" close bordered />
      <div className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-16) var(--screen-margin) var(--space-24)' }}>
          <div className="seg" role="group" aria-label="Mode de saisie">
            <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>Une séance</button>
            <button type="button" aria-pressed={mode === 'bulk'} onClick={() => setMode('bulk')}>Lot fait</button>
            <button type="button" aria-pressed={mode === 'planned'} onClick={() => setMode('planned')}>Lot prévu</button>
          </div>
          {mode === 'single' ? (
            <>
              <div className="field"><span className="lbl">Date</span>
                <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{dayTitle(date)} {date.slice(0, 4)}</span><Icon name="calendar" size={20} /></button>
                {cal && <DatePicker value={date} onChange={(v) => { setDate(v); setCal(false); }} />}
              </div>
              <div className="field"><span className="lbl">Discipline</span>
                <div className="disc-picker" role="radiogroup" aria-label="Discipline">
                  {ACTUAL_DISCIPLINES.map((x) => <button key={x} type="button" role="radio" aria-checked={disc === x} className={'disc-pick' + (disc === x ? ' on' : '')} style={{ ['--c' as string]: dvar(x) }} onClick={() => setDisc(x)}><DiscIcon d={x} size={36} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span></button>)}
                </div>
              </div>
              <div className="grid-3" style={{ gap: 'var(--space-12)' }}>
                <label className="field"><span className="lbl">Durée (min)</span><input className="input num" inputMode="decimal" value={dur} placeholder="45" onChange={(e) => setDur(e.target.value)} /></label>
                <label className="field"><span className="lbl">Distance (km)</span><input className="input num" inputMode="decimal" value={dist} placeholder="—" onChange={(e) => setDist(e.target.value)} /></label>
                <label className="field"><span className="lbl">FC moy.</span><input className="input num" inputMode="numeric" value={hr} placeholder="—" onChange={(e) => setHr(e.target.value)} /></label>
              </div>
              <div className="field"><span className="lbl">Ressenti</span><RpeScale value={rpe} onChange={setRpe} /></div>
              <label className="field"><span className="lbl">Commentaire <span className="c-moderate" style={{ fontWeight: 400 }}>(facultatif)</span></span><textarea className="input textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
              <section className="calc-box" aria-live="polite">
                <div className="between"><span className="c-neutral">{disc === 'BIKE' ? 'Vitesse' : 'Allure'}</span><strong className="t-amount-s">{isFinite(durMin) && isFinite(distKm) && distKm > 0 ? paceFor(disc === 'SWIM' ? (durMin * 60) / (distKm * 10) : (durMin * 60) / distKm, disc) : '—'}</strong></div>
                <span className="t-caption c-moderate">{hr ? 'La charge sera estimée sur ta FC moyenne.' : rpe ? 'La charge sera estimée depuis ton ressenti, recalée sur l’échelle du cardio.' : 'Sans FC ni ressenti, la charge restera provisoire (tes habitudes × durée).'} Une saisie manuelle n’est jamais présentée comme une mesure.</span>
              </section>
            </>
          ) : (
            <>
              <div className="note"><Icon name="info" size={20} /><span>{mode === 'bulk' ? <>Une ligne par séance : <code>AAAA-MM-JJ;DISCIPLINE;durée_min;distance_km;FC_moyenne;RPE</code>. Les trois derniers champs peuvent rester vides. Coller deux fois la même ligne ne crée pas de doublon.</> : <>Une ligne par séance prévue : <code>AAAA-MM-JJ;DISCIPLINE;durée_min;titre</code>. Disciplines : RUN, BIKE, SWIM, STRENGTH, BRICK (ou Course, Vélo, Natation, Renfo).</>}</span></div>
              <label className="field"><span className="lbl">Séances</span><textarea className="input textarea mono" rows={9} value={text} placeholder={mode === 'bulk' ? '2026-10-05;RUN;45;8,5;148;5\n2026-10-06;SWIM;40;1,8;;6' : '2026-10-20;BIKE;90;Sortie longue\n2026-10-21;RUN;45;Footing'} onChange={(e) => setText(e.target.value)} /></label>
              {parsed && text.trim() && (
                <div className="stack-4 t-caption">
                  <span className="t-caption-strong" style={{ color: 'var(--success-text)' }}>{parsed.valid.length} ligne(s) prête(s)</span>
                  {parsed.issues.map((x) => <span key={x.line} className="c-critical">Ligne {x.line} ignorée — {x.message}</span>)}
                </div>
              )}
            </>
          )}
        </div>
        <div className="sticky-foot">
          <div className="form-narrow">
            {mode === 'single'
              ? <button type="button" className="btn btn-primary block" disabled={'error' in r} onClick={submitSingle}>Ajouter la séance</button>
              : <button type="button" className="btn btn-primary block" disabled={!parsed?.valid.length} onClick={submitBulk}>{mode === 'bulk' ? `Importer ${parsed?.valid.length || ''} séance(s)` : `Planifier ${parsed?.valid.length || ''} séance(s)`}</button>}
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
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const order = ['RUN', 'BIKE', 'SWIM', 'STRENGTH', 'OTHER'].filter((k) => totals[k]);
  const ref = st.reference;
  const refText = (v: number) => (disc === 'RUN' ? num(v * 3.6, 1) + NBSP + 'km/h' : disc === 'SWIM' ? mmss(100 / v) + NBSP + '/100' + NBSP + 'm' : num(v, 0) + NBSP + 'W');
  return (
    <div className="screen" data-screen="stats">
      <AppHeader title="Séances" />
      <ErrorBanner />
      <SubNav items={NAV} label="Sections Séances" />
      <main className="content with-fab dgrid">
        <Hero className="dspan-5" label={ov.firstDay ? 'Bilan depuis le ' + dateFr(ov.firstDay) : 'Bilan global'} value={hours(ov.seconds)} chip={`${ov.sessions} séances · ${ov.weeks} semaines · ${km(ov.metres, 0)}`}>
          <div className="foot">
            <span><strong>{ov.weeks ? duration(ov.seconds / ov.weeks) : '—'}</strong> par semaine</span>
            <span><strong>{ov.weeks ? num(ov.sessions / ov.weeks, 1) : '—'}</strong> séances / sem.</span>
            <span>hors « Autre »</span>
          </div>
        </Hero>
        <section className="card g12 dspan-7" aria-labelledby="h-share">
          <h2 id="h-share">Répartition du temps</h2>
          <ChipGroup label="Période" value={period} onChange={setPeriod} options={[['4', '4 sem.'], ['12', '12 sem.'], ['all', 'Tout']]} />
          <div className="row" style={{ gap: 'var(--space-16)', alignItems: 'center' }}>
            <Donut size={136} ring={20} label="Répartition du temps par discipline" slices={order.map((k) => ({ value: totals[k], color: dvar(k as ActualDiscipline) }))}>
              <span className="t-caption c-moderate">Total</span><span className="t-amount-s">{duration(sum)}</span>
            </Donut>
            <ul className="grow stack t-caption" style={{ gap: 'var(--space-6)' }}>
              {order.map((k) => <li key={k} className="legend-row" style={{ padding: 0, border: 0 }}><span className="dot s10" style={{ background: dvar(k as ActualDiscipline) }} /><span>{DISCIPLINE_LABEL[k as ActualDiscipline]}</span><span className="t-strong right">{pct(totals[k] / (sum || 1))}</span></li>)}
              {!order.length && <li className="c-moderate">Aucune séance sur la période.</li>}
            </ul>
          </div>
        </section>

        <div className="disc-select dspan-12" role="tablist" aria-label="Discipline">
          {STATS_DISC.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={disc === x} className={'disc-tab' + (disc === x ? ' on' : '')} style={{ ['--c' as string]: dvar(x) }} onClick={() => setDisc(x)}>
              <DiscIcon d={x} size={32} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span>
            </button>
          ))}
        </div>

        {disc === 'BRICK' && !st.sessions.length ? (
          <section className="card dspan-12"><Empty icon="brick" title="Aucun enchaînement confirmé" text="Planifie une séance qui mélange deux disciplines, ou confirme la proposition de regroupement que le bilan affiche quand deux séances du même jour forment un enchaînement." /></section>
        ) : (
          <>
            <section className="card g12 dspan-5" aria-label="Totaux">
              <h2>{DISCIPLINE_LABEL[disc]}</h2>
              <div className="grid-3">
                <Kpi label="Séances" value={String(st.totals.sessions)} />
                <Kpi label="Volume" value={hours(st.totals.seconds)} />
                <Kpi label="Distance" value={disc === 'STRENGTH' || disc === 'BRICK' ? '—' : distanceFor(st.totals.metres, disc)} />
              </div>
              <dl className="kv">
                {disc !== 'STRENGTH' && disc !== 'BRICK' && <><dt>{disc === 'BIKE' ? 'Vitesse moyenne' : 'Allure moyenne'}</dt><dd>{paceFor(st.avgPaceSec, disc)}</dd>
                  <dt>{disc === 'BIKE' ? 'Meilleure vitesse' : 'Meilleure allure'} <span className="t-legal c-moderate">(≥ 20 min)</span></dt><dd>{paceFor(st.bestPaceSec, disc)}</dd>
                  <dt>Plus longue</dt><dd>{st.longestMetres ? distanceFor(st.longestMetres, disc) : '—'}</dd></>}
                <dt>Séance la plus longue</dt><dd>{duration(st.longestSeconds)}</dd>
                <dt>FC moyenne</dt><dd>{bpm(st.avgHr)}</dd>
                {st.totals.elevation > 0 && <><dt>Dénivelé cumulé</dt><dd>{num(st.totals.elevation, 0)} m</dd></>}
                <dt>Charge de la semaine</dt><dd>{st.weekLoad === null ? '—' : num(st.weekLoad, 0)}</dd>
              </dl>
            </section>
            <section className="card g12 dspan-7" aria-label="12 dernières semaines">
              <div className="between baseline"><h2>12 dernières semaines</h2><span className="t-caption c-moderate">chiffre = séances</span></div>
              <WeekBars weeks={st.weeks} color={dvar(disc)} label={`Volume hebdomadaire de ${DISCIPLINE_LABEL[disc].toLowerCase()}`} />
            </section>
            {(disc === 'RUN' || disc === 'BIKE' || disc === 'SWIM') && (
              <section className="card g8 dspan-5" aria-label="Indicateur de référence">
                <div className="between"><h2>{disc === 'RUN' ? 'VMA' : disc === 'BIKE' ? 'FTP' : 'CSS'}</h2><button type="button" className="icon-btn" aria-label="Ajouter un relevé" onClick={() => navigate('/progression/zones?ajout=' + (disc === 'RUN' ? 'vma' : disc === 'BIKE' ? 'ftp' : 'css'))}><Icon name="plusCircle" /></button></div>
                {ref ? (<>
                  <span className="t-h2">{refText(ref.value)}</span>
                  <span className="t-caption c-moderate">{{ test: 'Test', estimation: 'Estimation', manual: 'Saisie' }[ref.source]} du {dateFr(ref.measuredAt.slice(0, 10))}{st.referenceHistory[1] ? ` · ${signed(disc === 'SWIM' ? 100 / st.referenceHistory[1].value - 100 / ref.value : (ref.value - st.referenceHistory[1].value) * (disc === 'RUN' ? 3.6 : 1), disc === 'RUN' ? 1 : 0)}${disc === 'SWIM' ? ' s/100 m' : disc === 'RUN' ? ' km/h' : ' W'} depuis le ${dateFr(st.referenceHistory[1].measuredAt.slice(0, 10))}` : ''}</span>
                  <StepChart history={st.referenceHistory} format={refText} color={dvar(disc)} />
                </>) : <p className="t-caption c-moderate">Aucune valeur enregistrée. Le coach peut programmer un test.</p>}
              </section>
            )}
            <section className="stack-8 dspan-7" aria-label="Journal de la discipline">
              <h2 className="t-h3">Dernières séances</h2>
              <ul className="op-list" style={{ margin: 0 }}>
                {st.sessions.slice(0, 8).map((s) => (
                  <li key={s.id} className="op-item">
                    <button type="button" className="op-row" onClick={() => navigate('/seances/' + s.id)}>
                      <DiscIcon d={s.discipline} />
                      <span className="stack" style={{ minWidth: 0 }}><span className="t-strong">{dayTitle(sessionDay(s))}</span><span className="t-caption c-moderate">{[s.distanceM ? distanceFor(s.distanceM, s.discipline) : null, paceOf(s) ? paceFor(paceOf(s), s.discipline) : null, s.avgHrBpm ? bpm(s.avgHrBpm) : null].filter(Boolean).join(' · ')}</span></span>
                      <span className="t-amount-s nowrap">{duration(s.durationSec)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {st.sessions.length > 8 && <button type="button" className="btn btn-tertiary" onClick={() => navigate('/seances')}>Tout le journal</button>}
            </section>
          </>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

export { speedKmh, daysBetween, dayMonth };
