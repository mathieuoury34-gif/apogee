// Santé et capacités : calories (dépense / apport) et point hebdomadaire (VO₂max, seuil de lactate, ressenti, prédictions).
// Tout ce qui vient d'une estimation Apogée ou d'une saisie est étiqueté comme tel ; Apogée ne recalcule pas les indices Garmin.
import { $t } from '../i18n';
import { useState } from 'react';
import { Sheet, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useLocalSheet } from '../ui/menu';
import { useCalc } from '../data/store';
import { addMeal, deleteMeal, restore, saveCheckin } from '../data/actions';
import { addDays, mondayOf } from '../domain/dates';
import { dayEnergy, weekEnergy } from '../domain/energy';
import { currentCheckin, hasContent, metricSeries, type CheckinMetric } from '../domain/checkin';
import { liveRecords } from '../domain/load';
import type { Checkin } from '../domain/types';
import { dateFr, dayMonth, dayTitle, NBSP, num, signed, weekdayShort } from '../ui/format';

const KCAL = (v: number | null) => (v === null ? '—' : num(v, 0) + NBSP + 'kcal');

// ------------------------------------------------------------------ calories
export function CaloriesCard() {
  const { data, d } = useCalc();
  const [day, setDay] = useState(d.today);
  const sheet = useLocalSheet();
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
  return (
    <section className="card g12" aria-label={$t("Calories")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Calories")}</h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => sheet.show()}>{$t("Ajouter un repas")}</button>
      </div>
      <div className="between">
        <button type="button" className="icon-btn" aria-label={$t("Jour précédent")} onClick={() => setDay(addDays(day, -1))}><Icon name="back" /></button>
        <span className="t-strong">{day === d.today ? $t("Aujourd’hui") : dayTitle(day)}</span>
        <button type="button" className="icon-btn" aria-label={$t("Jour suivant")} disabled={day >= d.today} onClick={() => setDay(addDays(day, 1))}><Icon name="next" /></button>
      </div>
      {noEnergy ? <p className="t-caption c-moderate">{$t("Pas de dépense connue ce jour. Les calories actives viennent des séances de la montre ; pour la dépense de repos, renseigne ta taille dans Paramètres › Profil.")}</p> : (
        <>
          <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'baseline' }}>
            <span className="t-h2">{KCAL(e.total)}</span>
            <span className="t-caption c-neutral">{$t("dépensées")}{e.restFrom === 'estimation' ? $t(" (repos estimé)") : ''}</span>
          </div>
          <dl className="kv">
            <dt>{$t("Actives (mouvement, séances)")}</dt><dd>{KCAL(e.active)}</dd>
            <dt>{e.restFrom === 'estimation' ? $t("Repos (estimation Mifflin-St Jeor)") : $t("Repos (passives)")}</dt><dd>{KCAL(e.rest)}</dd>
          </dl>
        </>
      )}
      <dl className="kv">
        <dt>{$t("Mangées (journal)")}</dt><dd>{e.meals ? KCAL(e.intake) : '—'}</dd>
        {e.balance !== null && (<><dt>{$t("Bilan du jour")}</dt><dd style={{ color: e.balance > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>{signed(e.balance, 0)}{NBSP}kcal</dd></>)}
      </dl>
      {meals.length > 0 && (
        <ul className="stack" style={{ gap: 'var(--space-4)' }}>
          {meals.map((m) => (
            <li key={m.id} className="between t-caption"><span>{m.label ?? $t("Repas")}</span>
              <span className="row" style={{ gap: 'var(--space-8)' }}><strong>{KCAL(m.kcal)}</strong><button type="button" className="icon-btn" aria-label={$t("Supprimer ce repas")} onClick={() => { const snap = deleteMeal(m.id); showToast($t("Repas supprimé"), { undo: () => restore(snap) }); }}><Icon name="trash" size={18} /></button></span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="t-strong">{$t("Semaine du {0}", { 0: dayMonth(week.days[0].day) })}</h3>
      <div className="kcal-week" role="img" aria-label={$t("Dépense et apport de la semaine")}>
        {week.days.map((x) => {
          const act = x.active ?? 0, rest = x.rest ?? 0;
          return (
            <button key={x.day} type="button" className={'col' + (x.day === day ? ' on' : '')} onClick={() => setDay(x.day)} aria-label={dayTitle(x.day)}>
              <span className="bars">
                <span className="stack-bar"><span className="rest" style={{ height: `${(rest / maxBar) * 100}%` }} /><span className="act" style={{ height: `${(act / maxBar) * 100}%` }} /></span>
                {x.intake > 0 && <span className="intake" style={{ bottom: `${(x.intake / maxBar) * 100}%` }} />}
              </span>
              <span className="t-legal c-moderate">{weekdayShort(x.day)}</span>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><span className="dot s10" style={{ background: 'var(--chart-1)' }} />{$t("Actives")}</span>
        <span><span className="dot s10" style={{ background: 'var(--chart-other)' }} />{$t("Repos")}</span>
        <span><span style={{ width: 14, height: 3, background: 'var(--text)', borderRadius: 2 }} />{$t("Mangées")}</span>
      </div>
      <p className="t-legal c-moderate">{$t("Semaine : {0} actives, {1} de repos, {2} mangées sur {3} jour(s) saisi(s).", { 0: KCAL(week.active), 1: KCAL(week.rest), 2: week.mealDays ? KCAL(week.intake) : '—', 3: week.mealDays })}</p>
      <p className="t-legal c-moderate">{$t("Le repos vient de Health Connect quand la montre donne le total ; sinon c’est une estimation (formule de Mifflin-St Jeor, avec ta taille, ton poids, ton âge et ton sexe). Le journal de repas est un simple compteur : tu entres les kcal toi-même, il n’y a pas de base d’aliments. Une estimation reste une estimation : ne la prends pas pour une mesure.")}</p>
      {sheet.open && (
        <Sheet title={$t("Ajouter un repas")} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
              {[$t("Petit-déjeuner"), $t("Déjeuner"), $t("Collation"), $t("Dîner")].map((l) => <button key={l} type="button" className="chip" aria-pressed={label === l} onClick={() => setLabel(label === l ? '' : l)}>{l}</button>)}
            </div>
            <label className="field"><span className="lbl">{$t("Calories (kcal)")}</span><input className="input num" inputMode="numeric" autoFocus value={kc} onChange={(ev) => setKc(ev.target.value)} /></label>
            <label className="field"><span className="lbl">{$t("Libellé")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input" value={label} onChange={(ev) => setLabel(ev.target.value)} /></label>
            <span className="t-legal c-moderate">{$t("Pour le jour affiché : {0}.", { 0: dateFr(day) })}</span>
          </div>
        </Sheet>
      )}
    </section>
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

export function CheckinCard() {
  const { data, d } = useCalc();
  const sheet = useLocalSheet();
  const cur = currentCheckin(data, d.today);
  const [f, setF] = useState<Record<string, string>>({});
  const [sleepF, setSleepF] = useState<number | null>(null);
  const [recF, setRecF] = useState<number | null>(null);
  const open = () => {
    const c = cur.draft;
    setF({
      vo2max: c.vo2max?.toString().replace('.', ',') ?? '', lthrBpm: c.lthrBpm?.toString() ?? '', lthPace: clock(c.lthPaceSecKm),
      p5: clock(c.pred5kSec), p10: clock(c.pred10kSec), ph: clock(c.predHalfSec), pm: clock(c.predMarathonSec), note: c.note ?? '',
    });
    setSleepF(c.sleepFelt); setRecF(c.recoveryFelt);
    sheet.show();
  };
  const vo2 = numOrNull(f.vo2max ?? ''), lthr = numOrNull(f.lthrBpm ?? '');
  const lthp = parseClock(f.lthPace ?? ''), p5 = parseClock(f.p5 ?? ''), p10 = parseClock(f.p10 ?? ''), ph = parseClock(f.ph ?? ''), pm = parseClock(f.pm ?? '');
  const bad = [vo2, lthr, lthp, p5, p10, ph, pm].some((x) => Number.isNaN(x))
    || (vo2 !== null && (vo2 < 15 || vo2 > 90)) || (lthr !== null && (lthr < 80 || lthr > 230));
  const next: Omit<Checkin, 'updatedAt'> = {
    id: cur.week, week: cur.week, vo2max: vo2, lthrBpm: lthr, lthPaceSecKm: lthp, hrvMs: cur.saved?.hrvMs ?? null, hrvStatus: cur.saved?.hrvStatus ?? null, sleepFelt: sleepF, recoveryFelt: recF,
    pred5kSec: p5, pred10kSec: p10, predHalfSec: ph, predMarathonSec: pm, note: (f.note ?? '').trim() || null,
  };
  const save = () => {
    if (bad || !hasContent({ ...next, id: undefined } as never)) return;
    const snap = saveCheckin(next);
    sheet.hide();
    showToast($t("Point de la semaine enregistré"), { undo: () => restore(snap) });
  };
  const s = cur.saved;
  const set = (k: string) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const scale = (val: number | null, on: (v: number | null) => void, label: string) => (
    <div className="stack-4" role="group" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="row" style={{ gap: 'var(--space-6)' }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="chip" style={{ flex: 1, justifyContent: 'center' }} aria-pressed={val === n} onClick={() => on(val === n ? null : n)}>{n}</button>)}</div>
      <div className="between t-legal c-moderate"><span>{$t("Très mauvais")}</span><span>{$t("Très bon")}</span></div>
    </div>
  );
  return (
    <section className="card g12" aria-label={$t("Point de la semaine")}>
      <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
        <h2>{$t("Point de la semaine")}</h2>
        <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={open}>{s ? $t("Modifier") : $t("Remplir")}</button>
      </div>
      <p className="t-caption c-neutral">{$t("Une fois par semaine, recopie ce que ta montre affiche : VO₂max, seuil de lactate, prédictions de course, et ton ressenti. Apogée en trace les courbes. Un rappel te le propose le dimanche.")}</p>
      {s ? (
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
      ) : <p className="t-caption c-moderate">{$t("Pas encore rempli cette semaine (semaine du {0}).", { 0: dayMonth(cur.week) })}</p>}
      {sheet.open && (
        <Sheet title={$t("Point de la semaine")} onClose={sheet.hide} footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>{$t("Enregistrer")}</button>}>
          <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
            <span className="t-caption c-neutral">{$t("Semaine du {0}. Laisse vide ce que ta montre ne donne pas.", { 0: dateFr(cur.week) })}</span>
            <h3 className="t-strong">{$t("Capacités")}</h3>
            <div className="grid-2">
              <label className="field"><span className="lbl">{$t("VO₂max")}</span><input className="input num" inputMode="decimal" value={f.vo2max ?? ''} onChange={set('vo2max')} /></label>
              <label className="field"><span className="lbl">{$t("Seuil : FC (bpm)")}</span><input className="input num" inputMode="numeric" value={f.lthrBpm ?? ''} onChange={set('lthrBpm')} /></label>
            </div>
            <label className="field"><span className="lbl">{$t("Seuil : allure (min:s /km)")}</span><input className="input num" inputMode="text" placeholder="4:35" value={f.lthPace ?? ''} onChange={set('lthPace')} /></label>
            <h3 className="t-strong">{$t("Ressenti de la semaine")}</h3>
            {scale(sleepF, setSleepF, $t("Sommeil"))}
            {scale(recF, setRecF, $t("Récupération"))}
            <h3 className="t-strong">{$t("Prédictions de course de la montre")}</h3>
            <div className="grid-2">
              <label className="field"><span className="lbl">{$t("5 km")}</span><input className="input num" placeholder="24:30" value={f.p5 ?? ''} onChange={set('p5')} /></label>
              <label className="field"><span className="lbl">{$t("10 km")}</span><input className="input num" placeholder="51:00" value={f.p10 ?? ''} onChange={set('p10')} /></label>
              <label className="field"><span className="lbl">{$t("Semi")}</span><input className="input num" placeholder="1:52:00" value={f.ph ?? ''} onChange={set('ph')} /></label>
              <label className="field"><span className="lbl">{$t("Marathon")}</span><input className="input num" placeholder="3:55:00" value={f.pm ?? ''} onChange={set('pm')} /></label>
            </div>
            <label className="field"><span className="lbl">{$t("Note")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input" value={f.note ?? ''} onChange={set('note')} /></label>
            {bad && <span className="t-caption" style={{ color: 'var(--critical-text)' }}>{$t("Une valeur est illisible ou hors limites.")}</span>}
          </div>
        </Sheet>
      )}
    </section>
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

function Line({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.2 || Math.abs(hi) * 0.02 || 1;
  const W = 300, H = 48;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--chart-fitness)' }} /></svg>;
}

export function CapacitiesTrendsCard() {
  const { data } = useCalc();
  const rows = TRENDS.map((t) => ({ t, s: metricSeries(data, t.k) })).filter((r) => r.s.length > 0);
  return (
    <section className="card g12" aria-label={$t("Courbes de capacité")}>
      <h2>{$t("Courbes de capacité")}</h2>
      {rows.length === 0 ? <p className="t-caption c-moderate">{$t("Les courbes apparaîtront dès que tu auras rempli ton point de la semaine, une ou deux fois.")}</p> : (
        <ul className="stack" style={{ gap: 'var(--space-16)' }}>
          {rows.map(({ t, s }) => {
            const last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
            const diff = prev ? last.v - prev.v : null;
            const good = diff === null || diff === 0 || t.better === null ? null : (diff > 0) === (t.better === 'up');
            return (
              <li key={t.k} className="stack-4">
                <div className="between"><span className="t-caption-strong">{t.label}</span>
                  <span className="row" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}><strong>{t.fmt(last.v)}</strong>{diff !== null && diff !== 0 && <span className="t-legal" style={{ color: good === null ? 'var(--text-moderate)' : good ? 'var(--success-text)' : 'var(--warning-text)' }}>{t.k.endsWith('Sec') || t.k === 'lthPaceSecKm' ? (diff > 0 ? '+' : '−') + clock(Math.abs(diff)) : signed(diff, t.k === 'vo2max' ? 1 : 0)}</span>}</span>
                </div>
                <Line values={s.map((x) => x.v)} />
                <div className="between t-legal c-moderate"><span>{dayMonth(s[0].week)}</span><span>{$t("{0} point(s)", { 0: s.length })}</span><span>{dayMonth(last.week)}</span></div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="t-legal c-moderate">{$t("Valeurs recopiées de ta montre (ou lues dans Health Connect quand elle les envoie) : Apogée ne les recalcule pas, elle en trace l’évolution.")}</p>
    </section>
  );
}
