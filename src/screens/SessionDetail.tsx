// Bilan d'une séance « à la Garmin » : graphiques parcourables (FC, vitesse ou allure), temps par zone de FC (Karvonen), statistiques groupées.
// Tout est calculé à l'ouverture avec la courbe de FC et la courbe de vitesse déjà stockées ; une donnée que la montre ne nous transmet pas
// (foulée, puissance, SWOLF, séries et charges de musculation, altitude…) n'est pas inventée : elle n'apparaît pas.
import { $t } from '../i18n';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useCalc } from '../data/store';
import { Info, InfoCard, InfoToggle, Segmented } from '../ui/kit';
import { ChartPanel, type ChartBand, type ChartPt, type XKind } from '../ui/sessionChart';
import { ZONE_COLOR, ZoneRows, ZoneScale } from '../ui/zoneviz';
import { SplitBars } from '../ui/charts2';
import { cleanHr } from '../domain/hr';
import { sessionDay } from '../domain/load';
import { distanceAt, distanceCurve, hrView, rangeStats, speedStats } from '../domain/sessionStats';
import { KCAL_J, paceOf } from '../domain/stats';
import { polarSplit } from '../domain/zones';
import { overlaySteps, type StepResult } from '../domain/plannedSteps';
import type { Segment } from '../domain/sessionStats';
import type { ActualSession } from '../domain/types';
import { KIND_LABEL as BLOCK_KIND, NBSP, bpm, descent, duration, elevation, hhmm, kcal, mmss, num, paceFor, speedKmh, targetText } from '../ui/format';

const HR_COLOR = 'var(--critical)';
const kindSpeedLabel = (d: string) => (d === 'BIKE' || d === 'OTHER' ? $t("Vitesse") : $t("Allure"));

function percentile(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]; }
/** Moyenne glissante sur `n` mesures (lisse le bruit du GPS pour tracer la vitesse). */
function smooth(v: number[], n: number): number[] {
  const out: number[] = [], h = Math.floor(n / 2);
  for (let i = 0; i < v.length; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - h); k <= Math.min(v.length - 1, i + h); k++) { s += v[k]; c++; } out.push(s / c); }
  return out;
}

/** `children` : cartes à placer après les statistiques (l'ordre du bilan est choisi par l'écran qui l'appelle). */
export function SessionAnalysis({ s, children }: { s: ActualSession; children?: ReactNode }) {
  const { data, d } = useCalc();
  const [xKind, setXKind] = useState<XKind>('time');
  const [zmode, setZmode] = useState<'time' | 'pct'>('time');
  const day = sessionDay(s);
  const ser = data.series[s.id];
  const hr = useMemo(() => (ser && !ser.deleted ? cleanHr(ser.hr) : []), [ser]);
  const speed = ser && !ser.deleted ? ser.speed : null;
  const hrMax = d.ctx.hrMaxAt(day), rest = d.ctx.restAt(day);
  const hv = useMemo(() => (hrMax ? hrView(hr, hrMax, rest) : null), [hr, hrMax, rest]);
  const sp = useMemo(() => (speed ? speedStats(speed, s.distanceM, s.durationSec) : null), [speed, s.distanceM, s.durationSec]);
  const curve = useMemo(() => (speed && s.discipline !== 'STRENGTH' ? distanceCurve(speed, s.distanceM) : null), [speed, s.distanceM, s.discipline]);
  const start = Date.parse(s.startAt) / 1000;
  const xs = (t: number) => (xKind === 'distance' && curve ? distanceAt(curve, t) : t - start);
  const kind: XKind = xKind === 'distance' && curve ? 'distance' : 'time';

  // ---- FC
  const hrPts: ChartPt[] = useMemo(() => hr.map((p) => ({ x: xs(p[0]), t: p[0], v: p[1] })), [hr, kind, curve, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const hrVals = hr.map((p) => p[1]);
  const hrLo = hrVals.length ? Math.floor((Math.min(...hrVals) - 3) / 20) * 20 : 0, hrHi = hrVals.length ? Math.ceil((Math.max(...hrVals) + 3) / 20) * 20 : 200;
  const bands: ChartBand[] | undefined = hv ? hv.ranges.map((r, i) => ({ lo: i === 0 ? 0 : r.lo, hi: i === 4 ? 300 : r.hi, color: ZONE_COLOR[i] })) : undefined;

  // ---- vitesse / allure
  const kindSpeed = s.discipline === 'BIKE' || s.discipline === 'OTHER';
  const perHundred = s.discipline === 'SWIM';
  const spPts: ChartPt[] = useMemo(() => {
    if (!speed || speed.length < 20 || s.discipline === 'STRENGTH') return [];
    const v = speed.filter((p) => Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 35).sort((a, b) => a[0] - b[0]);
    const sm = smooth(v.map((p) => p[1]), 5);
    return v.map((p, i) => {
      const val = kindSpeed ? sm[i] * 3.6 : Math.min(perHundred ? 300 : 720, sm[i] > 0.05 ? (perHundred ? 100 : 1000) / sm[i] : (perHundred ? 300 : 720));
      return { x: xs(p[0]), t: p[0], v: val };
    });
  }, [speed, kind, curve, start, kindSpeed, perHundred, s.discipline]); // eslint-disable-line react-hooks/exhaustive-deps
  const spVals = spPts.map((p) => p.v).sort((a, b) => a - b);
  let spDomain: [number, number] = [0, 10], spStep = 5;
  if (spVals.length) {
    if (kindSpeed) { const top = Math.ceil((spVals[spVals.length - 1] + 1) / 10) * 10; spDomain = [0, top]; spStep = 10; }
    else { const lo = Math.floor(percentile(spVals, 0.02) / 30) * 30, hi = Math.min(perHundred ? 300 : 720, Math.ceil(percentile(spVals, 0.98) / 30) * 30); spDomain = [lo, Math.max(hi, lo + 90)]; spStep = spDomain[1] - spDomain[0] > 360 ? 120 : spDomain[1] - spDomain[0] > 180 ? 60 : 30; }
  }
  const avgPace = paceOf(s);
  const avgSpeedKmh = s.distanceM && s.durationSec ? (s.distanceM / s.durationSec) * 3.6 : null;
  const spAvg = kindSpeed ? avgSpeedKmh : avgPace;
  const spFmt = (v: number) => (kindSpeed ? num(v, 1) + NBSP + 'km/h' : mmss(v) + NBSP + (perHundred ? '/100' + NBSP + 'm' : '/km'));
  const bestPace = sp?.maxMs ? (perHundred ? 100 : 1000) / sp.maxMs : null;

  // ---- étapes de la séance prévue (si toutes au temps), tours et séries de la montre
  const link = d.links.byActual.get(s.id);
  const planned = link?.plannedId ? data.planned[link.plannedId] : undefined;
  const planSteps = useMemo(() => (planned && !planned.deleted ? overlaySteps(planned, start, s.durationSec, speed ?? null, hr, s.distanceM, s.discipline) : null), [planned, start, s.durationSec, speed, hr, s.distanceM, s.discipline]);
  const watchLaps: Segment[] = useMemo(() => {
    const L = ser && !ser.deleted ? ser.laps ?? [] : [];
    if (L.length < 2) return [];
    const hp = hr.map((p) => ({ t: p[0], v: p[1] }));
    return L.map(([a, b, len]) => {
      const sec = Math.max(0, b - a);
      const m = len ?? (curve ? Math.max(0, distanceAt(curve, b) - distanceAt(curve, a)) : null);
      const h = rangeStats(hp, a, b, 120);
      return { from: a, to: b, sec, metres: m, ms: m !== null && sec > 0 ? m / sec : null, avgHr: h ? h.avg : null, maxHr: h ? h.max : null };
    });
  }, [ser, hr, curve]);
  const sets = ser && !ser.deleted ? (ser.segments ?? []).filter((x) => x[3] > 0) : [];
  const [lapMode, setLapMode] = useState<'plan' | 'watch' | 'sets' | null>(null);
  const lapModes: ['plan' | 'watch' | 'sets', string][] = [];
  if (planSteps) lapModes.push(['plan', $t("Intervalles")]);
  if (watchLaps.length) lapModes.push(['watch', $t("Tours montre")]);
  if (sets.length) lapModes.push(['sets', $t("Séries")]);
  const lapNow = lapMode && lapModes.some(([k]) => k === lapMode) ? lapMode : lapModes[0]?.[0] ?? null;
  const unitPace = (ms: number | null) => (ms && ms > 0.05 ? (s.discipline === 'BIKE' || s.discipline === 'OTHER' ? speedKmh(ms) : paceFor((perHundred ? 100 : 1000) / ms, s.discipline)) : '—');
  const clk = (sec: number) => (sec >= 3600 ? hhmm(sec) : mmss(sec));
  const dist = (m: number | null) => (m === null ? '—' : perHundred ? num(m, 0) + NBSP + 'm' : num(m / 1000, 2) + NBSP + 'km');
  const stepName = (g: StepResult) => (g.block.label ? g.block.label : BLOCK_KIND[g.kind] + (g.kind === 'WORK' || g.kind === 'RECOVERY' || g.kind === 'REST' ? ' ' + g.rank : ''));

  const showHr = hrPts.length >= 20;
  const showSpeed = spPts.length >= 20;
  const zt = hv ? hv.zones : null;
  const ztot = zt ? zt.reduce((a, b) => a + b, 0) : 0;
  const pol = zt ? polarSplit(zt) : null;
  const restLabel = hv ? Math.round(hv.hrRest) : null;

  const rowsStat: [string, string | null][] = [];
  const add = (k: string, v: string | null) => { if (v && v !== '—') rowsStat.push([k, v]); };
  if (s.discipline !== 'STRENGTH') {
    if (s.discipline === 'BIKE' || s.discipline === 'OTHER') {
      add($t("Vitesse moyenne"), avgSpeedKmh ? speedKmh(avgSpeedKmh / 3.6) : null);
      add($t("Vitesse maximale"), sp?.maxMs ? speedKmh(sp.maxMs) : null);
    } else {
      add($t("Allure moyenne"), avgPace ? paceFor(avgPace, s.discipline) : null);
      add($t("Meilleure allure"), bestPace ? paceFor(bestPace, s.discipline) : null);
      add($t("Vitesse moyenne"), avgSpeedKmh ? speedKmh(avgSpeedKmh / 3.6) : null);
      add($t("Vitesse maximale"), sp?.maxMs ? speedKmh(sp.maxMs) : null);
    }
  }
  const timing: [string, string | null][] = [[$t("Durée totale"), duration(s.durationSec)]];
  const heart: [string, string | null][] = [
    [$t("FC moyenne"), s.avgHrBpm ? bpm(Math.round(s.avgHrBpm)) : null], [$t("FC maximale"), bpm(s.maxHrBpm)],
  ];
  const restKcal = s.totalCaloriesJ && s.activeCaloriesJ ? Math.max(0, (s.totalCaloriesJ - s.activeCaloriesJ) / KCAL_J) : null;
  const cal: [string, string | null][] = [[$t("Calories actives"), s.activeCaloriesJ ? kcal(s.activeCaloriesJ / KCAL_J) : null], [$t("Calories de repos"), restKcal ? kcal(restKcal) : null], [$t("Calories totales"), s.totalCaloriesJ ? kcal(s.totalCaloriesJ / KCAL_J) : null]];
  const elev: [string, string | null][] = [[$t("Dénivelé positif"), s.elevationGainM ? elevation(s.elevationGainM) : null], [$t("Dénivelé négatif"), s.elevationLossM ? descent(s.elevationLossM) : null]];
  const groups: [string, [string, string | null][]][] = [
    [$t("Vitesse et allure"), rowsStat], [$t("Temps"), timing], [$t("Fréquence cardiaque"), heart], [$t("Calories"), cal], [$t("Dénivelé"), elev],
  ];
  const shown = groups.map(([t, rows]) => [t, rows.filter((r) => r[1] && r[1] !== '—')] as [string, [string, string | null][]]).filter(([, rows]) => rows.length);

  return (
    <>
      {(showHr || showSpeed) && (
        <InfoCard className="card g16 dspan-7" aria-label={$t("Graphiques")}>
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <h2>{$t("Graphiques")}<InfoToggle /></h2>
            {curve && <Segmented label={$t("Axe horizontal")} value={xKind} onChange={setXKind} options={[['time', $t("Temps")], ['distance', $t("Distance")]]} />}
          </div>
          <Info>{$t("Un doigt posé ou glissé : l’instant et la valeur. Deux doigts posés : la zone entre eux est sélectionnée et on lit la moyenne (par exemple la FC moyenne entre ces deux instants). À la souris : glisser pour sélectionner. Le bouton « Zones de FC » colore les zones (Karvonen). L’axe en distance se calcule avec la courbe de vitesse.")}</Info>
          {showHr && <ChartPanel title={$t("Fréquence cardiaque")} pts={hrPts} xKind={kind} valueText={(v) => num(v, 0) + NBSP + 'bpm'} color={HR_COLOR} avg={s.avgHrBpm ?? (hv?.avg ?? null)} cap={120} domain={[hrLo, hrHi]} tickStep={20} bands={bands} label={$t("Fréquence cardiaque pendant la séance")}
            heads={[{ value: bpm(Math.round(s.avgHrBpm ?? hv?.avg ?? 0)), label: $t("Moyenne") }, { value: bpm(s.maxHrBpm), label: $t("Maximum") }]} />}
          {showSpeed && <ChartPanel title={kindSpeed ? $t("Vitesse") : $t("Allure")} pts={spPts} xKind={kind} valueText={spFmt} tickText={kindSpeed ? undefined : mmss} inverted={!kindSpeed} color="var(--info-icon)" avg={spAvg} cap={30} domain={spDomain} tickStep={spStep} label={kindSpeed ? $t("Vitesse pendant la séance") : $t("Allure pendant la séance")}
            avgWord={$t("Moyenne")} heads={[{ value: spAvg ? spFmt(spAvg) : '—', label: $t("Moyenne") }, { value: kindSpeed ? (sp?.maxMs ? speedKmh(sp.maxMs) : '—') : bestPace ? spFmt(bestPace) : '—', label: kindSpeed ? $t("Maximum") : $t("Meilleure") }]} />}
        </InfoCard>
      )}

      {lapNow && (
        <InfoCard className="card g12 dspan-7" aria-label={$t("Tours et intervalles")}>
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <h2>{$t("Tours et intervalles")}<InfoToggle /></h2>
            {lapModes.length > 1 && <Segmented label={$t("Affichage")} value={lapNow} onChange={setLapMode} options={lapModes} />}
          </div>
          {lapNow === 'plan' && planSteps && (
            <div className="laps" role="table" aria-label={$t("Intervalles")}>
              <div className="laps-row laps-h" role="row"><span>{$t("Étape")}</span><span>{$t("Durée")}</span><span>{$t("Dist.")}</span><span>{kindSpeedLabel(s.discipline)}</span><span>{$t("FC")}</span></div>
              {planSteps.map((g, i) => (
                <div key={i} role="row" className={'laps-row ' + (g.kind === 'WORK' ? 'laps-work' : 'laps-other')}>
                  <span className="laps-name">{stepName(g)}{planned && targetText(g.block, planned.discipline) ? <span className="laps-target">{targetText(g.block, planned.discipline)}</span> : null}</span><span>{clk(g.to - g.from)}</span><span>{dist(g.metres)}</span><span>{unitPace(g.ms)}</span><span>{g.avgHr ? num(g.avgHr, 0) : '—'}</span>
                </div>
              ))}
            </div>
          )}
          {lapNow === 'watch' && (
            <div className="laps" role="table" aria-label={$t("Tours")}>
              <div className="laps-row laps-h" role="row"><span>{$t("Tour")}</span><span>{$t("Temps")}</span><span>{$t("Dist.")}</span><span>{kindSpeedLabel(s.discipline)}</span><span>{$t("FC")}</span></div>
              {watchLaps.map((g, i) => (
                <div key={i} role="row" className="laps-row laps-other">
                  <span className="laps-name">{i + 1}</span><span>{clk(g.sec)}</span><span>{dist(g.metres)}</span><span>{unitPace(g.ms)}</span><span>{g.avgHr ? num(g.avgHr, 0) : '—'}</span>
                </div>
              ))}
            </div>
          )}
          {lapNow === 'sets' && (
            <div className="laps" role="table" aria-label={$t("Séries")}>
              <div className="laps-row laps-h laps-sets" role="row"><span>{$t("Série")}</span><span>{$t("Durée")}</span><span>{$t("Répétitions")}</span></div>
              {sets.map((g, i) => (
                <div key={i} role="row" className="laps-row laps-other laps-sets"><span className="laps-name">{i + 1}</span><span>{clk(Math.max(0, g[1] - g[0]))}</span><span>{g[3]}</span></div>
              ))}
            </div>
          )}
          <Info>{lapNow === 'watch' ? $t("Tours enregistrés par ta montre et transmis par Health Connect.") : lapNow === 'sets' ? $t("Séries transmises par ta montre via Health Connect (durée et répétitions ; le poids n’est pas transmis).") : $t("Les étapes viennent de la séance prévue rattachée (toutes au temps) : la courbe réelle est découpée suivant leurs durées, en partant du début de la séance. Durée, distance, allure et FC sont calculées par Apogée ; elles peuvent s’écarter de quelques secondes si tu as appuyé sur la montre en retard.")}</Info>
        </InfoCard>
      )}

      {hv && zt && ztot > 0 && (
        <InfoCard className="card g12 dspan-5" aria-label={$t("Temps par zone de FC")}>
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <h2>{$t("Temps par zone de FC")}<InfoToggle /></h2>
            <Segmented label={$t("Affichage")} value={zmode} onChange={setZmode} options={[['time', $t("Durée")], ['pct', '%']]} />
          </div>
          <ZoneScale ranges={hv.ranges} />
          <ZoneRows zones={zt} ranges={hv.ranges} mode={zmode} />
          {pol && <div className="stack-4"><SplitBars rows={[{ label: $t("Facile · soutenue · intense"), easy: pol.easy, hard: pol.hard, intense: pol.intense }]} /></div>}
          <Info>{$t("Méthode de Karvonen : chaque seuil = FC de repos + % × (FC max − FC de repos), avec Z1 < 60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 % de la réserve. FC max retenue {0} bpm ; FC de repos {1} bpm{2}. Les zones de ta montre sont en % de la FC max seule : leurs bornes diffèrent.", { 0: num(hv.hrMax, 0), 1: restLabel ?? '—', 2: hv.restKnown ? $t(" (médiane des 14 derniers jours)") : $t(" (valeur de référence : pas de FC de repos mesurée)") })}</Info>
        </InfoCard>
      )}

      {shown.length > 0 && (
        <InfoCard className="card g12 dspan-7" aria-label={$t("Statistiques")}>
          <h2>{$t("Statistiques")}<InfoToggle /></h2>
          {shown.map(([title, rows]) => (
            <div key={title} className="stack-4">
              <h3 className="stat-title">{title}</h3>
              <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            </div>
          ))}
          <Info>{$t("Calculé par Apogée à partir de la courbe de FC et de vitesse de la montre. Foulée, puissance, SWOLF et poids de musculation ne sont pas transmis par la montre à l’application : ils n’apparaissent pas. Les tours et les séries de la montre n’apparaissent que si elle les envoie.")}</Info>
        </InfoCard>
      )}
      {children}
    </>
  );
}
