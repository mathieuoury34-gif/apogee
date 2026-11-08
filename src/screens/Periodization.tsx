// Périodisation — blocs de préparation sur une frise chronologique, jusqu'à la course.
// Les blocs viennent du coach (apogee/1) ou d'une saisie ; un chevauchement est refusé avec le nom du
// bloc en conflit.
import { $t } from '../i18n';
import { useState } from 'react';
import { DatePicker, Empty, Sheet, SubHeader, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useCalc } from '../data/store';
import { deletePhase, restore, savePhase } from '../data/actions';
import { addDays, daysBetween } from '../domain/dates';
import { PHASE_ISSUE_TEXT, refKeyOfPhase, validatePhase } from '../domain/coach';
import { newId } from '../domain/ids';
import { liveRecords } from '../domain/load';
import { cycleColor, cycleInfos, weeklyCycles } from '../domain/cycles';
import { CycleStrip } from '../ui/cycleStrip';
import type { PhaseCycle, TrainingPhase } from '../domain/types';
import { dateFr, dayMonth, dayTitle, num, PHASE_TYPES } from '../ui/format';

const PHASE_NAME = Object.fromEntries(PHASE_TYPES) as Record<string, string>;
const PHASE_COLOR: Record<string, string> = { base: 'var(--d-SWIM)', build: 'var(--d-BIKE)', peak: 'var(--d-RUN)', taper: 'var(--d-BRICK)', recovery: 'var(--d-STRENGTH)', race: 'var(--critical)', transition: 'var(--d-OTHER)' };

export function PeriodizationScreen() {
  const { data, d } = useCalc();
  const [edit, setEdit] = useState<TrainingPhase | 'new' | null>(null);
  const phases = liveRecords(data.phases).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const start = phases[0]?.startDate ?? d.today;
  const end = [race?.raceDate, phases[phases.length - 1]?.endDate].filter(Boolean).sort().pop() ?? addDays(d.today, 7);
  const span = Math.max(1, daysBetween(start, end) + 1);
  const at = (day: string) => `${Math.min(100, Math.max(0, (daysBetween(start, day) / span) * 100))}%`;
  const remove = (p: TrainingPhase) => { const snap = deletePhase(p.id); showToast($t("Bloc supprimé"), { undo: () => restore(snap) }); };
  return (
    <div className="screen" data-screen="periodisation">
      <SubHeader title={$t("Périodisation")} fallback="/calendrier" right={<button type="button" className="icon-btn" aria-label={$t("Nouveau bloc")} onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      <main className="content stack-16 form-narrow-d">
        {!phases.length ? (
          <Empty icon="layers" title={$t("Aucun bloc de préparation")} text={$t("Les blocs (foncier, développement, affûtage…) arrivent avec le plan du coach, ou se créent avec le bouton +.")} action={<button type="button" className="btn btn-primary" onClick={() => setEdit('new')}>{$t("Créer un bloc")}</button>} />
        ) : (
          <>
            <section className="card g8" aria-label={$t("Frise")}>
              <div className="between t-caption c-moderate"><span>{dateFr(start)}</span>{race && <span><Icon name="flag" size={14} /> {race.name}</span>}<span>{dateFr(end)}</span></div>
              <div className="timeline" role="img" aria-label={$t("Frise des blocs de préparation")}>
                {phases.map((p) => <span key={p.id} className="tl-block" style={{ left: at(p.startDate), width: `calc(${at(addDays(p.endDate, 1))} - ${at(p.startDate)})`, background: PHASE_COLOR[p.phase ?? ''] ?? 'var(--brand-primary)' }} title={p.label} />)}
                {d.today >= start && d.today <= end && <span className="tl-today" style={{ left: at(d.today) }} />}
                {race && <span className="tl-race" style={{ left: at(race.raceDate) }} />}
              </div>
              {phases.some((p) => p.cycles?.length) && <CycleStrip items={phases.flatMap((p) => cycleInfos(p.cycles))} from={start} to={end} today={d.today} labels={false} thin label={$t("Frise des cycles de charge")} />}
              <div className="legend">{[...new Set(phases.map((p) => p.phase).filter(Boolean))].map((k) => <span key={k}><span className="dot s10" style={{ background: PHASE_COLOR[k!] ?? 'var(--brand-primary)' }} />{PHASE_NAME[k!] ?? k}</span>)}</div>
            </section>
            <ul className="stack-12" aria-label={$t("Blocs")}>
              {phases.map((p, i) => {
                const now = p.startDate <= d.today && d.today <= p.endDate;
                const weeks = Math.round((daysBetween(p.startDate, p.endDate) + 1) / 7 * 10) / 10;
                const gap = i > 0 ? daysBetween(phases[i - 1].endDate, p.startDate) - 1 : 0;
                return (
                  <li key={p.id} className="stack-8">
                    {gap > 0 && <span className="t-caption c-moderate" style={{ textAlign: 'center' }}>{gap} {$t("jour(s) sans bloc")}</span>}
                    <button type="button" className={'card g8 list-card' + (now ? ' highlight' : '')} style={{ textAlign: 'left', borderLeft: `4px solid ${PHASE_COLOR[p.phase ?? ''] ?? 'var(--brand-primary)'}`, cursor: 'pointer', width: '100%' }} onClick={() => setEdit(p)}>
                      <div className="between"><span className="t-h3">{p.label}</span>{now ? <span className="var-chip">{$t("en cours")}</span> : p.endDate < d.today ? <span className="t-caption c-moderate">{$t("terminé")}</span> : null}</div>
                      <span className="t-caption c-neutral">{dayMonth(p.startDate)} → {dayMonth(p.endDate)} · {num(weeks, 0, 1)} {$t("sem.")}{p.phase ? ' · ' + (PHASE_NAME[p.phase] ?? p.phase) : ''}{p.coachExchangeId ? $t(" · coach") : ''}</span>
                      {p.intent && <span className="c-neutral">{p.intent}</span>}
                      {p.objective && <span className="t-caption"><strong>{$t("Objectif :")}</strong> {p.objective}</span>}
                      {!!p.cycles?.length && <CycleStrip items={cycleInfos(p.cycles)} from={p.startDate} to={p.endDate} today={d.today} label={$t("Cycles de charge")} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
      {edit && <PhaseSheet value={edit === 'new' ? null : edit} all={phases} defaultStart={phases.length ? addDays(phases[phases.length - 1].endDate, 1) : d.today} onClose={() => setEdit(null)} onDelete={edit !== 'new' ? () => { remove(edit); setEdit(null); } : undefined} />}
    </div>
  );
}

function PhaseSheet({ value, all, defaultStart, onClose, onDelete }: { value: TrainingPhase | null; all: TrainingPhase[]; defaultStart: string; onClose: () => void; onDelete?: () => void }) {
  const [label, setLabel] = useState(value?.label ?? '');
  const [phase, setPhase] = useState<string | null>(value?.phase ?? 'base');
  const [start, setStart] = useState(value?.startDate ?? defaultStart);
  const [end, setEnd] = useState(value?.endDate ?? addDays(defaultStart, 27));
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const [intent, setIntent] = useState(value?.intent ?? '');
  const [objective, setObjective] = useState(value?.objective ?? '');
  const [notes, setNotes] = useState(value?.notes ?? '');
  const [cycles, setCycles] = useState<PhaseCycle[]>(value?.cycles ?? []);
  const [cycOpen, setCycOpen] = useState<{ i: number; f: 'start' | 'end' } | null>(null);
  const id = value?.id ?? 'new';
  const issues = validatePhase({ id, label, startDate: start, endDate: end, cycles }, all.filter((p) => p.id !== id));
  const infoOf = new Map(cycleInfos(cycles).map((x) => [x.cycle, x]));
  const setCycle = (i: number, patch: Partial<PhaseCycle>) => setCycles(cycles.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const addCycle = () => {
    const last = [...cycles].sort((a, b) => (a.endDate < b.endDate ? -1 : 1)).pop();
    const s0 = last ? addDays(last.endDate, 1) : start;
    const e0 = addDays(s0, 6) > end ? end : addDays(s0, 6);
    setCycles([...cycles, { kind: last?.kind === 'up' ? 'down' : 'up', startDate: s0, endDate: e0 < s0 ? s0 : e0, label: null }]);
  };
  const save = () => {
    savePhase({ id: value?.id ?? newId(), updatedAt: '', label: label.trim(), phase, startDate: start, endDate: end, intent: intent.trim() || null, objective: objective.trim() || null, notes: notes.trim() || null, cycles: cycles.length ? [...cycles].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).map((c) => ({ ...c, label: c.label?.trim() || null })) : null, idempotencyKey: value?.idempotencyKey ?? null, coachExchangeId: value?.coachExchangeId ?? null });
    onClose(); showToast($t("Bloc enregistré"));
  };
  return (
    <Sheet title={value ? $t("Modifier le bloc") : $t("Nouveau bloc")} onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={issues.length > 0} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <label className="field"><span className="lbl">{$t("Nom")}</span><input className="input" value={label} placeholder={$t("Bloc foncier 1")} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="field"><span className="lbl">{$t("Type")}</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{PHASE_TYPES.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={phase === k} onClick={() => setPhase(phase === k ? null : k)}>{l}</button>)}</div>
        </div>
        <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
          <div className="field"><span className="lbl">{$t("Du")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'start' ? null : 'start')}><span>{dayTitle(start)}</span><Icon name="calendar" size={20} /></button></div>
          <div className="field"><span className="lbl">{$t("Au")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'end' ? null : 'end')}><span>{dayTitle(end)}</span><Icon name="calendar" size={20} /></button></div>
        </div>
        {open && <DatePicker value={open === 'start' ? start : end} onChange={(v) => { if (open === 'start') { setStart(v); if (end < v) setEnd(addDays(v, 6)); } else setEnd(v); setOpen(null); }}  onClose={() => setOpen(null)} />}
        {[...new Set(issues.map((x) => x.code))].map((code) => { const w = issues.filter((x) => x.code === code && x.with).map((x) => `« ${x.with} »`); return <span key={code} className="t-caption-strong c-critical">{PHASE_ISSUE_TEXT[code]}{w.length ? ` (${w.join(', ')})` : ''}</span>; })}
        <div className="field">
          <span className="lbl">{$t("Cycles de charge")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
          <span className="hint">{$t("Découpe le bloc en périodes de montée de la charge (bleu → violet) et de descente (vert). Les jours sont teintés dans le calendrier du mois.")}</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {[2, 3, 4].map((n) => <button key={n} type="button" className="chip" onClick={() => { setCycles(weeklyCycles(start, end, n)); setCycOpen(null); }}>{n} {$t("sem. de montée + 1 de descente")}</button>)}
            {cycles.length > 0 && <button type="button" className="chip" onClick={() => { setCycles([]); setCycOpen(null); }}>{$t("Tout effacer")}</button>}
          </div>
          {cycles.map((c, i) => {
            const info = infoOf.get(c);
            return (
              <div key={i} className="card g8" style={{ borderLeft: `4px solid ${info?.color ?? cycleColor(c.kind)}` }}>
                <div className="between">
                  <div className="chips g6" style={{ margin: 0, padding: 0 }}>{([['up', $t("Montée")], ['down', $t("Descente")]] as const).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={c.kind === k} onClick={() => setCycle(i, { kind: k })}>{l}</button>)}</div>
                  <button type="button" className="icon-btn" aria-label={$t("Supprimer le cycle")} onClick={() => { setCycles(cycles.filter((_, k) => k !== i)); setCycOpen(null); }}><Icon name="trash" size={18} /></button>
                </div>
                <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
                  <div className="field"><span className="lbl">{$t("Du")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCycOpen(cycOpen?.i === i && cycOpen.f === 'start' ? null : { i, f: 'start' })}><span>{dayTitle(c.startDate)}</span><Icon name="calendar" size={20} /></button></div>
                  <div className="field"><span className="lbl">{$t("Au")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCycOpen(cycOpen?.i === i && cycOpen.f === 'end' ? null : { i, f: 'end' })}><span>{dayTitle(c.endDate)}</span><Icon name="calendar" size={20} /></button></div>
                </div>
                {cycOpen?.i === i && <DatePicker value={cycOpen.f === 'start' ? c.startDate : c.endDate} onChange={(v) => { setCycle(i, cycOpen.f === 'start' ? { startDate: v, ...(c.endDate < v ? { endDate: v } : {}) } : { endDate: v }); setCycOpen(null); }} onClose={() => setCycOpen(null)} />}
                <input className="input" value={c.label ?? ''} maxLength={40} placeholder={info?.text ?? $t("Nom (facultatif)")} onChange={(e) => setCycle(i, { label: e.target.value })} aria-label={$t("Nom du cycle")} />
              </div>
            );
          })}
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={addCycle}><Icon name="plus" size={18} />{$t("Ajouter un cycle")}</button>
        </div>
        <label className="field"><span className="lbl">{$t("Intention")}</span><input className="input" value={intent} placeholder={$t("Construire le volume en endurance")} onChange={(e) => setIntent(e.target.value)} /></label>
        <label className="field"><span className="lbl">{$t("Objectif mesurable")}</span><input className="input" value={objective} placeholder={$t("3 sorties longues vélo de plus de 3 h")} onChange={(e) => setObjective(e.target.value)} /></label>
        <label className="field"><span className="lbl">{$t("Notes")}</span><textarea className="input textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {value && <span className="t-legal c-moderate">{$t("Référence coach :")} {refKeyOfPhase(value)}</span>}
        {onDelete && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)' }} onClick={onDelete}><Icon name="trash" size={18} />{$t("Supprimer le bloc")}</button>}
      </div>
    </Sheet>
  );
}
