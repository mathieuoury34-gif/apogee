// Interruptions (blessure, voyage, charge externe) : déclarées depuis le Calendrier, qui les affiche. Elles suspendent les rappels et
// peuvent remplacer la charge mesurée par un forfait quotidien.
import { $t } from '../i18n';
import { useState } from 'react';
import { DatePicker, Empty, Sheet, SubHeader, Switch, showToast, Info } from '../ui/kit';
import { Icon } from '../ui/icons';
import { IntField } from '../ui/wheels';
import { navigate, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { deleteInterruption, restore, saveInterruption } from '../data/actions';
import { addDays } from '../domain/dates';
import { newId } from '../domain/ids';
import { liveRecords } from '../domain/load';
import type { Interruption, InterruptionReason } from '../domain/types';
import { dateFr, dayTitle, num, parseNum, toInput } from '../ui/format';

const REASON_LABEL: Record<InterruptionReason, string> = { injury: $t("Blessure"), travel: $t("Voyage"), external_load: $t("Charge externe"), other: $t("Autre") };

export function InterruptionsScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const ask = route.query.get('nouvelle');
  const [edit, setEdit] = useState<Interruption | 'new' | null>(ask !== null ? 'new' : null);
  const list = liveRecords(data.interruptions).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const remove = (i: Interruption) => { const snap = deleteInterruption(i.id); showToast($t("Interruption supprimée"), { undo: () => restore(snap) }); };
  return (
    <div className="screen" data-screen="interruptions">
      <SubHeader title={$t("Interruptions")} fallback="/calendrier" right={<button type="button" className="icon-btn" aria-label={$t("Nouvelle interruption")} onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      <main className="content stack-16 form-narrow-d">
        <Info>{$t("Une interruption (blessure, voyage, charge externe comme un déménagement) suspend les rappels et les alertes de séances manquées. Une charge forfaitaire quotidienne peut remplacer la charge mesurée, pour que la forme de fond reflète la réalité.")}</Info>
        {!list.length ? <Empty icon="pause" title={$t("Aucune interruption")} text={$t("Ajoute une période avec le bouton +.")} /> : (
          <ul className="tile-list divided card" style={{ padding: '0 var(--space-16)' }}>
            {list.map((i) => {
              const now = i.startDate <= d.today && d.today <= i.endDate;
              return (
                <li key={i.id}>
                  <button type="button" className="settings-row" onClick={() => setEdit(i)}>
                    <Icon name="pause" style={{ color: now ? 'var(--warning-text)' : 'var(--text-neutral)' }} />
                    <span className="stack"><span className="t-strong">{i.label}{now ? <span className="var-chip warn" style={{ marginLeft: 8 }}>{$t("en cours")}</span> : null}</span><span className="t-caption c-moderate">{REASON_LABEL[i.reason]} {$t("· du")} {dateFr(i.startDate)} {$t("au")} {dateFr(i.endDate)}{i.dailyLoadOverride !== null ? $t(" · forfait {0}/j", { 0: num(i.dailyLoadOverride, 0) }) : ''}</span></span>
                    <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {edit && <InterruptionSheet value={edit === 'new' ? null : edit} defaultStart={d.today} onDelete={edit !== 'new' ? () => { remove(edit); setEdit(null); } : undefined} onClose={() => { setEdit(null); if (ask !== null) navigate('/calendrier/interruptions', { replace: true }); }} />}
    </div>
  );
}

function InterruptionSheet({ value, defaultStart, onClose, onDelete }: { value: Interruption | null; defaultStart: string; onClose: () => void; onDelete?: () => void }) {
  const [label, setLabel] = useState(value?.label ?? '');
  const [reason, setReason] = useState<InterruptionReason>(value?.reason ?? 'injury');
  const [start, setStart] = useState(value?.startDate ?? defaultStart);
  const [end, setEnd] = useState(value?.endDate ?? addDays(defaultStart, 6));
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const [load, setLoad] = useState(value?.dailyLoadOverride !== null && value?.dailyLoadOverride !== undefined ? toInput(value.dailyLoadOverride, 0) : '');
  const [suspends, setSuspends] = useState(value?.suspendsReminders ?? true);
  const [notes, setNotes] = useState(value?.notes ?? '');
  const lv = load.trim() ? parseNum(load) : null;
  const bad = !label.trim() || end < start || (lv !== null && (!Number.isFinite(lv) || lv < 0));
  const save = () => {
    saveInterruption({ id: value?.id ?? newId(), updatedAt: '', label: label.trim(), reason, startDate: start, endDate: end, dailyLoadOverride: lv, suspendsReminders: suspends, notes: notes.trim() || null });
    onClose(); showToast($t("Interruption enregistrée"));
  };
  return (
    <Sheet title={value ? $t("Modifier l’interruption") : $t("Nouvelle interruption")} onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <label className="field"><span className="lbl">{$t("Nom")}</span><input className="input" value={label} placeholder={$t("Entorse cheville, vacances…")} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="field"><span className="lbl">{$t("Motif")}</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{(Object.keys(REASON_LABEL) as InterruptionReason[]).map((r) => <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{REASON_LABEL[r]}</button>)}</div>
        </div>
        <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
          <div className="field"><span className="lbl">{$t("Du")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'start' ? null : 'start')}><span>{dayTitle(start)}</span><Icon name="calendar" size={20} /></button></div>
          <div className="field"><span className="lbl">{$t("Au")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'end' ? null : 'end')}><span>{dayTitle(end)}</span><Icon name="calendar" size={20} /></button></div>
        </div>
        {open && <DatePicker value={open === 'start' ? start : end} onChange={(v) => { if (open === 'start') { setStart(v); if (end < v) setEnd(v); } else setEnd(v); setOpen(null); }}  onClose={() => setOpen(null)} />}
        {end < start && <span className="t-caption-strong c-critical">{$t("La fin précède le début.")}</span>}
        <div className="field"><span className="lbl">{$t("Charge forfaitaire par jour")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><IntField label={$t("Charge forfaitaire par jour")} value={load.trim() && Number.isFinite(parseNum(load)) ? parseNum(load) : null} onChange={(x) => setLoad(x === null ? '' : String(x))} clearable min={0} max={1000} step={5} initial={0} /><span className="hint">{$t("Remplace la charge des jours sans séance. 0 pour un arrêt complet ; une valeur pour un effort non mesuré (déménagement, randonnée).")}</span></div>
        <div className="between" style={{ gap: 'var(--space-12)' }}><span className="t-strong" id="lbl-susp">{$t("Suspendre les rappels et alertes")}</span><Switch checked={suspends} labelledBy="lbl-susp" onChange={setSuspends} /></div>
        <label className="field"><span className="lbl">{$t("Notes")}</span><textarea className="input textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {onDelete && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)' }} onClick={onDelete}><Icon name="trash" size={18} />{$t("Supprimer")}</button>}
      </div>
    </Sheet>
  );
}

