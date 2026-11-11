// Carte « Alimentation » d'une séance prévue : synthèse en schéma (avant, pendant, après), aliments précis tirés de la banque
// de Paramètres, liste à emporter, hypothèses modifiables et cloches de rappel. Rien n'est enregistré sauf les choix de l'athlète
// (journée chaude, intensité imposée, cloches) : le plan est recalculé à l'affichage, y compris pour les séances passées.
import { $t } from '../i18n';
import { useState } from 'react';
import { Info, InfoCard, InfoToggle, Segmented, Sheet, Switch, showToast } from '../ui/kit';
import { ClockField } from '../ui/wheels';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { native } from '../native/bridge';
import { useLocalSheet } from '../ui/menu';
import { useCalc, usePrefs } from '../data/store';
import { setNutriBell, setNutriSession } from '../data/actions';
import { today } from '../domain/dates';
import { resolveBank } from '../domain/foods';
import { intakeText, leadText, nutritionForSession, type Level, type NutriEvent, type NutriPlan } from '../domain/nutrition';
import { DISCIPLINE_LABEL, duration } from '../ui/format';
import type { PlannedSession } from '../domain/types';

const LEVEL_LABEL = (l: Level) => (l === 'easy' ? $t("Facile") : l === 'moderate' ? $t("Soutenue") : $t("Qualité"));
const PHASE: Record<NutriEvent['phase'], { label: () => string; fg: string; bg: string }> = {
  before: { label: () => $t("Avant"), fg: 'var(--info)', bg: 'var(--info-bg)' },
  during: { label: () => $t("Pendant"), fg: 'var(--success)', bg: 'var(--success-bg)' },
  after: { label: () => $t("Après"), fg: 'var(--warning)', bg: 'var(--warning-bg)' },
};

/** Quand, en mots : « 2 h avant », « à 15 min », « dès la fin, dans les 2 h ». */
function whenText(e: NutriEvent, D: number): string {
  if (e.phase === 'before') return e.toMin !== undefined && e.toMin !== e.atMin ? $t("de {0} à {1} avant", { 0: leadText(e.atMin), 1: leadText(e.toMin) }) : $t("{0} avant", { 0: leadText(e.atMin) });
  if (e.phase === 'during') return e.toMin !== undefined ? $t("toute la séance") : $t("à {0}", { 0: leadText(e.atMin) });
  const rel = e.atMin - D;
  if (rel <= 0) return e.toMin !== undefined ? $t("dès la fin, dans les {0}", { 0: leadText(e.toMin - e.atMin) }) : $t("dès la fin");
  return $t("{0} après la fin", { 0: leadText(rel) });
}

// ------------------------------------------------------------------ schéma
const W = 320, H = 92, X1 = 86, X2 = 234, Y = 34;
function Timeline({ plan }: { plan: NutriPlan }) {
  const D = plan.minutes;
  const xb = (m: number) => Math.max(4, Math.min(X1 - 4, ((m + 240) / 240) * X1));
  const xd = (m: number) => X1 + Math.max(0, Math.min(1, m / D)) * (X2 - X1);
  const xa = (m: number) => X2 + Math.max(4, Math.min(W - X2 - 4, ((m - D) / 240) * (W - X2)));
  const pos = (e: NutriEvent) => (e.phase === 'before' ? xb(e.atMin) : e.phase === 'during' ? xd(e.atMin) : xa(e.atMin));
  const dots = plan.events.filter((e) => e.items.length || e.id === 'b-caf');
  const drink = plan.events.find((e) => e.id === 'd-drink' || e.id === 'd-water');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={$t("Schéma de l’alimentation : avant, pendant et après la séance")} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {([['before', 0, X1], ['during', X1, X2], ['after', X2, W]] as const).map(([ph, a, b]) => (
        <g key={ph}>
          <rect x={a + 1} y={Y} width={b - a - 2} height={18} rx={ph === 'during' ? 3 : 9} fill={PHASE[ph].bg} stroke={PHASE[ph].fg} strokeWidth={ph === 'during' ? 1.5 : 1} />
          <text x={(a + b) / 2} y={Y - 8} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={PHASE[ph].fg}>{PHASE[ph].label().toUpperCase()}</text>
        </g>
      ))}
      {drink && drink.phase === 'during' && <line x1={X1 + 3} x2={X2 - 3} y1={Y + 26} y2={Y + 26} stroke={PHASE.during.fg} strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />}
      {dots.map((e) => (
        <circle key={e.id} cx={pos(e)} cy={Y + 9} r={e.phase === 'during' ? 3.6 : 5} fill={PHASE[e.phase].fg} stroke="var(--bg-surface)" strokeWidth="1.5" />
      ))}
      {plan.events.filter((e) => e.phase === 'before' && e.bell === 'meal').map((e) => (
        <text key={'l' + e.id} x={pos(e)} y={Y + 36} textAnchor="middle" fontSize="10" fill="var(--text)">{'−' + leadText(e.atMin)}</text>
      ))}
      {plan.events.filter((e) => e.phase === 'after' && e.bell).slice(0, 1).map((e) => (
        <text key={'l' + e.id} x={X2 + 6} y={Y + 36} textAnchor="start" fontSize="10" fill="var(--text)">{$t("≤ {0}", { 0: leadText((e.toMin ?? e.atMin + 120) - e.atMin) })}</text>
      ))}
      <text x={X1 + 2} y={Y + 36} textAnchor="start" fontSize="10" fill="var(--text)">0</text>
      <text x={X2 - 2} y={Y + 36} textAnchor="end" fontSize="10" fill="var(--text)">{duration(D * 60)}</text>
      {drink && drink.phase === 'during' && <text x={(X1 + X2) / 2} y={Y + 48} textAnchor="middle" fontSize="10" fill="var(--text-neutral)">{plan.during.intervalMin ? $t("une prise toutes les {0} min", { 0: plan.during.intervalMin }) : $t("boire régulièrement")}</text>}
    </svg>
  );
}

// ------------------------------------------------------------------ une ligne du plan
function EventRow({ e, D, bell, onBell }: { e: NutriEvent; D: number; bell: boolean; onBell?: () => void }) {
  return (
    <div className="row" style={{ gap: 'var(--space-8)', alignItems: 'flex-start' }}>
      <div className="stack grow" style={{ gap: 2 }}>
        <span className="t-caption c-moderate">{whenText(e, D)}</span>
        <span className="t-strong">{e.title}</span>
        {e.items.length > 0 && <span>{e.items.map(intakeText).join(' + ')}</span>}
        {e.text && <span className="t-caption c-moderate">{e.text}</span>}
        {(e.carbsG >= 1 || e.proteinG >= 1) && <span className="t-caption c-neutral">{[e.carbsG >= 1 ? $t("≈ {0} g de glucides", { 0: Math.round(e.carbsG) }) : '', e.proteinG >= 1 ? $t("≈ {0} g de protéines", { 0: Math.round(e.proteinG) }) : ''].filter(Boolean).join(' · ')}</span>}
      </div>
      {onBell && <button type="button" className="icon-btn" aria-pressed={bell} aria-label={bell ? $t("Rappel programmé : modifier") : $t("Me notifier")} onClick={onBell} style={bell ? { color: 'var(--warning)' } : undefined}><Icon name="bell" size={22} /></button>}
    </div>
  );
}

function PhaseBlock({ plan, phase, bells, onBell }: { plan: NutriPlan; phase: NutriEvent['phase']; bells: Record<string, unknown>; onBell: (e: NutriEvent) => void }) {
  const list = plan.events.filter((e) => e.phase === phase);
  if (!list.length) return null;
  return (
    <div className="stack" style={{ gap: 'var(--space-8)', padding: 'var(--space-12)', borderRadius: 'var(--radius-12)', background: PHASE[phase].bg, borderLeft: `4px solid ${PHASE[phase].fg}` }}>
      <span className="t-strong" style={{ color: PHASE[phase].fg }}>{PHASE[phase].label()}</span>
      {list.map((e) => <EventRow key={e.id} e={e} D={plan.minutes} bell={!!e.bell && !!bells[e.bell]} onBell={e.bell && native.isApp() ? () => onBell(e) : undefined} />)}
    </div>
  );
}

// ------------------------------------------------------------------ cloche
function BellSheet({ p, e, plan, sh, current }: { p: PlannedSession; e: NutriEvent; plan: NutriPlan; sh: ReturnType<typeof useLocalSheet>; current: { startMin: number | null } | undefined }) {
  const prefs = usePrefs();
  const hour = prefs.nutriHour ?? 7;
  const key = e.bell as string;
  const before = e.phase === 'before';
  const [custom, setCustom] = useState(current ? current.startMin !== null : false);
  const [start, setStart] = useState<number>(current?.startMin != null ? current.startMin * 60 : 8 * 3600);
  const lead = before ? -e.atMin : 0;
  const clock = (sec: number) => { const m = Math.floor(sec / 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const notifAt = Math.max(0, start - lead * 60);
  const what = e.items.length ? e.items.map(intakeText).join(' + ') : e.text ?? e.title;
  const save = () => {
    setNutriBell(p.id, key, { startMin: before && custom ? Math.round(start / 60) : null });
    sh.hide();
    showToast($t("Rappel programmé"));
  };
  return (
    <Sheet title={$t("Me notifier")} onClose={sh.hide} head={<span className="t-caption c-moderate">{DISCIPLINE_LABEL[p.discipline]} · {e.title}</span>}
      footer={<div className="row wrap" style={{ gap: 'var(--space-8)' }}>
        <button type="button" className="btn btn-primary grow" onClick={save}>{$t("Enregistrer")}</button>
        {current && <button type="button" className="btn btn-secondary" onClick={() => { setNutriBell(p.id, key, null); sh.hide(); }}>{$t("Retirer")}</button>}
      </div>}>
      <div className="stack" style={{ gap: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
        <div className="note"><Icon name="info" size={20} /><span>{before ? $t("« {0} », {1}.", { 0: what, 1: whenText(e, plan.minutes) }) : $t("« {0} » dès que la séance est reçue de la montre.", { 0: what })}</span></div>
        {before ? (
          <>
            <Segmented<'morning' | 'custom'> label={$t("Moment du rappel")} value={custom ? 'custom' : 'morning'} options={[['morning', $t("Le matin à {0} h", { 0: hour })], ['custom', $t("Selon l’heure de la séance")]]} onChange={(v) => setCustom(v === 'custom')} />
            {custom
              ? <>
                  <div className="field"><span className="lbl">{$t("Heure de la séance")}</span><ClockField label={$t("Heure de la séance")} value={start} onChange={setStart} initial={8 * 3600} /></div>
                  <span className="t-caption c-moderate">{$t("Tu seras notifié à {0}, {1} avant la séance.", { 0: clock(notifAt), 1: leadText(lead) })}</span>
                </>
              : <span className="t-caption c-moderate">{$t("Tu seras notifié le jour de la séance à {0} h : « pense à prendre {1}, {2} avant la séance ».", { 0: hour, 1: what, 2: leadText(lead) })}</span>}
          </>
        ) : <span className="t-caption c-moderate">{$t("Apogée connaît l’heure de fin de la séance une fois reçue de la montre : le rappel arrive alors, avec les aliments du plan.")}</span>}
        {prefs.nutriMode !== 'chosen' && (
          <div className="note note-warning"><Icon name="alert" size={20} /><span>{prefs.nutriMode === 'all' ? $t("Les rappels d’alimentation sont déjà actifs pour toutes les séances. Cette cloche ajuste l’heure de celui-ci.") : $t("Les rappels d’alimentation sont coupés dans Paramètres › Rappels : cette cloche n’enverra rien tant que tu n’as pas choisi un mode actif.")}
            {' '}<button type="button" className="btn-tertiary" style={{ display: 'inline', minHeight: 0 }} onClick={() => { sh.hide(); navigate('/parametres'); }}>{$t("Ouvrir Paramètres")}</button></span></div>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ carte
export function NutritionCard({ p }: { p: PlannedSession }) {
  const { data, d } = useCalc();
  const sh = useLocalSheet();
  const [bellFor, setBellFor] = useState<NutriEvent | null>(null);
  const [more, setMore] = useState(false);
  const bank = resolveBank(data);
  const n = nutritionForSession(data, d.refsAt(p.plannedDate), p, bank, today());
  const opt = data.nutri[p.id] && !data.nutri[p.id].deleted ? data.nutri[p.id] : undefined;
  const bells = opt?.bells ?? {};
  const plan = n.plan;
  const mode = usePrefs().nutriMode;
  const ring = (e: NutriEvent) => { setBellFor(e); sh.show(); };
  return (
    <InfoCard className="card g8 dspan-12" aria-label={$t("Alimentation")}>
      <h2>{$t("Alimentation")}<InfoToggle /></h2>
      <Info>{$t("Ce qu’il faut manger et boire avant, pendant et après cette séance, calculé d’après le sport, la durée et l’intensité estimée, avec les produits de ta banque d’aliments (Paramètres › Alimentation). Ce sont des repères généraux, pas un avis médical ; la quantité de glucides par heure s’apprend à l’entraînement, un peu plus chaque semaine.")}</Info>
      {!plan && <div className="note"><Icon name="info" size={20} /><span>{n.reason}</span></div>}
      {plan && (
        <>
          <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
            <span className="chip" style={{ cursor: 'default' }}>{duration(plan.minutes * 60)}</span>
            <span className="chip" style={{ cursor: 'default' }}>{LEVEL_LABEL(n.level)}</span>
            {n.hot && <span className="chip" style={{ cursor: 'default' }}>{$t("Chaud")}</span>}
            {mode && mode !== 'off' && Object.keys(bells).length > 0 && <span className="chip" style={{ cursor: 'default' }}><Icon name="bell" size={14} />{Object.keys(bells).length}</span>}
          </div>
          <Timeline plan={plan} />
          <PhaseBlock plan={plan} phase="before" bells={bells} onBell={ring} />
          <PhaseBlock plan={plan} phase="during" bells={bells} onBell={ring} />
          <PhaseBlock plan={plan} phase="after" bells={bells} onBell={ring} />
          {plan.during.shopping.length > 0 && (
            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              <span className="t-strong">{$t("À emporter pour la séance")}</span>
              {plan.during.shopping.map((x) => <span key={x.foodId}>{intakeText(x)}<span className="t-caption c-neutral"> · {x.unit}</span></span>)}
              <span className="t-caption c-moderate">{$t("≈ {0} g de glucides en tout, soit {1} g par heure.", { 0: Math.round(plan.during.totalCarbs), 1: Math.round(plan.during.carbsPerHActual) })}</span>
            </div>
          )}
          {plan.notes.map((t) => <div key={t} className="note"><Icon name="info" size={20} /><span>{t}</span></div>)}
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={more} onClick={() => setMore(!more)}>{more ? $t("Masquer les hypothèses") : $t("Hypothèses et réglages de cette séance")}</button>
          {more && (
            <div className="stack" style={{ gap: 'var(--space-12)' }}>
              <div className="field">
                <span className="lbl">{$t("Intensité")}</span>
                <Segmented<string> label={$t("Intensité")} value={opt?.intensity ?? 'auto'} options={[['auto', $t("Estimée")], ['easy', $t("Facile")], ['moderate', $t("Soutenue")], ['quality', $t("Qualité")]]}
                  onChange={(v) => setNutriSession(p.id, { intensity: v === 'auto' ? null : (v as Level) })} />
                <span className="hint">{opt?.intensity ? $t("Imposée par toi.") : $t("Estimée : {0}.", { 0: LEVEL_LABEL(n.guess.level) + ' — ' + n.guess.basis })}</span>
              </div>
              <div className="between" style={{ gap: 'var(--space-12)' }}>
                <span className="stack"><span className="t-strong" id={'hot-' + p.id}>{$t("Chaud")}</span><span className="t-caption c-moderate">{$t("Plus de boisson et plus de sodium par heure.")}</span></span>
                <Switch checked={!!opt?.hot} labelledBy={'hot-' + p.id} onChange={(v) => setNutriSession(p.id, { hot: v })} />
              </div>
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                {plan.before.carbs && <span className="t-caption c-moderate">{$t("Avant : {0}–{1} g de glucides.", { 0: plan.before.carbs[0], 1: plan.before.carbs[1] })}</span>}
                {plan.during.carbsPerH && <span className="t-caption c-moderate">{$t("Pendant : {0}–{1} g de glucides par heure.", { 0: plan.during.carbsPerH[0], 1: plan.during.carbsPerH[1] })}</span>}
                {plan.during.fluidPerH && <span className="t-caption c-moderate">{$t("Boisson : {0}–{1} ml par heure.", { 0: plan.during.fluidPerH[0], 1: plan.during.fluidPerH[1] })}</span>}
                {plan.during.sodiumPerH && <span className="t-caption c-moderate">{$t("Sodium : {0}–{1} mg par heure.", { 0: plan.during.sodiumPerH[0], 1: plan.during.sodiumPerH[1] })}</span>}
                {plan.after.carbs && <span className="t-caption c-moderate">{$t("Après : {0}–{1} g de glucides sur {2} h.", { 0: plan.after.carbs[0], 1: plan.after.carbs[1], 2: plan.after.hours })}</span>}
                <span className="t-caption c-moderate">{$t("Calculé pour {0} kg (règles établies pour {1} kg).", { 0: Math.round(plan.weightKg), 1: plan.rulesKg })}</span>
              </div>
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/alimentation')}><Icon name="plus" size={18} />{$t("Ma banque d’aliments")}</button>
            </div>
          )}
        </>
      )}
      {sh.open && bellFor && plan && <BellSheet p={p} e={bellFor} plan={plan} sh={sh} current={bellFor.bell ? bells[bellFor.bell] : undefined} />}
    </InfoCard>
  );
}
