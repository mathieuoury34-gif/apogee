import { $t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import { useLongPress } from '../ui/menu';
import { DurationField } from '../ui/wheels';
import { KIND_LABEL, duration } from '../ui/format';
import type { FlatStep, StepEdit } from '../domain/plannedSteps';

/** Une ligne : appui long pour la saisir, durée modifiable par la roulette. */
function Row({ pos, name, sub, sec, grabbed, onGrab, onSec }: { pos: number; name: string; sub: string | null; sec: number; grabbed: boolean; onGrab: () => void; onSec: (v: number) => void }) {
  const lp = useLongPress(onGrab);
  return (
    <div className={'steps-row' + (grabbed ? ' dragging' : '') + (sec === 0 ? ' off' : '')} data-pos={pos} {...lp}>
      <span className="steps-grip" aria-hidden="true"><Icon name="grip" size={18} /></span>
      <span className="laps-name">{name}{sub ? <span className="laps-target">{sub}</span> : null}</span>
      <span className="steps-dur" onPointerDown={(e) => e.stopPropagation()}><DurationField label={name} value={sec} onChange={(v) => onSec(v ?? 0)} hours={false} /></span>
    </div>
  );
}

/**
 * Corrige à la main le découpage en intervalles d'une séance réalisée : durée de chaque étape (0 = étape retirée) et ordre (appui long sur une ligne puis glisser).
 * `sub(f)` donne la consigne de l'étape (ex. « 5:00 /km »), `sessionSec` la durée réelle de la séance.
 */
export function StepsEditor({ flat, edit, sessionSec, sub, onSave, onReset, onCancel }: { flat: FlatStep[]; edit: StepEdit[] | null; sessionSec: number; sub: (f: FlatStep) => string | null; onSave: (e: StepEdit[]) => void; onReset: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState<StepEdit[]>(() => (edit && edit.length === flat.length ? edit : flat.map((f, i) => ({ i, sec: f.sec }))));
  const [grab, setGrab] = useState<number | null>(null);
  const grabRef = useRef<number | null>(null);
  grabRef.current = grab;
  useEffect(() => {
    if (grab === null) return;
    const stopScroll = (e: TouchEvent) => { if (grabRef.current !== null && e.cancelable) e.preventDefault(); };
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pos]') as HTMLElement | null;
      const to = el ? Number(el.dataset.pos) : NaN, from = grabRef.current;
      if (from === null || !Number.isInteger(to) || to === from) return;
      setRows((r) => { const n = r.slice(); const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
      grabRef.current = to; setGrab(to);
    };
    const end = () => setGrab(null);
    document.addEventListener('touchmove', stopScroll, { passive: false });
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    return () => { document.removeEventListener('touchmove', stopScroll); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, [grab !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen: Record<string, number> = {};
  const total = rows.reduce((a, r) => a + r.sec, 0);
  return (
    <div className="g8" style={{ display: 'flex', flexDirection: 'column' }}>
      <p className="t-caption c-moderate">{$t("Appui long sur une étape puis glisse pour changer l’ordre ; touche une durée pour la modifier (0:00 retire l’étape).")}</p>
      <div className={'steps-list' + (grab !== null ? ' grabbing' : '')}>
        {rows.map((r, pos) => {
          const f = flat[r.i];
          const k = f.kind; seen[k] = (seen[k] ?? 0) + 1;
          const name = f.block.label ? f.block.label : KIND_LABEL[k] + (k === 'WORK' || k === 'RECOVERY' || k === 'REST' ? ' ' + seen[k] : '');
          return <Row key={r.i} pos={pos} name={name} sub={sub(f)} sec={r.sec} grabbed={grab === pos} onGrab={() => setGrab(pos)} onSec={(v) => setRows((x) => x.map((y, j) => (j === pos ? { ...y, sec: v } : y)))} />;
        })}
      </div>
      <p className={'t-caption ' + (Math.abs(total - sessionSec) > 5 ? 'c-moderate' : 'c-neutral')}>{$t("Total des étapes : {0} · séance : {1}", { 0: duration(total), 1: duration(sessionSec) })}</p>
      <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
        <button type="button" className="btn btn-primary" style={{ height: 40 }} onClick={() => onSave(rows)}>{$t("Enregistrer")}</button>
        <button type="button" className="btn btn-secondary" style={{ height: 40 }} onClick={onCancel}>{$t("Annuler")}</button>
        <button type="button" className="btn btn-tertiary" style={{ minHeight: 40 }} onClick={onReset}>{$t("Revenir au prévu")}</button>
      </div>
    </div>
  );
}
