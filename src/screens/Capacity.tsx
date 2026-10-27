// Fenêtres « à la Garmin » calculées par Apogée avec des méthodes publiées (domain/science.ts, domain/capacity.ts) :
// disponibilité à l'entraînement, réserve d'énergie, VO₂max estimée, prédictions de course, endurance, côtes,
// Training Effect d'une séance. Toutes sont étiquetées « estimation Apogée » : ce ne sont pas les indices de Garmin.
import { $t } from '../i18n';
import { useMemo } from 'react';
import { useCalc } from '../data/store';
import { Info, InfoCard, InfoToggle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { addDays } from '../domain/dates';
import {
  bestEfforts, energyReserve, enduranceScore, hillScore, racePredictions, readiness, trainingEffects, vo2maxEstimate,
  readinessLevel, type ReadinessKey, type ReadinessLevel,
} from '../domain/capacity';
import type { TeLevel } from '../domain/science';
import { dayMonth, dayTitle, hhmm, NBSP, num, signed, weekdayShort } from '../ui/format';

const Est = () => <span className="var-chip flat" style={{ alignSelf: 'center' }}>{$t("estimation Apogée")}</span>;

export function clockOf(sec: number | null): string {
  if (sec === null || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

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
      <div className="between"><h2>{$t("Effet de la séance")}<InfoToggle /></h2><Est /></div>
      {row($t("Aérobie"), e.aerobic, e.level)}
      {row($t("Anaérobie"), e.anaerobic, e.anaerobicLevel)}
      <Info>{$t("Échelle de 0 à 5 comme sur les montres. Aérobie : charge de la séance (TRIMP de Banister, qui suit la dépense d’oxygène après l’effort) comparée à une séance solide de tes 90 derniers jours ({0}).", { 0: e.refIsDefault ? $t("valeur type : historique trop court") : num(e.refLoad, 0) })}{e.anaerobic === null ? '' : $t(" Anaérobie : temps passé à 90 % de la FC max ou plus ({0}), approximation d’Apogée.", { 0: Math.round((e.zone5Sec ?? 0) / 60) + NBSP + 'min' })}</Info>
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

export function ReadinessCard() {
  const { data, d } = useCalc();
  const r = useMemo(() => readiness(data, d), [data, d]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const day = addDays(d.today, i - 6); return { day, r: readiness(data, d, day) }; }), [data, d]);
  return (
    <InfoCard className="card g12" aria-label={$t("Disponibilité à l’entraînement")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("Disponibilité à l’entraînement")}<InfoToggle /></h2><Est /></div>
      {r ? (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}><span className="t-h2">{r.score}</span><span className="t-strong" style={{ color: R_COLOR[r.level] }}>{R_LABEL[r.level]}</span></div>
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
          <div className="row" style={{ gap: 'var(--space-6)', alignItems: 'flex-end', height: 56 }} aria-label={$t("7 derniers jours")}>
            {week.map(({ day, r: x }) => (
              <div key={day} className="stack-4" style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '70%', height: x ? Math.max(4, (x.score / 100) * 36) : 4, borderRadius: 4, background: x ? R_COLOR[x.level] : 'var(--bg-grey-minimal)' }} title={x ? `${dayTitle(day)} : ${x.score}` : dayTitle(day)} />
                <span className="t-legal c-moderate">{weekdayShort(day)}</span>
              </div>
            ))}
          </div>
          {r.missing.length > 0 && <p className="t-legal c-moderate">{$t("Le poids des données manquantes est réparti sur les autres.")}</p>}
        </>
      ) : <p className="t-caption c-moderate">{$t("Il faut au moins deux de ces éléments : sommeil, FC de repos, charge récente. Avec une montre lue par Health Connect, le score apparaît en quelques jours.")}</p>}
      <Info>{$t("Méthode : on combine les facteurs que la littérature relie à la capacité de s’entraîner — sommeil (7 à 9 h recommandées, Hirshkowitz 2015), FC de repos au-dessus de ta base (Buchheit 2014), rapport de charge aiguë / chronique (Gabbett 2016) et fraîcheur du modèle de Banister. Les poids ci-dessus sont ceux d’Apogée. La variabilité cardiaque (HRV), qui entre dans l’indice de Garmin, n’est pas utilisée.")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ réserve d'énergie
export function ReserveCard() {
  const { data, d } = useCalc();
  const pts = useMemo(() => energyReserve(data, d, 14), [data, d]);
  const last = pts[pts.length - 1];
  const W = 300, H = 80, gap = 4, bw = (W - gap * (pts.length - 1)) / pts.length;
  const Y = (v: number) => H - (v / 100) * H;
  return (
    <InfoCard className="card g12" aria-label={$t("Réserve d’énergie")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("Réserve d’énergie")}<InfoToggle /></h2><Est /></div>
      {!last || pts.every((p) => p.sleepAssumed) ? <p className="t-caption c-moderate">{$t("Il faut des nuits de sommeil (montre lue par Health Connect) pour estimer la réserve.")}</p> : (
        <>
          <div className="row wrap" style={{ gap: 'var(--space-24)', alignItems: 'baseline' }}>
            <span className="stack-4"><span className="t-legal c-moderate">{$t("Ce matin")}</span><span className="t-h2">{last.wake}</span></span>
            <span className="stack-4"><span className="t-legal c-moderate">{$t("Ce soir (séances déjà faites)")}</span><span className="t-h2">{last.evening}</span></span>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={$t("Réserve d’énergie sur 14 jours : réveil et soir")} style={{ width: '100%', height: 'auto' }}>
            {pts.map((p, i) => (
              <g key={p.day}>
                <rect x={i * (bw + gap)} y={Y(p.wake)} width={bw} height={Math.max(2, Y(p.evening) - Y(p.wake))} rx="3" style={{ fill: p.sleepAssumed ? 'var(--bg-grey-minimal)' : 'var(--form-ready)' }}><title>{`${dayTitle(p.day)} : ${p.wake} → ${p.evening}`}</title></rect>
                {(i === 0 || i === pts.length - 1 || i === 7) && <text x={i === 0 ? 0 : i === pts.length - 1 ? W : i * (bw + gap) + bw / 2} y={H + 14} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="10" style={{ fill: 'var(--text-moderate)' }}>{dayMonth(p.day)}</text>}
              </g>
            ))}
          </svg>
          <Info>{$t("Chaque barre va du niveau du réveil (haut) à celui du soir (bas). Une courte nuit ou plusieurs grosses journées de suite abaissent le réveil suivant. Les jours en gris n’ont pas de nuit enregistrée (sommeil supposé égal à ta moyenne).")}</Info>
        </>
      )}
      <Info>{$t("Méthode simplifiée : le Body Battery de Garmin repose sur la HRV et le stress, que la montre ne transmet pas. Ici : recharge = jusqu’à 80 points selon la durée de sommeil (besoin 8 h) et la FC de repos ; dépense = 35 points par jour plus 40 points par séance à ta charge habituelle. Ces paramètres sont ceux d’Apogée : c’est une lecture de tendance, pas une mesure.")}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ VO₂max
export function Vo2Card() {
  const { data, d } = useCalc();
  const efforts = useMemo(() => bestEfforts(data, d.today), [data, d.today]);
  const v = useMemo(() => vo2maxEstimate(data, d, efforts), [data, d, efforts]);
  const hrNote = d.ctx.hrMax.origin === 'tanaka';
  return (
    <InfoCard className="card g12" aria-label={$t("VO₂max estimée")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("VO₂max")}<InfoToggle /></h2><Est /></div>
      {v.value !== null ? (
        <>
          <div className="row" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}><span className="t-h2">{num(v.value, 0, 1)}</span><span className="t-caption c-moderate">ml/kg/min · {v.method === 'submax' ? $t("d’après tes sorties de course") : $t("d’après FC max / FC de repos")}</span></div>
          <dl className="kv">
            {v.submax && <><dt>{$t("Sorties de course (FC de réserve)")}</dt><dd>{num(v.submax.value, 0, 1)} <span className="t-legal c-moderate" style={{ fontWeight: 400 }}>({v.submax.n} {$t("séances")})</span></dd></>}
            {v.uth !== null && <><dt>{$t("FC max / FC de repos (Uth)")}</dt><dd>{num(v.uth, 0, 1)}</dd></>}
            {v.vdot && <><dt>{$t("Meilleur effort récent (VDOT)")}</dt><dd>{num(v.vdot.value, 0, 1)}</dd></>}
            {v.watch && <><dt>{$t("Ta montre (point du {0})", { 0: dayMonth(v.watch.week) })}</dt><dd>{num(v.watch.value, 0, 1)}</dd></>}
          </dl>
        </>
      ) : <p className="t-caption c-moderate">{$t("Il faut ta FC de repos (montre lue par Health Connect) et ta FC max pour estimer la VO₂max. Renseigne ta date de naissance dans Paramètres › Athlète si besoin.")}</p>}
      <Info>{$t("Méthodes publiées : (1) sorties de course à allure stable — coût en oxygène de la course (ACSM) et équivalence entre % de la réserve de FC et % de la réserve de VO₂ (Swain et Leutholtz 1997) ; médiane des sorties à plat des 60 derniers jours, 3 sorties minimum. (2) Rapport FC max / FC de repos × 15,3 (Uth 2004). (3) VDOT de Daniels et Gilbert sur ton meilleur effort de 3 à 21 km : c’est une borne basse, un entraînement n’étant pas une course. L’erreur typique est de l’ordre de 10 %.")}{hrNote ? ' ' + $t("Ta FC max vient d’une formule : la mesurer (ou la laisser s’affiner avec tes efforts) améliore l’estimation.") : ''}</Info>
    </InfoCard>
  );
}

// ------------------------------------------------------------------ prédictions de course
export function PredictionsCard() {
  const { data, d } = useCalc();
  const efforts = useMemo(() => bestEfforts(data, d.today), [data, d.today]);
  const v = useMemo(() => vo2maxEstimate(data, d, efforts), [data, d, efforts]);
  const p = useMemo(() => racePredictions(data, v, efforts), [data, v, efforts]);
  const any = p.rows.some((r) => r.vdotSec !== null || r.riegelSec !== null || r.watchSec !== null);
  const hasWatch = p.rows.some((r) => r.watchSec !== null);
  return (
    <InfoCard className="card g12" aria-label={$t("Prédictions de course")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("Prédictions de course")}<InfoToggle /></h2><Est /></div>
      {!any ? <p className="t-caption c-moderate">{$t("Pas encore de VO₂max estimée ni d’effort de course sur 90 jours : rien à prédire.")}</p> : (
        <div className="pred-grid" style={{ gridTemplateColumns: `auto repeat(${hasWatch ? 3 : 2}, 1fr)` }} role="table">
          <span className="t-legal c-moderate" role="columnheader">{$t("Distance")}</span>
          <span className="t-legal c-moderate" role="columnheader" style={{ textAlign: 'right' }}>{$t("Selon ta VO₂max")}</span>
          <span className="t-legal c-moderate" role="columnheader" style={{ textAlign: 'right' }}>{$t("Selon ton meilleur effort")}</span>
          {hasWatch && <span className="t-legal c-moderate" role="columnheader" style={{ textAlign: 'right' }}>{$t("Ta montre")}</span>}
          {p.rows.map((r) => (
            <div key={r.dist.key} style={{ display: 'contents' }} role="row">
              <span className="t-caption-strong" role="cell">{r.dist.label}</span>
              <span style={{ textAlign: 'right' }} role="cell"><strong>{clockOf(r.vdotSec)}</strong></span>
              <span style={{ textAlign: 'right' }} role="cell"><strong>{clockOf(r.riegelSec)}</strong></span>
              {hasWatch && <span style={{ textAlign: 'right' }} role="cell">{clockOf(r.watchSec)}</span>}
            </div>
          ))}
        </div>
      )}
      <Info>{$t("Méthodes publiées : « selon ta VO₂max » applique les équations de Daniels et Gilbert (1979) à la VO₂max estimée ci-dessus ; « selon ton meilleur effort » extrapole ton meilleur temps récent par la loi de Riegel (1981), T₂ = T₁ × (D₂ ÷ D₁)^1,06, jusqu’à 4 fois la distance. Les deux supposent une préparation spécifique à la distance : le marathon est souvent prédit trop optimiste sans grosses sorties longues. L’écart entre les deux colonnes est normal : la première suppose une course à fond, la seconde repart de tes sorties réelles, souvent plus tranquilles.")}</Info>
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
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}><h2>{$t("Endurance et côtes")}<InfoToggle /></h2><Est /></div>
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
