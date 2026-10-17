// Menu d'appui long sur une séance (prévue ou réalisée) : dupliquer, déplacer, modifier, supprimer, renommer.
// L'appui long ouvre une feuille ; « retour » d'Android la ferme sans quitter l'écran.
import { $t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { DatePicker, Sheet, SportPicker, showToast } from './kit';
import { Icon } from './icons';
import { navigate } from './router';
import { deletePlanned, duplicatePlanned, movePlanned, restore, setActualLook, templateFromSession } from '../data/actions';
import { useCalc } from '../data/store';
import { dateFr, dayTitle, DISCIPLINE_LABEL, sessionLabel } from './format';
import { sessionDay } from '../domain/load';
import type { ActualSession, PlannedSession } from '../domain/types';

/** Feuille locale qui a sa propre entrée d'historique (même mécanisme que la feuille d'un bloc de l'éditeur). */
export function useLocalSheet() {
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  useEffect(() => {
    const onPop = () => { if (pushed.current) { pushed.current = false; setOpen(false); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const show = () => {
    if (!pushed.current) { history.pushState({ depth: ((history.state as { depth?: number } | null)?.depth ?? 0) + 1 }, '', location.href); pushed.current = true; }
    setOpen(true);
  };
  const hide = () => { setOpen(false); if (pushed.current) { pushed.current = false; history.back(); } };
  /** Ferme la feuille puis va ailleurs en remplaçant son entrée d'historique (un seul « retour » ramène à l'écran d'origine). */
  const leave = (to: string) => { setOpen(false); pushed.current = false; navigate(to, { replace: true }); };
  return { open, show, hide, leave };
}

/** Appui long (≈ 0,45 s) sans bouger : lance `onLong`, et avale le clic qui suit. Le clic droit fait de même sur ordinateur. */
export function useLongPress(onLong: () => void, ms = 450) {
  const st = useRef<{ t: number | undefined; x: number; y: number; fired: boolean }>({ t: undefined, x: 0, y: 0, fired: false });
  const clear = () => { if (st.current.t !== undefined) { clearTimeout(st.current.t); st.current.t = undefined; } };
  const fire = () => { if (st.current.fired) return; st.current.fired = true; clear(); navigator.vibrate?.(15); onLong(); };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st.current.fired = false; st.current.x = e.clientX; st.current.y = e.clientY;
      clear(); st.current.t = window.setTimeout(fire, ms);
    },
    onPointerMove: (e: React.PointerEvent) => { if (st.current.t !== undefined && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) clear(); },
    onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); fire(); },
    onClickCapture: (e: React.MouseEvent) => { if (st.current.fired) { e.preventDefault(); e.stopPropagation(); st.current.fired = false; } },
  };
}

/** Pour une séance prévue : propriétés à poser sur la ligne + la feuille à afficher à côté. */
export function usePlannedMenu(p: PlannedSession) {
  const sh = useLocalSheet();
  const lp = useLongPress(sh.show);
  return { lp, sheet: sh.open ? <PlannedSheet p={p} sh={sh} /> : null };
}

/** Pour une séance réalisée. */
export function useActualMenu(s: ActualSession) {
  const sh = useLocalSheet();
  const lp = useLongPress(sh.show);
  return { lp, sheet: sh.open ? <ActualSheet s={s} sh={sh} /> : null };
}

type SheetCtl = ReturnType<typeof useLocalSheet>;

function Action({ icon, title, sub, onClick, danger, open }: { icon: string; title: string; sub?: string; onClick: () => void; danger?: boolean; open?: boolean }) {
  return (
    <button type="button" className="row-btn" aria-expanded={open} onClick={onClick} style={danger ? { color: 'var(--critical-text)' } : undefined}>
      <Icon name={icon} size={22} />
      <span className="stack grow"><span className="t-strong">{title}</span>{sub && <span className="t-caption c-moderate">{sub}</span>}</span>
    </button>
  );
}

function PlannedSheet({ p, sh }: { p: PlannedSession; sh: SheetCtl }) {
  const [mode, setMode] = useState<null | 'copy' | 'move'>(null);
  const [confirm, setConfirm] = useState(false);
  const label = p.title ?? DISCIPLINE_LABEL[p.discipline];
  return (
    <Sheet title={label} onClose={sh.hide} head={<span className="t-caption c-moderate">{dayTitle(p.plannedDate)} · {DISCIPLINE_LABEL[p.discipline]}</span>}>
      <div className="stack" style={{ gap: 0, paddingBottom: 'var(--space-16)' }}>
        <Action icon="copy" title={$t("Dupliquer")} sub={$t("Choisis le jour de la copie")} open={mode === 'copy'} onClick={() => setMode(mode === 'copy' ? null : 'copy')} />
        {mode === 'copy' && <DatePicker value={p.plannedDate} label={$t("Dupliquer vers")} onChange={(date) => {
          const c = duplicatePlanned(p.id, date);
          sh.hide();
          if (c) showToast($t("Séance dupliquée au ") + dateFr(date), { undo: () => restore([{ coll: 'planned', id: c.id, rec: undefined }]) });
        }} />}
        <Action icon="calendar" title={$t("Déplacer")} sub={$t("Change le jour de cette séance")} open={mode === 'move'} onClick={() => setMode(mode === 'move' ? null : 'move')} />
        {mode === 'move' && <DatePicker value={p.plannedDate} label={$t("Déplacer au")} onChange={(date) => {
          const snap = movePlanned(p.id, date);
          sh.hide();
          showToast($t("Séance déplacée au ") + dateFr(date), { undo: () => restore(snap) });
        }} />}
        <Action icon="bookmark" title={$t("Ajouter aux favoris")} sub={$t("Pour la replacer plus tard en un geste")} onClick={() => { const t = templateFromSession(p.id); sh.hide(); if (t) showToast($t("Ajoutée aux favoris : {0}", { 0: t.name })); }} />
        <Action icon="pencil" title={$t("Modifier")} sub={$t("Ouvre l’éditeur de blocs")} onClick={() => sh.leave('/calendrier/editer/' + p.id)} />
        {!confirm
          ? <Action icon="trash" title={$t("Supprimer")} danger onClick={() => setConfirm(true)} />
          : <div className="row wrap" style={{ gap: 'var(--space-8)', padding: 'var(--space-8) 0' }}>
              <button type="button" className="btn btn-danger" onClick={() => { const snap = deletePlanned(p.id); sh.hide(); showToast($t("Séance supprimée"), { undo: () => restore(snap) }); }}>{$t("Supprimer")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>{$t("Annuler")}</button>
            </div>}
      </div>
    </Sheet>
  );
}

function ActualSheet({ s, sh }: { s: ActualSession; sh: SheetCtl }) {
  const { data, d } = useCalc();
  const [title, setTitle] = useState(s.title ?? '');
  const [sub, setSub] = useState<string | null>(s.subSport ?? null);
  const [copy, setCopy] = useState(false);
  const isOther = s.discipline === 'OTHER';
  const changed = title.trim() !== (s.title ?? '').trim() || (isOther && sub !== (s.subSport ?? null));
  const link = d.links.byActual.get(s.id);
  const plan = link?.plannedId ? data.planned[link.plannedId] : undefined;
  const save = () => {
    const snap = setActualLook(s.id, { title, subSport: isOther ? sub : undefined });
    sh.hide();
    showToast(title.trim() || (isOther && sub !== (s.subSport ?? null)) ? $t("Titre enregistré") : $t("Titre retiré"), { undo: () => restore(snap) });
  };
  return (
    <Sheet title={sessionLabel(s)} onClose={sh.hide} head={<span className="t-caption c-moderate">{dayTitle(sessionDay(s))} · {DISCIPLINE_LABEL[s.discipline]}</span>}
      footer={<button type="button" className="btn btn-primary block" disabled={!changed} onClick={save}>{$t("Enregistrer le titre")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-4)', paddingBottom: 'var(--space-16)' }}>
        <label className="field"><span className="lbl">{$t("Titre")}</span>
          <input className="input" value={title} maxLength={80} autoFocus placeholder={s.discipline === 'OTHER' ? $t("Nom de l’activité : GR20 étape 3, kayak, balade…") : $t("Sortie avec Paul, vélo de nuit…")} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && changed) save(); }} />
          <span className="hint">{$t("Remplace le nom de la discipline dans les listes. Ne change aucun calcul.")}</span></label>
        {isOther && <div className="field"><span className="lbl">{$t("Pictogramme de l’activité")}</span><SportPicker value={sub} onChange={setSub} /></div>}
        <Action icon="seances" title={$t("Ouvrir le bilan")} onClick={() => sh.leave('/seances/' + s.id)} />
        {plan && !plan.deleted && <>
          <Action icon="copy" title={$t("Dupliquer la séance prévue")} sub={plan.title ?? DISCIPLINE_LABEL[plan.discipline]} open={copy} onClick={() => setCopy(!copy)} />
          {copy && <DatePicker value={plan.plannedDate} label={$t("Dupliquer vers")} onChange={(date) => {
            const c = duplicatePlanned(plan.id, date);
            sh.hide();
            if (c) showToast($t("Séance dupliquée au ") + dateFr(date), { undo: () => restore([{ coll: 'planned', id: c.id, rec: undefined }]) });
          }} />}
        </>}
      </div>
    </Sheet>
  );
}
