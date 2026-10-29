// Santé et capacités : calories (dépense / apport) et point hebdomadaire (VO₂max, seuil de lactate, ressenti, prédictions).
// Tout ce qui vient d'une estimation Apogée ou d'une saisie est étiqueté comme tel ; Apogée ne recalcule pas les indices Garmin.
import { $t } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { navigate, useRoute } from '../ui/router';
import { DateField, Disclosure, Segmented, Sheet, showToast, Info, InfoCard, InfoToggle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { DecField, DurationField, IntField, PaceField, numOf } from '../ui/wheels';
import { useLocalSheet } from '../ui/menu';
import { useCalc } from '../data/store';
import { addMeal, deleteMeal, restore, saveCheckin, type Snapshot } from '../data/actions';
import { useDayFix } from './dayfix';
import { addDays, dayRange, mondayOf } from '../domain/dates';
import { dayEnergy, weekEnergy } from '../domain/energy';
import { capacityHistory, type CapacityPoint } from '../domain/capacity';
import { DayChart } from '../ui/daychart';
import { PeriodBar, useDaySel, usePeriod } from '../ui/period';
import { Readout } from '../ui/readout';
import { checkinStatus, checkinsSorted, currentCheckin, hasContent, metricSeries, sundayOf, type CheckinMetric } from '../domain/checkin';
import { liveRecords } from '../domain/load';
import type { Checkin, EnergyPart } from '../domain/types';
import { dateFr, dayMonth, dayTitle, NBSP, num, signed, weekdayShort } from '../ui/format';

const KCAL = (v: number | null) => (v === null ? '—' : num(v, 0) + NBSP + 'kcal');


// ------------------------------------------------------------------ correction d'un jour : pas, étages, calories
/** Feuille « Saisir / Modifier » d'une carte (calories ; ou pas et étages) : recopie d'un jour d'après Garmin Connect. */
export function EnergyEditSheet({ day: day0, parts, onClose }: { day: string; parts: EnergyPart[]; onClose: () => void }) {
  const fix = useDayFix(day0, parts, true);
  const done = (msg: string, snaps: Snapshot[]) => { onClose(); showToast(msg, { undo: () => snaps.slice().reverse().forEach((x) => restore(x)) }); };
  const title = parts.includes('kcal') ? $t("Calories") : $t("Pas et étages");
  return (
    <Sheet title={title} onClose={onClose} footer={<button type="button" className="btn btn-primary block" disabled={fix.bad || !fix.changed} onClick={() => { if (fix.bad || !fix.changed) return; done($t("Jour corrigé"), fix.save()); }}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        {fix.node}
        {fix.canReset && <button type="button" className="btn btn-tertiary" onClick={() => done($t("Rendu à la montre"), fix.reset())}>{$t("Rétablir la valeur de la montre")}</button>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ calories
export function CaloriesCard() {
  const { data, d } = useCalc();
  const [day, setDay] = useState(d.today);
  const sheet = useLocalSheet();
  const fix = useLocalSheet();
  const [kc, setKc] = useState('');
  const [label, setLabel] = useState('');
  const e = dayEnergy(data, day);
  const week = weekEnergy(data, mondayOf(day));
  const meals = liveRecords(data.meals).filter((m) => m.day === day).sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
  const v = Number(kc.replace(',', '.'));
  const ok = Number.isFinite(v) && v > 0 && v <= 10000;
  const save = () => {
    if (!ok) return;
    const snap = addMeal(day, v, label);
    sheet.hide(); setKc(''); setLabel('');
    showToast($t("Repas ajouté"), { undo: () => restore(snap) });
  };
  const maxBar = Math.max(1, ...week.days.map((x) => Math.max(x.total ?? x.active ?? 0, x.intake)));
  const noEnergy = e.active === null && e.rest === null;
  const cp = usePeriod();
  const cAll = useMemo(() => dayRange(addDays(d.today, -364), d.today), [d.today]);
  const cDays = cp.slice(cAll);
  return (
    <InfoCard className="card g12" aria-label={$t("Calories")} data-anchor="calories">
      <div className="between">
        <h2>{$t("Calories")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => fix.show()}>{noEnergy ? $t("Saisir") : $t("Modifier")}</button>
      </div>
      <div className="between">
        <button type="button" className="icon-btn" aria-label={$t("Jour précédent")} onClick={() => setDay(addDays(day, -1))}><Icon name="back" /></button>
        <span className="t-strong">{day === d.today ? $t("Aujourd’hui") : dayTitle(day)}</span>
        <button type="button" className="icon-btn" aria-label={$t("Jour suivant")} disabled={day >= d.today} onClick={() => setDay(addDays(day, 1))}><Icon name="next" /></button>
      </div>
      {noEnergy ? <><p className="t-caption c-moderate">{$t("Pas de dépense connue ce jour. Les calories actives viennent des séances de la montre ; pour la dépense de repos, renseigne ta taille dans Paramètres › Profil.")}</p><button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/profil')}>{$t("Ouvrir le profil")}</button></> : (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
            <span className="t-h2">{KCAL(e.total)}</span>
            <span className="t-caption c-neutral">{$t("dépensées")}{e.restFrom === 'estimation' ? $t(" (repos estimé)") : ''}</span>
            {e.restHow === 'manual' && <span className="var-chip flat">{$t("saisies")}</span>}
          </div>
          <dl className="kv">
            <dt>{$t("Actives (mouvement, séances)")}</dt><dd>{KCAL(e.active)}</dd>
            <dt>{e.restFrom === 'estimation' ? $t("Repos (estimation Mifflin-St Jeor)") : $t("Repos (passives)")}</dt><dd>{KCAL(e.rest)}</dd>
          </dl>
        </>
      )}
      {e.restHow === 'split' && <><p className="t-legal c-moderate">{$t("Le partage repos / actives vient de Health Connect et peut s’écarter de Garmin Connect. Pour les faire coller, renseigne les calories de repos de ta montre dans Paramètres › Profil.")}</p><button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/profil?ancre=repos')}>{$t("Ouvrir le profil")}</button></>}
      <dl className="kv">
        <dt>{$t("Mangées (journal)")}</dt><dd>{e.meals ? KCAL(e.intake) : '—'}</dd>
        {e.balance !== null && (<><dt>{$t("Bilan du jour")}</dt><dd style={{ color: e.balance > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>{signed(e.balance, 0)}{NBSP}kcal</dd></>)}
      </dl>
      <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', height: 36 }} onClick={() => sheet.show()}>{$t("Ajouter un repas")}</button>
      {meals.length > 0 && (
        <ul className="stack" style={{ gap: 'var(--space-4)' }}>
          {meals.map((m) => (
            <li key={m.id} className="between t-caption"><span>{m.label ?? $t("Repas")}</span>
              <span className="row" style={{ gap: 'var(--space-8)' }}><strong>{KCAL(m.kcal)}</strong><button type="button" className="icon-btn" aria-label={$t("Supprimer ce repas")} onClick={() => { const snap = deleteMeal(m.id); showToast($t("Repas supprimé"), { undo: () => restore(snap) }); }}><Icon name="trash" size={18} /></button></span>
            </li>
          ))}
        </ul>
      )}
      <PeriodBar p={cp} total={cAll.length} from={cDays[0]} to={cDays[cDays.length - 1]} />
      <DayChart points={cDays.map((x) => { const en = dayEnergy(data, x); return { day: x, v: en.active ?? (en.total !== null ? 0 : null), lo: en.rest ?? 0 }; })} kind="stack" sel={Math.max(0, cDays.indexOf(day))} onSel={(i) => setDay(cDays[i])} onRelease={() => setDay(d.today)} height={110} color="var(--chart-kcal-active)" color2="var(--chart-kcal-rest)" fmtTick={(v) => num(v, 0)} label={$t("Dépense par jour : repos et actives")} />
      <div className="legend">
        <span><span className="dot s10" style={{ background: 'var(--chart-kcal-active)' }} />{$t("Actives")}</span>
        <span><span className="dot s10" style={{ background: 'var(--chart-kcal-rest)' }} />{$t("Repos")}</span>
      </div>
      <h3 className="t-strong">{$t("Semaine du {0}", { 0: dayMonth(week.days[0].day) })}</h3>
      <p className="t-legal c-moderate">{$t("Semaine : {0} actives, {1} de repos, {2} mangées sur {3} jour(s) saisi(s).", { 0: KCAL(week.active), 1: KCAL(week.rest), 2: week.mealDays ? KCAL(week.intake) : '—', 3: week.mealDays })}</p>
      <Info>{$t("Le repos vient de Health Connect quand la montre donne le total ; sinon c’est une estimation (formule de Mifflin-St Jeor, avec ta taille, ton poids, ton âge et ton sexe). Le journal de repas est un simple compteur : tu entres les kcal toi-même, il n’y a pas de base d’aliments. Une estimation reste une estimation : ne la prends pas pour une mesure.")} {$t("Si tu renseignes les calories de repos de ta montre (Paramètres › Profil), le total reste celui de Health Connect et les actives sont calculées comme dans Garmin Connect.")} {$t("En cas d’écart net avec Garmin Connect pour un jour, « Saisir » / « Modifier » te laisse recopier ses calories actives et totales : elles ne sont plus écrasées par la montre.")}</Info>
      {fix.open && <EnergyEditSheet day={day} parts={['kcal']} onClose={fix.hide} />}
      {sheet.open && (
        <Sheet title={$t("Ajouter un repas")} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
              {[$t("Petit-déjeuner"), $t("Déjeuner"), $t("Collation"), $t("Dîner")].map((l) => <button key={l} type="button" className="chip" aria-pressed={label === l} onClick={() => setLabel(label === l ? '' : l)}>{l}</button>)}
            </div>
            <div className="field"><span className="lbl">{$t("Calories (kcal)")}</span><IntField label={$t("Calories (kcal)")} unit="kcal" value={numOf(kc)} onChange={(x) => setKc(x === null ? '' : String(x))} min={5} max={3000} step={5} initial={500} /></div>
            <label className="field"><span className="lbl">{$t("Libellé")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input" value={label} onChange={(ev) => setLabel(ev.target.value)} /></label>
            <span className="t-legal c-moderate">{$t("Pour le jour affiché : {0}.", { 0: dateFr(day) })}</span>
          </div>
        </Sheet>
      )}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ pas et étages
export function ActivityCard() {
  const { data, d } = useCalc();
  const route = useRoute();
  const wanted = route.query.get('mesure') === 'floors' ? 'floors' : 'steps';
  const [what, setWhat] = useState<'steps' | 'floors'>(wanted);
  useEffect(() => { setWhat(wanted); }, [route.key, wanted]);
  const all = useMemo(() => dayRange(addDays(d.today, -364), d.today), [d.today]);
  const pw = usePeriod();
  const days = pw.slice(all);
  const [si, setSi, relSel] = useDaySel(days);
  const fix = useLocalSheet();
  const val = (x: string) => { const e = data.energy[x]; return e && !e.deleted ? e[what] ?? null : null; };
  const known = days.map(val).filter((x): x is number => !!x);
  if (!Object.values(data.energy).some((e) => !e.deleted && (e.steps || e.floors))) return null;
  const day = days[si] ?? d.today;
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  return (
    <InfoCard className="card g12" aria-label={$t("Pas et étages")} data-anchor="pas-etages">
      <div className="between">
        <h2>{$t("Pas et étages")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => fix.show()}>{val(day) === null ? $t("Saisir") : $t("Modifier")}</button>
      </div>
      <Segmented label={$t("Mesure")} value={what} onChange={setWhat} options={[['steps', $t("Pas")], ['floors', $t("Étages")]]} />
      <PeriodBar p={pw} total={all.length} from={days[0]} to={days[days.length - 1]} />
      <Readout when={<>{day === d.today ? $t("Aujourd’hui") : dayTitle(day)}{data.energy[day]?.edited?.includes(what) ? <span className="var-chip flat" style={{ marginLeft: 'var(--space-8)' }}>{$t("saisi")}</span> : null}</>} cells={[
        { label: what === 'steps' ? $t("Pas") : $t("Étages"), value: val(day) === null ? '—' : num(val(day)!, 0), color: what === 'steps' ? 'var(--chart-7)' : 'var(--chart-4)', key: true },
        { label: $t("Moyenne de la période"), value: avg === null ? '—' : num(avg, 0) },
      ]} />
      <DayChart points={days.map((x) => ({ day: x, v: val(x) }))} kind="bars" sel={si} onSel={setSi} onRelease={relSel} height={110} color={what === 'steps' ? 'var(--chart-7)' : 'var(--chart-4)'} fmtTick={(v) => num(v, 0)} label={what === 'steps' ? $t("Pas par jour") : $t("Étages par jour")} />
      <Info>{$t("Lus dans Health Connect (rien n’est recalculé) : Garmin Connect y dépose le total du jour. Les étages ne sont affichés que si la montre les transmet. « Saisir » / « Modifier » corrige le jour affiché d’après Garmin Connect en cas d’écart net : la valeur saisie n’est plus écrasée par la montre.")}</Info>
      {fix.open && <EnergyEditSheet day={day} parts={['steps', 'floors']} onClose={fix.hide} />}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ point hebdomadaire
const clock = (sec: number | null) => {
  if (sec === null) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
};
/** « 24:30 » ou « 3:30:00 » → secondes ; vide → null ; illisible → NaN. */
export function parseClock(t: string): number | null {
  const s = t.trim();
  if (!s) return null;
  const p = s.split(':').map((x) => Number(x.replace(',', '.')));
  if (p.some((x) => !Number.isFinite(x) || x < 0) || p.length > 3) return NaN;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : NaN;
}
const numOrNull = (t: string): number | null => { const s = t.trim(); if (!s) return null; const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

/** Formulaire du point de la semaine : relevé daté de la montre (VO₂max, seuil, ressenti, prédictions) et correction d'un jour (pas, étages, calories, sommeil). */
/** `only` : fenêtre « Courbes de capacité » (VO₂max, seuil de lactate, prédictions) sans le ressenti ni la correction de jour ; sans `only`, c’est le point de la semaine complet. */
export function CheckinSheet({ onClose, only }: { onClose: () => void; only?: 'curves' }) {
  const { data, d } = useCalc();
  const maxDay = sundayOf(d.today);
  const [dateF, setDateF] = useState(maxDay);
  const cur = currentCheckin(data, dateF);
  const fieldsOf = (day: string): Record<string, string> => {
    const c = currentCheckin(data, day).draft;
    return {
      vo2max: c.vo2max?.toString().replace('.', ',') ?? '', lthrBpm: c.lthrBpm?.toString() ?? '', lthPace: clock(c.lthPaceSecKm),
      p5: clock(c.pred5kSec), p10: clock(c.pred10kSec), ph: clock(c.predHalfSec), pm: clock(c.predMarathonSec), note: c.note ?? '',
    };
  };
  const [f, setF] = useState<Record<string, string>>(() => fieldsOf(maxDay));
  const [sleepF, setSleepF] = useState<number | null>(() => currentCheckin(data, maxDay).draft.sleepFelt);
  const [recF, setRecF] = useState<number | null>(() => currentCheckin(data, maxDay).draft.recoveryFelt);
  const fill = (day: string) => { const c = currentCheckin(data, day).draft; setF(fieldsOf(day)); setSleepF(c.sleepFelt); setRecF(c.recoveryFelt); };
  // changer le jour recharge la fiche de cette semaine-là (pour compléter ou corriger un ancien point)
  const onDate = (v: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > maxDay) return; setDateF(v); fill(v); };
  const vo2 = numOrNull(f.vo2max ?? ''), lthr = numOrNull(f.lthrBpm ?? '');
  const lthp = parseClock(f.lthPace ?? ''), p5 = parseClock(f.p5 ?? ''), p10 = parseClock(f.p10 ?? ''), ph = parseClock(f.ph ?? ''), pm = parseClock(f.pm ?? '');
  const bad = [vo2, lthr, lthp, p5, p10, ph, pm].some((x) => Number.isNaN(x))
    || (vo2 !== null && (vo2 < 15 || vo2 > 90)) || (lthr !== null && (lthr < 80 || lthr > 230));
  const next: Omit<Checkin, 'updatedAt'> = {
    id: cur.week, week: cur.week, day: dateF, vo2max: vo2, lthrBpm: lthr, lthPaceSecKm: lthp, hrvMs: cur.saved?.hrvMs ?? null, hrvStatus: cur.saved?.hrvStatus ?? null, sleepFelt: sleepF, recoveryFelt: recF,
    pred5kSec: p5, pred10kSec: p10, predHalfSec: ph, predMarathonSec: pm, note: (f.note ?? '').trim() || null,
  };
  const fix = useDayFix(d.today, only ? [] : ['steps', 'floors', 'kcal', 'sleep'], true);
  const { id: _i, week: _w, day: _d, ...content } = next;
  const withCheckin = hasContent(content);
  const canSave = !bad && !fix.bad && (withCheckin || fix.changed);
  const save = () => {
    if (!canSave) return;
    const snaps: Snapshot[] = [];
    if (withCheckin) snaps.push(saveCheckin(next));
    snaps.push(...fix.save());
    onClose();
    showToast(only ? $t("Courbes de capacité enregistrées") : $t("Point de la semaine enregistré"), { undo: () => snaps.slice().reverse().forEach((x) => restore(x)) });
  };
  const clk = (x: number | null) => (x !== null && Number.isFinite(x) ? x : null);
  const set = (k: string) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const scale = (val: number | null, on: (v: number | null) => void, label: string) => (
    <div className="stack-4" role="group" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="row" style={{ gap: 'var(--space-6)' }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="chip" style={{ flex: 1, justifyContent: 'center' }} aria-pressed={val === n} onClick={() => on(val === n ? null : n)}>{n}</button>)}</div>
      <div className="between t-legal c-moderate"><span>{$t("Très mauvais")}</span><span>{$t("Très bon")}</span></div>
    </div>
  );
  return (
    <Sheet title={only ? $t("Courbes de capacité") : $t("Point de la semaine")} onClose={onClose} footer={<button type="button" className="btn btn-primary block" disabled={!canSave} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <DateField label={$t("Jour du relevé")} value={dateF} max={maxDay} onChange={onDate} />
        <span className="t-caption c-neutral">{$t("Par défaut le prochain dimanche. Choisis un jour passé pour recopier un ancien relevé de ta montre (une fiche par semaine : semaine du {0}). Laisse vide ce que ta montre ne donne pas.", { 0: dateFr(cur.week) })}</span>
        <h3 className="t-strong">{$t("Capacités")}</h3>
        <div className="grid-2">
          <div className="field"><span className="lbl">{$t("VO₂max")}</span><DecField label={$t("VO₂max")} value={numOf(f.vo2max ?? '')} onChange={(x) => setF({ ...f, vo2max: x === null ? '' : String(x).replace('.', ',') })} hiMax={90} clearable initial={50} /></div>
          <div className="field"><span className="lbl">{$t("Seuil : FC (bpm)")}</span><IntField label={$t("Seuil : FC (bpm)")} unit="bpm" value={numOf(f.lthrBpm ?? '')} onChange={(x) => setF({ ...f, lthrBpm: x === null ? '' : String(x) })} min={80} max={230} clearable initial={170} /></div>
        </div>
        <div className="field"><span className="lbl">{$t("Seuil : allure (min:s /km)")}</span><PaceField label={$t("Seuil : allure (min:s /km)")} value={clk(lthp)} onChange={(x) => setF({ ...f, lthPace: x === null ? '' : clock(x) })} clearable initial={275} /></div>
        {!only && <>
        <h3 className="t-strong">{$t("Ressenti de la semaine")}</h3>
        {scale(sleepF, setSleepF, $t("Sommeil"))}
        {scale(recF, setRecF, $t("Récupération"))}
        </>}
        <>
        <h3 className="t-strong">{$t("Prédictions de course de la montre")}</h3>
        <div className="grid-2">
          <div className="field"><span className="lbl">{$t("5 km")}</span><DurationField label={$t("5 km")} hours={false} value={clk(p5)} onChange={(x) => setF({ ...f, p5: x === null ? '' : clock(x) })} clearable initial={1500} /></div>
          <div className="field"><span className="lbl">{$t("10 km")}</span><DurationField label={$t("10 km")} hours={true} value={clk(p10)} onChange={(x) => setF({ ...f, p10: x === null ? '' : clock(x) })} clearable initial={3100} /></div>
          <div className="field"><span className="lbl">{$t("Semi")}</span><DurationField label={$t("Semi")} hours={true} value={clk(ph)} onChange={(x) => setF({ ...f, ph: x === null ? '' : clock(x) })} clearable initial={6600} /></div>
          <div className="field"><span className="lbl">{$t("Marathon")}</span><DurationField label={$t("Marathon")} hours={true} value={clk(pm)} onChange={(x) => setF({ ...f, pm: x === null ? '' : clock(x) })} clearable initial={14100} /></div>
        </div>
        </>
        {!only && <>
        <h3 className="t-strong">{$t("Corriger un jour d’après Garmin Connect")}</h3>
        {fix.node}
        </>}
        {!only && <label className="field"><span className="lbl">{$t("Note")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input" value={f.note ?? ''} onChange={set('note')} /></label>}
        {bad && <span className="t-caption" style={{ color: 'var(--critical-text)' }}>{$t("Une valeur est illisible ou hors limites.")}</span>}
      </div>
    </Sheet>
  );
}

export function CheckinCard() {
  const { data, d } = useCalc();
  const sheet = useLocalSheet();
  const st = checkinStatus(data, d.today);
  // ouverture directe du formulaire (notification, première ouverture après son heure) : `?point=1`, une seule fois
  const route = useRoute();
  const asked = route.query.get('point') === '1';
  useEffect(() => {
    if (!asked) return;
    navigate(route.path, { replace: true });
    sheet.show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
  const all = checkinsSorted(data);
  const s = all.length ? all[all.length - 1] : null;
  return (
    <InfoCard className="card g12" aria-label={$t("Point de la semaine")} data-anchor="point-semaine">
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Point de la semaine")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => sheet.show()}>{st.done ? $t("Modifier") : $t("Remplir")}</button>
      </div>
      <div className="stack-4" data-checkin={st.done ? 'done' : 'todo'}>
        {st.done
          ? <span className="row t-caption-strong c-success" style={{ gap: 'var(--space-8)', alignItems: 'center' }}><Icon name="check" size={20} />{$t("Fait pour dimanche {0}", { 0: dayMonth(st.due) })}</span>
          : <span className="t-caption-strong c-moderate">{$t("Pas encore fait")}</span>}
        <span className="t-caption c-moderate">{st.done ? $t("Prochain point : dimanche {0}", { 0: dayMonth(st.next) }) : $t("Relevé du dimanche {0} à faire · prochain : dimanche {1}", { 0: dayMonth(st.due), 1: dayMonth(st.next) })}</span>
      </div>
      <Info>{$t("Une fois par semaine, recopie ce que ta montre affiche : VO₂max, seuil de lactate, prédictions de course, et ton ressenti. Apogée en trace les courbes. Tu peux aussi y corriger un jour de pas, d’étages, de calories ou de sommeil d’après Garmin Connect. Un rappel te le propose le dimanche.")}</Info>
      {s ? (
        <Disclosure title={$t("Détail du dernier point ({0})", { 0: dateFr(s.day || s.week) })}>
        <dl className="kv">
          {s.vo2max !== null && <><dt>{$t("VO₂max")}</dt><dd>{num(s.vo2max, 0, 1)}</dd></>}
          {s.lthrBpm !== null && <><dt>{$t("Seuil de lactate : FC")}</dt><dd>{s.lthrBpm}{NBSP}bpm</dd></>}
          {s.lthPaceSecKm !== null && <><dt>{$t("Seuil de lactate : allure")}</dt><dd>{clock(s.lthPaceSecKm)}{NBSP}/km</dd></>}
          {s.sleepFelt !== null && <><dt>{$t("Sommeil ressenti")}</dt><dd>{s.sleepFelt}{NBSP}/{NBSP}5</dd></>}
          {s.recoveryFelt !== null && <><dt>{$t("Récupération ressentie")}</dt><dd>{s.recoveryFelt}{NBSP}/{NBSP}5</dd></>}
          {s.pred5kSec !== null && <><dt>{$t("Prédiction 5 km")}</dt><dd>{clock(s.pred5kSec)}</dd></>}
          {s.pred10kSec !== null && <><dt>{$t("Prédiction 10 km")}</dt><dd>{clock(s.pred10kSec)}</dd></>}
          {s.predHalfSec !== null && <><dt>{$t("Prédiction semi")}</dt><dd>{clock(s.predHalfSec)}</dd></>}
          {s.predMarathonSec !== null && <><dt>{$t("Prédiction marathon")}</dt><dd>{clock(s.predMarathonSec)}</dd></>}
        </dl>
        </Disclosure>
      ) : <p className="t-caption c-moderate">{$t("Aucun point enregistré pour l’instant.")}</p>}
      {sheet.open && <CheckinSheet onClose={sheet.hide} />}
    </InfoCard>
  );
}

// ------------------------------------------------------------------ courbes des capacités
const TRENDS: { k: CheckinMetric; label: string; fmt: (v: number) => string; better: 'up' | 'down' | null }[] = [
  { k: 'vo2max', label: $t("VO₂max"), fmt: (v) => num(v, 0, 1), better: 'up' },
  { k: 'lthrBpm', label: $t("Seuil de lactate : FC"), fmt: (v) => num(v, 0) + NBSP + 'bpm', better: null },
  { k: 'lthPaceSecKm', label: $t("Seuil de lactate : allure"), fmt: (v) => clock(v) + NBSP + '/km', better: 'down' },
  { k: 'sleepFelt', label: $t("Sommeil ressenti"), fmt: (v) => num(v, 0) + NBSP + '/' + NBSP + '5', better: 'up' },
  { k: 'recoveryFelt', label: $t("Récupération ressentie"), fmt: (v) => num(v, 0) + NBSP + '/' + NBSP + '5', better: 'up' },
  { k: 'pred5kSec', label: $t("Prédiction 5 km"), fmt: clock as (v: number) => string, better: 'down' },
  { k: 'pred10kSec', label: $t("Prédiction 10 km"), fmt: clock as (v: number) => string, better: 'down' },
  { k: 'predHalfSec', label: $t("Prédiction semi"), fmt: clock as (v: number) => string, better: 'down' },
  { k: 'predMarathonSec', label: $t("Prédiction marathon"), fmt: clock as (v: number) => string, better: 'down' },
];

/** Graduations « rondes » en secondes (10 s, 30 s, 1 min, 5 min…) pour un axe de temps. */
function timeTicks(lo: number, hi: number): number[] {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const st = steps.find((x) => (hi - lo) / x <= 4) ?? 3600;
  const out: number[] = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(v);
  return out;
}

/** Courbe d'une métrique avec son curseur : valeur lue, écart sur la période, graphe. */
function MetricChart({ label, pts, fmt, better, time, sel, onSel, onRelease, estimated, holdLast }: { label: string; pts: { day: string; v: number | null }[]; fmt: (v: number) => string; better: 'up' | 'down' | null; time?: boolean; sel: number; onSel: (i: number) => void; onRelease?: () => void; estimated?: boolean; holdLast?: boolean }) {
  const known = pts.filter((p) => p.v !== null).map((p) => p.v as number);
  if (!known.length) return <li className="stack-4"><span className="t-caption-strong">{label}</span><span className="t-legal c-moderate">{$t("Aucun relevé sur cette période.")}</span></li>;
  const at = Math.min(sel, pts.length - 1);
  let cur = pts[at];
  // relevés espacés (montre) : le curseur lit la dernière valeur connue avant ce jour, avec sa date
  let heldFrom: string | null = null;
  if (holdLast && cur && cur.v === null) for (let k = at - 1; k >= 0; k--) if (pts[k].v !== null) { cur = pts[k]; heldFrom = pts[k].day; break; }
  const first = known[0], lastV = known[known.length - 1];
  const diff = known.length >= 2 ? lastV - first : null;
  const good = diff === null || diff === 0 || better === null ? null : (diff > 0) === (better === 'up');
  const lo = Math.min(...known), hi = Math.max(...known);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.03 || 1;
  return (
    <li className="stack-4" data-component="MetricChart">
      <div className="between"><span className="t-caption-strong">{label}</span>
        <span className="row" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}>
          <strong className="metric-val">{cur && cur.v !== null ? fmt(cur.v) : '—'}</strong>
          {diff !== null && diff !== 0 && <span className="t-legal" style={{ color: good === null ? 'var(--text-moderate)' : good ? 'var(--success-text)' : 'var(--warning-text)' }}>{$t("{0} sur la période", { 0: (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)) })}</span>}
        </span>
      </div>
      <DayChart points={pts} kind="line" sel={sel} onSel={onSel} onRelease={onRelease} height={86} label={label} min={lo - pad} max={hi + pad} fmtTick={fmt} ticks={time ? timeTicks(lo - pad, hi + pad) : undefined} dots={holdLast ? true : pts.length <= 31 ? true : false} connect={holdLast} />
      {/* la ligne est toujours là (même vide) : sinon elle apparaît et disparaît en glissant le curseur et fait osciller la page */}
      {(holdLast || estimated) && <span className="t-legal c-moderate" style={{ minHeight: 18 }}>{heldFrom ? $t("Relevé du {0}", { 0: dayMonth(heldFrom) }) : estimated && cur && cur.v === null ? $t("Pas de valeur ce jour-là.") : NBSP}</span>}
    </li>
  );
}


/** Courbes de la montre (un relevé par semaine, recopié) : mêmes périodes, même curseur et même glissement que les autres graphes. */
function WatchTrend({ k, label, fmt, better, time, days, sel, onSel, onRelease }: { k: CheckinMetric; label: string; fmt: (v: number) => string; better: 'up' | 'down' | null; time?: boolean; days: string[]; sel: number; onSel: (i: number) => void; onRelease: () => void }) {
  const { data } = useCalc();
  const byDay = new Map(metricSeries(data, k).map((x) => [x.day, x.v]));
  return <MetricChart label={label} pts={days.map((day) => ({ day, v: byDay.get(day) ?? null }))} fmt={fmt} better={better} time={time} sel={sel} onSel={onSel} onRelease={onRelease} holdLast />;
}


/** Deux nombres à lire sur 4 intervalles égaux : bornes et graduations « rondes » (même nombre de lignes pour les deux axes du seuil). */
function axis4(known: number[], steps: number[]): { lo: number; hi: number; ticks: number[] } {
  const mn = Math.min(...known), mx = Math.max(...known);
  const st = steps.find((x) => x * 4 >= (mx - mn) * 1.3) ?? steps[steps.length - 1];
  let lo = Math.floor((mn + mx) / 2 / st) * st - 2 * st;
  while (lo > mn - st * 0.2) lo -= st;
  while (lo + 4 * st < mx + st * 0.2) lo += st;
  return { lo, hi: lo + 4 * st, ticks: [0, 1, 2, 3, 4].map((k) => lo + k * st) };
}

/** Seuil de lactate : FC (bpm, échelle de gauche) et allure (échelle de droite, la plus rapide en haut), comme dans Garmin Connect. */
function ThresholdChart({ days, sel, onSel, onRelease }: { days: string[]; sel: number; onSel: (i: number) => void; onRelease: () => void }) {
  const { data } = useCalc();
  const hrBy = new Map(metricSeries(data, 'lthrBpm').map((x) => [x.day, x.v]));
  const paBy = new Map(metricSeries(data, 'lthPaceSecKm').map((x) => [x.day, x.v]));
  const hr = days.map((x) => hrBy.get(x) ?? null), pa = days.map((x) => paBy.get(x) ?? null);
  const kh = hr.filter((v): v is number => v !== null), kp = pa.filter((v): v is number => v !== null);
  const label = $t("Seuil de lactate");
  if (!kh.length && !kp.length) return <li className="stack-4"><span className="t-caption-strong">{label}</span><span className="t-legal c-moderate">{$t("Aucun relevé sur cette période.")}</span></li>;
  const at = Math.min(sel, days.length - 1);
  // relevés espacés : le curseur lit le dernier relevé connu avant ce jour
  const held = (arr: (number | null)[]) => { for (let k = at; k >= 0; k--) if (arr[k] !== null) return { v: arr[k]!, from: days[k] }; return null; };
  const ch = held(hr), cp = held(pa);
  const axH = axis4(kh.length ? kh : [170], [1, 2, 5, 10]);
  const axP = axis4(kp.length ? kp : [270], [1, 2, 5, 10, 15, 30, 60]);
  const C1 = 'var(--chart-1)', C2 = 'var(--chart-3)';
  const fromDay = ch?.from ?? cp?.from;
  return (
    <li className="stack-4" data-component="ThresholdChart">
      <span className="t-caption-strong">{label}</span>
      <div className="row wrap" style={{ gap: 'var(--space-16)', alignItems: 'baseline' }}>
        <span className="row" style={{ gap: 'var(--space-6)', alignItems: 'baseline' }}><span className="dot s10" style={{ background: C1 }} /><strong className="metric-val">{ch ? ch.v + NBSP + 'bpm' : '—'}</strong></span>
        <span className="row" style={{ gap: 'var(--space-6)', alignItems: 'baseline' }}><span className="dot s10" style={{ background: C2 }} /><strong className="metric-val">{cp ? clock(cp.v) + NBSP + '/km' : '—'}</strong></span>
      </div>
      <DayChart points={days.map((day, i) => ({ day, v: hr[i] }))} kind="line" sel={sel} onSel={onSel} onRelease={onRelease} height={110} label={label}
        min={axH.lo} max={axH.hi} ticks={axH.ticks} fmtTick={(v) => num(v, 0)} color={C1} dots connect
        second={{ vals: pa, lo: axP.lo, hi: axP.hi, ticks: axP.ticks, fmt: clock as (v: number) => string, color: C2, invert: true }} />
      <div className="legend">
        <span><span className="dot s10" style={{ background: C1 }} />{$t("Fréquence cardiaque")}</span>
        <span><span className="dot s10" style={{ background: C2 }} />{$t("Allure")}</span>
      </div>
      <span className="t-legal c-moderate" style={{ minHeight: 18 }}>{fromDay ? $t("Relevé du {0}", { 0: dayMonth(fromDay) }) : NBSP}</span>
    </li>
  );
}

export function CapacitiesTrendsCard() {
  const { data, d } = useCalc();
  const pw = usePeriod(30);
  const sheet = useLocalSheet();
  // VO₂max calculée par Apogée sur tes séances, sans rien recopier : un point par jour
  const hist = useMemo(() => capacityHistory(data, d, 365), [data, d]);
  const win = pw.slice(hist);
  // le curseur ne reste pas où le doigt l'a laissé : au relâchement, il revient sur aujourd'hui (dernier jour de la période)
  const [pick, setPick] = useState<string | null>(null);
  const wd = win.map((p) => p.day);
  const si = pick !== null && wd.includes(pick) ? wd.indexOf(pick) : Math.max(0, wd.length - 1);
  const setSi = (i: number) => setPick(wd[i] ?? null);
  const back = () => setPick(null);
  type Own = { label: string; fmt: (v: number) => string; better: 'up' | 'down'; time?: boolean; pick: (p: CapacityPoint) => number | null };
  const ownAll: Own[] = [
    { label: $t("VO₂max"), fmt: (v) => num(v, 0, 1), better: 'up', pick: (p) => p.vo2max },
  ];
  const own = ownAll.filter((m) => win.filter((p) => m.pick(p) !== null).length >= 2);
  const hasThr = metricSeries(data, 'lthrBpm').length > 0 || metricSeries(data, 'lthPaceSecKm').length > 0;
  const watchRows = TRENDS.filter((t) => t.k === 'lthrBpm' ? hasThr : t.k === 'lthPaceSecKm' ? false : metricSeries(data, t.k).length > 0);
  return (
    <InfoCard className="card g12" aria-label={$t("Courbes de capacité")} data-anchor="courbes-capacite">
      <div className="between">
        <h2>{$t("Courbes de capacité")}<InfoToggle /></h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => sheet.show()}>{$t("Saisir")}</button>
      </div>
      {sheet.open && <CheckinSheet only="curves" onClose={sheet.hide} />}
      {own.length === 0 && watchRows.length === 0 ? <p className="t-caption c-moderate">{$t("Les courbes apparaîtront dès qu’Apogée aura assez de sorties de course pour estimer ta VO₂max, ou dès que tu auras rempli ton point de la semaine.")}</p> : (
        <>
          <PeriodBar p={pw} total={hist.length} from={win[0]?.day} to={win[win.length - 1]?.day} />
          <Readout when={win[si] ? (win[si].day === d.today ? $t("Aujourd’hui") : dayMonth(win[si].day)) : ''} cols={1} cells={[]} />
          {own.length > 0 && (
            <ul className="stack" style={{ gap: 'var(--space-16)' }}>
              {own.map((m) => <MetricChart key={m.label} label={m.label} pts={win.map((p) => ({ day: p.day, v: m.pick(p) }))} fmt={m.fmt} better={m.better} time={m.time} sel={si} onSel={setSi} onRelease={back} estimated />)}
            </ul>
          )}
          {watchRows.length > 0 && <h3 className="t-strong">{$t("Recopié de ta montre")}</h3>}
          {watchRows.length > 0 && <ul className="stack" style={{ gap: 'var(--space-16)' }}>
            {watchRows.map((t) => t.k === 'lthPaceSecKm' ? null : t.k === 'lthrBpm'
              ? <ThresholdChart key="seuil" days={win.map((p) => p.day)} sel={si} onSel={setSi} onRelease={back} />
              : <WatchTrend key={t.k} k={t.k} label={t.label} fmt={t.fmt} better={t.better} time={t.k.startsWith('pred')} days={win.map((p) => p.day)} sel={si} onSel={setSi} onRelease={back} />)}
          </ul>}
        </>
      )}
      <Info>{$t("VO₂max calculée par Apogée sur tes propres séances, un point par jour : chaque point est recalculé avec les sorties de course à allure stable des 60 jours précédents, les plus récentes comptant davantage. Aucune valeur n’est tracée tant qu’il n’y a pas assez de sorties. Touche ou fais glisser un graphe : le curseur se déplace sur tous, et les flèches reculent d’une période. Plus bas, les valeurs que tu recopies de ta montre (un relevé par semaine, reliés entre eux ; le curseur lit le dernier relevé connu), dont tes prédictions de course. Les deux ne sont pas comparables un à un : Garmin utilise ses propres modèles.")}</Info>
      <Info>{$t("Méthode publiée : sorties de course à allure stable — coût en oxygène de la course (ACSM) et équivalence entre % de la réserve de FC et % de la réserve de VO₂ (Swain et Leutholtz 1997) ; moyenne des sorties à plat des 60 derniers jours, les plus récentes comptant davantage (demi-vie de 3 semaines), 3 sorties minimum. Sans assez de sorties, repli sur le rapport FC max / FC de repos × 15,3 (Uth 2004). L’erreur typique est de l’ordre de 10 %.")}</Info>
    </InfoCard>
  );
}
