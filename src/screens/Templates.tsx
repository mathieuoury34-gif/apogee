// Copier une semaine, semaines types et séances favorites (calendrier).
// Les modèles sont une collection synchronisée (« templates ») : ils suivent ton compte comme le reste.
import { $t } from '../i18n';
import { useState } from 'react';
import { DatePicker, Sheet, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { closeSheet, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { applyTemplate, copyWeek, deleteTemplate, restore, templateFromWeek, weekPlanned } from '../data/actions';
import { addDays, mondayOf } from '../domain/dates';
import { estimateDuration } from '../domain/blocks';
import { liveRecords } from '../domain/load';
import type { SessionTemplate } from '../domain/types';
import { dateFr, dayMonth, DISCIPLINE_LABEL, duration } from '../ui/format';

type Ctl = { hide: () => void };

function Row({ icon, title, sub, onClick, open }: { icon: string; title: string; sub?: string; onClick: () => void; open?: boolean }) {
  return (
    <button type="button" className="row-btn" aria-expanded={open} onClick={onClick}>
      <Icon name={icon} size={22} />
      <span className="stack grow"><span className="t-strong">{title}</span>{sub && <span className="t-caption c-moderate">{sub}</span>}</span>
    </button>
  );
}

export function templates(data: ReturnType<typeof useCalc>['data'], kind: 'session' | 'week'): SessionTemplate[] {
  return liveRecords(data.templates).filter((t) => t.kind === kind).sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
}

function templateSummary(t: SessionTemplate, d: ReturnType<typeof useCalc>['d']): string {
  const total = t.items.reduce((s, it) => { const e = estimateDuration(it.blocks, it.discipline, d.refs); return s + (e.certainty === 'unknown' ? 0 : e.value); }, 0);
  const n = t.items.length;
  return t.kind === 'week' ? `${n} ${$t("séance")}${n > 1 ? 's' : ''}${total ? ' · ' + duration(total) : ''}` : `${DISCIPLINE_LABEL[t.items[0].discipline]}${total ? ' · ' + duration(total) : ''}`;
}

// ------------------------------------------------------------------ actions de la semaine
export function WeekActionsSheet({ monday, sh }: { monday: string; sh: Ctl }) {
  const { data, d } = useCalc();
  const [mode, setMode] = useState<null | 'copy' | 'save' | 'apply'>(null);
  const [target, setTarget] = useState<string>(addDays(monday, 7));
  const [name, setName] = useState('');
  const here = weekPlanned(monday);
  const dst = mondayOf(target);
  const dstCount = weekPlanned(dst).length;
  const weeks = templates(data, 'week');
  const doCopy = () => {
    const { snap, count } = copyWeek(monday, dst);
    sh.hide();
    showToast($t("{0} séance(s) copiée(s) vers la semaine du {1}", { 0: count, 1: dateFr(dst) }), { undo: () => restore(snap) });
  };
  const doSave = () => {
    const t = templateFromWeek(name || $t("Semaine du {0}", { 0: dayMonth(monday) }), monday);
    sh.hide();
    showToast(t ? $t("Semaine type enregistrée") : $t("Aucune séance prévue cette semaine"));
  };
  return (
    <Sheet title={$t("Actions de la semaine")} onClose={sh.hide} head={<span className="t-caption c-moderate">{dayMonth(monday)} – {dayMonth(addDays(monday, 6))} · {here.length} {$t("séance")}{here.length > 1 ? 's' : ''} {$t("prévue")}{here.length > 1 ? 's' : ''}</span>}>
      <div className="stack" style={{ gap: 0, paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <Row icon="copy" title={$t("Copier cette semaine vers…")} sub={$t("Les séances prévues, au même jour de la semaine choisie")} open={mode === 'copy'} onClick={() => setMode(mode === 'copy' ? null : 'copy')} />
        {mode === 'copy' && (
          <div className="stack-8" style={{ padding: 'var(--space-8) 0' }}>
            <DatePicker value={target} label={$t("Semaine de destination")} onChange={setTarget} />
            <p className="t-caption c-neutral">{here.length ? $t("{0} séance(s) seront ajoutées à la semaine du {1}.", { 0: here.length, 1: dateFr(dst) }) : $t("Cette semaine n’a aucune séance prévue à copier.")}{dstCount > 0 ? ' ' + $t("Elle contient déjà {0} séance(s) prévue(s) : elles sont conservées, rien n’est écrasé.", { 0: dstCount }) : ''}</p>
            <button type="button" className="btn btn-primary" disabled={!here.length || dst === monday} onClick={doCopy}>{$t("Copier")}</button>
          </div>
        )}
        <Row icon="bookmark" title={$t("Enregistrer comme semaine type")} sub={$t("Pour la réutiliser plus tard")} open={mode === 'save'} onClick={() => setMode(mode === 'save' ? null : 'save')} />
        {mode === 'save' && (
          <div className="stack-8" style={{ padding: 'var(--space-8) 0' }}>
            <label className="field"><span className="lbl">{$t("Nom")}</span><input className="input" value={name} maxLength={60} placeholder={$t("Semaine de volume, semaine d’affûtage…")} onChange={(e) => setName(e.target.value)} /></label>
            <button type="button" className="btn btn-primary" disabled={!here.length} onClick={doSave}>{$t("Enregistrer")}</button>
          </div>
        )}
        <Row icon="layers" title={$t("Appliquer une semaine type")} sub={weeks.length ? $t("{0} disponible(s)", { 0: weeks.length }) : $t("Aucune pour l’instant")} open={mode === 'apply'} onClick={() => setMode(mode === 'apply' ? null : 'apply')} />
        {mode === 'apply' && (
          <ul className="stack-8" style={{ padding: 'var(--space-8) 0' }}>
            {weeks.length === 0 && <li className="t-caption c-moderate">{$t("Enregistre d’abord une semaine comme semaine type.")}</li>}
            {weeks.map((t) => (
              <li key={t.id} className="between" style={{ gap: 'var(--space-8)' }}>
                <span className="stack-4 grow"><span className="t-strong">{t.name}</span><span className="t-caption c-moderate">{templateSummary(t, d)}</span></span>
                <button type="button" className="btn btn-secondary" onClick={() => { const { snap, count } = applyTemplate(t, monday); sh.hide(); showToast($t("{0} séance(s) ajoutée(s)", { 0: count }), { undo: () => restore(snap) }); }}>{$t("Appliquer")}</button>
                <button type="button" className="icon-btn" aria-label={$t("Supprimer cette semaine type")} onClick={() => { const snap = deleteTemplate(t.id); showToast($t("Semaine type supprimée"), { undo: () => restore(snap) }); }}><Icon name="trash" size={20} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ séances favorites (feuille « favoris »)
export function FavoritesSheet() {
  const route = useRoute();
  const { data, d } = useCalc();
  const date = route.query.get('date') || d.today;
  const list = templates(data, 'session');
  return (
    <Sheet title={$t("Mes séances favorites")} head={<span className="t-caption c-moderate">{$t("Ajout le {0}", { 0: dateFr(date) })}</span>}>
      <ul className="stack-8" style={{ padding: '0 var(--space-16) calc(var(--safe-bottom) + var(--space-16))' }}>
        {list.length === 0 && <li className="t-caption c-moderate">{$t("Aucun favori pour l’instant. Appuie longuement sur une séance prévue, puis « Ajouter aux favoris ».")}</li>}
        {list.map((t) => (
          <li key={t.id} className="between" style={{ gap: 'var(--space-8)' }}>
            <span className="stack-4 grow"><span className="t-strong">{t.name}</span><span className="t-caption c-moderate">{templateSummary(t, d)}</span></span>
            <button type="button" className="btn btn-secondary" onClick={() => { const { snap } = applyTemplate(t, date); closeSheet(); showToast($t("Séance ajoutée au {0}", { 0: dateFr(date) }), { undo: () => restore(snap) }); }}>{$t("Ajouter")}</button>
            <button type="button" className="icon-btn" aria-label={$t("Supprimer ce favori")} onClick={() => { const snap = deleteTemplate(t.id); showToast($t("Favori supprimé"), { undo: () => restore(snap) }); }}><Icon name="trash" size={20} /></button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
