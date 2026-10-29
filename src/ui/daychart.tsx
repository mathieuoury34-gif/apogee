// Graphe « un point par jour » commun à Progression : barres, barres flottantes (min → max), courbe ou barres empilées.
// Il se pilote de l'extérieur : `sel` est l'indice du jour lu (curseur), `onSel` est appelé au toucher / glissement.
// Le bandeau de valeurs (Readout) et la barre de période (PeriodBar) se placent autour, voir ui/readout.tsx et ui/period.tsx.
import { $t } from '../i18n';
import type { ReactNode } from 'react';
import { useWidth } from './kit';
import { niceStep } from './charts';
import { dateShort } from './format';

const AXIS = 40;

export interface DayPoint {
  day: string;
  /** Valeur (haut de la barre, point de la courbe). null = pas de donnée ce jour. */
  v: number | null;
  /** Barres flottantes : bas de la barre. Barres empilées : partie basse (sous `v`). */
  lo?: number | null;
  /** Teinte propre à ce point (sinon la couleur du graphe). */
  color?: string;
  /** Point estimé / supposé : tracé plus pâle. */
  faint?: boolean;
}
export type DayChartKind = 'bars' | 'range' | 'line' | 'stack';

export function DayChart({ points, kind, sel, onSel, onRelease, min, max, ticks, fmtTick, height = 130, label, color = 'var(--chart-value)', color2 = 'var(--chart-other)', dots, connect }: {
  points: DayPoint[]; kind: DayChartKind; sel: number; onSel: (i: number) => void; /** Appelé quand le doigt (ou la souris) lâche le graphe, ou que le défilement de la page le reprend. */ onRelease?: () => void;
  min?: number; max?: number; ticks?: number[]; fmtTick?: (v: number) => string;
  height?: number; label: string; color?: string; color2?: string; dots?: boolean;
  /** Courbe : relier aussi les points séparés par des jours sans valeur (pesées espacées). */
  connect?: boolean;
}): ReactNode {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const n = points.length;
  if (n < 1) return <div ref={ref} className="t-caption c-moderate">{$t("Pas encore de données sur cette période.")}</div>;
  const vals = points.flatMap((p) => [p.v, p.lo ?? null]).filter((x): x is number => x !== null);
  if (!vals.length) return <div ref={ref} className="t-caption c-moderate">{$t("Pas encore de données sur cette période.")}</div>;
  const stacked = kind === 'stack';
  let lo = min ?? (kind === 'bars' || stacked ? 0 : Math.min(...vals));
  let hi = max ?? (stacked ? Math.max(...points.map((p) => (p.v ?? 0) + (p.lo ?? 0))) : Math.max(...vals));
  if (min === undefined && kind !== 'bars' && !stacked) { const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1; lo -= pad; }
  if (max === undefined) { const pad = (hi - lo) * 0.08 || 1; hi += pad; }
  if (hi <= lo) hi = lo + 1;
  const tk = ticks ?? (() => { const st = niceStep((hi - lo) / 3); const out: number[] = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(v); return out; })();
  const W = cw - AXIS, T = 8, H = height, B = T + H;
  const X = (i: number) => ((i + 0.5) / n) * W;
  const Y = (v: number) => T + H - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * H;
  const bw = Math.max(1.5, Math.min(28, (W / n) * 0.62));
  const s = Math.min(Math.max(sel, 0), n - 1);
  const idx = (e: React.PointerEvent<HTMLDivElement>) => Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - e.currentTarget.getBoundingClientRect().left) / W) * n)));
  const line = points.map((p, i) => ({ p, i })).filter((q) => q.p.v !== null);
  const path = line.map((q, k) => (k && (connect || line[k - 1].i === q.i - 1) ? 'L' : 'M') + X(q.i).toFixed(1) + ',' + Y(q.p.v!).toFixed(1)).join(' ');
  const picks = n <= 2 ? [0, n - 1] : [0, Math.round((n - 1) / 2), n - 1];
  const fmt = fmtTick ?? ((v: number) => String(Math.round(v * 10) / 10));
  const sp = points[s];
  return (
    <div ref={ref} className="chart" style={{ height: B + 24 }} data-component="DayChart">
      <svg viewBox={`0 0 ${cw} ${B + 24}`} width={cw} height={B + 24} role="img" aria-label={label}>
        {tk.map((v) => <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />)}
        {kind === 'line' && <path d={path} fill="none" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />}
        {kind === 'line' && (dots ?? n <= 40) && line.map((q) => <circle key={q.i} cx={X(q.i)} cy={Y(q.p.v!)} r={q.i === s ? 4.5 : 2.5} style={{ fill: q.p.color ?? color, opacity: q.p.faint ? 0.5 : 1 }} />)}
        {kind === 'bars' && points.map((p, i) => p.v === null ? null : <rect key={i} x={X(i) - bw / 2} y={Y(p.v)} width={bw} height={Math.max(1.5, Y(lo) - Y(p.v))} rx={Math.min(3, bw / 2)} style={{ fill: p.color ?? color, opacity: (p.faint ? 0.45 : 1) * (i === s ? 1 : 0.72) }} />)}
        {kind === 'range' && points.map((p, i) => p.v === null || p.lo == null ? null : <rect key={i} x={X(i) - bw / 2} y={Y(p.v)} width={bw} height={Math.max(3, Y(p.lo) - Y(p.v))} rx={Math.min(4, bw / 2)} style={{ fill: p.color ?? color, opacity: (p.faint ? 0.45 : 1) * (i === s ? 1 : 0.72) }} />)}
        {stacked && points.map((p, i) => {
          if (p.v === null && p.lo == null) return null;
          const bot = p.lo ?? 0, top = bot + (p.v ?? 0);
          return <g key={i} style={{ opacity: i === s ? 1 : 0.75 }}>
            <rect x={X(i) - bw / 2} y={Y(bot)} width={bw} height={Math.max(0, Y(lo) - Y(bot))} style={{ fill: color2 }} />
            <rect x={X(i) - bw / 2} y={Y(top)} width={bw} height={Math.max(0, Y(bot) - Y(top))} rx={Math.min(3, bw / 2)} style={{ fill: color }} />
          </g>;
        })}
        <line x1="0" x2={W} y1={Y(lo)} y2={Y(lo)} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {tk.map((v) => <span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{fmt(v)}</span>)}
      {picks.map((i, k) => <span key={k} className="tick" style={{ top: B + 6, ...(k === 0 ? { left: 0 } : k === picks.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{dateShort(points[i].day)}</span>)}
      <div className="cross" style={{ top: T, height: H, left: X(s) }} />
      {kind === 'line' && sp.v !== null && <span aria-hidden="true" className="marker-dot" style={{ background: sp.color ?? color, border: '2px solid var(--bg-surface)', left: X(s) - 5, top: Y(sp.v) - 5 }} />}
      <div className="hit" style={{ width: W, height: B }} onPointerDown={(e) => onSel(idx(e))} onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) onSel(idx(e)); }} onPointerUp={onRelease} onPointerCancel={onRelease} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && e.buttons) onRelease?.(); }} />
    </div>
  );
}
