// Graphiques SVG — même grammaire que PEAnalyze : graduations à droite, grille discrète, curseur vertical
// et info-bulle sombre au survol / au toucher, largeur fluide.
import { $t } from '../i18n';
import { useState, type ReactNode } from 'react';
import { useWidth } from './kit';
import { dateShort, dayMonth, DISCIPLINE_LABEL, duration, num, NBSP, monthShort, signed } from './format';
import type { DayLoad } from '../domain/load';
import type { DailyForm } from '../domain/form';
import { formStep, FORM_STEP_LABEL } from '../domain/form';
import type { ZoneReading } from '../domain/types';
const AXIS = 36;

export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function hoverIndex(ev: React.PointerEvent<HTMLDivElement>, n: number): number {
  const r = ev.currentTarget.getBoundingClientRect();
  return Math.round(Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1) * (n - 1));
}

// ------------------------------------------------------------------ Charge : trois panneaux, chacun sur sa propre échelle
// 1. forme de fond et fatigue (axe resserré autour de leurs valeurs, pas écrasé par les pics de charge) ;
// 2. charge du jour en barres (un jour exceptionnel est écrêté et marqué d'un chevron, la vraie valeur reste dans l'infobulle) ;
// 3. fraîcheur (positive / négative).
export function LoadChart({ days, height = 150, compact = false }: { days: DayLoad[]; height?: number; compact?: boolean }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  if (n < 2) return <div ref={ref} className="t-caption c-moderate" style={{ padding: 'var(--space-16) 0' }}>{$t("Pas encore assez de jours collectés pour tracer la charge.")}</div>;
  const W = cw - AXIS, T = 8, gap = compact ? 8 : 12;
  const H1 = compact ? Math.round(height * 0.62) : height, H2 = compact ? 34 : 70, H3 = compact ? 30 : 52;
  const B1 = T + H1, T2 = B1 + gap, B2 = T2 + H2, T3 = B2 + gap, B3 = T3 + H3, total = B3 + 22;
  // panneau 1 : axe resserré sur forme de fond et fatigue
  const vals = days.flatMap((d) => [d.fitness, d.fatigue]);
  const vmin = Math.min(...vals), vmax = Math.max(...vals, 1);
  const step = niceStep(Math.max(vmax - vmin, vmax * 0.15) / 3);
  const lo = Math.max(0, Math.floor((vmin - (vmax - vmin) * 0.1) / step) * step), hi = Math.max(lo + step, Math.ceil((vmax + (vmax - vmin) * 0.1) / step) * step);
  const Y = (v: number) => T + H1 - ((v - lo) / (hi - lo)) * H1;
  // panneau 2 : charge du jour, écrêtée si un jour domine
  const sorted = days.map((d) => d.load).sort((x, y) => y - x);
  const maxLoad = Math.max(sorted[0], 1);
  const ref3 = sorted[Math.min(2, sorted.length - 1)];
  const capRaw = maxLoad > ref3 * 2 && ref3 > 0 ? ref3 * 1.35 : maxLoad;
  const lstep = niceStep(capRaw / 2), cap = Math.max(lstep, Math.ceil(capRaw / lstep) * lstep);
  const YL = (v: number) => B2 - (Math.min(v, cap) / cap) * H2;
  // panneau 3 : fraîcheur
  const fr = Math.max(...days.map((d) => Math.abs(d.freshness)), 5);
  const mid = T3 + H3 / 2;
  const YF = (v: number) => mid - (v / fr) * (H3 / 2);
  const X = (i: number) => ((i + 0.5) / n) * W;
  const bw = Math.max(1.5, (W / n) * 0.62);
  const line = (k: 'fitness' | 'fatigue') => days.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(d[k]).toFixed(1)).join(' ');
  let grid = '';
  const ticks: ReactNode[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) {
    grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' ';
    ticks.push(<span key={'a' + v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{num(v, 0)}</span>);
  }
  const h = hover ?? n - 1;
  const hd = days[h];
  const picks = compact ? [0, n - 1] : n <= 10 ? [0, Math.round((n - 1) / 2), n - 1] : [0, Math.round((n - 1) / 2), n - 1];
  return (
    <div ref={ref} className="chart" data-component="LoadChart" style={{ height: total }}>
      <svg viewBox={`0 0 ${cw} ${total}`} width={cw} height={total} role="img" aria-label={$t("Charge, forme de fond et fatigue sur {0} jours ; fraîcheur du jour {1}", { 0: n, 1: signed(days[n - 1].freshness, 0) })}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={line('fatigue')} fill="none" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" style={{ stroke: 'var(--chart-fatigue)' }} />
        <path d={line('fitness')} fill="none" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--chart-fitness)' }} />
        <line x1="0" x2={W} y1={B2} y2={B2} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
        {days.map((d, i) => d.load > 0 && <rect key={i} x={X(i) - bw / 2} y={YL(d.load)} width={bw} height={B2 - YL(d.load)} rx={Math.min(2, bw / 2)} style={{ fill: d.estimated ? 'var(--bg-brand-moderate)' : 'var(--chart-load)' }} />)}
        {days.map((d, i) => d.load > cap && <path key={'c' + i} d={`M${X(i) - bw / 2},${T2 + 5} l${bw / 2},-5 l${bw / 2},5`} fill="none" strokeWidth="1.5" style={{ stroke: 'var(--bg-surface)' }} />)}
        <line x1="0" x2={W} y1={mid} y2={mid} strokeWidth="1" style={{ stroke: 'var(--border-minimal)' }} />
        {days.map((d, i) => <rect key={'f' + i} x={X(i) - bw / 2} y={Math.min(mid, YF(d.freshness))} width={bw} height={Math.max(0.5, Math.abs(YF(d.freshness) - mid))} style={{ fill: d.freshness >= 0 ? 'var(--chart-fresh-pos)' : 'var(--chart-fresh-neg)' }} />)}
      </svg>
      {ticks}
      <span className="tick" style={{ left: W + 6, top: T2 - 4 }}>{num(cap, 0)}{maxLoad > cap ? '+' : ''}</span>
      <span className="tick" style={{ left: W + 6, top: B2 - 14 }}>0</span>
      <span className="tick" style={{ left: W + 6, top: T3 - 4 }}>{'+' + num(fr, 0)}</span>
      <span className="tick" style={{ left: W + 6, top: B3 - 14 }}>{'−' + num(fr, 0)}</span>
      {picks.map((i, k) => <span key={k} className="tick" style={{ top: B3 + 4, ...(k === 0 ? { left: 0 } : k === picks.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{dateShort(days[i].day)}</span>)}
      <div className="cross" style={{ top: T, height: B3 - T, left: X(h) }} />
      <span aria-hidden="true" className="marker-dot" style={{ background: 'var(--chart-fitness)', border: '2px solid var(--bg-surface)', left: X(h) - 5, top: Y(hd.fitness) - 5 }} />
      <div className="hit" style={{ width: W, height: B3 }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      <div role="status" className="tip" style={{ minWidth: 150, left: Math.min(Math.max(X(h) - 75, 0), W - 150), top: Y(hd.fitness) > 70 ? 6 : Math.min(B1 - 80, Y(hd.fitness) + 14) }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{dayMonth(hd.day)}{hd.interruptionFill ? $t(" · forfait") : ''}</span>
        <span className="t-caption c-reverse-muted">{$t("Charge")} {num(hd.load, 0)}{hd.estimated && hd.load ? $t(" (estimée)") : ''}</span>
        <span className="t-caption" style={{ color: 'var(--text-reverse)' }}>{$t("Fond")} {num(hd.fitness, 0)} {$t("· Fatigue")} {num(hd.fatigue, 0)}</span>
        <span className="t-caption-strong" style={{ color: hd.freshness >= 0 ? 'var(--brand-light-green)' : 'var(--text-reverse-muted)' }}>{$t("Fraîcheur")} {signed(hd.freshness, 0)}</span>
      </div>
    </div>
  );
}

/** Version « lecture facile » de la charge : trois graphiques séparés, chacun avec son titre et une phrase qui dit ce qu'il montre,
 *  et un bandeau qui donne les valeurs exactes du jour touché (il sert aussi de légende). */
export function LoadPanels({ days, today }: { days: DayLoad[]; today?: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  if (n < 2) return <div ref={ref} className="t-caption c-moderate" style={{ padding: 'var(--space-16) 0' }}>{$t("Pas encore assez de jours collectés pour tracer la charge.")}</div>;
  const W = cw - AXIS, T = 8;
  const X = (i: number) => ((i + 0.5) / n) * W;
  const bw = Math.max(1.5, (W / n) * 0.62);
  const todayIdx = today ? Math.max(0, days.findIndex((x) => x.day === today)) : n - 1;
  const h = hover ?? todayIdx;
  const hd = days[h];
  const projected = !!today && hd.day > today;
  // A. forme de fond et fatigue
  const H1 = 130;
  const vals = days.flatMap((d) => [d.fitness, d.fatigue]);
  const vmin = Math.min(...vals), vmax = Math.max(...vals, 1);
  const step = niceStep(Math.max(vmax - vmin, vmax * 0.15) / 3);
  const lo = Math.max(0, Math.floor((vmin - (vmax - vmin) * 0.1) / step) * step), hi = Math.max(lo + step, Math.ceil((vmax + (vmax - vmin) * 0.1) / step) * step);
  const Y = (v: number) => T + H1 - ((v - lo) / (hi - lo)) * H1;
  const line = (k: 'fitness' | 'fatigue') => days.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(d[k]).toFixed(1)).join(' ');
  let grid = '';
  const ticksA: ReactNode[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) {
    grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' ';
    ticksA.push(<span key={'a' + v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{num(v, 0)}</span>);
  }
  // B. charge du jour (un jour hors norme est écrêté, marqué d'un chevron ; la vraie valeur est dans le bandeau)
  const H2 = 80;
  const sorted = days.map((d) => d.load).sort((x, y) => y - x);
  const maxLoad = Math.max(sorted[0], 1);
  const ref3 = sorted[Math.min(2, sorted.length - 1)];
  const capRaw = maxLoad > ref3 * 2 && ref3 > 0 ? ref3 * 1.35 : maxLoad;
  const lstep = niceStep(capRaw / 2), cap = Math.max(lstep, Math.ceil(capRaw / lstep) * lstep);
  const YL = (v: number) => T + H2 - (Math.min(v, cap) / cap) * H2;
  // C. fraîcheur
  const H3 = 64;
  const fr = Math.max(...days.map((d) => Math.abs(d.freshness)), 5);
  const mid = T + H3 / 2;
  const YF = (v: number) => mid - (v / fr) * (H3 / 2);
  const picks = [0, Math.round((n - 1) / 2), n - 1];
  const hit = (H: number) => <div className="hit" style={{ width: W, height: H }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />;
  const sw = (c: string, dashed = false) => <span className="sw" style={dashed ? { borderTop: `2px dashed ${c}`, height: 0 } : { background: c }} />;
  return (
    <div ref={ref} className="load-panels" data-component="LoadPanels">
      <div role="status" aria-live="polite" className="load-readout">
        <span className="when t-caption-strong">{hover === null && h === todayIdx ? $t("Aujourd’hui") : dayMonth(hd.day)}{projected ? $t(" · projeté") : ''}{hd.interruptionFill ? $t(" · forfait") : ''}</span>
        <span>{sw('var(--chart-load)')}<span className="c-neutral">{$t("Charge du jour")}</span><strong>{num(hd.load, 0)}</strong>{hd.estimated && hd.load ? <em>{$t("estimée")}</em> : null}</span>
        <span>{sw('var(--chart-fitness)')}<span className="c-neutral">{$t("Forme de fond")}</span><strong>{num(hd.fitness, 0)}</strong></span>
        <span>{sw('var(--chart-fatigue)', true)}<span className="c-neutral">{$t("Fatigue")}</span><strong>{num(hd.fatigue, 0)}</strong></span>
        <span>{sw(hd.freshness >= 0 ? 'var(--chart-fresh-pos)' : 'var(--chart-fresh-neg)')}<span className="c-neutral">{$t("Fraîcheur")}</span><strong>{signed(hd.freshness, 0)}</strong></span>
      </div>

      <section className="lp" aria-label={$t("Forme de fond et fatigue")}>
        <h3 className="t-strong">{$t("Forme de fond et fatigue")}</h3>
        <p className="t-caption c-neutral">{$t("La forme de fond (trait plein) est ce que tu as construit depuis 6 semaines ; elle monte doucement. La fatigue (pointillés) est ce que tu as encaissé cette semaine ; elle bouge vite.")}</p>
        <div className="chart" style={{ height: T + H1 + 4 }}>
          <svg viewBox={`0 0 ${cw} ${T + H1 + 4}`} width={cw} height={T + H1 + 4} role="img" aria-label={$t("Forme de fond {0}, fatigue {1}", { 0: num(days[n - 1].fitness, 0), 1: num(days[n - 1].fatigue, 0) })}>
            <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
            <path d={line('fatigue')} fill="none" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" style={{ stroke: 'var(--chart-fatigue)' }} />
            <path d={line('fitness')} fill="none" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--chart-fitness)' }} />
          </svg>
          {ticksA}
          <div className="cross" style={{ top: T, height: H1, left: X(h) }} />
          <span aria-hidden="true" className="marker-dot" style={{ background: 'var(--chart-fitness)', border: '2px solid var(--bg-surface)', left: X(h) - 5, top: Y(hd.fitness) - 5 }} />
          {hit(T + H1)}
        </div>
      </section>

      <section className="lp" aria-label={$t("Charge du jour")}>
        <h3 className="t-strong">{$t("Charge du jour")}</h3>
        <p className="t-caption c-neutral">{$t("L’effort de chaque journée : plus la barre est haute, plus elle a été dure. Une barre pâle est une charge estimée, sans mesure précise.")}{maxLoad > cap ? $t(" Une journée hors norme est coupée (chevron) ; sa vraie valeur apparaît en haut.") : ''}</p>
        <div className="chart" style={{ height: T + H2 + 4 }}>
          <svg viewBox={`0 0 ${cw} ${T + H2 + 4}`} width={cw} height={T + H2 + 4} aria-hidden="true">
            <line x1="0" x2={W} y1={T + H2} y2={T + H2} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
            {days.map((d, i) => d.load > 0 && <rect key={i} x={X(i) - bw / 2} y={YL(d.load)} width={bw} height={T + H2 - YL(d.load)} rx={Math.min(2, bw / 2)} style={{ fill: d.estimated ? 'var(--bg-brand-moderate)' : 'var(--chart-load)' }} />)}
            {days.map((d, i) => d.load > cap && <path key={'c' + i} d={`M${X(i) - bw / 2},${T + 5} l${bw / 2},-5 l${bw / 2},5`} fill="none" strokeWidth="1.5" style={{ stroke: 'var(--bg-surface)' }} />)}
          </svg>
          <span className="tick" style={{ left: W + 6, top: T - 4 }}>{num(cap, 0)}{maxLoad > cap ? '+' : ''}</span>
          <span className="tick" style={{ left: W + 6, top: T + H2 - 14 }}>0</span>
          <div className="cross" style={{ top: T, height: H2, left: X(h) }} />
          {hit(T + H2)}
        </div>
      </section>

      <section className="lp" aria-label={$t("Fraîcheur")}>
        <h3 className="t-strong">{$t("Fraîcheur")}</h3>
        <p className="t-caption c-neutral">{$t("Forme de fond moins fatigue. Au-dessus de zéro : tu es reposé, c’est le bon moment pour une séance clé ou une course. En dessous : tu es dans le dur.")}</p>
        <div className="chart" style={{ height: T + H3 + 26 }}>
          <svg viewBox={`0 0 ${cw} ${T + H3 + 26}`} width={cw} height={T + H3 + 26} aria-hidden="true">
            <line x1="0" x2={W} y1={mid} y2={mid} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
            {days.map((d, i) => <rect key={i} x={X(i) - bw / 2} y={Math.min(mid, YF(d.freshness))} width={bw} height={Math.max(0.5, Math.abs(YF(d.freshness) - mid))} style={{ fill: d.freshness >= 0 ? 'var(--chart-fresh-pos)' : 'var(--chart-fresh-neg)' }} />)}
          </svg>
          <span className="tick" style={{ left: W + 6, top: T - 4 }}>{'+' + num(fr, 0)}</span>
          <span className="tick" style={{ left: W + 6, top: mid - 9 }}>0</span>
          <span className="tick" style={{ left: W + 6, top: T + H3 - 14 }}>{'−' + num(fr, 0)}</span>
          {picks.map((i, k) => <span key={k} className="tick" style={{ top: T + H3 + 6, ...(k === 0 ? { left: 0 } : k === picks.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{dateShort(days[i].day)}</span>)}
          <div className="cross" style={{ top: T, height: H3, left: X(h) }} />
          {hit(T + H3)}
        </div>
      </section>
    </div>
  );
}

export function LoadLegend() {
  return (
    <div className="legend">
      <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-fitness)' }} />{$t("Forme de fond")}</span>
      <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-fatigue)' }} />{$t("Fatigue")}</span>
      <span><span style={{ width: 10, height: 10, borderRadius: 'var(--radius-2)', background: 'var(--chart-load)' }} />{$t("Charge du jour")}</span>
      <span><span style={{ width: 10, height: 10, borderRadius: 'var(--radius-2)', background: 'var(--chart-fresh-pos)' }} />{$t("Fraîcheur")}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Forme du jour dans le temps
export function FormChart({ days, forms }: { days: string[]; forms: Map<string, DailyForm> }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = days.map((d, i) => ({ i, d, f: forms.get(d) })).filter((p) => p.f);
  const n = days.length;
  if (pts.length < 2) return <div ref={ref} className="t-caption c-moderate">{$t("La forme du jour apparaîtra ici dès qu’elle sera calculable plusieurs jours de suite.")}</div>;
  const W = cw - AXIS, T = 8, H = 120, B = T + H;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => T + H - (v / 100) * H;
  const path = pts.map((p, k) => (k ? 'L' : 'M') + X(p.i).toFixed(1) + ',' + Y(p.f!.score).toFixed(1)).join(' ');
  const bands: [number, number, string][] = [[0, 25, 'depleted'], [25, 45, 'strained'], [45, 65, 'steady'], [65, 83, 'ready'], [83, 100, 'fresh']];
  const h = hover === null ? pts[pts.length - 1] : pts.reduce((a, b) => (Math.abs(b.i - hover) < Math.abs(a.i - hover) ? b : a));
  return (
    <div ref={ref} className="chart" style={{ height: B + 22 }}>
      <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Forme du jour sur {0} jours", { 0: n })}>
        {bands.map(([a, b, k]) => <rect key={k} x="0" y={Y(b)} width={W} height={Y(a) - Y(b)} style={{ fill: `var(--form-${k})`, opacity: 0.1 }} />)}
        <path d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--text)' }} />
        {pts.map((p) => <circle key={p.i} cx={X(p.i)} cy={Y(p.f!.score)} r="2.5" style={{ fill: `var(--form-${formStep(p.f!.score)})` }} />)}
      </svg>
      {[25, 50, 75, 100].map((v) => <span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{v}</span>)}
      <span className="tick" style={{ top: B + 4, left: 0 }}>{dateShort(days[0])}</span>
      <span className="tick" style={{ top: B + 4, right: AXIS }}>{dateShort(days[n - 1])}</span>
      <div className="cross" style={{ top: T, height: H, left: X(h.i) }} />
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      <div role="status" className="tip" style={{ minWidth: 120, left: Math.min(Math.max(X(h.i) - 60, 0), W - 120), top: 6 }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{dayMonth(h.d)}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{num(h.f!.score, 0)}{NBSP}/{NBSP}100 · {FORM_STEP_LABEL[formStep(h.f!.score)]}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ barres hebdomadaires (volume, séances)
export function WeekBars({ weeks, color = 'var(--brand-primary)', label }: { weeks: { start: string; seconds: number; sessions: number }[]; color?: string; label: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = weeks.length;
  const W = cw - AXIS, T = 8, H = 120, B = T + H;
  const top = Math.max(...weeks.map((w) => w.seconds), 3600);
  const step = niceStep(top / 3600 / 3) * 3600, max = Math.ceil(top / step) * step;
  const bw = (W / n) * 0.62;
  const X = (i: number) => ((i + 0.5) / n) * W;
  const Y = (v: number) => T + H - (v / max) * H;
  const h = hover ?? n - 1;
  return (
    <div ref={ref} className="chart" style={{ height: B + 36 }} data-component="WeekBars">
      <svg viewBox={`0 0 ${cw} ${B + 36}`} width={cw} height={B + 36} role="img" aria-label={label}>
        {Array.from({ length: Math.round(max / step) }, (_, k) => <line key={k} x1="0" x2={W} y1={Y((k + 1) * step)} y2={Y((k + 1) * step)} strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />)}
        {weeks.map((w, i) => <rect key={i} x={X(i) - bw / 2} y={Y(w.seconds)} width={bw} height={Math.max(0, B - Y(w.seconds))} rx="3" style={{ fill: color, opacity: i === h ? 1 : 0.55 }} />)}
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {Array.from({ length: Math.round(max / step) }, (_, k) => <span key={k} className="tick" style={{ left: W + 6, top: Y((k + 1) * step) - 9 }}>{num(((k + 1) * step) / 3600, 0)}{NBSP}h</span>)}
      {weeks.map((w, i) => <span key={i} className="tick" style={{ top: B + 4, left: X(i) - 14, width: 28, textAlign: 'center' }}>{w.sessions || ''}</span>)}
      <span className="tick" style={{ top: B + 18, left: 0 }}>{dateShort(weeks[0].start)}</span>
      <span className="tick" style={{ top: B + 18, right: AXIS }}>{dateShort(weeks[n - 1].start)}</span>
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      {hover !== null && (
        <div role="status" className="tip" style={{ minWidth: 120, left: Math.min(Math.max(X(h) - 60, 0), W - 120), top: 4 }}>
          <span className="t-caption c-reverse-muted">{$t("Semaine du")} {dateShort(weeks[h].start)}</span>
          <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{duration(weeks[h].seconds)} · {weeks[h].sessions} {$t("séance")}{weeks[h].sessions > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ volume hebdomadaire empilé par discipline
export function StackedWeeks({ weeks, order }: { weeks: { start: string; byDiscipline: Record<string, number>; total: number }[]; order: string[] }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = weeks.length;
  const W = cw - AXIS, T = 8, H = 150, B = T + H;
  const top = Math.max(...weeks.map((w) => w.total), 3600);
  const step = niceStep(top / 3600 / 3) * 3600, max = Math.ceil(top / step) * step;
  const bw = (W / n) * 0.62;
  const X = (i: number) => ((i + 0.5) / n) * W;
  const Y = (v: number) => T + H - (v / max) * H;
  const h = hover ?? n - 1;
  return (
    <div ref={ref} className="chart" style={{ height: B + 22 }} data-component="StackedWeeks">
      <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Volume hebdomadaire par discipline sur {0} semaines", { 0: n })}>
        {Array.from({ length: Math.round(max / step) }, (_, k) => <line key={k} x1="0" x2={W} y1={Y((k + 1) * step)} y2={Y((k + 1) * step)} strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />)}
        {weeks.map((w, i) => {
          let acc = 0;
          return order.map((d) => {
            const v = w.byDiscipline[d] ?? 0;
            if (!v) return null;
            const y0 = Y(acc), y1 = Y(acc + v);
            acc += v;
            return <rect key={i + d} x={X(i) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1 - 1)} style={{ fill: `var(--d-${d})`, opacity: hover === null || i === h ? 1 : 0.5 }} />;
          });
        })}
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {Array.from({ length: Math.round(max / step) }, (_, k) => <span key={k} className="tick" style={{ left: W + 6, top: Y((k + 1) * step) - 9 }}>{num(((k + 1) * step) / 3600, 0)}{NBSP}h</span>)}
      <span className="tick" style={{ top: B + 4, left: 0 }}>{dateShort(weeks[0].start)}</span>
      <span className="tick" style={{ top: B + 4, right: AXIS }}>{dateShort(weeks[n - 1].start)}</span>
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      {hover !== null && (
        <div role="status" className="tip" style={{ minWidth: 140, left: Math.min(Math.max(X(h) - 70, 0), W - 140), top: 4 }}>
          <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{$t("Semaine du")} {dateShort(weeks[h].start)} · {duration(weeks[h].total)}</span>
          {order.filter((d) => weeks[h].byDiscipline[d]).map((d) => <span key={d} className="t-caption c-reverse-muted">{DISCIPLINE_LABEL[d as 'RUN']} {duration(weeks[h].byDiscipline[d])}</span>)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ indicateur en escalier (VMA, CSS…)
export function StepChart({ history, format, color = 'var(--brand-primary)' }: { history: ZoneReading[]; format: (v: number) => string; color?: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const pts = [...history].sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1));
  if (pts.length < 2) return <div ref={ref} />;
  // la colonne des repères à droite s'adapte à la largeur des valeurs (« 2:15 /100 m » est plus large que « 202 bpm »)
  const axis = Math.max(AXIS, Math.max(...pts.map((p) => format(p.value).length)) * 6.6 + 12);
  const W = cw - axis - 4, T = 14, H = 90, B = T + H;
  const t0 = Date.parse(pts[0].measuredAt), t1 = Math.max(Date.now(), Date.parse(pts[pts.length - 1].measuredAt) + 864e5);
  const lo = Math.min(...pts.map((p) => p.value)), hi = Math.max(...pts.map((p) => p.value));
  const pad = (hi - lo) * 0.2 || hi * 0.05;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const Y = (v: number) => T + H - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * H;
  return (
    <div ref={ref} className="chart" style={{ height: B + 22 }}>
      <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Progression de l’indicateur")}>
        {pts.map((p, i) => {
          const x0 = X(Date.parse(p.measuredAt)), x1 = i + 1 < pts.length ? X(Date.parse(pts[i + 1].measuredAt)) : W;
          const dashed = p.source !== 'test';
          return (
            <g key={p.id}>
              <line x1={x0} x2={x1} y1={Y(p.value)} y2={Y(p.value)} strokeWidth="2.5" strokeDasharray={dashed ? '6 4' : undefined} style={{ stroke: color }} />
              {i + 1 < pts.length && <line x1={x1} x2={x1} y1={Y(p.value)} y2={Y(pts[i + 1].value)} strokeWidth="1" style={{ stroke: color, opacity: 0.5 }} />}
              <circle cx={x0} cy={Y(p.value)} r="3.5" style={{ fill: 'var(--bg-surface)', stroke: color }} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <span className="tick" style={{ left: W + 6, top: Y(hi) - 9 }}>{format(hi)}</span>
      {hi !== lo && <span className="tick" style={{ left: W + 6, top: Y(lo) - 9 }}>{format(lo)}</span>}
      <span className="tick" style={{ top: B + 4, left: 0 }}>{monthShort(pts[0].measuredAt.slice(0, 7))}</span>
      <span className="tick" style={{ top: B + 4, right: axis }}>{$t("aujourd’hui")}</span>
    </div>
  );
}

// ------------------------------------------------------------------ anneau (copie de PEAnalyze)
export interface Slice { value: number; color: string }
function rings(slices: Slice[], r: number, c: number, width: number) {
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const visible = slices.filter((x) => x.value > 0);
  const gap = visible.length > 1 ? 2 : 0;
  let off = 0;
  return visible.map((x, i) => {
    const len = Math.max((x.value / total) * C - gap, 0.5);
    const el = <circle key={i} cx={c} cy={c} r={r} fill="none" strokeWidth={width} strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform={`rotate(-90 ${c} ${c})`} style={{ stroke: x.color }} />;
    off += len + gap;
    return el;
  });
}
export function Donut({ slices, size = 150, ring = 22, label, children }: { slices: Slice[]; size?: number; ring?: number; label: string; children?: ReactNode }) {
  const c = size / 2, r = c - ring / 2 - 4;
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        {slices.some((s) => s.value > 0) ? rings(slices, r, c, ring) : <circle cx={c} cy={c} r={r} fill="none" strokeWidth={ring} style={{ stroke: 'var(--bg-grey-minimal)' }} />}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}
