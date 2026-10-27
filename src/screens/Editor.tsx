// Éditeur de séance planifiée (plein écran, comme « Nouvel achat » de PEAnalyze) et feuille d'un bloc.
// Ergonomie revue : modèles de départ par discipline, durée/distance totales recalculées en direct,
// réordonnancement par flèches, enfants d'une série éditables en place, erreurs listées en clair avant
// l'enregistrement, saisie des allures en « 4:30 ».
import { $t } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker, DiscIcon, Sheet, SubHeader, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { back, navigate, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { restore, savePlanned } from '../data/actions';
import { estimateDistance, estimateDuration, ISSUE_TEXT, newBlock, validateSession } from '../domain/blocks';
import { newId, nowIso } from '../domain/ids';
import type { Block, BlockKind, PlannedDiscipline, PlannedSession } from '../domain/types';
import { BLOCK_KINDS, PLANNED_DISCIPLINES, TARGET_TYPES } from '../domain/types';
import { DurationField, IntField, MeasureField, TargetField, defaultDisp, fromDisp, toDisp } from '../ui/wheels';
import { blockDetail, blockHead, dayTitle, DISCIPLINE_LABEL, distanceFor, duration, KIND_LABEL, MEASURE_LABEL, mmss, parseMmss, parseNum, REL_LABEL, SETMODE_LABEL, TARGET_LABEL, toInput, DISCIPLINE_SHORT } from '../ui/format';

const B = (o: Partial<Block>): Block => ({ ...newBlock(o.kind ?? 'WORK'), ...o });
const TEMPLATES: Record<PlannedDiscipline, { label: string; blocks: () => Block[] }[]> = {
  RUN: [
    { label: $t("Footing 45 min"), blocks: () => [B({ kind: 'WARMUP', measureValue: 600 }), B({ measureValue: 1800, targetType: 'ZONE', targetLow: 2 }), B({ kind: 'COOLDOWN', measureValue: 300 })] },
    { label: $t("Fractionné 6 × 400 m"), blocks: () => [B({ kind: 'WARMUP', measureValue: 1200 }), B({ kind: 'SET', setCount: 6, children: [B({ measure: 'DISTANCE', measureValue: 400, targetType: 'PACE', targetLow: 240 }), B({ kind: 'RECOVERY', measureValue: 90 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })] },
    { label: $t("Sortie longue 1 h 30"), blocks: () => [B({ measureValue: 5400, targetType: 'ZONE', targetLow: 2 })] },
  ],
  BIKE: [
    { label: $t("Endurance 1 h 30"), blocks: () => [B({ kind: 'WARMUP', measureValue: 900 }), B({ measureValue: 4500, targetType: 'ZONE', targetLow: 2 })] },
    { label: $t("Seuil 3 × 10 min"), blocks: () => [B({ kind: 'WARMUP', measureValue: 900 }), B({ kind: 'SET', setCount: 3, children: [B({ measureValue: 600, targetType: 'ZONE', targetLow: 4 }), B({ kind: 'RECOVERY', measureValue: 300 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })] },
  ],
  SWIM: [
    { label: $t("Technique 1 800 m"), blocks: () => [B({ kind: 'WARMUP', measure: 'DISTANCE', measureValue: 300 }), B({ kind: 'SET', setMode: 'EVERY', setCount: 8, setWindowS: 60, children: [B({ measure: 'DISTANCE', measureValue: 50, notes: $t("Éducatif au choix") })] }), B({ measure: 'DISTANCE', measureValue: 800, targetType: 'ZONE', targetLow: 2 }), B({ kind: 'COOLDOWN', measure: 'DISTANCE', measureValue: 300 })] },
    { label: '10 × 100 m CSS', blocks: () => [B({ kind: 'WARMUP', measure: 'DISTANCE', measureValue: 400 }), B({ kind: 'SET', setCount: 10, children: [B({ measure: 'DISTANCE', measureValue: 100, targetType: 'PACE', targetLow: 100, relativeTo: 'CSS' }), B({ kind: 'REST', measureValue: 20 })] }), B({ kind: 'COOLDOWN', measure: 'DISTANCE', measureValue: 200 })] },
  ],
  STRENGTH: [
    { label: $t("Circuit 45 min"), blocks: () => [B({ kind: 'WARMUP', measureValue: 600 }), B({ kind: 'SET', setCount: 4, children: [B({ measure: 'REPS', measureValue: 10, label: $t("Squat") }), B({ measure: 'REPS', measureValue: 10, label: $t("Pompes") }), B({ kind: 'REST', measureValue: 90 })] })] },
  ],
  BRICK: [
    { label: $t("Vélo 1 h + course 20 min"), blocks: () => [B({ measureValue: 3600, discipline: 'BIKE', targetType: 'ZONE', targetLow: 2 }), B({ kind: 'TRANSITION', measure: 'OPEN', measureValue: null }), B({ measureValue: 1200, discipline: 'RUN', targetType: 'ZONE', targetLow: 3 })] },
  ],
};

type Path = [number] | [number, number];
type Target = { parent: number; index: number };
type Line = Target & { y: number; left: number; width: number; level: 0 | 1 };
/** Premier ancêtre qui défile (sinon la page). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement as HTMLElement | null;
}

export function PlannedEditorScreen({ id }: { id: string }) {
  const route = useRoute();
  const { data, d } = useCalc();
  const existing = id !== 'nouvelle' ? data.planned[id] : undefined;
  const [draft, setDraft] = useState<PlannedSession>(() => existing && !existing.deleted ? structuredClone(existing) : {
    id: newId(), updatedAt: '', createdAt: nowIso(), discipline: (route.query.get('d') as PlannedDiscipline) || 'RUN', plannedDate: route.query.get('date') || d.today,
    title: null, notes: null, origin: 'manual', idempotencyKey: null, coachExchangeId: null, blocks: [],
  });
  const [cal, setCal] = useState(false);
  const [edit, setEdit] = useState<Path | null>(null);
  // La feuille d'un bloc a sa propre entrée d'historique : « retour » d'Android la ferme sans quitter l'édition de la séance.
  const sheetPushed = useRef(false);
  const openEdit = (p: Path) => {
    if (!sheetPushed.current) { history.pushState({ depth: ((history.state as { depth?: number } | null)?.depth ?? 0) + 1 }, '', location.href); sheetPushed.current = true; }
    setEdit(p);
  };
  const closeEdit = () => {
    setEdit(null);
    if (sheetPushed.current) { sheetPushed.current = false; history.back(); }
  };
  useEffect(() => {
    const onPop = () => { if (sheetPushed.current) { sheetPushed.current = false; setEdit(null); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [drag, setDrag] = useState<{ from: Path; dy: number; line: { y: number; left: number; width: number } | null } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [addMenu, setAddMenu] = useState<number | null>(null); // -1 = racine, i = enfant de la série i
  const [tried, setTried] = useState(false);
  const issues = useMemo(() => validateSession(draft), [draft]);
  const dur = estimateDuration(draft.blocks, draft.discipline, d.refs);
  const dist = estimateDistance(draft.blocks, draft.discipline, d.refs);
  const setBlocks = (blocks: Block[]) => setDraft({ ...draft, blocks });
  const blockAt = (p: Path): Block => (p.length === 1 ? draft.blocks[p[0]] : draft.blocks[p[0]].children[p[1]]);
  const replaceAt = (p: Path, b: Block | null) => {
    const bl = structuredClone(draft.blocks);
    if (p.length === 1) { if (b) bl[p[0]] = b; else bl.splice(p[0], 1); }
    else { if (b) bl[p[0]].children[p[1]] = b; else bl[p[0]].children.splice(p[1], 1); }
    setBlocks(bl);
  };
  const move = (p: Path, dir: -1 | 1) => {
    const bl = structuredClone(draft.blocks);
    const arr = p.length === 1 ? bl : bl[p[0]].children;
    const i = p[p.length - 1], j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBlocks(bl);
  };
  /** Déplace un bloc (ou une série) n'importe où : dans sa liste, dans une autre série, ou hors d'une série.
   *  `t.parent` = index de la série d'arrivée dans la liste d'origine (-1 : racine) ; `t.index` = position d'arrivée une fois le bloc retiré. */
  const moveBlock = (p: Path, t: Target) => {
    const bl = structuredClone(draft.blocks);
    const src = p.length === 1 ? bl : bl[p[0]].children;
    const dest = t.parent < 0 ? null : bl[t.parent];
    const [x] = src.splice(p[p.length - 1], 1);
    if (!x || (dest && x.kind === 'SET')) return;
    const dst = dest ? dest.children : bl;
    dst.splice(Math.min(Math.max(t.index, 0), dst.length), 0, x);
    if (JSON.stringify(bl) !== JSON.stringify(draft.blocks)) setBlocks(bl);
  };
  const duplicate = (p: Path) => {
    const bl = structuredClone(draft.blocks);
    const arr = p.length === 1 ? bl : bl[p[0]].children;
    const i = p[p.length - 1];
    const fresh = (x: Block): Block => ({ ...structuredClone(x), children: x.children.map(fresh) });
    arr.splice(i + 1, 0, fresh(arr[i]));
    setBlocks(bl);
    showToast(arr[i].kind === 'SET' ? $t("Série dupliquée") : $t("Bloc dupliqué"));
  };
  /** Points d'insertion possibles pendant un glissement, lus dans le document (donc justes même après un défilement). */
  const collectLines = (p: Path, isSet: boolean): Line[] => {
    const ol = listRef.current;
    if (!ol) return [];
    const out: Line[] = [];
    const isSelf = (parent: number, idx: number) => (p.length === 1 ? parent < 0 && idx === p[0] : parent === p[0] && idx === p[1]);
    const rows = (Array.from(ol.querySelectorAll(':scope > li[data-idx]')) as HTMLElement[]).filter((r) => !isSelf(-1, +r.dataset.idx!));
    rows.forEach((r, k) => { const b = r.getBoundingClientRect(); out.push({ parent: -1, index: k, y: b.top - 4, left: b.left, width: b.width, level: 0 }); });
    if (rows.length) { const b = rows[rows.length - 1].getBoundingClientRect(); out.push({ parent: -1, index: rows.length, y: b.bottom + 4, left: b.left, width: b.width, level: 0 }); }
    else { const b = ol.getBoundingClientRect(); out.push({ parent: -1, index: 0, y: b.top, left: b.left, width: b.width, level: 0 }); }
    if (!isSet) {
      rows.forEach((r) => {
        const pi = +r.dataset.idx!;
        const cl = r.querySelector(':scope > ol.edit-children');
        if (!cl) return;
        const kids = (Array.from(cl.querySelectorAll(':scope > li[data-idx]')) as HTMLElement[]).filter((c) => !isSelf(pi, +c.dataset.idx!));
        kids.forEach((c, k) => { const b = c.getBoundingClientRect(); out.push({ parent: pi, index: k, y: b.top - 3, left: b.left, width: b.width, level: 1 }); });
        if (kids.length) { const b = kids[kids.length - 1].getBoundingClientRect(); out.push({ parent: pi, index: kids.length, y: b.bottom + 3, left: b.left, width: b.width, level: 1 }); }
        else if (cl.lastElementChild) { const b = (cl.lastElementChild as HTMLElement).getBoundingClientRect(); out.push({ parent: pi, index: 0, y: b.top, left: b.left, width: b.width, level: 1 }); }
      });
    }
    return out;
  };
  /** Appui long sur un bloc puis glissement : le bloc suit le doigt et se pose à l'endroit du trait bleu, y compris dans une autre série. */
  const startPress = (e: React.PointerEvent, p: Path) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = (e.currentTarget as HTMLElement).closest('li[data-idx]') as HTMLElement | null;
    if (!el || !listRef.current) return;
    const isSet = blockAt(p).kind === 'SET';
    const x0 = e.clientX, y0 = e.clientY;
    let active = false;
    let last = { x: x0, y: y0 };
    let target: Line | null = null;
    let scroller: HTMLElement | null = null, scroll0 = 0, raf = 0;
    const pick = (x: number, y: number): Line | null => {
      const ls = collectLines(p, isSet);
      if (!ls.length) return null;
      const nest = x > ls[0].left + ls[0].width * 0.33; // doigt vers la droite : on préfère l'intérieur d'une série
      let best: Line | null = null, bestC = Infinity;
      for (const l of ls) { const c = Math.abs(y - l.y) + ((l.level === 1) === nest ? 0 : 14); if (c < bestC) { bestC = c; best = l; } }
      return best;
    };
    const paint = () => {
      target = pick(last.x, last.y);
      setDrag({ from: p, dy: last.y - y0 + ((scroller?.scrollTop ?? 0) - scroll0), line: target ? { y: target.y, left: target.left, width: target.width } : null });
    };
    const tick = () => {
      if (!active) return;
      const edge = 90;
      const dv = last.y < edge ? -Math.ceil((edge - last.y) / 6) : last.y > window.innerHeight - edge ? Math.ceil((last.y - (window.innerHeight - edge)) / 6) : 0;
      if (dv && scroller) { const before = scroller.scrollTop; scroller.scrollTop += dv; if (scroller.scrollTop !== before) paint(); }
      raf = requestAnimationFrame(tick);
    };
    const noScroll = (ev: TouchEvent) => { if (active && ev.cancelable) ev.preventDefault(); };
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!active) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) stop(); return; }
      paint();
    };
    const up = () => {
      const was = active, t = target;
      stop();
      if (was) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 350); if (t) moveBlock(p, { parent: t.parent, index: t.index }); }
    };
    const timer = setTimeout(() => {
      active = true;
      scroller = scrollParent(listRef.current);
      scroll0 = scroller?.scrollTop ?? 0;
      navigator.vibrate?.(15);
      paint();
      raf = requestAnimationFrame(tick);
    }, 380);
    function stop() {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      active = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      document.removeEventListener('touchmove', noScroll);
      setDrag(null);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
    document.addEventListener('touchmove', noScroll, { passive: false });
  };
  const suppressClick = useRef(false);
  const rowProps = (p: Path) => {
    const mine = !!drag && drag.from.length === p.length && drag.from.every((v, j) => v === p[j]);
    return {
      'data-idx': p[p.length - 1],
      style: mine && drag ? { transform: `translateY(${drag.dy}px) scale(1.02)`, zIndex: 5, boxShadow: 'var(--shadow-m, 0 6px 18px rgba(0,0,0,.25))', position: 'relative' as const, transition: 'none' } : undefined,
      className: mine ? ' dragging' : '',
    };
  };
  const add = (kind: BlockKind, parent: number) => {
    const bl = structuredClone(draft.blocks);
    const b = newBlock(kind);
    if (parent < 0) { bl.push(b); setBlocks(bl); openEdit([bl.length - 1]); }
    else { bl[parent].children.push(b); setBlocks(bl); openEdit([parent, bl[parent].children.length - 1]); }
    setAddMenu(null);
  };
  const save = () => {
    setTried(true);
    if (issues.length) return;
    const next = { ...draft, title: draft.title?.trim() || null, notes: draft.notes?.trim() || null, discipline: draft.discipline };
    const changed = !existing || JSON.stringify([existing.discipline, existing.plannedDate, existing.title, existing.notes, existing.blocks]) !== JSON.stringify([next.discipline, next.plannedDate, next.title, next.notes, next.blocks]);
    const snap = savePlanned(existing && changed ? { ...next, editedAt: nowIso() } : next);
    if (existing) back('/calendrier/prevue/' + draft.id);
    else navigate('/calendrier/prevue/' + draft.id, { replace: true });
    showToast(existing ? $t("Séance modifiée") : $t("Séance planifiée le ") + dayTitle(draft.plannedDate).toLowerCase(), { undo: () => restore(snap) });
  };
  const brick = draft.discipline === 'BRICK';
  const kinds = BLOCK_KINDS.filter((k) => k !== 'SET' && (brick || k !== 'TRANSITION'));

  return (
    <div className="screen screen-white" data-screen="editeur">
      <SubHeader title={existing ? $t("Modifier la séance") : $t("Nouvelle séance")} fallback="/calendrier" close bordered />
      <div className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin) var(--space-24)' }}>
          <div className="field">
            <span className="lbl">{$t("Discipline")}</span>
            <div className="disc-picker" role="radiogroup" aria-label={$t("Discipline")}>
              {PLANNED_DISCIPLINES.map((x) => (
                <button key={x} type="button" role="radio" aria-checked={draft.discipline === x} className={'disc-pick' + (draft.discipline === x ? ' on' : '')} style={{ ['--c' as string]: `var(--d-${x})` }} onClick={() => setDraft({ ...draft, discipline: x, blocks: x === 'BRICK' || draft.discipline !== 'BRICK' ? draft.blocks : draft.blocks.map((b) => ({ ...b, discipline: null })) })}>
                  <DiscIcon d={x} size={36} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lbl">{$t("Date")}</span>
            <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} aria-expanded={cal} onClick={() => setCal(!cal)}>
              <span>{dayTitle(draft.plannedDate)} {draft.plannedDate.slice(0, 4)}</span><Icon name="calendar" size={20} style={{ color: 'var(--primary-fg)' }} />
            </button>
            {cal && <DatePicker value={draft.plannedDate} label={$t("Date de la séance")} onChange={(v) => { setDraft({ ...draft, plannedDate: v }); setCal(false); }} />}
          </div>
          <label className="field">
            <span className="lbl">{$t("Titre")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
            <input className="input" value={draft.title ?? ''} placeholder={$t("Fractionné seuil, sortie longue…")} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>

          <section className="stack-8" aria-label={$t("Blocs")}>
            <div className="between"><span className="lbl t-label">{$t("Blocs")}</span><span className="t-caption c-moderate">{draft.blocks.length} {$t("bloc")}{draft.blocks.length > 1 ? 's' : ''}</span></div>
            {!draft.blocks.length && (
              <div className="stack-8">
                <p className="t-caption c-moderate">{$t("Pars d’un modèle ou ajoute les blocs un par un.")}</p>
                <div className="chips">
                  {TEMPLATES[draft.discipline].map((t) => <button key={t.label} type="button" className="chip" onClick={() => setDraft({ ...draft, blocks: t.blocks(), title: draft.title || t.label })}>{t.label}</button>)}
                </div>
              </div>
            )}
            <ol className="edit-blocks" ref={listRef}>
              {draft.blocks.map((b, i) => (
                <li key={i} data-idx={i} style={rowProps([i]).style} className={'edit-block k-' + b.kind + (tried && issues.some((x) => x.path[0] === i) ? ' invalid' : '') + rowProps([i]).className}>
                  <BlockRow b={b} d={draft.discipline} onOpen={() => { if (!suppressClick.current) openEdit([i]); }} onPress={(e) => startPress(e, [i])} onDup={() => duplicate([i])} onUp={i > 0 ? () => move([i], -1) : undefined} onDown={i < draft.blocks.length - 1 ? () => move([i], 1) : undefined} />
                  {b.kind === 'SET' && (
                    <ol className="edit-children">
                      {b.children.map((c, k) => (
                        <li key={k} data-idx={k} style={rowProps([i, k]).style} className={'edit-block child k-' + c.kind + (tried && issues.some((x) => x.path[0] === i && x.path[1] === k) ? ' invalid' : '') + rowProps([i, k]).className}>
                          <BlockRow b={c} d={draft.discipline} onOpen={() => { if (!suppressClick.current) openEdit([i, k]); }} onPress={(e) => startPress(e, [i, k])} onDup={() => duplicate([i, k])} onUp={k > 0 ? () => move([i, k], -1) : undefined} onDown={k < b.children.length - 1 ? () => move([i, k], 1) : undefined} />
                        </li>
                      ))}
                      <li><button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setAddMenu(addMenu === i ? null : i)}><Icon name="plus" size={18} />{$t("Ajouter dans la série")}</button>
                        {addMenu === i && <div className="chips g6" style={{ margin: 0, padding: '0 0 var(--space-8)' }}>{kinds.map((k) => <button key={k} type="button" className="chip" onClick={() => add(k, i)}>{KIND_LABEL[k]}</button>)}</div>}
                      </li>
                    </ol>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-secondary block" onClick={() => setAddMenu(addMenu === -1 ? null : -1)}><Icon name="plus" size={18} />{$t("Ajouter un bloc")}</button>
            {addMenu === -1 && (
              <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
                {[...kinds, 'SET' as BlockKind].map((k) => <button key={k} type="button" className="chip" onClick={() => add(k, -1)}>{k === 'SET' ? $t("Série (répétitions)") : KIND_LABEL[k]}</button>)}
              </div>
            )}
          </section>

          <label className="field">
            <span className="lbl">{$t("Notes")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
            <textarea className="input textarea" rows={3} value={draft.notes ?? ''} placeholder={$t("Consigne générale, parcours, matériel…")} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>

          <section aria-label={$t("Totaux")} aria-live="polite" className="calc-box">
            <div className="between"><span className="c-neutral">{$t("Durée estimée")}</span><strong className={'t-amount-s' + (dur.certainty !== 'exact' ? ' est' : '')}>{dur.certainty === 'unknown' ? '—' : duration(dur.value)}</strong></div>
            <div className="between"><span className="c-neutral">{$t("Distance estimée")}</span><strong className={'t-amount-s' + (dist.certainty !== 'exact' ? ' est' : '')}>{dist.certainty === 'unknown' ? '—' : distanceFor(dist.value, draft.discipline)}</strong></div>
            <span className="t-caption c-moderate">{dur.certainty === 'exact' ? $t("Tous les blocs sont chronométrés. ") : dur.untimed ? $t("{0} bloc(s) sans durée connue, non compté(s). ", { 0: dur.untimed }) : ''}{dur.approx || dist.approx ? $t("Blocs sans cible estimés à ton allure d’endurance (70 % VMA, 90 % CSS). ") : ''}{dur.usedRefs || dist.usedRefs ? $t("Calcul fait avec ta dernière VMA / CSS.") : ''}</span>
          </section>
          {tried && issues.length > 0 && (
            <div role="alert" className="note note-critical">
              <Icon name="alert" size={20} />
              <span className="stack-4"><strong>{$t("À corriger avant d’enregistrer")}</strong>{[...new Set(issues.map((x) => x.code))].map((c) => <span key={c}>{ISSUE_TEXT[c]}</span>)}</span>
            </div>
          )}
        </div>
        <div className="sticky-foot">
          <div className="form-narrow"><button type="button" className="btn btn-primary block" onClick={save}>{existing ? $t("Enregistrer les modifications") : $t("Planifier la séance")}</button></div>
        </div>
      </div>
      {drag?.line && <div className="drop-line" aria-hidden="true" style={{ top: drag.line.y - 1.5, left: drag.line.left, width: drag.line.width }} />}
      {edit && blockAt(edit) && (
        <BlockSheet block={blockAt(edit)} discipline={draft.discipline} isChild={edit.length === 2} refs={d.refs}
          onClose={closeEdit} onApply={(b) => { replaceAt(edit, b); closeEdit(); }} onDelete={() => { replaceAt(edit, null); closeEdit(); }} onDuplicate={() => { duplicate(edit); closeEdit(); }} />
      )}
    </div>
  );
}

function BlockRow({ b, d, onOpen, onPress, onDup, onUp, onDown }: { b: Block; d: PlannedDiscipline; onOpen: () => void; onPress: (e: React.PointerEvent) => void; onDup: () => void; onUp?: () => void; onDown?: () => void }) {
  return (
    <div className="block-row">
      <button type="button" className="block-main" onClick={onOpen} onPointerDown={onPress} onContextMenu={(e: React.MouseEvent) => e.preventDefault()}>
        <span className="block-role">{b.kind === 'SET' ? $t("Série") : KIND_LABEL[b.kind]}</span>
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{b.kind === 'SET' ? blockHead(b) : b.label ?? (blockDetail(b, d) || $t("À compléter"))}</span>
          {b.kind !== 'SET' && b.label && <span className="t-caption c-neutral">{blockDetail(b, d)}</span>}
          {b.discipline && <span className="t-caption c-moderate">{DISCIPLINE_LABEL[b.discipline]}</span>}
        </span>
      </button>
      <span className="block-moves">
        <button type="button" className="icon-btn neutral" aria-label={b.kind === 'SET' ? $t("Dupliquer la série") : $t("Dupliquer le bloc")} onClick={onDup}><Icon name="copy" size={18} /></button>
        <button type="button" className="icon-btn neutral" aria-label={$t("Monter")} disabled={!onUp} onClick={onUp}><Icon name="up" size={18} /></button>
        <button type="button" className="icon-btn neutral" aria-label={$t("Descendre")} disabled={!onDown} onClick={onDown}><Icon name="down" size={18} /></button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ feuille d'un bloc
function BlockSheet({ block, discipline, isChild, refs, onApply, onClose, onDelete, onDuplicate }: { block: Block; discipline: PlannedDiscipline; isChild: boolean; refs: { vma: number | null; css: number | null }; onApply: (b: Block) => void; onClose: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const [b, setB] = useState<Block>(structuredClone(block));
  const eff = b.discipline ?? discipline;
  const isSet = b.kind === 'SET';
  const [low, setLow] = useState<number>(b.targetLow !== null ? toDisp(b.targetType, b.relativeTo, b.targetLow) : defaultDisp(b.targetType, b.relativeTo, eff));
  const [high, setHigh] = useState<number | null>(b.targetHigh !== null ? toDisp(b.targetType, b.relativeTo, b.targetHigh) : null);
  const defaultMeas = (m: Block['measure']) => (m === 'TIME' ? 600 : m === 'DISTANCE' ? (eff === 'SWIM' ? 100 : 400) : 10);
  const [meas, setMeas] = useState<number>(b.measureValue ?? defaultMeas(b.measure));
  const [win, setWin] = useState<number>(b.setWindowS ?? 60);
  /** Choisir un autre type (ou une autre référence) d'intensité : la roulette repart d'une valeur type. */
  const retarget = (type: Block['targetType'], rel: Block['relativeTo']) => { setB({ ...b, targetType: type, relativeTo: rel }); setLow(defaultDisp(type, rel, eff)); setHigh(null); };
  const apply = () => {
    const next: Block = { ...b };
    if (!isSet) {
      next.measureValue = b.measure === 'OPEN' || b.measure === null ? null : meas;
    } else {
      next.setWindowS = b.setMode === 'REPEAT' ? b.setWindowS : win;
      next.measure = null; next.measureValue = null;
    }
    if (isSet) { next.targetType = 'NONE'; next.relativeTo = null; }
    next.targetLow = b.targetType === 'NONE' || isSet ? null : fromDisp(b.targetType, b.relativeTo, low);
    next.targetHigh = b.targetType === 'NONE' || isSet || high === null ? null : fromDisp(b.targetType, b.relativeTo, high);
    if (b.targetType === 'NONE') next.relativeTo = null;
    next.label = b.label?.trim() || null;
    next.notes = b.notes?.trim() || null;
    onApply(next);
  };
  const targetHint = b.relativeTo !== null ? $t("Pourcentage de ta {0}", { 0: REL_LABEL[b.relativeTo] }) + (b.relativeTo === 'VMA' && refs.vma ? $t(" (VMA actuelle {0} km/h)", { 0: toInput(refs.vma * 3.6, 1) }) : b.relativeTo === 'CSS' && refs.css ? $t(" (CSS actuelle {0} /100 m)", { 0: mmss(100 / refs.css) }) : '')
    : b.targetType === 'PACE' ? (eff === 'SWIM' ? $t("Allure aux 100 m, ex. 1:45") : $t("Allure au km, ex. 4:30")) : b.targetType === 'SPEED' ? $t("En km/h") : b.targetType === 'ZONE' ? $t("Zone de 1 à 5") : b.targetType === 'RPE' ? $t("Ressenti de 1 à 10") : b.targetType === 'HR' ? $t("En bpm") : b.targetType === 'POWER' ? $t("En watts") : b.targetType === 'LOAD' ? $t("En kg") : '';
  return (
    <Sheet title={isSet ? $t("Série") : KIND_LABEL[b.kind]} onClose={onClose} full footer={
      <div className="row" style={{ gap: 'var(--space-12)' }}>
        <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={onDelete} aria-label={$t("Supprimer")}><Icon name="trash" size={18} /></button>
        <button type="button" className="btn btn-tertiary" onClick={onDuplicate} aria-label={isSet ? $t("Dupliquer la série") : $t("Dupliquer le bloc")}><Icon name="copy" size={18} /></button>
        <button type="button" className="btn btn-primary grow" onClick={apply}>{$t("Valider le bloc")}</button>
      </div>
    }>
      <div className="stack" style={{ gap: 'var(--space-20)', paddingBottom: 'var(--space-16)' }}>
        {!isSet && (
          <div className="field">
            <span className="lbl">{$t("À quoi sert ce bloc")}</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {BLOCK_KINDS.filter((k) => k !== 'SET' && (discipline === 'BRICK' || k !== 'TRANSITION')).map((k) => <button key={k} type="button" className={'chip chip-k k-' + k} aria-pressed={b.kind === k} onClick={() => setB({ ...b, kind: k, targetType: k === 'REST' ? 'NONE' : b.targetType })}>{KIND_LABEL[k]}</button>)}
            </div>
          </div>
        )}
        {!isSet && <label className="field"><span className="lbl">{discipline === 'STRENGTH' ? $t("Mouvement") : $t("Nom")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
          <input className="input" value={b.label ?? ''} placeholder={discipline === 'STRENGTH' ? $t("Squat, tractions…") : $t("Corps de séance, éducatif…")} onChange={(e) => setB({ ...b, label: e.target.value })} /></label>}
        {isSet ? (
          <>
            <div className="field">
              <span className="lbl">{$t("Comment se répète la série")}</span>
              <div className="seg" role="group">{(['REPEAT', 'EVERY', 'AMRAP'] as const).map((m) => <button key={m} type="button" aria-pressed={b.setMode === m} onClick={() => setB({ ...b, setMode: m })}>{SETMODE_LABEL[m]}</button>)}</div>
              <span className="hint">{b.setMode === 'EVERY' ? $t("Départ toutes les X : la récupération est le reliquat (EMOM, « 8 × 50 départ 1:00 »).") : b.setMode === 'AMRAP' ? $t("Un maximum de tours dans la fenêtre de temps.") : $t("Les blocs de la série sont répétés N fois.")}</span>
            </div>
            {b.setMode !== 'AMRAP' && (
              <div className="field">
                <span className="lbl">{$t("Nombre de tours")}</span>
                <div className="stepper" style={{ maxWidth: 200 }}>
                  <button type="button" aria-label={$t("Un tour de moins")} onClick={() => setB({ ...b, setCount: Math.max(1, (b.setCount ?? 1) - 1) })}><Icon name="minus" size={20} /></button>
                  <IntField label={$t("Nombre de tours")} value={b.setCount} onChange={(v) => setB({ ...b, setCount: v })} min={1} max={200} initial={4} />
                  <button type="button" aria-label={$t("Un tour de plus")} onClick={() => setB({ ...b, setCount: (b.setCount ?? 0) + 1 })}><Icon name="plus" size={20} /></button>
                </div>
              </div>
            )}
            {b.setMode !== 'REPEAT' && (
              <div className="field"><span className="lbl">{b.setMode === 'AMRAP' ? $t("Fenêtre AMRAP") : $t("Départ toutes les")}</span>
                <DurationField value={win} onChange={(v) => setWin(v ?? 60)} label={b.setMode === 'AMRAP' ? $t("Fenêtre AMRAP") : $t("Départ toutes les")} hours={false} />
                <span className="hint">{$t("Minutes et secondes")}</span></div>
            )}
          </>
        ) : (
          <div className="field">
            <span className="lbl">{$t("Ce qui le termine")}</span>
            <div className="seg" role="group">{(['TIME', 'DISTANCE', 'REPS', 'OPEN'] as const).map((m) => <button key={m} type="button" aria-pressed={b.measure === m} onClick={() => { setB({ ...b, measure: m }); setMeas(defaultMeas(m)); }}>{MEASURE_LABEL[m]}</button>)}</div>
            {b.measure !== 'OPEN' && b.measure !== null && <MeasureField measure={b.measure} value={meas} onChange={setMeas} discipline={eff} />}
            {b.measure === 'DISTANCE' && <span className="hint">{$t("Kilomètres et mètres")}</span>}
          </div>
        )}
        {b.kind !== 'REST' && !isSet && (
          <div className="field">
            <span className="lbl">{$t("À quelle intensité")}</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {TARGET_TYPES.map((t) => <button key={t} type="button" className="chip" aria-pressed={b.targetType === t} onClick={() => retarget(t, t === 'PACE' || t === 'SPEED' || t === 'POWER' || t === 'HR' || t === 'LOAD' ? b.relativeTo : null)}>{TARGET_LABEL[t]}</button>)}
            </div>
            {(b.targetType === 'PACE' || b.targetType === 'SPEED' || b.targetType === 'POWER' || b.targetType === 'HR' || b.targetType === 'LOAD') && (
              <select className="input" value={b.relativeTo ?? ''} onChange={(e) => retarget(b.targetType, (e.target.value || null) as Block['relativeTo'])}>
                <option value="">{$t("Valeur absolue")}</option>
                {b.targetType === 'POWER' && <option value="FTP">{$t("% de la FTP")}</option>}
                {(b.targetType === 'PACE' || b.targetType === 'SPEED') && <option value={eff === 'SWIM' ? 'CSS' : 'VMA'}>{eff === 'SWIM' ? $t("% de la CSS (vitesse)") : $t("% de la VMA")}</option>}
                {b.targetType === 'HR' && <option value="HRMAX">{$t("% de la FC max")}</option>}
                {b.targetType === 'LOAD' && <option value="ONE_RM">{$t("% du 1RM")}</option>}
              </select>
            )}
            {b.targetType !== 'NONE' && (
              <div className="stack" style={{ gap: 'var(--space-12)' }}>
                <div className="stack-4"><span className="t-caption-strong">{high === null ? $t("Valeur") : $t("Borne basse")}</span>
                  <TargetField type={b.targetType} rel={b.relativeTo} value={low} onChange={setLow} label={$t("Valeur ou borne basse")} swim={eff === 'SWIM'} /></div>
                {high !== null && <div className="stack-4"><span className="t-caption-strong">{$t("Borne haute")}</span>
                  <TargetField type={b.targetType} rel={b.relativeTo} value={high} onChange={setHigh} label={$t("Borne haute (facultatif)")} swim={eff === 'SWIM'} /></div>}
                <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', height: 36 }} onClick={() => setHigh(high === null ? low : null)}>{high === null ? $t("Ajouter une borne haute (fourchette)") : $t("Retirer la borne haute")}</button>
              </div>
            )}
            {targetHint && <span className="hint">{targetHint}{$t(". Borne haute facultative (fourchette).")}</span>}
          </div>
        )}
        {discipline === 'BRICK' && !isChild && !isSet && (
          <div className="field">
            <span className="lbl">{$t("Discipline de ce bloc")}</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              <button type="button" className="chip" aria-pressed={b.discipline === null} onClick={() => setB({ ...b, discipline: null })}>{$t("Celle de la séance")}</button>
              {(['BIKE', 'RUN', 'SWIM'] as const).map((x) => <button key={x} type="button" className="chip" aria-pressed={b.discipline === x} onClick={() => setB({ ...b, discipline: x })}>{DISCIPLINE_LABEL[x]}</button>)}
            </div>
          </div>
        )}
        <label className="field"><span className="lbl">{$t("Consigne")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span>
          <textarea className="input textarea" rows={2} value={b.notes ?? ''} placeholder={$t("Éducatif, matériel, sensation recherchée…")} onChange={(e) => setB({ ...b, notes: e.target.value })} /></label>
      </div>
    </Sheet>
  );
}
