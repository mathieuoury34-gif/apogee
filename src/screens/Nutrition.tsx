// Carte « Alimentation » d'une séance prévue : synthèse en frise à pictogrammes (avant, pendant, après), contrôle ✅ / ⚠️ des apports,
// éditeur des aliments, liste à emporter, hypothèses modifiables et cloches de rappel. Rien n'est enregistré sauf les choix de l'athlète
// (journée chaude, intensité imposée, aliments modifiés, cloches) : le plan est recalculé à l'affichage, y compris pour les séances passées.
import { $t } from '../i18n';
import { useState } from 'react';
import { Info, InfoCard, InfoToggle, Segmented, Sheet, Switch, showToast } from '../ui/kit';
import { ClockField } from '../ui/wheels';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { native } from '../native/bridge';
import { useLocalSheet } from '../ui/menu';
import { useCalc, usePrefs } from '../data/store';
import { setNutriBell, setNutriEdit, setNutriSession } from '../data/actions';
import { today } from '../domain/dates';
import { CATEGORIES, carbsOf, foodIcon, resolveBank, type BankFood } from '../domain/foods';
import { checkPlan, intakeText, leadText, nutritionForSession, phaseState, qtyText, type Check, type Intake, type Level, type NutriEvent, type NutriPlan } from '../domain/nutrition';
import { DISCIPLINE_LABEL, duration } from '../ui/format';
import type { PlannedSession } from '../domain/types';

export const LEVEL_LABEL = (l: Level) => (l === 'easy' ? $t("Facile") : l === 'moderate' ? $t("Modérée") : $t("Intense"));
const LEVEL_HINT = (l: Level) => (l === 'easy' ? $t("Tu peux parler sans effort (zones 1–2).") : l === 'moderate' ? $t("Allure soutenue, tenable longtemps (zone 3).") : $t("Dur : seuil, intervalles, test, course (zones 4–5)."));
const PHASE: Record<NutriEvent['phase'], { label: () => string; fg: string; bg: string }> = {
  before: { label: () => $t("Avant"), fg: 'var(--info)', bg: 'var(--info-bg)' },
  during: { label: () => $t("Pendant"), fg: 'var(--d-STRENGTH)', bg: 'var(--d-STRENGTH-bg)' },
  after: { label: () => $t("Après"), fg: 'var(--warning)', bg: 'var(--warning-bg)' },
};

/** Quand, en mots courts : « 3 h avant », « 15 min », « dès la fin ». */
export function whenText(e: NutriEvent, D: number): string {
  if (e.phase === 'before') return e.toMin !== undefined && e.toMin !== e.atMin ? $t("{0} à {1} avant", { 0: leadText(e.atMin), 1: leadText(e.toMin) }) : $t("{0} avant", { 0: leadText(e.atMin) });
  if (e.phase === 'during') return e.toMin !== undefined ? $t("tout du long") : leadText(e.atMin);
  const rel = e.atMin - D;
  if (rel <= 0) return e.toMin !== undefined ? $t("dès la fin, sous {0}", { 0: leadText(e.toMin - e.atMin) }) : $t("dès la fin");
  return $t("{0} après la fin", { 0: leadText(rel) });
}
const fmtQ = (q: number) => { const r = Math.round(q * 2) / 2; if (Math.abs(r - q) > 0.05) return String(Math.round(q * 10) / 10).replace('.', ','); return r === Math.floor(r) ? String(r) : (Math.floor(r) ? String(Math.floor(r)) : '') + '½'; };
const textIcon = (e: NutriEvent) => (e.id === 'b-caf' ? 'f-coffee' : e.id.endsWith('fluid') || e.id === 'd-water' ? 'f-droplet' : 'f-utensils');

// ------------------------------------------------------------------ frise
function FoodChip({ x, byId }: { x: Intake; byId: Map<string, BankFood> }) {
  const f = byId.get(x.foodId);
  return (
    <span className="nchip">
      <span className="nico"><Icon name={f ? foodIcon(f) : 'f-utensils'} size={18} /></span>
      <span className="nt"><b>{qtyText(x)}</b> {x.name}</span>
    </span>
  );
}

function StateBadge({ st }: { st: Check['state'] | null }) {
  if (!st) return null;
  return (
    <span className="nstate" style={{ color: st === 'ok' ? 'var(--success-text)' : 'var(--warning-text)' }}>
      <Icon name={st === 'ok' ? 'ok' : 'warn'} size={18} />{st === 'ok' ? $t("Apports atteints") : st === 'low' ? $t("Un peu juste") : $t("Au-dessus du conseil")}
    </span>
  );
}

function Node({ e, D, byId, bell, onBell, full }: { e: NutriEvent; D: number; byId: Map<string, BankFood>; bell: boolean; onBell?: () => void; full: boolean }) {
  if (!e.items.length && !e.text && !e.edited) return null;
  if (!e.items.length && /^d-\d+$/.test(e.id)) return null;
  return (
    <li className="nnode">
      <span className="ntime">{whenText(e, D)}</span>
      <div className="stack" style={{ gap: 4 }}>
        <div className="nchips">
          {e.items.map((x) => <FoodChip key={x.foodId} x={x} byId={byId} />)}
          {!e.items.length && e.text && <span className="nchip"><span className="nico"><Icon name={textIcon(e)} size={18} /></span><span className="nt">{e.text}</span></span>}
        </div>
        {e.times && <span className="t-caption c-moderate">{$t("toutes les heures, {0} fois", { 0: e.times })}</span>}
        {e.id === 'd-drink' && e.items.length > 0 && <span className="t-caption c-moderate">{$t("par heure")}</span>}
        {full && (e.carbsG >= 1 || e.proteinG >= 1) && <span className="t-caption c-neutral">{[e.carbsG >= 1 ? $t("≈ {0} g de glucides", { 0: Math.round(e.carbsG) }) : '', e.proteinG >= 1 ? $t("≈ {0} g de protéines", { 0: Math.round(e.proteinG) }) : ''].filter(Boolean).join(' · ')}</span>}
      </div>
      {onBell ? <button type="button" className="icon-btn" aria-pressed={bell} aria-label={bell ? $t("Rappel programmé : modifier") : $t("Me notifier")} onClick={onBell} style={bell ? { color: 'var(--warning)' } : undefined}><Icon name="bell" size={22} /></button> : <span />}
    </li>
  );
}

function PhaseBlock({ plan, phase, bells, onBell, byId, checks, full }: { plan: NutriPlan; phase: NutriEvent['phase']; bells: Record<string, unknown>; onBell: (e: NutriEvent) => void; byId: Map<string, BankFood>; checks: Check[]; full: boolean }) {
  const list = plan.events.filter((e) => e.phase === phase);
  if (!list.length) return null;
  return (
    <section className="nphase" style={{ ['--ph' as string]: PHASE[phase].fg, ['--phbg' as string]: PHASE[phase].bg }} aria-label={PHASE[phase].label()}>
      <header className="nhead"><span className="nname">{PHASE[phase].label()}</span><StateBadge st={phaseState(checks, phase)} /></header>
      <ol className="nlist">
        {list.map((e) => <Node key={e.id} e={e} D={plan.minutes} byId={byId} full={full} bell={!!e.bell && !!bells[e.bell]} onBell={e.bell && native.isApp() ? () => onBell(e) : undefined} />)}
      </ol>
      {full && checks.filter((c) => c.phase === phase).map((c) => <CheckLine key={c.key} c={c} />)}
    </section>
  );
}

function CheckLine({ c }: { c: Check }) {
  const range = c.lo === c.hi ? String(c.lo) : c.lo + '–' + c.hi;
  const gap = c.state === 'low' ? $t(" · il manque ≈ {0} {1}", { 0: Math.round(c.lo - c.got), 1: c.unit }) : c.state === 'high' ? $t(" · en trop ≈ {0} {1}", { 0: Math.round(c.got - c.hi), 1: c.unit }) : '';
  return (
    <span className="t-caption" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: c.state === 'ok' ? 'var(--success-text)' : 'var(--warning-text)' }}>
      <Icon name={c.state === 'ok' ? 'ok' : 'warn'} size={16} style={{ flex: 'none', marginTop: 1 }} />
      <span>{$t("{0} : {1} {2} (conseil {3} {2})", { 0: c.label, 1: c.got, 2: c.unit, 3: range })}{gap}</span>
    </span>
  );
}

// ------------------------------------------------------------------ éditeur des aliments
const EDITABLE = (e: NutriEvent) => e.id === 'b-meal' || e.id === 'd-drink' || e.id === 'd-water' || /^d-\d+$/.test(e.id) || e.id === 'a-prot' || e.id === 'a-meal' || e.id === 'a-fast';
const stepOf = (f?: BankFood) => (f && (f.liquid || f.category === 'bar' || f.id === 'd:banana' || f.category === 'salt') ? 0.5 : 1);

function EditorSheet({ p, sh }: { p: PlannedSession; sh: ReturnType<typeof useLocalSheet> }) {
  const { data, d } = useCalc();
  const bank = resolveBank(data);
  const byId = new Map(resolveBank(data, true).map((f) => [f.id, f]));
  const n = nutritionForSession(data, d.refsAt(p.plannedDate), p, bank, today());
  const [adding, setAdding] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('bar');
  const plan = n.plan;
  if (!plan) return null;
  const checks = checkPlan(plan);
  const hasEdits = Object.keys((data.nutri[p.id] && !data.nutri[p.id].deleted ? data.nutri[p.id].edits : undefined) ?? {}).length > 0;
  const cur = (e: NutriEvent) => e.items.map((x) => ({ foodId: x.foodId, qty: Math.round(x.qty * 100) / 100 }));
  const step = (e: NutriEvent, i: number, dir: 1 | -1) => { const l = cur(e); const q = l[i].qty + dir * stepOf(byId.get(l[i].foodId)); if (q < 0.1) l.splice(i, 1); else l[i].qty = q; setNutriEdit(p.id, e.id, l); };
  const drop = (e: NutriEvent, i: number) => { const l = cur(e); l.splice(i, 1); setNutriEdit(p.id, e.id, l); };
  const add = (e: NutriEvent, f: BankFood) => { const l = cur(e); const ex = l.find((x) => x.foodId === f.id); if (ex) ex.qty += stepOf(f); else l.push({ foodId: f.id, qty: stepOf(f) }); setNutriEdit(p.id, e.id, l); setAdding(null); };
  const opening = (e: NutriEvent) => { setAdding(adding === e.id ? null : e.id); setCat(e.phase === 'before' ? 'before' : e.phase === 'after' ? 'after' : e.id === 'd-drink' || e.id === 'd-water' ? 'drink' : 'bar'); };
  const events = plan.events.filter(EDITABLE);
  return (
    <Sheet title={$t("Adapter l’alimentation")} onClose={sh.hide} full head={<span className="t-caption c-moderate">{DISCIPLINE_LABEL[p.discipline]} · {duration(plan.minutes * 60)}</span>}
      footer={<div className="row wrap" style={{ gap: 'var(--space-8)' }}>
        <button type="button" className="btn btn-primary grow" onClick={sh.hide}>{$t("Terminé")}</button>
        {hasEdits && <button type="button" className="btn btn-secondary" onClick={() => { setNutriEdit(p.id, null, null); showToast($t("Retour au calcul")); }}>{$t("Revenir au calcul")}</button>}
      </div>}>
      <div className="stack" style={{ gap: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
        <div className="stack" style={{ gap: 6, padding: 'var(--space-12)', borderRadius: 'var(--radius-12)', background: 'var(--bg-grey-minimal)' }}>
          <span className="t-strong">{$t("Apports par rapport au conseil")}</span>
          {checks.length === 0 && <span className="t-caption c-moderate">{$t("Rien à contrôler pour cette séance.")}</span>}
          {checks.map((c) => <CheckLine key={c.phase + c.key} c={c} />)}
        </div>
        {events.map((e) => (
          <div key={e.id} className="stack" style={{ gap: 'var(--space-8)', paddingLeft: 'var(--space-12)', borderLeft: `4px solid ${PHASE[e.phase].fg}` }}>
            <span className="t-caption c-moderate">{PHASE[e.phase].label()} · {whenText(e, plan.minutes)}{e.id === 'd-drink' || e.id === 'd-water' ? ' · ' + $t("par heure") : ''}{e.times ? ' · ' + $t("{0} fois", { 0: e.times }) : ''}</span>
            {e.items.map((x, i) => {
              const f = byId.get(x.foodId);
              return (
                <div key={x.foodId} className="row" style={{ gap: 'var(--space-8)' }}>
                  <span className="nico"><Icon name={f ? foodIcon(f) : 'f-utensils'} size={18} /></span>
                  <span className="stack grow" style={{ gap: 0 }}><span className="t-strong">{x.name}</span><span className="t-caption c-neutral">{x.unit}{x.ml > 0 ? '' : ''}</span></span>
                  <button type="button" className="icon-btn" aria-label={$t("Moins")} onClick={() => step(e, i, -1)}><Icon name="minus" size={20} /></button>
                  <span className="t-strong" style={{ minWidth: 28, textAlign: 'center' }}>{fmtQ(x.qty)}</span>
                  <button type="button" className="icon-btn" aria-label={$t("Plus")} onClick={() => step(e, i, 1)}><Icon name="plus" size={20} /></button>
                  <button type="button" className="icon-btn neutral" aria-label={$t("Retirer")} onClick={() => drop(e, i)}><Icon name="trash" size={20} /></button>
                </div>
              );
            })}
            {e.items.length === 0 && <span className="t-caption c-moderate">{e.text ?? $t("Aucun aliment")}</span>}
            <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={adding === e.id} onClick={() => opening(e)}><Icon name="plus" size={18} />{$t("Ajouter un aliment")}</button>
            {adding === e.id && (
              <div className="stack" style={{ gap: 'var(--space-8)' }}>
                <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
                  {CATEGORIES().map((c) => <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
                </div>
                {bank.filter((f) => f.category === cat).map((f) => (
                  <button key={f.id} type="button" className="row-btn" onClick={() => add(e, f)}>
                    <span className="nico"><Icon name={foodIcon(f)} size={18} /></span>
                    <span className="stack grow" style={{ gap: 0, textAlign: 'left' }}><span className="t-strong">{f.builtin ? $t(f.name) : f.name}</span><span className="t-caption c-moderate">{f.builtin ? $t(f.unit) : f.unit} · {$t("{0} g de glucides", { 0: Math.round(carbsOf(f)) })}</span></span>
                    <Icon name="plus" size={18} />
                  </button>
                ))}
                {bank.filter((f) => f.category === cat).length === 0 && <span className="t-caption c-moderate">{$t("Aucun favori dans cette catégorie.")}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
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
  const bellSh = useLocalSheet();
  const editSh = useLocalSheet();
  const [bellFor, setBellFor] = useState<NutriEvent | null>(null);
  const [more, setMore] = useState(false);
  const bank = resolveBank(data);
  const byId = new Map(resolveBank(data, true).map((f) => [f.id, f]));
  const n = nutritionForSession(data, d.refsAt(p.plannedDate), p, bank, today());
  const opt = data.nutri[p.id] && !data.nutri[p.id].deleted ? data.nutri[p.id] : undefined;
  const main = data.nutri.main && !data.nutri.main.deleted ? data.nutri.main : undefined;
  const full = main?.detail === 'full';
  const bells = opt?.bells ?? {};
  const plan = n.plan;
  const mode = usePrefs().nutriMode;
  const checks = plan ? checkPlan(plan) : [];
  const ring = (e: NutriEvent) => { setBellFor(e); bellSh.show(); };
  return (
    <InfoCard className="card g8 dspan-12" aria-label={$t("Alimentation")}>
      <div className="between" style={{ gap: 'var(--space-8)', flexWrap: 'nowrap' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-4)', whiteSpace: 'nowrap' }}>{$t("Alimentation")}{plan && plan.notes.length > 0 && <InfoToggle />}</h2>
        {plan && (
          <div className="row" style={{ gap: 'var(--space-6)', flexShrink: 0 }}>
            <span className="chip" style={{ cursor: 'default', fontSize: 13, padding: '0 var(--space-8)' }}><Icon name="gauge" size={14} />{LEVEL_LABEL(n.level)}</span>
            <button type="button" className="icon-btn" style={{ border: '1.5px solid var(--border-neutral, currentColor)' }} aria-label={$t("Adapter")} title={$t("Adapter")} onClick={editSh.show}><Icon name="pencil" size={18} /></button>
          </div>
        )}
      </div>
      {plan && plan.notes.length > 0 && <Info><div className="stack" style={{ gap: 'var(--space-8)' }}>{plan.notes.map((t) => <span key={t}>{t}</span>)}</div></Info>}
      {!plan && <div className="note"><Icon name="info" size={20} /><span>{n.reason}</span></div>}
      {plan && (
        <>
          {(n.hot || (mode && mode !== 'off' && Object.keys(bells).length > 0)) && (
            <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
              {n.hot && <span className="chip" style={{ cursor: 'default' }}>{$t("Chaud")}</span>}
              {mode && mode !== 'off' && Object.keys(bells).length > 0 && <span className="chip" style={{ cursor: 'default' }}><Icon name="bell" size={14} />{Object.keys(bells).length}</span>}
            </div>
          )}
          {plan.during.shopping.length > 0 && (
            <div className="stack" style={{ gap: 'var(--space-6)' }}>
              <span className="t-strong">{$t("À emporter")}</span>
              <div className="nchips">{plan.during.shopping.map((x) => <FoodChip key={x.foodId} x={x} byId={byId} />)}</div>
            </div>
          )}
          <div className="ntl">
            <PhaseBlock plan={plan} phase="before" bells={bells} onBell={ring} byId={byId} checks={checks} full={full} />
            <PhaseBlock plan={plan} phase="during" bells={bells} onBell={ring} byId={byId} checks={checks} full={full} />
            <PhaseBlock plan={plan} phase="after" bells={bells} onBell={ring} byId={byId} checks={checks} full={full} />
          </div>
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={more} onClick={() => setMore(!more)}>{more ? $t("Masquer les hypothèses") : $t("Hypothèses et réglages de cette séance")}</button>
          {more && (
            <div className="stack" style={{ gap: 'var(--space-12)' }}>
              <div className="field">
                <span className="lbl">{$t("Intensité")}</span>
                <Segmented<string> label={$t("Intensité")} value={opt?.intensity ?? 'auto'} options={[['auto', $t("Estimée")], ['easy', $t("Facile")], ['moderate', $t("Modérée")], ['quality', $t("Intense")]]}
                  onChange={(v) => setNutriSession(p.id, { intensity: v === 'auto' ? null : (v as Level) })} />
                <span className="hint">{LEVEL_LABEL(n.level)} : {LEVEL_HINT(n.level)} {opt?.intensity ? $t("Imposée par toi.") : $t("Estimée {0}.", { 0: n.guess.basis })}</span>
              </div>
              <div className="between" style={{ gap: 'var(--space-12)' }}>
                <span className="stack"><span className="t-strong" id={'hot-' + p.id}>{$t("Chaud")}</span><span className="t-caption c-moderate">{$t("Plus de boisson et plus de sodium par heure.")}</span></span>
                <Switch checked={!!opt?.hot} labelledBy={'hot-' + p.id} onChange={(v) => setNutriSession(p.id, { hot: v })} />
              </div>
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                {plan.before.carbs && <span className="t-caption c-moderate">{$t("Avant : {0}–{1} g de glucides.", { 0: plan.before.carbs[0], 1: plan.before.carbs[1] })}</span>}
                {plan.during.carbsPerH && plan.during.carbsPerH[1] > 0 && <span className="t-caption c-moderate">{$t("Pendant : {0}–{1} g de glucides par heure.", { 0: plan.during.carbsPerH[0], 1: plan.during.carbsPerH[1] })}</span>}
                {plan.during.fluidPerH && <span className="t-caption c-moderate">{$t("Boisson : {0}–{1} ml par heure.", { 0: plan.during.fluidPerH[0], 1: plan.during.fluidPerH[1] })}</span>}
                {plan.during.sodiumPerH && <span className="t-caption c-moderate">{$t("Sodium : {0}–{1} mg par heure.", { 0: plan.during.sodiumPerH[0], 1: plan.during.sodiumPerH[1] })}</span>}
                {plan.after.carbs && <span className="t-caption c-moderate">{$t("Après : {0}–{1} g de glucides sur {2} h.", { 0: plan.after.carbs[0], 1: plan.after.carbs[1], 2: plan.after.hours })}</span>}
                <span className="t-caption c-moderate">{$t("Calculé pour {0} kg (règles établies pour {1} kg).", { 0: Math.round(plan.weightKg), 1: plan.rulesKg })}</span>
              </div>
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/alimentation')}><Icon name="nutrition" size={18} />{$t("Banque d’aliments et préférences")}</button>
            </div>
          )}
        </>
      )}
      {bellSh.open && bellFor && plan && <BellSheet p={p} e={bellFor} plan={plan} sh={bellSh} current={bellFor.bell ? bells[bellFor.bell] : undefined} />}
      {editSh.open && <EditorSheet p={p} sh={editSh} />}
    </InfoCard>
  );
}
