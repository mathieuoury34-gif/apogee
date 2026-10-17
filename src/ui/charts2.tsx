// Graphiques de la page Analyse : répartition par zone (barres 100 %), forme de fond par discipline.
import { $t } from '../i18n';
import { useState } from 'react';
import { useWidth } from './kit';
import { dateShort, DISCIPLINE_LABEL, num, pct } from './format';
import type { FitnessSlice, LoadKey } from '../domain/loadByDiscipline';
import { LOAD_KEYS } from '../domain/loadByDiscipline';

export interface SplitRow { label: string; easy: number; hard: number; intense: number }

/** Une ligne par semaine : barre horizontale à 100 % partagée entre facile / soutenue / intense. */
export function SplitBars({ rows }: { rows: SplitRow[] }) {
  return (
    <ul className="stack" style={{ gap: 'var(--space-8)' }}>
      {rows.map((r) => {
        const t = r.easy + r.hard + r.intense;
        const w = (v: number) => (t ? `${(v / t) * 100}%` : '0%');
        return (
          <li key={r.label} className="stack-4">
            <div className="between t-caption"><span className="t-caption-strong">{r.label}</span><span className="c-neutral">{t ? `${pct(r.easy / t)} · ${pct(r.hard / t)} · ${pct(r.intense / t)}` : '—'}</span></div>
            <div className="zbar" role="img" aria-label={t ? $t("Facile {0}, soutenu {1}, intense {2}", { 0: pct(r.easy / t), 1: pct(r.hard / t), 2: pct(r.intense / t) }) : $t("Pas de données")}>
              <span style={{ width: w(r.easy), background: 'var(--zone-easy)' }} /><span style={{ width: w(r.hard), background: 'var(--zone-hard)' }} /><span style={{ width: w(r.intense), background: 'var(--zone-intense)' }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const FITNESS_COLOR: Record<LoadKey, string> = { SWIM: 'var(--d-SWIM)', BIKE: 'var(--d-BIKE)', RUN: 'var(--d-RUN)', STRENGTH: 'var(--d-STRENGTH)', OTHER: 'var(--d-OTHER)', FORFAIT: 'var(--bg-brand-moderate)' };
export const FITNESS_LABEL: Record<LoadKey, string> = { SWIM: DISCIPLINE_LABEL.SWIM, BIKE: DISCIPLINE_LABEL.BIKE, RUN: DISCIPLINE_LABEL.RUN, STRENGTH: DISCIPLINE_LABEL.STRENGTH, OTHER: DISCIPLINE_LABEL.OTHER, FORFAIT: $t("Interruption (forfait)") };

/** Barres empilées de la forme de fond (une barre par semaine), la hauteur totale est la forme de fond. */
export function StackedFitness({ slices, keys }: { slices: FitnessSlice[]; keys: LoadKey[] }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = slices.length;
  if (n < 2) return <div ref={ref} className="t-caption c-moderate">{$t("Pas encore assez d’historique.")}</div>;
  const AX = 36, W = cw - AX, T = 8, H = 150, B = T + H;
  const tot = (s: FitnessSlice) => keys.reduce((t, k) => t + s.byKey[k], 0);
  const top = Math.max(...slices.map(tot), 1);
  const stepRaw = top / 3, mag = 10 ** Math.floor(Math.log10(stepRaw)), step = ([1, 2, 5, 10].map((m) => m * mag).find((x) => x >= stepRaw) ?? mag * 10);
  const max = Math.ceil(top / step) * step;
  const bw = Math.max(2, (W / n) * 0.7);
  const X = (i: number) => ((i + 0.5) / n) * W;
  const Y = (v: number) => T + H - (v / max) * H;
  const h = hover ?? n - 1;
  const idx = (e: React.PointerEvent<HTMLDivElement>) => Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - e.currentTarget.getBoundingClientRect().left) / W) * n)));
  return (
    <div ref={ref} className="chart" style={{ height: B + 22 }} data-component="StackedFitness">
      <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Forme de fond par discipline")}>
        {Array.from({ length: Math.round(max / step) }, (_, k) => <line key={k} x1="0" x2={W} y1={Y((k + 1) * step)} y2={Y((k + 1) * step)} strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />)}
        {slices.map((s, i) => { let acc = 0; return keys.map((k) => { const v = s.byKey[k]; if (v <= 0) return null; const y0 = Y(acc), y1 = Y(acc + v); acc += v; return <rect key={i + k} x={X(i) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1 - 0.5)} style={{ fill: FITNESS_COLOR[k], opacity: hover === null || i === h ? 1 : 0.55 }} />; }); })}
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {Array.from({ length: Math.round(max / step) }, (_, k) => <span key={k} className="tick" style={{ left: W + 6, top: Y((k + 1) * step) - 9 }}>{num((k + 1) * step, 0)}</span>)}
      <span className="tick" style={{ top: B + 4, left: 0 }}>{dateShort(slices[0].day)}</span>
      <span className="tick" style={{ top: B + 4, right: AX }}>{dateShort(slices[n - 1].day)}</span>
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(idx(e))} onPointerDown={(e) => setHover(idx(e))} onPointerLeave={() => setHover(null)} />
      {hover !== null && (
        <div role="status" className="tip" style={{ minWidth: 150, left: Math.min(Math.max(X(h) - 75, 0), W - 150), top: 4 }}>
          <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{dateShort(slices[h].day)} · {num(tot(slices[h]), 0)}</span>
          {keys.filter((k) => slices[h].byKey[k] > 0.5).map((k) => <span key={k} className="t-caption c-reverse-muted">{FITNESS_LABEL[k]} {num(slices[h].byKey[k], 0)}</span>)}
        </div>
      )}
    </div>
  );
}

export const FITNESS_KEYS = LOAD_KEYS;
