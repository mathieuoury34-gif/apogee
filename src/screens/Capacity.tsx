// Fenêtres « à la Garmin » calculées par Apogée avec des méthodes publiées (domain/science.ts, domain/capacity.ts) :
// disponibilité à l'entraînement, réserve d'énergie, VO₂max estimée, prédictions de course, endurance, côtes,
// Training Effect d'une séance. Ce sont des estimations Apogée, pas les indices de Garmin.
import { $t } from '../i18n';
import { useMemo } from 'react';
import { useCalc } from '../data/store';
import { Info, InfoCard, InfoToggle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useLocalSheet } from '../ui/menu';
import { CheckinSheet } from './Wellness';
import { navigate } from '../ui/router';
import { addDays, dayRange } from '../domain/dates';
import { DayChart } from '../ui/daychart';
import { PeriodBar, useDaySel, usePeriod } from '../ui/period';
import { Readout } from '../ui/readout';
import {
  bestEfforts, effortAdjuster, energyReserve, enduranceScore, hillScore, readiness, readinessFactors, trainingEffects, vo2maxEstimate,
  readinessLevel, type ReadinessKey, type ReadinessLevel,
} from '../domain/capacity';
import type { TeLevel } from '../domain/science';
import { dayMonth, dayTitle, hhmm, NBSP, num, signed, weekdayShort } from '../ui/format';

// ------------------------------------------------------------------ Training Effect (détail d'une séance)
export const TE_LABEL: Record<TeLevel, string> = { none: $t("Aucun effet"), minor: $t("Effet léger"), maintain: $t("Maintien"), improve: $t("Amélioration"), high: $t("Forte amélioration"), over: $t("Surcharge") };
const TE_COLOR: Record<TeLevel, string> = { none: 'var(--text-moderate)', minor: 'var(--form-strained)', maintain: 'var(--form-steady)', improve: 'var(--form-ready)', high: 'var(--form-fresh)', over: 'var(--critical)' };

export function TrainingEffectCard({ id }: { id: string }) {
  const { data, d } = useCalc();
  const e = trainingEffects(data, d).get(id);
  if (!e) return null;
  const row = (label: string, v: number | null, lvl: TeLevel | null) => (
    <div className="stack-4">
      <div className="between"><span className="t-label">{label}</span>{v === null || lvl === null ? <span className="t-caption c-moderate">—</span> : <span className="row" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}><strong>{num(v, 1)}</strong><span className="t-caption" style={{ color: TE_COLOR[lvl] }}>{TE_LABEL[lvl]}</span></span>}</div>
      <div className="meter" role="img" aria-label={label + ' ' + (v === null ? '—' : num(v, 1) + ' / 5')}><span style={{ width: v === null ? 0 : `${(v / 5) * 100}%`, background: lvl ? TE_COLOR[lvl] : undefined }} /></div>
    </div>
  );
  return (
    <InfoCard className="card g12 dspan-5" aria-label={$t("Effet de la séance")}>
      <h2>{$t("Effet de la séance")}<InfoToggle /></h2>
      {row($t("Aérobie"), e.aerobic, e.level)}
      {row($t("Anaérobie"), e.anaerobic, e.anaerobicLevel)}
      <Info>{$t("Échelle de 0 à 5 comme sur les montres. Aérobie : charge de la séance (modèle d’effort de type EPOC, la dépense d’oxygène après l’effort) comparée à une séance solide de tes 90 derniers jours ({0}).", { 0: e.refIsDefault ? $t("valeur type : historique trop court") : num(e.refLoad, 0) })}{e.anaerobic === null ? '' : $t(" Anaérobie : temps passé à 90 % de la FC max ou plus ({0}), approximation d’Apogée.", { 0: Math.round((e.zone5Sec ?? 0) / 60) + NBSP + 'min' })}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ disponibilité à l'entraînement
const R_LABEL: Record<ReadinessLevel, string> = { prime: $t("Au top"), high: $t("Élevée"), moderate: $t("Moyenne"), low: $t("Faible"), poor: $t("Très faible") };
const R_TEXT: Record<ReadinessLevel, string> = {
  prime: $t("Tout est au vert : une séance exigeante est possible."),
  high: $t("Bonne disponibilité : une séance de qualité passe bien."),
  moderate: $t("Disponibilité correcte : séance normale, écoute tes sensations."),
  low: $t("Plutôt une séance facile ou du repos."),
  poor: $t("Récupération prioritaire aujourd’hui."),
};
const R_COLOR: Record<ReadinessLevel, string> = { prime: 'var(--form-fresh)', high: 'var(--form-ready)', moderate: 'var(--form-steady)', low: 'var(--form-strained)', poor: 'var(--form-depleted)' };
const R_FACTOR: Record<ReadinessKey, string> = { sleep: $t("Sommeil de la nuit"), sleepHistory: $t("Sommeil des 3 dernières nuits"), restingHr: $t("FC de repos"), acuteLoad: $t("Charge récente (aiguë / chronique)"), freshness: $t("Fraîcheur") };
const R_ORDER: ReadinessKey[] = ['sleep', 'sleepHistory', 'restingHr', 'acuteLoad', 'freshness'];

function factorValue(k: ReadinessKey, v: number): string {
  if (k === 'sleep' || k === 'sleepHistory') return hhmm(v);
  if (k === 'restingHr') return (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 0, 1) + NBSP + 'bpm';
  if (k === 'acuteLoad') return num(v, 2);
  return signed(v, 0);
}


/** Tous les jours depuis le début de l'historique (au moins 30 jours) jusqu'à aujourd'hui. */
function useAllDays(): string[] {
  const { d } = useCalc();
  return useMemo(() => dayRange(d.series.firstDay && d.series.firstDay < addDays(d.today, -364) ? (d.series.firstDay < addDays(d.today, -729) ? addDays(d.today, -729) : d.series.firstDay) : addDays(d.today, -364), d.today), [d.series.firstDay, d.today]);
}

export function ReadinessCard() {
  const { data, d } = useCalc();
  const all = useAllDays();
  const pw = usePeriod();
  const days = pw.slice(all);
  const key = days[0] + days.length;
  const pts = useMemo(() => days.map((day) => ({ day, r: readiness(data, d, day) })), [data, d, key]);
  const [si, setSi] = useDaySel(days, (x) => !!pts.find((q) => q.day === x)?.r);
  const cur = pts[si];
  const r = cur?.r ?? null;
  const missingSel = useMemo(() => (cur ? readinessFactors(data, d, cur.day).missing : []), [data, d, cur?.day]);
  return (
    <InfoCard className="card g12" aria-label={$t("Disponibilité à l’entraînement")} data-anchor="disponibilite">
      <h2>{$t("Disponibilité à l’entraînement")}<InfoToggle /></h2>
      <PeriodBar p={pw} total={all.length} from={days[0]} to={days[days.length - 1]} />
      <Readout when={cur ? (cur.day === d.today ? $t("Aujourd’hui") : dayTitle(cur.day)) : ''} cols={1} cells={[{ label: r ? R_LABEL[r.level] : $t("Pas assez de données"), value: r ? r.score : '—', color: r ? R_COLOR[r.level] : undefined, key: true, valueColor: r ? R_COLOR[r.level] : undefined }]} />
      <DayChart points={pts.map((p) => ({ day: p.day, v: p.r ? p.r.score : null, color: p.r ? R_COLOR[p.r.level] : undefined }))} kind="bars" min={0} max={100} ticks={[0, 25, 50, 75, 100]} sel={si} onSel={setSi} height={110} label={$t("Disponibilité à l’entraînement par jour")} />
      {r ? (
        <>
          <p className="t-caption c-neutral">{R_TEXT[r.level]}</p>
          <ul className="stack" style={{ gap: 'var(--space-10)' }}>
            {R_ORDER.map((k) => {
              const f = r.factors.find((x) => x.key === k);
              return (
                <li key={k} className="stack-4">
                  <div className="between t-caption"><span className="t-caption-strong">{R_FACTOR[k]} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("· poids")} {num((f ? f.effectiveWeight : 0) * 100, 0)}{NBSP}%</span></span><span className="c-neutral">{f ? factorValue(k, f.value) : $t("manquant")}</span></div>
                  <div className="meter"><span style={{ width: f ? `${f.score}%` : 0, background: f ? R_COLOR[readinessLevel(f.score)] : undefined }} /></div>
                </li>
              );
            })}
          </ul>
          {r.missing.length > 0 && <p className="t-legal c-moderate">{$t("Le poids des données manquantes est réparti sur les autres.")}</p>}
        </>
      ) : (
        <>
          <p className="t-caption c-moderate">{$t("Il faut au moins deux de ces éléments pour calculer le score. Ce qu’Apogée a trouvé ce jour-là :")}</p>
          <ul className="stack-4">
            {R_ORDER.map((k) => { const ok = !missingSel.includes(k); return <li key={k} className="between t-caption"><span>{R_FACTOR[k]}</span><span className={ok ? 'c-success' : 'c-moderate'}>{ok ? $t("trouvé") : $t("manquant")}</span></li>; })}
          </ul>
        </>
      )}
      <Info>{$t("Touche ou fais glisser le graphe pour lire un autre jour ; les flèches reculent d’une période. Méthode : on combine les facteurs que la littérature relie à la capacité de s’entraîner — sommeil (7 à 9 h recommandées, Hirshkowitz 2015), FC de repos au-dessus de ta base (Buchheit 2014), rapport de charge aiguë / chronique (Gabbett 2016) et fraîcheur du modèle de Banister. Les poids ci-dessus sont ceux d’Apogée. La variabilité cardiaque (HRV), qui entre dans l’indice de Garmin, n’est pas utilisée.")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ réserve d'énergie
export function ReserveCard() {
  const { data, d } = useCalc();
  const all = useAllDays();
  const pw = usePeriod();
  const days = pw.slice(all);
  const last = days[days.length - 1] ?? d.today;
  const pts = useMemo(() => energyReserve(data, d, days.length || 1, last), [data, d, days.length, last]);
  const [si, setSi] = useDaySel(pts.map((p) => p.day));
  const cur = pts[si];
  return (
    <InfoCard className="card g12" aria-label={$t("Réserve d’énergie")} data-anchor="reserve">
      <h2>{$t("Réserve d’énergie")}<InfoToggle /></h2>
      {!cur || pts.every((p) => p.sleepAssumed) ? <p className="t-caption c-moderate">{$t("Il faut des nuits de sommeil (montre lue par Health Connect) pour estimer la réserve.")}</p> : (
        <>
          <PeriodBar p={pw} total={all.length} from={pts[0].day} to={pts[pts.length - 1].day} />
          <Readout when={cur.day === d.today ? $t("Aujourd’hui") : dayTitle(cur.day)} cells={[
            { label: $t("Au réveil"), value: cur.wake, color: 'var(--form-ready)', key: true },
            { label: $t("Point bas du jour"), value: cur.evening, color: 'var(--form-strained)', key: true },
            { label: $t("Sommeil"), value: cur.sleepSec === null ? $t("supposé") : hhmm(cur.sleepSec) },
            { label: $t("Charge du jour"), value: num(cur.load, 0) },
          ]} />
          <DayChart points={pts.map((p) => ({ day: p.day, v: p.wake, lo: p.evening, faint: p.sleepAssumed }))} kind="range" min={0} max={100} ticks={[0, 25, 50, 75, 100]} sel={si} onSel={setSi} height={120} color="var(--form-ready)" label={$t("Réserve d’énergie par jour : réveil et point bas")} />
          <div className="legend"><span><span className="dot s10" style={{ background: 'var(--form-ready)' }} />{$t("De l’heure du réveil (haut) au point bas de la journée (bas)")}</span><span><span className="dot s10" style={{ background: 'var(--form-ready)', opacity: 0.45 }} />{$t("Nuit non enregistrée")}</span></div>
        </>
      )}
      <Info>{$t("Méthode simplifiée : le Body Battery de Garmin repose sur la HRV et le stress, que la montre ne transmet pas. Ici : recharge = jusqu’à 80 points selon la durée de sommeil (besoin 8 h) et la FC de repos ; dépense = 55 points par jour plus 25 points par séance à ta charge habituelle. Ces paramètres ont été recalés sur une semaine de Garmin Connect (réveils de 90 à 100, creux de 10 à 34) : c’est une lecture de tendance, pas une mesure. Les jours grisés n’ont pas de nuit enregistrée (sommeil supposé égal à ta moyenne).")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ VO₂max
export function Vo2Card() {
  const { data, d } = useCalc();
  const efforts = useMemo(() => bestEfforts(data, d.today), [data, d.today]);
  const v = useMemo(() => vo2maxEstimate(data, d, efforts), [data, d, efforts]);
  const hrNote = d.ctx.hrMax.origin === 'tanaka';
  const sheet = useLocalSheet();
  return (
    <InfoCard className="card g12" aria-label={$t("VO₂max estimée")} data-anchor="vo2max">
      <div className="between">
        <h2>{$t("VO₂max")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => sheet.show()}>{v.watch ? $t("Modifier") : $t("Saisir")}</button>
      </div>
      {sheet.open && <CheckinSheet only="vo2" onClose={sheet.hide} />}
      {v.value !== null ? (
        <>
          <div className="row" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}><span className="t-h2">{num(v.value, 0, 1)}</span><span className="t-caption c-moderate">ml/kg/min · {v.method === 'submax' ? $t("d’après tes sorties de course") : $t("d’après FC max / FC de repos")}</span></div>
          {v.watch && <dl className="kv"><dt>{$t("Ta montre (point du {0})", { 0: dayMonth(v.watch.week) })}</dt><dd>{num(v.watch.value, 0, 1)}</dd></dl>}
          {v.submax && <p className="t-legal c-moderate">{$t("Calculée sur {0} sorties de course récentes.", { 0: v.submax.n })}</p>}
        </>
      ) : <><p className="t-caption c-moderate">{$t("Il faut ta FC de repos (montre lue par Health Connect) et ta FC max pour estimer la VO₂max. Renseigne ta date de naissance dans Paramètres › Athlète si besoin.")}</p><button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/profil')}>{$t("Ouvrir le profil")}</button></>}
      <Info>{$t("Méthode publiée : sorties de course à allure stable — coût en oxygène de la course (ACSM) et équivalence entre % de la réserve de FC et % de la réserve de VO₂ (Swain et Leutholtz 1997) ; moyenne des sorties à plat des 60 derniers jours, les plus récentes comptant davantage (demi-vie de 3 semaines), 3 sorties minimum. Sans assez de sorties, repli sur le rapport FC max / FC de repos × 15,3 (Uth 2004). L’erreur typique est de l’ordre de 10 %.")}{hrNote ? ' ' + $t("Ta FC max vient d’une formule : la mesurer (ou la laisser s’affiner avec tes efforts) améliore l’estimation.") : ''}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ endurance et côtes
export function EnduranceHillCard() {
  const { data, d } = useCalc();
  const efforts = useMemo(() => bestEfforts(data, d.today), [data, d.today]);
  const v = useMemo(() => vo2maxEstimate(data, d, efforts), [data, d, efforts]);
  const en = useMemo(() => enduranceScore(data, d.today, v.value ?? v.watch?.value ?? null), [data, d.today, v]);
  const hill = useMemo(() => hillScore(data, d.today), [data, d.today]);
  const bar = (label: string, value: string, pctv: number) => (
    <div className="stack-4"><div className="between t-caption"><span className="t-caption-strong">{label}</span><span className="c-neutral">{value}</span></div><div className="meter"><span style={{ width: `${pctv}%`, background: 'var(--form-ready)' }} /></div></div>
  );
  return (
    <InfoCard className="card g16" aria-label={$t("Endurance et côtes")}>
      <h2>{$t("Endurance et côtes")}<InfoToggle /></h2>
      <div className="stack" style={{ gap: 'var(--space-10)' }}>
        <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{en ? en.score : '—'}</span><span className="t-strong">{$t("Indice d’endurance")}</span></div>
        {en ? (
          <>
            {en.aerobic !== null && bar($t("Capacité aérobie (VO₂max)"), num(en.vo2 ?? 0, 0, 1), en.aerobic)}
            {bar($t("Volume (28 jours)"), num(en.weeklyHours, 1) + NBSP + $t("h / semaine"), en.volume)}
            {bar($t("Sortie la plus longue"), hhmm(en.longestSec), en.longest)}
            {en.partial && <p className="t-legal c-moderate">{$t("Sans VO₂max estimée, l’indice ne repose que sur le volume et la durée des sorties.")}</p>}
          </>
        ) : <p className="t-caption c-moderate">{$t("Aucune séance d’endurance sur 28 jours.")}</p>}
      </div>
      <div className="stack" style={{ gap: 'var(--space-10)' }}>
        <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{hill ? hill.score : '—'}</span><span className="t-strong">{$t("Indice de côtes")}</span></div>
        {hill ? (
          <>
            {bar($t("Dénivelé positif (28 jours)"), num(hill.weeklyGain, 0) + NBSP + $t("m / semaine"), hill.volume)}
            {hill.vamScore !== null && hill.best
              ? bar($t("Vitesse ascensionnelle"), num(hill.best.vam, 0) + NBSP + $t("m/h"), hill.vamScore)
              : <p className="t-legal c-moderate">{$t("Aucune sortie assez vallonnée (≥ 2,5 % de pente moyenne, 20 min et 100 m de dénivelé) : l’indice ne repose que sur le dénivelé.")}</p>}
            {hill.best && <button type="button" className="row-btn" style={{ padding: 0 }} onClick={() => navigate('/seances/' + hill.best!.sessionId)}><span className="t-caption c-moderate grow">{$t("Meilleure sortie : {0}", { 0: dayTitle(hill.best.day) })}</span><Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} /></button>}
          </>
        ) : <p className="t-caption c-moderate">{$t("Aucun dénivelé enregistré en course ou à vélo sur 28 jours.")}</p>}
      </div>
      <Info>{$t("Méthode : l’endurance combine les déterminants publiés de la performance (VO₂max, Joyner et Coyle 2008) et la « durabilité » (volume et durée des sorties longues, Maunder 2021) ; les côtes combinent le dénivelé hebdomadaire et la vitesse ascensionnelle moyenne des sorties vallonnées (VAM). Les entrées sont mesurées ; les échelles de 0 à 100 (VO₂max 30 → 0 et 60 → 100, 10 h par semaine, 3 h de sortie, 1 200 m de D+ par semaine, 600 m/h à pied ou 700 m/h à vélo) sont celles d’Apogée.")}</Info>
    </InfoCard>
  );
}
