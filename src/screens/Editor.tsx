// Éditeur de séance planifiée (plein écran, comme « Nouvel achat » de PEAnalyze) et feuille d'un bloc.
// Ergonomie revue : modèles de départ par discipline, durée/distance totales recalculées en direct,
// réordonnancement par flèches, enfants d'une série éditables en place, erreurs listées en clair avant
// l'enregistrement, saisie des allures en « 4:30 ».
import { useMemo, useState } from 'react';
import { DatePicker, DiscIcon, Sheet, SubHeader, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { back, navigate, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { restore, savePlanned } from '../data/actions';
import { estimateDistance, estimateDuration, ISSUE_TEXT, newBlock, validateSession } from '../domain/blocks';
import { newId, nowIso } from '../domain/ids';
import type { Block, BlockKind, PlannedDiscipline, PlannedSession } from '../domain/types';
import { BLOCK_KINDS, PLANNED_DISCIPLINES, TARGET_TYPES } from '../domain/types';
import { blockDetail, blockHead, dayTitle, DISCIPLINE_LABEL, distanceFor, duration, KIND_LABEL, MEASURE_LABEL, mmss, parseMmss, parseNum, REL_LABEL, SETMODE_LABEL, TARGET_LABEL, toInput, DISCIPLINE_SHORT } from '../ui/format';

const B = (o: Partial<Block>): Block => ({ ...newBlock(o.kind ?? 'WORK'), ...o });
const TEMPLATES: Record<PlannedDiscipline, { label: string; blocks: () => Block[] }[]> = {
  RUN: [
    { label: 'Footing 45 min', blocks: () => [B({ kind: 'WARMUP', measureValue: 600 }), B({ measureValue: 1800, targetType: 'ZONE', targetLow: 2 }), B({ kind: 'COOLDOWN', measureValue: 300 })] },
    { label: 'Fractionné 6 × 400 m', blocks: () => [B({ kind: 'WARMUP', measureValue: 1200 }), B({ kind: 'SET', setCount: 6, children: [B({ measure: 'DISTANCE', measureValue: 400, targetType: 'PACE', targetLow: 240 }), B({ kind: 'RECOVERY', measureValue: 90 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })] },
    { label: 'Sortie longue 1 h 30', blocks: () => [B({ measureValue: 5400, targetType: 'ZONE', targetLow: 2 })] },
  ],
  BIKE: [
    { label: 'Endurance 1 h 30', blocks: () => [B({ kind: 'WARMUP', measureValue: 900 }), B({ measureValue: 4500, targetType: 'ZONE', targetLow: 2 })] },
    { label: 'Seuil 3 × 10 min', blocks: () => [B({ kind: 'WARMUP', measureValue: 900 }), B({ kind: 'SET', setCount: 3, children: [B({ measureValue: 600, targetType: 'ZONE', targetLow: 4 }), B({ kind: 'RECOVERY', measureValue: 300 })] }), B({ kind: 'COOLDOWN', measureValue: 600 })] },
  ],
  SWIM: [
    { label: 'Technique 1 800 m', blocks: () => [B({ kind: 'WARMUP', measure: 'DISTANCE', measureValue: 300 }), B({ kind: 'SET', setMode: 'EVERY', setCount: 8, setWindowS: 60, children: [B({ measure: 'DISTANCE', measureValue: 50, notes: 'Éducatif au choix' })] }), B({ measure: 'DISTANCE', measureValue: 800, targetType: 'ZONE', targetLow: 2 }), B({ kind: 'COOLDOWN', measure: 'DISTANCE', measureValue: 300 })] },
    { label: '10 × 100 m CSS', blocks: () => [B({ kind: 'WARMUP', measure: 'DISTANCE', measureValue: 400 }), B({ kind: 'SET', setCount: 10, children: [B({ measure: 'DISTANCE', measureValue: 100, targetType: 'PACE', targetLow: 100, relativeTo: 'CSS' }), B({ kind: 'REST', measureValue: 20 })] }), B({ kind: 'COOLDOWN', measure: 'DISTANCE', measureValue: 200 })] },
  ],
  STRENGTH: [
    { label: 'Circuit 45 min', blocks: () => [B({ kind: 'WARMUP', measureValue: 600 }), B({ kind: 'SET', setCount: 4, children: [B({ measure: 'REPS', measureValue: 10, label: 'Squat' }), B({ measure: 'REPS', measureValue: 10, label: 'Pompes' }), B({ kind: 'REST', measureValue: 90 })] })] },
  ],
  BRICK: [
    { label: 'Vélo 1 h + course 20 min', blocks: () => [B({ measureValue: 3600, discipline: 'BIKE', targetType: 'ZONE', targetLow: 2 }), B({ kind: 'TRANSITION', measure: 'OPEN', measureValue: null }), B({ measureValue: 1200, discipline: 'RUN', targetType: 'ZONE', targetLow: 3 })] },
  ],
};

type Path = [number] | [number, number];

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
  const add = (kind: BlockKind, parent: number) => {
    const bl = structuredClone(draft.blocks);
    const b = newBlock(kind);
    if (parent < 0) { bl.push(b); setBlocks(bl); setEdit([bl.length - 1]); }
    else { bl[parent].children.push(b); setBlocks(bl); setEdit([parent, bl[parent].children.length - 1]); }
    setAddMenu(null);
  };
  const save = () => {
    setTried(true);
    if (issues.length) return;
    const snap = savePlanned({ ...draft, title: draft.title?.trim() || null, notes: draft.notes?.trim() || null, discipline: draft.discipline });
    if (existing) back('/calendrier/prevue/' + draft.id);
    else navigate('/calendrier/prevue/' + draft.id, { replace: true });
    showToast(existing ? 'Séance modifiée' : 'Séance planifiée le ' + dayTitle(draft.plannedDate).toLowerCase(), { undo: () => restore(snap) });
  };
  const brick = draft.discipline === 'BRICK';
  const kinds = BLOCK_KINDS.filter((k) => k !== 'SET' && (brick || k !== 'TRANSITION'));

  return (
    <div className="screen screen-white" data-screen="editeur">
      <SubHeader title={existing ? 'Modifier la séance' : 'Nouvelle séance'} fallback="/calendrier" close bordered />
      <div className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin) var(--space-24)' }}>
          <div className="field">
            <span className="lbl">Discipline</span>
            <div className="disc-picker" role="radiogroup" aria-label="Discipline">
              {PLANNED_DISCIPLINES.map((x) => (
                <button key={x} type="button" role="radio" aria-checked={draft.discipline === x} className={'disc-pick' + (draft.discipline === x ? ' on' : '')} style={{ ['--c' as string]: `var(--d-${x})` }} onClick={() => setDraft({ ...draft, discipline: x, blocks: x === 'BRICK' || draft.discipline !== 'BRICK' ? draft.blocks : draft.blocks.map((b) => ({ ...b, discipline: null })) })}>
                  <DiscIcon d={x} size={36} /><span className="t-caption-strong">{DISCIPLINE_SHORT[x]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="lbl">Date</span>
            <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} aria-expanded={cal} onClick={() => setCal(!cal)}>
              <span>{dayTitle(draft.plannedDate)} {draft.plannedDate.slice(0, 4)}</span><Icon name="calendar" size={20} style={{ color: 'var(--primary-fg)' }} />
            </button>
            {cal && <DatePicker value={draft.plannedDate} label="Date de la séance" onChange={(v) => { setDraft({ ...draft, plannedDate: v }); setCal(false); }} />}
          </div>
          <label className="field">
            <span className="lbl">Titre <span className="c-moderate" style={{ fontWeight: 400 }}>(facultatif)</span></span>
            <input className="input" value={draft.title ?? ''} placeholder="Fractionné seuil, sortie longue…" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>

          <section className="stack-8" aria-label="Blocs">
            <div className="between"><span className="lbl t-label">Blocs</span><span className="t-caption c-moderate">{draft.blocks.length} bloc{draft.blocks.length > 1 ? 's' : ''}</span></div>
            {!draft.blocks.length && (
              <div className="stack-8">
                <p className="t-caption c-moderate">Pars d’un modèle ou ajoute les blocs un par un.</p>
                <div className="chips">
                  {TEMPLATES[draft.discipline].map((t) => <button key={t.label} type="button" className="chip" onClick={() => setDraft({ ...draft, blocks: t.blocks(), title: draft.title || t.label })}>{t.label}</button>)}
                </div>
              </div>
            )}
            <ol className="edit-blocks">
              {draft.blocks.map((b, i) => (
                <li key={i} className={'edit-block k-' + b.kind + (tried && issues.some((x) => x.path[0] === i) ? ' invalid' : '')}>
                  <BlockRow b={b} d={draft.discipline} onOpen={() => setEdit([i])} onUp={i > 0 ? () => move([i], -1) : undefined} onDown={i < draft.blocks.length - 1 ? () => move([i], 1) : undefined} />
                  {b.kind === 'SET' && (
                    <ol className="edit-children">
                      {b.children.map((c, k) => (
                        <li key={k} className={'edit-block child k-' + c.kind + (tried && issues.some((x) => x.path[0] === i && x.path[1] === k) ? ' invalid' : '')}>
                          <BlockRow b={c} d={draft.discipline} onOpen={() => setEdit([i, k])} onUp={k > 0 ? () => move([i, k], -1) : undefined} onDown={k < b.children.length - 1 ? () => move([i, k], 1) : undefined} />
                        </li>
                      ))}
                      <li><button type="button" className="btn btn-tertiary" style={{ minHeight: 36 }} onClick={() => setAddMenu(addMenu === i ? null : i)}><Icon name="plus" size={18} />Ajouter dans la série</button>
                        {addMenu === i && <div className="chips g6" style={{ margin: 0, padding: '0 0 var(--space-8)' }}>{kinds.map((k) => <button key={k} type="button" className="chip" onClick={() => add(k, i)}>{KIND_LABEL[k]}</button>)}</div>}
                      </li>
                    </ol>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-secondary block" onClick={() => setAddMenu(addMenu === -1 ? null : -1)}><Icon name="plus" size={18} />Ajouter un bloc</button>
            {addMenu === -1 && (
              <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
                {[...kinds, 'SET' as BlockKind].map((k) => <button key={k} type="button" className="chip" onClick={() => add(k, -1)}>{k === 'SET' ? 'Série (répétitions)' : KIND_LABEL[k]}</button>)}
              </div>
            )}
          </section>

          <label className="field">
            <span className="lbl">Notes <span className="c-moderate" style={{ fontWeight: 400 }}>(facultatif)</span></span>
            <textarea className="input textarea" rows={3} value={draft.notes ?? ''} placeholder="Consigne générale, parcours, matériel…" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>

          <section aria-label="Totaux" aria-live="polite" className="calc-box">
            <div className="between"><span className="c-neutral">Durée estimée</span><strong className={'t-amount-s' + (dur.certainty !== 'exact' ? ' est' : '')}>{dur.certainty === 'unknown' ? '—' : duration(dur.value)}</strong></div>
            <div className="between"><span className="c-neutral">Distance estimée</span><strong className={'t-amount-s' + (dist.certainty !== 'exact' ? ' est' : '')}>{dist.certainty === 'unknown' ? '—' : distanceFor(dist.value, draft.discipline)}</strong></div>
            <span className="t-caption c-moderate">{dur.certainty === 'exact' ? 'Tous les blocs sont chronométrés. ' : dur.untimed ? `${dur.untimed} bloc(s) sans durée connue, non compté(s). ` : ''}{dur.approx || dist.approx ? 'Blocs sans cible estimés à ton allure d’endurance (70 % VMA, 90 % CSS). ' : ''}{dur.usedRefs || dist.usedRefs ? 'Calcul fait avec ta dernière VMA / CSS.' : ''}</span>
          </section>
          {tried && issues.length > 0 && (
            <div role="alert" className="note note-critical">
              <Icon name="alert" size={20} />
              <span className="stack-4"><strong>À corriger avant d’enregistrer</strong>{[...new Set(issues.map((x) => x.code))].map((c) => <span key={c}>{ISSUE_TEXT[c]}</span>)}</span>
            </div>
          )}
        </div>
        <div className="sticky-foot">
          <div className="form-narrow"><button type="button" className="btn btn-primary block" onClick={save}>{existing ? 'Enregistrer les modifications' : 'Planifier la séance'}</button></div>
        </div>
      </div>
      {edit && blockAt(edit) && (
        <BlockSheet block={blockAt(edit)} discipline={draft.discipline} isChild={edit.length === 2} refs={d.refs}
          onClose={() => setEdit(null)} onApply={(b) => { replaceAt(edit, b); setEdit(null); }} onDelete={() => { replaceAt(edit, null); setEdit(null); }} />
      )}
    </div>
  );
}

function BlockRow({ b, d, onOpen, onUp, onDown }: { b: Block; d: PlannedDiscipline; onOpen: () => void; onUp?: () => void; onDown?: () => void }) {
  return (
    <div className="block-row">
      <button type="button" className="block-main" onClick={onOpen}>
        <span className="block-role">{b.kind === 'SET' ? 'Série' : KIND_LABEL[b.kind]}</span>
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{b.kind === 'SET' ? blockHead(b) : b.label ?? (blockDetail(b, d) || 'À compléter')}</span>
          {b.kind !== 'SET' && b.label && <span className="t-caption c-neutral">{blockDetail(b, d)}</span>}
          {b.discipline && <span className="t-caption c-moderate">{DISCIPLINE_LABEL[b.discipline]}</span>}
        </span>
      </button>
      <span className="block-moves">
        <button type="button" className="icon-btn neutral" aria-label="Monter" disabled={!onUp} onClick={onUp}><Icon name="up" size={18} /></button>
        <button type="button" className="icon-btn neutral" aria-label="Descendre" disabled={!onDown} onClick={onDown}><Icon name="down" size={18} /></button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ feuille d'un bloc
function BlockSheet({ block, discipline, isChild, refs, onApply, onClose, onDelete }: { block: Block; discipline: PlannedDiscipline; isChild: boolean; refs: { vma: number | null; css: number | null }; onApply: (b: Block) => void; onClose: () => void; onDelete: () => void }) {
  const [b, setB] = useState<Block>(structuredClone(block));
  const eff = b.discipline ?? discipline;
  const isSet = b.kind === 'SET';
  const paceLike = b.targetType === 'PACE' && b.relativeTo === null;
  const fmtTarget = (v: number | null) => (v === null ? '' : paceLike ? mmss(v) : b.targetType === 'SPEED' && b.relativeTo === null ? toInput(v * 3.6, 1) : toInput(v, b.targetType === 'LOAD' ? 1 : 0));
  const [low, setLow] = useState(fmtTarget(b.targetLow));
  const [high, setHigh] = useState(fmtTarget(b.targetHigh));
  const [meas, setMeas] = useState(b.measureValue === null ? '' : b.measure === 'TIME' ? mmss(b.measureValue) : toInput(b.measureValue));
  const [win, setWin] = useState(b.setWindowS === null ? '' : mmss(b.setWindowS));
  const parseTarget = (s: string): number | null => {
    if (!s.trim()) return null;
    const v = paceLike ? parseMmss(s) : parseNum(s);
    if (!isFinite(v)) return null;
    return b.targetType === 'SPEED' && b.relativeTo === null ? v / 3.6 : v;
  };
  const apply = () => {
    const next: Block = { ...b };
    if (!isSet) {
      const m = !meas.trim() ? null : b.measure === 'TIME' ? parseMmss(meas) : parseNum(meas);
      next.measureValue = b.measure === 'OPEN' || m === null || !isFinite(m) ? null : m;
    } else {
      const w = win.trim() ? parseMmss(win) : NaN;
      next.setWindowS = isFinite(w) ? w : null;
      next.measure = null; next.measureValue = null;
    }
    next.targetLow = b.targetType === 'NONE' ? null : parseTarget(low);
    next.targetHigh = b.targetType === 'NONE' ? null : parseTarget(high);
    if (b.targetType === 'NONE') next.relativeTo = null;
    next.label = b.label?.trim() || null;
    next.notes = b.notes?.trim() || null;
    onApply(next);
  };
  const measureHint = b.measure === 'TIME' ? 'Minutes et secondes, ex. 10:00 (ou 10 pour 10 min)' : b.measure === 'DISTANCE' ? 'En mètres, ex. 400' : b.measure === 'REPS' ? 'Nombre de répétitions' : '';
  const targetHint = b.relativeTo !== null ? `Pourcentage de ta ${REL_LABEL[b.relativeTo]}` + (b.relativeTo === 'VMA' && refs.vma ? ` (VMA actuelle ${toInput(refs.vma * 3.6, 1)} km/h)` : b.relativeTo === 'CSS' && refs.css ? ` (CSS actuelle ${mmss(100 / refs.css)} /100 m)` : '')
    : b.targetType === 'PACE' ? (eff === 'SWIM' ? 'Allure aux 100 m, ex. 1:45' : 'Allure au km, ex. 4:30') : b.targetType === 'SPEED' ? 'En km/h' : b.targetType === 'ZONE' ? 'Zone de 1 à 5' : b.targetType === 'RPE' ? 'Ressenti de 1 à 10' : b.targetType === 'HR' ? 'En bpm' : b.targetType === 'POWER' ? 'En watts' : b.targetType === 'LOAD' ? 'En kg' : '';
  return (
    <Sheet title={isSet ? 'Série' : KIND_LABEL[b.kind]} onClose={onClose} full footer={
      <div className="row" style={{ gap: 'var(--space-12)' }}>
        <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={onDelete}><Icon name="trash" size={18} />Supprimer</button>
        <button type="button" className="btn btn-primary grow" onClick={apply}>Valider le bloc</button>
      </div>
    }>
      <div className="stack" style={{ gap: 'var(--space-20)', paddingBottom: 'var(--space-16)' }}>
        {!isSet && (
          <div className="field">
            <span className="lbl">À quoi sert ce bloc</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {BLOCK_KINDS.filter((k) => k !== 'SET' && (discipline === 'BRICK' || k !== 'TRANSITION')).map((k) => <button key={k} type="button" className="chip" aria-pressed={b.kind === k} onClick={() => setB({ ...b, kind: k, targetType: k === 'REST' ? 'NONE' : b.targetType })}>{KIND_LABEL[k]}</button>)}
            </div>
          </div>
        )}
        {isSet ? (
          <>
            <div className="field">
              <span className="lbl">Comment se répète la série</span>
              <div className="seg" role="group">{(['REPEAT', 'EVERY', 'AMRAP'] as const).map((m) => <button key={m} type="button" aria-pressed={b.setMode === m} onClick={() => setB({ ...b, setMode: m })}>{SETMODE_LABEL[m]}</button>)}</div>
              <span className="hint">{b.setMode === 'EVERY' ? 'Départ toutes les X : la récupération est le reliquat (EMOM, « 8 × 50 départ 1:00 »).' : b.setMode === 'AMRAP' ? 'Un maximum de tours dans la fenêtre de temps.' : 'Les blocs de la série sont répétés N fois.'}</span>
            </div>
            {b.setMode !== 'AMRAP' && (
              <div className="field">
                <span className="lbl">Nombre de tours</span>
                <div className="stepper" style={{ maxWidth: 200 }}>
                  <button type="button" aria-label="Un tour de moins" onClick={() => setB({ ...b, setCount: Math.max(1, (b.setCount ?? 1) - 1) })}><Icon name="minus" size={20} /></button>
                  <input inputMode="numeric" value={b.setCount ?? ''} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setB({ ...b, setCount: isFinite(v) && v > 0 ? v : null }); }} />
                  <button type="button" aria-label="Un tour de plus" onClick={() => setB({ ...b, setCount: (b.setCount ?? 0) + 1 })}><Icon name="plus" size={20} /></button>
                </div>
              </div>
            )}
            {b.setMode !== 'REPEAT' && (
              <label className="field"><span className="lbl">{b.setMode === 'AMRAP' ? 'Fenêtre AMRAP' : 'Départ toutes les'}</span>
                <input className="input num" inputMode="decimal" value={win} placeholder="1:00" onChange={(e) => setWin(e.target.value)} /><span className="hint">Minutes et secondes</span></label>
            )}
          </>
        ) : (
          <div className="field">
            <span className="lbl">Ce qui le termine</span>
            <div className="seg" role="group">{(['TIME', 'DISTANCE', 'REPS', 'OPEN'] as const).map((m) => <button key={m} type="button" aria-pressed={b.measure === m} onClick={() => { setB({ ...b, measure: m }); setMeas(''); }}>{MEASURE_LABEL[m]}</button>)}</div>
            {b.measure !== 'OPEN' && <input className="input num" inputMode="decimal" aria-label={measureHint} value={meas} placeholder={b.measure === 'TIME' ? '10:00' : b.measure === 'DISTANCE' ? '400' : '10'} onChange={(e) => setMeas(e.target.value)} />}
            {measureHint && <span className="hint">{measureHint}</span>}
          </div>
        )}
        {b.kind !== 'REST' && (
          <div className="field">
            <span className="lbl">À quelle intensité</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {TARGET_TYPES.map((t) => <button key={t} type="button" className="chip" aria-pressed={b.targetType === t} onClick={() => { setB({ ...b, targetType: t, relativeTo: t === 'PACE' || t === 'SPEED' || t === 'POWER' || t === 'HR' || t === 'LOAD' ? b.relativeTo : null }); setLow(''); setHigh(''); }}>{TARGET_LABEL[t]}</button>)}
            </div>
            {(b.targetType === 'PACE' || b.targetType === 'SPEED' || b.targetType === 'POWER' || b.targetType === 'HR' || b.targetType === 'LOAD') && (
              <select className="input" value={b.relativeTo ?? ''} onChange={(e) => { setB({ ...b, relativeTo: (e.target.value || null) as Block['relativeTo'] }); setLow(''); setHigh(''); }}>
                <option value="">Valeur absolue</option>
                {b.targetType === 'POWER' && <option value="FTP">% de la FTP</option>}
                {(b.targetType === 'PACE' || b.targetType === 'SPEED') && <option value={eff === 'SWIM' ? 'CSS' : 'VMA'}>{eff === 'SWIM' ? '% de la CSS (vitesse)' : '% de la VMA'}</option>}
                {b.targetType === 'HR' && <option value="HRMAX">% de la FC max</option>}
                {b.targetType === 'LOAD' && <option value="ONE_RM">% du 1RM</option>}
              </select>
            )}
            {b.targetType !== 'NONE' && (
              <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
                <input className="input num" inputMode="decimal" aria-label="Valeur ou borne basse" placeholder="Valeur" value={low} onChange={(e) => setLow(e.target.value)} />
                <input className="input num" inputMode="decimal" aria-label="Borne haute (facultatif)" placeholder="Borne haute" value={high} onChange={(e) => setHigh(e.target.value)} />
              </div>
            )}
            {targetHint && <span className="hint">{targetHint}. Borne haute facultative (fourchette).</span>}
          </div>
        )}
        {discipline === 'BRICK' && !isChild && !isSet && (
          <div className="field">
            <span className="lbl">Discipline de ce bloc</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              <button type="button" className="chip" aria-pressed={b.discipline === null} onClick={() => setB({ ...b, discipline: null })}>Celle de la séance</button>
              {(['BIKE', 'RUN', 'SWIM'] as const).map((x) => <button key={x} type="button" className="chip" aria-pressed={b.discipline === x} onClick={() => setB({ ...b, discipline: x })}>{DISCIPLINE_LABEL[x]}</button>)}
            </div>
          </div>
        )}
        <label className="field"><span className="lbl">{discipline === 'STRENGTH' ? 'Mouvement' : 'Nom'} <span className="c-moderate" style={{ fontWeight: 400 }}>(facultatif)</span></span>
          <input className="input" value={b.label ?? ''} placeholder={discipline === 'STRENGTH' ? 'Squat, tractions…' : 'Corps de séance, éducatif…'} onChange={(e) => setB({ ...b, label: e.target.value })} /></label>
        <label className="field"><span className="lbl">Consigne <span className="c-moderate" style={{ fontWeight: 400 }}>(facultatif)</span></span>
          <textarea className="input textarea" rows={2} value={b.notes ?? ''} placeholder="Éducatif, matériel, sensation recherchée…" onChange={(e) => setB({ ...b, notes: e.target.value })} /></label>
      </div>
    </Sheet>
  );
}
