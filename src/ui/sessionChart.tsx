// Graphique d'une séance (FC, vitesse ou allure) qu'on peut parcourir au doigt.
//  · un doigt posé ou glissé : un curseur donne l'instant (ou le kilomètre) et la valeur ;
//  · deux doigts posés : la zone entre eux est sélectionnée et on lit sa MOYENNE (FC moyenne entre ces deux instants) ;
//  · à la souris : survol pour le curseur, glisser pour sélectionner ;
//  · bouton plein écran (le graphique se met en travers si le téléphone est tenu droit) et bouton « Zones de FC ».
import { $t } from '../i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { useWidth } from './kit';
import { Icon } from './icons';
import { NBSP, num } from './format';
import { rangeStats } from '../domain/sessionStats';

export interface ChartPt { /** abscisse : secondes depuis le début, ou mètres si l'axe est en distance */ x: number; /** instant réel (s) : sert aux pondérations */ t: number; v: number }
export interface ChartBand { lo: number; hi: number; color: string }
export type XKind = 'time' | 'distance';

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
}
const xText = (x: number, kind: XKind) => (kind === 'time' ? clock(x) : num(x / 1000, 2) + NBSP + 'km');
const xTick = (x: number, kind: XKind) => (kind === 'time' ? clock(x) : num(x / 1000, x >= 10000 ? 0 : 1));

function niceStep(range: number, n: number): number {
  const raw = Math.max(range, 1e-9) / n, mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].map((m) => m * mag).find((m) => m >= raw) ?? mag * 10);
}

export interface SessionChartProps {
  pts: ChartPt[];
  xKind: XKind;
  /** « 108 bpm », « 5:12 /km »… */
  valueText: (v: number) => string;
  /** étiquette d'un graduation de l'axe vertical */
  tickText?: (v: number) => string;
  /** allure : les valeurs basses (rapides) sont en haut */
  inverted?: boolean;
  color: string;
  /** moyenne de toute la séance (trait blanc) */
  avg: number | null;
  /** durée maximale pour laquelle une mesure vaut jusqu'à la suivante (s) */
  cap: number;
  domain: [number, number];
  tickStep?: number;
  bands?: ChartBand[];
  label: string;
  width?: number;
  height: number;
  /** le graphique est tourné d'un quart de tour (plein écran, téléphone tenu droit) */
  rotated?: boolean;
  avgWord?: string;
}

export function SessionChart(p: SessionChartProps) {
  const { pts, xKind, domain, inverted, color, cap } = p;
  const gid = useId().replace(/:/g, '');
  const AX = 40, R = 10, T = 8, B = 26;
  const W = Math.max(60, (p.width ?? 300) - AX - R), H = Math.max(40, p.height - T - B);
  const x0 = pts.length ? pts[0].x : 0, x1 = pts.length ? pts[pts.length - 1].x : 1;
  const span = Math.max(1e-9, x1 - x0);
  const [lo, hi] = domain;
  const X = (x: number) => ((x - x0) / span) * W;
  const Y = (v: number) => T + (inverted ? ((v - lo) / (hi - lo || 1)) : 1 - (v - lo) / (hi - lo || 1)) * H;
  const clampV = (v: number) => Math.min(hi, Math.max(lo, v));

  const [cursor, setCursor] = useState<number | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const hit = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, number>());
  const drag = useRef<number | null>(null);

  const xOf = (e: { clientX: number; clientY: number }): number => {
    const r = hit.current!.getBoundingClientRect();
    const px = p.rotated ? e.clientY - r.top : e.clientX - r.left;
    return x0 + Math.min(1, Math.max(0, px / W)) * span;
  };

  // deux doigts : on bloque le défilement et le zoom du navigateur pour garder le geste
  useEffect(() => {
    const el = hit.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  }, []);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    const x = xOf(e);
    ptrs.current.set(e.pointerId, x);
    if (ptrs.current.size >= 2) { const [a, b] = [...ptrs.current.values()]; setSel([Math.min(a, b), Math.max(a, b)]); setCursor(null); drag.current = null; return; }
    setSel(null); setCursor(x);
    drag.current = e.pointerType === 'mouse' ? x : null;
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const x = xOf(e);
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, x);
    if (ptrs.current.size >= 2) { const [a, b] = [...ptrs.current.values()]; setSel([Math.min(a, b), Math.max(a, b)]); return; }
    if (drag.current !== null && e.buttons) { if (Math.abs(x - drag.current) / span * W > 4) { setSel([Math.min(drag.current, x), Math.max(drag.current, x)]); setCursor(null); } return; }
    setCursor(x);
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId);
    if (e.pointerType !== 'mouse' && ptrs.current.size === 0) setCursor(null);
    if (ptrs.current.size === 0) drag.current = null;
  };

  const near = useMemo(() => (x: number): ChartPt | null => {
    if (!pts.length) return null;
    let a = 0, b = pts.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (pts[m].x <= x) a = m; else b = m; }
    return Math.abs(pts[a].x - x) <= Math.abs(pts[b].x - x) ? pts[a] : pts[b];
  }, [pts]);

  const stats = useMemo(() => {
    if (!sel) return null;
    const inRange = pts.filter((q) => q.x >= sel[0] && q.x <= sel[1]);
    return inRange.length ? rangeStats(inRange, -Infinity, Infinity, cap) : null;
  }, [sel, pts, cap]);

  // tracé : au plus une mesure par pixel (moyenne du paquet) pour rester fluide sur 6 h de sortie
  const line = useMemo(() => {
    if (!pts.length) return [] as [number, number][];
    const buckets = Math.max(2, Math.floor(W));
    if (pts.length <= buckets * 1.5) return pts.map((q) => [X(q.x), Y(clampV(q.v))] as [number, number]);
    const out: [number, number][] = [];
    let i = 0;
    for (let k = 0; k < buckets; k++) {
      const end = x0 + ((k + 1) / buckets) * span;
      let s = 0, n = 0, xs = 0;
      while (i < pts.length && (pts[i].x <= end || k === buckets - 1)) { s += pts[i].v; xs += pts[i].x; n++; i++; }
      if (n) out.push([X(xs / n), Y(clampV(s / n))]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, W, lo, hi, inverted]);
  const base = inverted ? T : T + H;
  const path = line.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const area = line.length ? path + ` L${line[line.length - 1][0].toFixed(1)},${base} L${line[0][0].toFixed(1)},${base} Z` : '';

  const step = p.tickStep ?? niceStep(hi - lo, 4);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  const xTicks = Array.from({ length: 6 }, (_, i) => x0 + (span * i) / 5);
  const tickText = p.tickText ?? ((v: number) => num(v, 0));
  const word = p.avgWord ?? $t("Moyenne");

  const curPt = cursor !== null ? near(cursor) : null;
  const tipX = sel ? (X(sel[0]) + X(sel[1])) / 2 : curPt ? X(curPt.x) : 0;
  const tipW = 168;
  const tipLeft = Math.min(Math.max(AX + tipX - tipW / 2, 0), (p.width ?? 300) - tipW);

  return (
    <div className="chart schart" style={{ height: p.height, width: p.width ?? '100%' }} role="img" aria-label={p.label} data-component="SessionChart">
      <svg width={p.width ?? 300} height={p.height} viewBox={`0 0 ${p.width ?? 300} ${p.height}`}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1={inverted ? 1 : 0} y2={inverted ? 0 : 1}><stop offset="0" stopColor={color} stopOpacity="0.65" /><stop offset="1" stopColor={color} stopOpacity="0.08" /></linearGradient>
          <clipPath id={gid + 'c'}><rect x="0" y={T} width={W} height={H} /></clipPath>
        </defs>
        <g transform={`translate(${AX},0)`}>
          {ticks.map((v) => <g key={v}><line x1="0" x2={W} y1={Y(v)} y2={Y(v)} strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} /><text x={-6} y={Y(v) + 4} textAnchor="end" className="schart-t">{tickText(v)}</text></g>)}
          {p.bands?.map((b, i) => { const a = Y(clampV(b.hi)), z = Y(clampV(b.lo)); const top = Math.min(a, z), h = Math.abs(z - a); return h > 0.5 ? <rect key={i} x="0" y={top} width={W} height={h} style={{ fill: b.color, opacity: 0.22 }} /> : null; })}
          {p.bands?.map((b, i) => (b.lo > lo && b.lo < hi ? <line key={'l' + i} x1="0" x2={W} y1={Y(b.lo)} y2={Y(b.lo)} strokeWidth="1" strokeDasharray="3 3" style={{ stroke: b.color }} /> : null))}
          <g clipPath={`url(#${gid}c)`}>
            {area && <path d={area} fill={`url(#${gid})`} />}
            {path && <path d={path} fill="none" strokeWidth="1.5" strokeLinejoin="round" style={{ stroke: color }} />}
          </g>
          {p.avg !== null && p.avg >= lo && p.avg <= hi && <line x1="0" x2={W} y1={Y(p.avg)} y2={Y(p.avg)} strokeWidth="1.5" style={{ stroke: 'var(--text-neutral)' }} />}
          {sel && (
            <g>
              <rect x={X(sel[0])} y={T} width={Math.max(1, X(sel[1]) - X(sel[0]))} height={H} style={{ fill: 'var(--text-neutral)', opacity: 0.2 }} />
              {[sel[0], sel[1]].map((x) => <g key={x}><line x1={X(x)} x2={X(x)} y1={T} y2={T + H} strokeWidth="1.5" style={{ stroke: 'var(--text-neutral)' }} />{stats && <circle cx={X(x)} cy={Y(clampV(stats.avg))} r="4.5" style={{ fill: 'var(--bg-surface)', stroke: 'var(--text-neutral)', strokeWidth: 2 }} />}</g>)}
            </g>
          )}
          {curPt && !sel && (
            <g>
              <line x1={X(curPt.x)} x2={X(curPt.x)} y1={T} y2={T + H} strokeWidth="1" style={{ stroke: 'var(--text-neutral)' }} />
              <circle cx={X(curPt.x)} cy={Y(clampV(curPt.v))} r="4.5" style={{ fill: color, stroke: 'var(--bg-surface)', strokeWidth: 2 }} />
            </g>
          )}
          {xTicks.map((x, i) => <text key={i} x={X(x)} y={T + H + 17} textAnchor={i === 0 ? 'start' : i === 5 ? 'end' : 'middle'} className="schart-t">{xTick(x, xKind)}</text>)}
        </g>
      </svg>
      <div ref={hit} className="hit" style={{ left: AX, top: T, width: W, height: H, touchAction: 'pan-y' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !ptrs.current.size) setCursor(null); }} />
      {(sel && stats) || curPt ? (
        <div role="status" className="tip schart-tip" style={{ left: tipLeft, top: 0, width: tipW }}>
          {sel && stats ? <>
            <span className="t-caption c-reverse-muted">{xText(sel[0], xKind)} — {xText(sel[1], xKind)}</span>
            <span className="row" style={{ gap: 6, alignItems: 'center' }}><span className="dot s10" style={{ background: color }} /><strong style={{ color: 'var(--text-reverse)' }}>{p.valueText(stats.avg)}</strong></span>
            <span className="t-caption c-reverse-muted">{word} · {$t("max")} {p.valueText(p.inverted ? stats.min : stats.max)}</span>
          </> : curPt ? <>
            <span className="t-caption c-reverse-muted">{xText(curPt.x, xKind)}</span>
            <span className="row" style={{ gap: 6, alignItems: 'center' }}><span className="dot s10" style={{ background: color }} /><strong style={{ color: 'var(--text-reverse)' }}>{p.valueText(curPt.v)}</strong></span>
          </> : null}
        </div>
      ) : null}
      {sel && <button type="button" className="schart-clear" onClick={() => setSel(null)} aria-label={$t("Effacer la sélection")}><Icon name="close" size={14} /></button>}
    </div>
  );
}

// ------------------------------------------------------------------ panneau : titre, deux chiffres, graphique, plein écran
export interface ChartPanelProps extends Omit<SessionChartProps, 'width' | 'height' | 'rotated' | 'bands'> {
  title: string;
  /** les deux chiffres au-dessus, comme Garmin Connect : « 145 bpm Moyenne », « 168 bpm Maximum » */
  heads: { value: string; label: string }[];
  bands?: ChartBand[];
  /** présence du bouton « Zones de FC » */
  zonesButton?: ReactNode;
  height?: number;
}

export function ChartPanel(p: ChartPanelProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [full, setFull] = useState(false);
  const [zones, setZones] = useState(false);
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
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
  const bands = zones ? p.bands : undefined;
  const common = { pts: p.pts, xKind: p.xKind, valueText: p.valueText, tickText: p.tickText, inverted: p.inverted, color: p.color, avg: p.avg, cap: p.cap, domain: p.domain, tickStep: p.tickStep, label: p.label, avgWord: p.avgWord, bands };
  return (
    <div className="stack-8" data-component="ChartPanel">
      <div className="between baseline">
        <h3 className="t-strong">{p.title}</h3>
        <span className="row" style={{ gap: 4 }}>
          {p.bands && <button type="button" className="chip" aria-pressed={zones} onClick={() => setZones(!zones)}>{$t("Zones de FC")}</button>}
          <button type="button" className="icon-btn" aria-label={$t("Plein écran")} onClick={() => setFull(true)}><Icon name="expand" size={18} /></button>
        </span>
      </div>
      <div className="grid-2 heads">{p.heads.map((h) => <div key={h.label} className="kpi"><span className="t-h3">{h.value}</span><span className="label">{h.label}</span></div>)}</div>
      <div ref={ref}><SessionChart {...common} width={w} height={p.height ?? 170} /></div>
      <span className="t-legal c-moderate">{$t("Un doigt : lire un instant. Deux doigts : moyenne entre les deux.")}</span>
      {full && (
        <div className="schart-full" style={portrait ? { width: win.h, height: win.w, left: win.w, top: 0, transform: 'rotate(90deg)', transformOrigin: 'top left' } : { left: 0, top: 0, width: win.w, height: win.h }} role="dialog" aria-label={p.title}>
          <div className="row between" style={{ padding: '10px 14px 0' }}>
            <span className="row" style={{ gap: 8 }}><button type="button" className="icon-btn" aria-label={$t("Fermer")} onClick={() => setFull(false)}><Icon name="back" size={22} /></button><span className="t-strong">{p.title}</span></span>
            <span className="row" style={{ gap: 16 }}>{p.heads.map((h) => <span key={h.label} className="t-caption"><strong>{h.value}</strong> <span className="c-moderate">{h.label}</span></span>)}</span>
          </div>
          <div style={{ padding: '4px 10px 0' }}><SessionChart {...common} rotated={portrait} width={FW - 20} height={FH - 112} /></div>
          <div style={{ padding: '0 14px' }} className="row between">{p.bands ? <button type="button" className="chip" aria-pressed={zones} onClick={() => setZones(!zones)}>{$t("Zones de FC")}</button> : <span />}<span className="t-legal c-moderate">{$t("Un doigt : lire un instant. Deux doigts : moyenne entre les deux.")}</span></div>
        </div>
      )}
    </div>
  );
}
