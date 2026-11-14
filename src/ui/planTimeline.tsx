// Plan de séance : frise horizontale de la séance prévue, à l'échelle du temps.
//  · une barre par bloc (couleur = discipline, hauteur = intensité, rayée = transition) ; toucher une barre en donne le détail ;
//  · au-dessus, les aliments du « Pendant » aux bons moments (une prise = ses pictogrammes), la boisson en bandeau ;
//  · bouton plein écran, comme les courbes d'un bilan : la frise se met en travers si le téléphone est tenu droit,
//    avec zoom (×1 à ×8) et déplacement au doigt ou aux flèches.
import { $t } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { Icon } from './icons';
import { useWidth } from './kit';
import { DISCIPLINE_LABEL, KIND_LABEL, NBSP, distanceFor, duration, dvar, targetText } from './format';
import { planTimeline, timeTicks, type SegDisc, type TlSeg } from '../domain/planTimeline';
import { foodIcon, type BankFood } from '../domain/foods';
import { isDrinkEv, isSlotEv, qtyText, type NutriEvent, type NutriPlan } from '../domain/nutrition';
import type { RefValues } from '../domain/blocks';
import type { PlannedSession } from '../domain/types';

const mmLabel = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : m + '′'; };
const segLabel = (s: number) => (s >= 3600 ? Math.floor(s / 3600) + 'h' + String(Math.round((s % 3600) / 60)).padStart(2, '0') : s >= 90 ? Math.round(s / 60) + '′' : Math.round(s) + '″');

type Sel = { t: 'seg'; i: number } | { t: 'food'; e: string } | null;
const FOOD_H = 62, AXIS_H = 20;

interface TlProps {
  p: Pick<PlannedSession, 'discipline' | 'blocks'>;
  refs: RefValues;
  plan: NutriPlan | null;
  byId: Map<string, BankFood>;
  width: number;
  /** hauteur de la zone des barres */
  barsH: number;
  rotated?: boolean;
  zoom: number;
  start: number;
  onPan?: (startS: number) => void;
  sel: Sel;
  setSel: (s: Sel) => void;
}

function Timeline(q: TlProps) {
  const tl = useMemo(() => planTimeline(q.p, q.refs), [q.p, q.refs]);
  const total = Math.max(60, tl.totalS);
  const span = total / q.zoom;
  const start = Math.min(Math.max(0, q.start), total - span);
  const pps = q.width / span;
  const X = (s: number) => (s - start) * pps;
  const events = (q.plan?.events ?? []).filter((e) => e.phase === 'during');
  const slots = events.filter((e) => isSlotEv(e) && e.items.length);
  const drinks = events.filter((e) => isDrinkEv(e) && e.items.length);
  const drag = useRef<{ x: number; s: number; moved: boolean } | null>(null);
  const lastMoved = useRef(false);
  const ticks = timeTicks(span, Math.max(3, Math.floor(q.width / 54)));
  const first = Math.ceil(start / ticks.step) * ticks.step;
  const axis: number[] = [];
  for (let x = first; x <= start + span + 1e-6; x += ticks.step) axis.push(x);
  const dpos = (e: RPointerEvent) => (q.rotated ? e.clientY : e.clientX);
  const down = (e: RPointerEvent<HTMLDivElement>) => { if (q.zoom > 1 && q.onPan) { drag.current = { x: dpos(e), s: start, moved: false }; lastMoved.current = false; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignoré */ } } };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const dx = dpos(e) - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) q.onPan?.(Math.min(Math.max(0, d.s - dx / pps), total - span));
  };
  const up = () => { lastMoved.current = !!drag.current?.moved; drag.current = null; };
  const pick = (s: Sel) => { if (lastMoved.current) { lastMoved.current = false; return; } q.setSel(s); };
  const selSeg = q.sel?.t === 'seg' ? q.sel.i : -1;

  return (
    <div className="ptl" style={{ width: q.width, height: FOOD_H + q.barsH + AXIS_H }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {/* aliments du Pendant */}
      <div className="ptl-food" style={{ height: FOOD_H }}>
        {drinks.map((drink) => {
          const x0 = X(drink.atMin * 60), x1 = X((drink.toMin ?? total / 60) * 60);
          const l = Math.max(0, x0), r = Math.min(q.width, x1);
          if (r <= l) return null;
          return (
            <button key={drink.id} type="button" className={'ptl-drink' + (q.sel?.t === 'food' && q.sel.e === drink.id ? ' on' : '')} onClick={() => pick({ t: 'food', e: drink.id })} aria-label={$t("Boisson")} style={{ left: l, width: r - l - 2 }}>
              <Icon name={foodIcon(q.byId.get(drink.items[0].foodId) ?? { id: drink.items[0].foodId, category: 'drink' })} size={14} />
              <span className="ptl-drink-t">{drink.items.map((x) => (x.ml > 0 ? Math.round(x.ml) + ' ml' : qtyText(x)) + ' ' + x.name).join(' + ')} {$t("par heure")}</span>
            </button>
          );
        })}
        {slots.map((e) => {
          const x = X(e.atMin * 60);
          if (x < -20 || x > q.width + 20) return null;
          const on = q.sel?.t === 'food' && q.sel.e === e.id;
          return (
            <button key={e.id} type="button" className={'ptl-take' + (on ? ' on' : '')} style={{ left: x }} onClick={() => pick({ t: 'food', e: e.id })} aria-label={$t("Prise à {0}", { 0: mmLabel(e.atMin * 60) })}>
              <span className="ptl-take-ico">{e.items.map((it) => <span key={it.foodId} className="nico"><Icon name={foodIcon(q.byId.get(it.foodId) ?? { id: it.foodId, category: 'bar' })} size={16} /></span>)}</span>
              <span className="ptl-take-q">{e.items.map((it) => qtyText(it)).join(' · ')}</span>
            </button>
          );
        })}
      </div>
      {/* blocs */}
      <div className="ptl-bars" style={{ height: q.barsH }}>
        {tl.segs.map((s, i) => {
          const x = X(s.startS), w = s.durS * pps;
          if (x + w < 0 || x > q.width) return null;
          const h = Math.max(10, s.level * q.barsH);
          const cls = 'ptl-seg k-' + s.kind + (s.unknown ? ' unk' : '') + (selSeg === i ? ' on' : '');
          return (
            <button key={s.key} type="button" className={cls} onClick={() => pick({ t: 'seg', i })} aria-label={KIND_LABEL[s.kind] + ' ' + (s.unknown ? '' : duration(s.durS))}
              style={{ left: x, width: Math.max(3, w - 1.5), height: h, ['--sc' as string]: dvar(s.disc) }}>
              {w >= 34 && !s.unknown && <span className="ptl-seg-t">{segLabel(s.durS)}</span>}
            </button>
          );
        })}
        {tl.segs.length === 0 && <span className="t-caption c-moderate" style={{ padding: 8 }}>{$t("Aucun bloc.")}</span>}
      </div>
      {/* axe du temps */}
      <div className="ptl-axis" style={{ height: AXIS_H }}>
        {axis.map((s, i) => <span key={s} className="schart-t" style={{ left: X(s), transform: i === 0 && X(s) < 12 ? 'none' : 'translateX(-50%)' }}>{mmLabel(s)}</span>)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ détail d'une barre ou d'une prise
function Detail({ p, refs, plan, byId, sel, onClose }: { p: Pick<PlannedSession, 'discipline' | 'blocks'>; refs: RefValues; plan: NutriPlan | null; byId: Map<string, BankFood>; sel: Sel; onClose: () => void; compact?: boolean }) {
  const tl = useMemo(() => planTimeline(p, refs), [p, refs]);
  if (!sel) return <p className="t-caption c-moderate ptl-hint">{$t("Touche un bloc ou un aliment pour en voir le détail.")}</p>;
  const close = <button type="button" className="icon-btn" aria-label={$t("Fermer")} onClick={onClose} style={{ flex: 'none' }}><Icon name="close" size={18} /></button>;
  if (sel.t === 'food') {
    const e: NutriEvent | undefined = plan?.events.find((x) => x.id === sel.e);
    if (!e) return null;
    const drinkEv = isDrinkEv(e);
    return (
      <div className="ptl-detail">
        <div className="between"><span className="t-strong">{drinkEv ? $t("Boire") : $t("Prise à {0}", { 0: mmLabel(e.atMin * 60) })}</span>{close}</div>
        <ul className="stack" style={{ gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
          {e.items.map((it) => (
            <li key={it.foodId} className="row" style={{ gap: 8 }}><span className="nico"><Icon name={foodIcon(byId.get(it.foodId) ?? { id: it.foodId, category: 'bar' })} size={18} /></span><span><b>{it.ml > 0 ? Math.round(it.ml) + ' ml' : qtyText(it)}</b> {it.name}{drinkEv ? ' · ' + $t("par heure") : ''}</span></li>
          ))}
        </ul>
        {e.carbsG >= 1 && <span className="t-caption c-moderate">{$t("≈ {0} g de glucides", { 0: Math.round(e.carbsG) })}</span>}
      </div>
    );
  }
  const s: TlSeg | undefined = tl.segs[sel.i];
  if (!s) return null;
  const disc = (s.block.discipline && s.block.discipline !== 'BRICK' ? s.block.discipline : s.disc) as SegDisc;
  const end = s.startS + s.durS;
  const inside = (plan?.events ?? []).filter((e) => e.phase === 'during' && isSlotEv(e) && e.atMin * 60 >= s.startS && e.atMin * 60 < end);
  const mText = mmLabel(s.startS) + ' → ' + (s.unknown ? '?' : mmLabel(end));
  return (
    <div className="ptl-detail">
      <div className="between" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <span className="dot s10" style={{ background: s.kind === 'TRANSITION' ? 'var(--text-moderate)' : dvar(disc) }} />
          <span className="t-strong">{KIND_LABEL[s.kind]}{s.block.label ? ' — ' + s.block.label : ''}</span>
        </span>
        {close}
      </div>
      <span className="t-caption c-neutral">{DISCIPLINE_LABEL[disc]}{s.rep ? ' · ' + $t("répétition {0}/{1}", { 0: s.rep.i, 1: s.rep.n }) : ''} · {mText}</span>
      <dl className="kv" style={{ margin: 0 }}>
        <dt>{$t("Durée")}</dt><dd>{s.unknown ? $t("non précisée") : (s.estimated ? '≈ ' : '') + duration(Math.round(s.durS))}</dd>
        {s.metres !== null && s.metres > 0 && <><dt>{$t("Distance")}</dt><dd>{s.block.measure === 'DISTANCE' ? '' : '≈ '}{distanceFor(s.metres, disc)}</dd></>}
        {targetText(s.block, disc) && <><dt>{$t("Cible")}</dt><dd>{targetText(s.block, disc)}</dd></>}
      </dl>
      {s.block.notes && <span className="t-caption c-moderate">{s.block.notes}</span>}
      {inside.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="t-caption-strong">{$t("À manger pendant ce bloc")}</span>
          {inside.map((e) => <span key={e.id} className="t-caption">{mmLabel(e.atMin * 60)} · {e.items.map((it) => qtyText(it) + NBSP + it.name).join(' + ')}</span>)}
        </div>
      )}
    </div>
  );
}

function Legend({ p, refs }: { p: Pick<PlannedSession, 'discipline' | 'blocks'>; refs: RefValues }) {
  const tl = useMemo(() => planTimeline(p, refs), [p, refs]);
  const discs = [...new Set(tl.segs.filter((s) => s.kind !== 'TRANSITION').map((s) => s.disc))];
  const hasT = tl.segs.some((s) => s.kind === 'TRANSITION');
  if (p.discipline !== 'BRICK' && discs.length < 2) return null;
  return (
    <div className="row wrap ptl-legend">
      {discs.map((d) => <span key={d} className="t-caption row" style={{ gap: 6 }}><span className="dot s10" style={{ background: dvar(d) }} />{DISCIPLINE_LABEL[d]}</span>)}
      {hasT && <span className="t-caption row" style={{ gap: 6 }}><span className="dot s10 ptl-tdot" />{KIND_LABEL.TRANSITION}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ panneau (page de la séance) + plein écran
export function PlanTimelinePanel({ p, refs, plan, byId }: { p: Pick<PlannedSession, 'discipline' | 'blocks'>; refs: RefValues; plan: NutriPlan | null; byId: Map<string, BankFood> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<Sel>(null);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [start, setStart] = useState(0);
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  const tl = useMemo(() => planTimeline(p, refs), [p, refs]);
  useEffect(() => {
    if (!full) return;
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('resize', on); document.body.style.overflow = prev; };
  }, [full]);
  const portrait = win.h > win.w;
  const FW = portrait ? win.h : win.w, FH = portrait ? win.w : win.h;
  const total = Math.max(60, tl.totalS);
  const setZ = (z: number) => {
    const span = total / zoom, center = Math.min(total, start + span / 2);
    const ns = total / z;
    setZoom(z); setStart(Math.min(Math.max(0, center - ns / 2), total - ns));
  };
  const panBy = (dir: 1 | -1) => { const span = total / zoom; setStart(Math.min(Math.max(0, start + dir * span * 0.5), total - span)); };
  if (!tl.segs.length) return null;
  const hasFood = !!plan?.events.some((e) => e.phase === 'during' && e.items.length);
  const common = { p, refs, plan, byId, sel, setSel };
  return (
    <div className="stack-8" data-component="PlanTimeline">
      <div className="between baseline">
        <span className="row" style={{ gap: 8 }}><span className="t-caption c-moderate">{duration(Math.round(tl.totalS))}{tl.unknown > 0 ? ' · ' + $t("{0} bloc(s) sans durée", { 0: tl.unknown }) : ''}</span></span>
        <button type="button" className="icon-btn" aria-label={$t("Plein écran")} onClick={() => { setFull(true); setZoom(1); setStart(0); }}><Icon name="expand" size={18} /></button>
      </div>
      <div ref={ref}><Timeline {...common} width={w} barsH={104} zoom={1} start={0} /></div>
      <Legend p={p} refs={refs} />
      <Detail {...common} onClose={() => setSel(null)} />
      {!hasFood && <span className="t-legal c-moderate">{$t("Les aliments du Pendant apparaissent ici dès que la séance est assez longue pour en prévoir.")}</span>}
      {full && (
        <div className="schart-full" style={portrait ? { width: win.h, height: win.w, left: win.w, top: 0, transform: 'rotate(90deg)', transformOrigin: 'top left' } : { left: 0, top: 0, width: win.w, height: win.h }} role="dialog" aria-label={$t("Plan de séance")}>
          <div className="row between" style={{ padding: '10px 14px 0' }}>
            <span className="row" style={{ gap: 8 }}><button type="button" className="icon-btn" aria-label={$t("Fermer")} onClick={() => setFull(false)}><Icon name="back" size={22} /></button><span className="t-strong">{$t("Plan de séance")}</span><span className="t-caption c-moderate">{duration(Math.round(tl.totalS))}</span></span>
            <span className="row" style={{ gap: 4 }}>
              {zoom > 1 && <><button type="button" className="icon-btn" aria-label={$t("Reculer")} onClick={() => panBy(-1)}><Icon name="back" size={18} /></button><button type="button" className="icon-btn" aria-label={$t("Avancer")} onClick={() => panBy(1)}><Icon name="next" size={18} /></button></>}
              <button type="button" className="icon-btn" aria-label={$t("Zoom arrière")} disabled={zoom <= 1} onClick={() => setZ(Math.max(1, zoom / 2))}><Icon name="minus" size={18} /></button>
              <span className="t-caption-strong" style={{ minWidth: 28, textAlign: 'center' }}>×{zoom}</span>
              <button type="button" className="icon-btn" aria-label={$t("Zoom avant")} disabled={zoom >= 8} onClick={() => setZ(Math.min(8, zoom * 2))}><Icon name="plus" size={18} /></button>
            </span>
          </div>
          <div style={{ padding: '0 10px' }}>
            <Timeline {...common} width={FW - 20} barsH={Math.max(80, Math.min(190, FH - FOOD_H - AXIS_H - 150))} rotated={portrait} zoom={zoom} start={start} onPan={setStart} />
          </div>
          <div style={{ padding: '0 14px', overflow: 'auto', flex: 1 }}>
            <Legend p={p} refs={refs} />
            <Detail {...common} onClose={() => setSel(null)} compact />
          </div>
        </div>
      )}
    </div>
  );
}


/** Bandeau des jambes d'un enchaînement (natation › vélo › course), largeur proportionnelle au temps, transitions en gris. */
export function LegStrip({ p, refs, labels }: { p: Pick<PlannedSession, 'discipline' | 'blocks'>; refs: RefValues; labels?: boolean }) {
  const tl = useMemo(() => planTimeline(p, refs), [p, refs]);
  if (p.discipline !== 'BRICK' || !tl.segs.length) return null;
  const parts: { d: SegDisc | null; s: number }[] = [];
  for (const s of tl.segs) {
    const d = s.kind === 'TRANSITION' ? null : s.disc;
    const last = parts[parts.length - 1];
    if (last && last.d === d) last.s += s.durS; else parts.push({ d, s: s.durS });
  }
  const tot = parts.reduce((a, x) => a + x.s, 0) || 1;
  return (
    <span className="ptl-legs" aria-hidden="true">
      {parts.map((x, i) => (
        <span key={i} className={'ptl-leg' + (x.d ? '' : ' t')} style={{ flexGrow: Math.max(x.s / tot, x.d ? 0.08 : 0.02), background: x.d ? dvar(x.d) : undefined }}>{labels && x.d ? <span className="ptl-leg-t">{DISCIPLINE_LABEL[x.d]}</span> : null}</span>
      ))}
    </span>
  );
}
