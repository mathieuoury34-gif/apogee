// Graphiques de charge « à la Garmin » : charge aiguë avec entonnoir optimal, rapport de charge, bande de statut par semaine,
// répartition de la charge. Valeurs estimées par Apogée (voir domain/loadStatus.ts).
import { $t } from '../i18n';
import { useState, type ReactNode } from 'react';
import { Info, useWidth } from './kit';
import { Readout } from './readout';
import { hoverIndex, niceStep } from './charts';
import { dateShort, dayMonth, num, pct } from './format';
import { FOCUS_REF, RATIO_HIGH, RATIO_LOW, RATIO_OPT_HIGH, STATUS_ORDER, type AcutePoint, type LoadFocus, type StatusKey, type WeekStatus } from '../domain/loadStatus';

const AXIS = 36;

export const STATUS_INFO: Record<StatusKey, { label: string; color: string; text: string }> = {
  productive: { label: $t("Productif"), color: 'var(--success)', text: $t("Ta charge est dans la zone optimale et ta forme de fond monte.") },
  maintaining: { label: $t("Maintien"), color: 'var(--form-steady)', text: $t("Ta charge est dans la zone optimale et ta forme de fond reste stable.") },
  recovery: { label: $t("Récupération"), color: 'var(--form-strained)', text: $t("Semaine plus légère que d’habitude : ton corps récupère.") },
  unproductive: { label: $t("Peu productif"), color: 'var(--chart-other)', text: $t("Ta charge est dans la zone mais ta forme de fond baisse. Fatigue, sommeil, stress ?") },
  detraining: { label: $t("Désentraînement"), color: 'var(--form-depleted)', text: $t("Charge très basse : ta forme de fond baisse.") },
  high: { label: $t("Charge élevée"), color: 'var(--warning)', text: $t("Au-dessus de ta zone optimale. À surveiller.") },
  overreaching: { label: $t("Surcharge"), color: 'var(--critical)', text: $t("Hausse brutale de la charge : le risque de blessure ou de surmenage augmente.") },
};

function ratioColor(r: number | null): string {
  if (r === null) return 'var(--text-moderate)';
  return r > RATIO_HIGH ? 'var(--critical)' : r > RATIO_OPT_HIGH ? 'var(--warning)' : r >= RATIO_LOW ? 'var(--success)' : 'var(--form-strained)';
}

// ------------------------------------------------------------------ charge aiguë et entonnoir
export function AcuteLoadChart({ points, today }: { points: AcutePoint[]; today: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  if (n < 2) return <div ref={ref} className="t-caption c-moderate">{$t("Pas encore assez de jours pour tracer la charge aiguë.")}</div>;
  const W = cw - AXIS, T = 8, H = 150, B = T + H;
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.acute, p.top ?? 0)));
  const step = niceStep(maxV / 3), hi = Math.max(step, Math.ceil((maxV * 1.05) / step) * step);
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => B - (v / hi) * H;
  const withBand = points.map((p, i) => ({ p, i })).filter((q) => q.p.chronic !== null);
  const poly = (a: (p: AcutePoint) => number, b: (p: AcutePoint) => number) =>
    withBand.length < 2 ? '' : 'M' + withBand.map((q) => X(q.i).toFixed(1) + ',' + Y(a(q.p)).toFixed(1)).join(' L') + ' L' + withBand.slice().reverse().map((q) => X(q.i).toFixed(1) + ',' + Y(b(q.p)).toFixed(1)).join(' L') + ' Z';
  const line = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.acute).toFixed(1)).join(' ');
  const ti = points.findIndex((p) => p.day === today);
  const h = hover ?? (ti >= 0 && ti >= n - 1 ? ti : n - 1);
  const hp = points[h];
  const ticks: ReactNode[] = [];
  let grid = '';
  for (let v = 0; v <= hi + 1e-6; v += step) { grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' '; ticks.push(<span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{num(v, 0)}</span>); }
  const picks = [0, Math.round((n - 1) / 2), n - 1];
  return (
    <div className="stack-8" data-component="AcuteLoadChart">
      <Readout when={hp.day === today && hover === null ? $t("Aujourd’hui") : dayMonth(hp.day)} cells={[
        { label: $t("Charge aiguë (7 j)"), value: num(hp.acute, 0), color: 'var(--text)', key: true, valueColor: ratioColor(hp.ratio) },
        { label: $t("Rapport de charge"), value: hp.ratio === null ? '—' : num(hp.ratio, 2), color: ratioColor(hp.ratio), key: true, valueColor: ratioColor(hp.ratio) },
        { label: $t("Zone optimale"), value: hp.lo === null ? '—' : num(hp.lo, 0) + '–' + num(hp.hi!, 0), color: 'var(--success)' },
      ]} />
      <div ref={ref} className="chart" style={{ height: B + 22 }}>
        <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Charge aiguë des 7 derniers jours : {0}, zone optimale {1}", { 0: num(points[n - 1].acute, 0), 1: points[n - 1].lo === null ? '—' : num(points[n - 1].lo!, 0) + '–' + num(points[n - 1].hi!, 0) })}>
          <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
          <path d={poly((p) => p.hi!, (p) => p.top!)} style={{ fill: 'var(--warning)', opacity: 0.45 }} />
          <path d={poly((p) => p.lo!, (p) => p.hi!)} style={{ fill: 'var(--success)', opacity: 0.52 }} />
          <path d={line} fill="none" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--text)' }} />
        </svg>
        {ticks}
        {picks.map((i, k) => <span key={k} className="tick" style={{ top: B + 4, ...(k === 0 ? { left: 0 } : k === 2 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{dateShort(points[i].day)}</span>)}
        <div className="cross" style={{ top: T, height: H, left: X(h) }} />
        <span aria-hidden="true" className="marker-dot" style={{ background: ratioColor(hp.ratio), border: '2px solid var(--bg-surface)', left: X(h) - 5, top: Y(hp.acute) - 5 }} />
        <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      </div>
      <div className="legend">
        <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--text)' }} />{$t("Ta charge sur 7 jours")}</span>
        <span><span className="dot s10" style={{ background: 'var(--success)', opacity: 0.6 }} />{$t("Zone optimale")}</span>
        <span><span className="dot s10" style={{ background: 'var(--warning)', opacity: 0.5 }} />{$t("Élevée")}</span>
      </div>
      {withBand.length < 2 && <p className="t-legal c-moderate">{$t("La zone optimale apparaît après 28 jours d’historique : elle se déduit de ta charge habituelle.")}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ rapport de charge
export function RatioChart({ points, today }: { points: AcutePoint[]; today: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const pts = points.map((p, i) => ({ p, i })).filter((q) => q.p.ratio !== null);
  if (n < 2 || pts.length < 2) return <div ref={ref} className="t-caption c-moderate">{$t("Le rapport de charge apparaît après 28 jours d’historique.")}</div>;
  const W = cw - AXIS, T = 6, H = 96, B = T + H, LO = 0.4, HI = 2;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => B - ((Math.min(Math.max(v, LO), HI) - LO) / (HI - LO)) * H;
  const path = pts.map((q, k) => (k ? 'L' : 'M') + X(q.i).toFixed(1) + ',' + Y(q.p.ratio!).toFixed(1)).join(' ');
  const hv = hover === null ? pts[pts.length - 1] : pts.reduce((a, b) => (Math.abs(b.i - hover) < Math.abs(a.i - hover) ? b : a));
  const bands: [number, number, string][] = [[LO, RATIO_LOW, 'var(--form-strained)'], [RATIO_LOW, RATIO_OPT_HIGH, 'var(--success)'], [RATIO_OPT_HIGH, RATIO_HIGH, 'var(--warning)'], [RATIO_HIGH, HI, 'var(--critical)']];
  const picks = [0, Math.round((n - 1) / 2), n - 1];
  return (
    <div className="stack-8" data-component="RatioChart">
      <Readout when={hv.p.day === today && hover === null ? $t("Aujourd’hui") : dayMonth(hv.p.day)} cols={1} cells={[
        { label: $t("Rapport de charge"), value: num(hv.p.ratio!, 2), color: ratioColor(hv.p.ratio), key: true, valueColor: ratioColor(hv.p.ratio) },
      ]} />
      <div ref={ref} className="chart" style={{ height: B + 22 }}>
        <svg viewBox={`0 0 ${cw} ${B + 22}`} width={cw} height={B + 22} role="img" aria-label={$t("Rapport de charge {0}", { 0: num(pts[pts.length - 1].p.ratio!, 2) })}>
          {bands.map(([a, b, c]) => <rect key={a} x="0" y={Y(b)} width={W} height={Y(a) - Y(b)} style={{ fill: c, opacity: 0.45 }} />)}
          <path d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--text)' }} />
        </svg>
        {[RATIO_LOW, RATIO_OPT_HIGH, RATIO_HIGH].map((v) => <span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{num(v, 1)}</span>)}
        {picks.map((i, k) => <span key={k} className="tick" style={{ top: B + 4, ...(k === 0 ? { left: 0 } : k === 2 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{dateShort(points[i].day)}</span>)}
        <div className="cross" style={{ top: T, height: H, left: X(hv.i) }} />
        <span aria-hidden="true" className="marker-dot" style={{ background: ratioColor(hv.p.ratio), border: '2px solid var(--bg-surface)', left: X(hv.i) - 5, top: Y(hv.p.ratio!) - 5 }} />
        <div className="hit" style={{ width: W, height: B }} onPointerMove={(e) => setHover(hoverIndex(e, n))} onPointerDown={(e) => setHover(hoverIndex(e, n))} onPointerLeave={() => setHover(null)} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bande de statut par semaine
export function StatusStrip({ weeks }: { weeks: WeekStatus[] }) {
  const [selStart, setSelStart] = useState<string | null>(null);
  const found = selStart === null ? -1 : weeks.findIndex((x) => x.start === selStart);
  const sel = found >= 0 ? found : weeks.length - 1;
  const w = weeks[sel];
  const daily = !!weeks[0]?.daily;
  const info = w?.status ? STATUS_INFO[w.status] : null;
  const present = STATUS_ORDER.filter((k) => weeks.some((x) => x.status === k));
  return (
    <div className="stack-8" data-component="StatusStrip">
      <div className="status-strip" role="list" aria-label={daily ? $t("Statut de chaque jour") : $t("Statut de chaque semaine")}>
        {weeks.map((x, i) => (
          <button key={x.start} role="listitem" type="button" className={'seg' + (i === sel ? ' on' : '') + (x.partial ? ' partial' : '')} aria-pressed={i === sel} aria-label={dayMonth(x.start) + ' : ' + (x.status ? STATUS_INFO[x.status].label : $t("pas assez d’historique"))} style={{ background: x.status ? STATUS_INFO[x.status].color : 'var(--bg-surface-minimal)' }} onClick={() => setSelStart(x.start)} />
        ))}
      </div>
      <div className="between t-legal c-moderate"><span>{dayMonth(weeks[0].start)}</span><span>{dayMonth(weeks[weeks.length - 1].start)}</span></div>
      {w && (
        <div role="status" aria-live="polite" className="status-detail">
          <div className="between wrap"><span className="t-strong" style={{ color: info?.color }}>{info ? info.label : $t("Pas encore de statut")}</span><span className="t-caption c-moderate">{daily ? dayMonth(w.start) : $t("Semaine du {0}", { 0: dayMonth(w.start) })}{w.partial ? $t(" (en cours)") : ''}</span></div>
          <p className="t-caption c-neutral">{info ? info.text : $t("Il faut 28 jours d’historique pour situer la semaine.")}</p>
          {w.ratio !== null && <p className="t-legal c-moderate">{daily ? $t("Charge des 7 jours {0} · rapport {1}", { 0: num(w.load, 0), 1: num(w.ratio, 2) }) : $t("Charge de la semaine {0} · rapport {1}", { 0: num(w.load, 0), 1: num(w.ratio, 2) })}</p>}
        </div>
      )}
      {present.length > 0 && <div className="legend">{present.map((k) => <span key={k}><span className="dot s10" style={{ background: STATUS_INFO[k].color }} />{STATUS_INFO[k].label}</span>)}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ répartition de la charge
const FOCUS_ROWS: { key: 'low' | 'high' | 'anaerobic'; label: string; color: string; more: string; less: string }[] = [
  { key: 'low', label: $t("Faible aérobie"), color: 'var(--zone-easy)', more: $t("Beaucoup de facile : de la base, mais pense à quelques séances plus soutenues."), less: $t("Peu de facile : ajoute des sorties tranquilles pour construire la base.") },
  { key: 'high', label: $t("Aérobie élevée"), color: 'var(--zone-hard)', more: $t("Beaucoup de soutenu : attention à la fatigue qui s’installe."), less: $t("Peu de soutenu : une séance au seuil par semaine ferait progresser l’allure.") },
  { key: 'anaerobic', label: $t("Anaérobie"), color: 'var(--zone-intense)', more: $t("Beaucoup d’intensité : garde-la pour peu de séances."), less: $t("Peu d’intensité : des fractionnés courts entretiennent la vitesse et la VO₂max.") },
];
export function FocusBars({ focus }: { focus: LoadFocus }) {
  if (!(focus.total > 0)) return <p className="t-caption c-moderate">{$t("Il faut des séances avec une FC (courbe ou moyenne) sur la période choisie, et une FC max connue.")}</p>;
  return (
    <div className="stack-12" data-component="FocusBars">
      {FOCUS_ROWS.map((r) => {
        const v = focus[r.key] / focus.total, [a, b] = FOCUS_REF[r.key];
        const verdict = v > b ? r.more : v < a ? r.less : $t("Dans la fourchette courante.");
        return (
          <div key={r.key} className="stack-4">
            <div className="between t-caption"><span className="t-caption-strong">{r.label}</span><span className="c-neutral">{pct(v)} · {num(focus[r.key], 0)}</span></div>
            <div className="focus-bar" role="img" aria-label={r.label + ' ' + pct(v)}>
              <span className="ref" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
              <span className="val" style={{ width: `${Math.min(100, v * 100)}%`, background: r.color }} />
            </div>
            <span className="t-legal c-moderate">{verdict}</span>
          </div>
        );
      })}
      <Info>{$t("Bande claire = repère courant d’une semaine équilibrée (indicatif, pas une prescription). Calcul sur la période affichée : la charge de chaque séance de course, vélo ou natation avec FC est partagée selon le temps passé dans chaque zone, une minute intense pesant plus qu’une minute facile (le poids de chaque zone vient du modèle d’effort de la charge) ; la charge du renforcement compte en anaérobie{0}. Garmin classe autrement, avec ses propres seuils : les parts ne sont pas comparables une à une.", { 0: focus.skipped ? $t(" ; {0} séance(s) sans FC non comptée(s)", { 0: focus.skipped }) : '' })}</Info>
    </div>
  );
}
