// Paramètres (même organisation que PEAnalyze : sections titrées, cartes, lignes à chevron),
// profil athlète, interruptions, écran de connexion et écran de chargement.
import { $t, lang, setLang } from '../i18n';
import { useRef, useState } from 'react';
import { DatePicker, Empty, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { IntField, numOf } from '../ui/wheels';
import { navigate, useRoute } from '../ui/router';
import { getData, getPrefs, setPrefs, useCalc, usePrefs } from '../data/store';
import { deleteCloud, signIn, signOut, syncNow, useSync } from '../data/sync';
import { backupBlob, dossierMessage, importDossier, importGarminGraph, readJsonFile, restoreBackup } from '../data/backup';
import { deleteEverything, purgeBefore, restore, saveAthlete } from '../data/actions';
import { purgePlan } from '../domain/purge';
import { native } from '../native/bridge';
import { HealthCard } from './Health';
import { openHealthSettings, requestHealthPermissions, runHealthSync, useHealth } from '../native/healthSync';
import { addDays, ageAt } from '../domain/dates';
import { newId } from '../domain/ids';
import { liveRecords } from '../domain/load';
import type { InjuryEntry, Weekday } from '../domain/types';
import { WEEKDAYS } from '../domain/types';
import { dateFr, dateTimeFr, dayTitle, num, parseNum, toInput } from '../ui/format';
import { setThemePref, themePref, type ThemePref } from '../theme';

function Row({ icon, title, sub, onClick, right, danger }: { icon: string; title: string; sub: string; onClick: () => void; right?: React.ReactNode; danger?: boolean }) {
  return (
    <li>
      <button type="button" className="settings-row" onClick={onClick}>
        <Icon name={icon} style={{ color: danger ? 'var(--critical-text)' : 'var(--primary-fg)' }} />
        <span className="stack"><span className="t-strong" style={danger ? { color: 'var(--critical-text)' } : undefined}>{title}</span><span className="t-caption c-moderate">{sub}</span></span>
        {right ?? <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />}
      </button>
    </li>
  );
}

function Section({ id, title, children, anchor }: { id: string; title: string; children: React.ReactNode; anchor?: string }) {
  return (
    <section aria-labelledby={id} className="stack-8" data-anchor={anchor}>
      <h2 id={id} className="overline c-neutral" style={{ padding: '0 var(--space-4)' }}>{title}</h2>
      {children}
    </section>
  );
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function SettingsScreen() {
  const { data, d } = useCalc();
  const sync = useSync();
  const health = useHealth();
  const prefs = usePrefs();
  const [busy, setBusy] = useState('');
  const [reset, setReset] = useState(false);
  const [cut, setCut] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [theme, setTheme] = useState<ThemePref>(themePref());
  const jsonInput = useRef<HTMLInputElement>(null);
  const a = data.athlete.main && !data.athlete.main.deleted ? data.athlete.main : null;
  const interruptions = liveRecords(data.interruptions);
  const total = liveRecords(data.actual).length;
  const running = interruptions.find((i) => i.startDate <= d.today && d.today <= i.endDate);
  const app = native.isApp();
  const report = prefs.healthLastReport ? (JSON.parse(prefs.healthLastReport) as { found: number; inserted: number; updated: number; nights: number }) : null;

  const exportXlsx = async () => {
    setBusy('xlsx');
    try {
      const { exportExcel } = await import('../data/excel');
      await native.saveFile($t("Apogée ") + stamp() + $t(".xlsx"), await exportExcel(getData(), d));
      showToast($t("Classeur Excel exporté"));
    } catch (e) { showToast($t("Export impossible : ") + (e as Error).message, { error: true }); } finally { setBusy(''); }
  };
  const exportJson = async () => {
    try { await native.saveFile('apogee-sauvegarde-' + stamp() + $t(".json"), backupBlob(getData())); showToast($t("Sauvegarde exportée")); }
    catch (e) { showToast($t("Export impossible : ") + (e as Error).message, { error: true }); }
  };
  const onJson = async (f: File) => {
    try {
      const prev = getData();
      const file = readJsonFile(await f.text());
      if (file.kind === 'dossier') showToast(dossierMessage(importDossier(file.dossier)), { undo: () => restoreBackup(prev) });
      else if (file.kind === 'garmin') showToast(importGarminGraph(file.file), { undo: () => restoreBackup(prev) });
      else { restoreBackup(file.data); showToast($t("Sauvegarde restaurée"), { undo: () => restoreBackup(prev) }); }
    } catch (e) { showToast($t("Lecture impossible : ") + (e as Error).message, { error: true }); }
  };
  const readNow = async () => {
    setBusy('health');
    try {
      const r = await runHealthSync();
      showToast(r ? $t("{0} nouvelle(s) séance(s), {1} mise(s) à jour", { 0: r.inserted, 1: r.updated }) : $t("Lecture impossible : vérifie les autorisations"), { error: !r });
    } finally { setBusy(''); }
  };
  const wipe = async () => {
    const n = deleteEverything();
    setReset(false);
    showToast($t("{0} enregistrement(s) effacé(s){1}", { 0: n, 1: sync.user ? $t(", aussi dans le compte") : '' }));
  };

  return (
    <div className="screen" data-screen="parametres">
      <SubHeader title={$t("Paramètres")} fallback="/accueil" />
      <main className="content form-narrow" style={{ gap: 'var(--space-24)' }}>
        <Section id="p-sync" title={$t("Compte & synchronisation")}>
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            {!sync.configured ? (
              <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-12)' }}>
                <Icon name="cloud" style={{ color: 'var(--text-moderate)' }} />
                <span className="stack">
                  <span className="t-strong">{$t("Synchronisation pas encore activée")}</span>
                  <span className="t-caption c-moderate">{$t("Les données sont enregistrées sur cet appareil. La connexion Google sera disponible dès que le projet Firebase sera relié à l’app (voir le README).")}</span>
                </span>
              </div>
            ) : sync.user ? (
              <>
                <div className="row" style={{ gap: 'var(--space-12)' }}>
                  {sync.user.photo
                    ? <img src={sync.user.photo} alt="" width={40} height={40} style={{ borderRadius: 'var(--radius-full)' }} referrerPolicy="no-referrer" />
                    : <span className="op-icon" style={{ background: 'var(--bg-brand-minimal)', color: 'var(--primary-fg)' }}>{(sync.user.name || sync.user.email).charAt(0).toUpperCase()}</span>}
                  <span className="stack grow">
                    <span className="t-strong ellipsis">{sync.user.name || $t("Compte Google")}</span>
                    <span className="t-caption c-moderate ellipsis">{sync.user.email}</span>
                  </span>
                </div>
                <div className="row t-caption" style={{ color: sync.state === 'error' ? 'var(--critical-text)' : 'var(--success-text)' }}>
                  <Icon name={sync.state === 'error' ? 'alert' : 'success'} size={18} />
                  {sync.state === 'error' ? sync.error : sync.state === 'syncing' ? $t("Synchronisation…") : (sync.lastSync ? $t("Synchronisé le ") + dateTimeFr(sync.lastSync) : $t("Synchronisé")) + $t(" · téléphone, PC et iPhone partagent les mêmes données")}
                </div>
                <div className="row wrap">
                  <button type="button" className="btn btn-secondary" onClick={() => syncNow()}><Icon name="refresh" size={18} />{$t("Synchroniser maintenant")}</button>
                  <button type="button" className="btn btn-tertiary" style={{ color: 'var(--text-neutral)' }} onClick={() => signOut()}><Icon name="logout" size={18} />{$t("Se déconnecter")}</button>
                </div>
              </>
            ) : (
              <>
                <span className="t-caption c-moderate">{$t("Connecte-toi pour retrouver les mêmes données sur ton téléphone, ton PC et ton iPhone (sauvegarde automatique, gratuite).")}</span>
                <button type="button" className="btn btn-primary" onClick={() => signIn().catch((e) => showToast($t("Connexion impossible : ") + e.message, { error: true }))}>{$t("Continuer avec Google")}</button>
              </>
            )}
          </div>
        </Section>

        <Section id="p-health" title={$t("Montre (Health Connect)")} anchor="montre">
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            <HealthCard />
          </div>
        </Section>

        <Section id="p-theme" title={$t("Thème")}>
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="seg" role="group" aria-label={$t("Thème de l’application")}>
              {([['light', $t("Clair")], ['dark', $t("Sombre")], ['system', $t("Système")]] as [ThemePref, string][]).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={theme === v} onClick={() => { setThemePref(v); setTheme(v); }}>{l}</button>
              ))}
            </div>
            <span className="t-caption c-moderate">{$t("« Système » suit le réglage clair ou sombre du téléphone ou de l’ordinateur.")}</span>
          </div>
        </Section>

        <Section id="p-lang" title="Langue · Language">
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="seg" role="group" aria-label="Langue · Language">
              {([['fr', 'Français'], ['en', 'English']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={lang === v} onClick={() => { if (lang !== v) setLang(v); }}>{l}</button>
              ))}
            </div>
            <span className="t-caption c-moderate">{$t("L’app redémarre dans la langue choisie. Le dossier coach et l’export Excel restent en français.")}</span>
          </div>
        </Section>

        <Section id="p-athlete" title={$t("Athlète")}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="user" title={$t("Profil")} sub={a ? [a.displayName, a.birthDate ? $t("{0} ans", { 0: ageAt(a.birthDate) }) : null, a.availability.length ? $t("{0} jour(s) dispo.", { 0: a.availability.length }) : null].filter(Boolean).join(' · ') || $t("À compléter") : $t("Date de naissance, sexe, disponibilités, blessures")} onClick={() => navigate('/parametres/profil')} />
          </ul>
        </Section>

        <Section id="p-data" title={$t("Données")}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="sheet" title={$t("Exporter en Excel (.xlsx)")} sub={busy === 'xlsx' ? $t("Préparation du fichier…") : $t("Tableau de bord, séances, plan, charge, zones, périodisation — formules et graphiques")} onClick={exportXlsx} />
            <Row icon="download" title={$t("Exporter une sauvegarde (.json)")} sub={$t("Toutes les données, relisibles par l’app")} onClick={exportJson} />
            <Row icon="upload" title={$t("Restaurer ou compléter (.json)")} sub={$t("Sauvegarde Apogée (remplace les données) ou dossier coach de l’ancienne app (ajoute les séances qui manquent)")} onClick={() => jsonInput.current?.click()} />
          </ul>
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onJson(f); e.target.value = ''; }} />
        </Section>

        <Section id="p-help" title={$t("Aide")}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="info" title={$t("Aide et mode d’emploi")} sub={$t("Toutes les fonctionnalités, tous les calculs, et où télécharger l’APK Android")} onClick={() => navigate('/parametres/aide')} />
          </ul>
        </Section>

        <Section id="p-calc" title={$t("Calculs")}>
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="between" style={{ gap: 'var(--space-12)' }}>
              <span className="stack"><span className="t-strong" id="lbl-prov">{$t("Charge provisoire")}</span><span className="t-caption c-moderate">{$t("Une séance sans FC ni ressenti compte d’après tes habitudes (charge par minute × durée), marquée « estimée », au lieu de zéro.")}</span></span>
              <Switch checked={prefs.provisionalLoad} labelledBy="lbl-prov" onChange={(v) => setPrefs({ provisionalLoad: v })} />
            </div>
          </div>
        </Section>

        {app && (
          <Section id="p-reminders" title={$t("Rappels et notifications")}>
            <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
              <div className="between" style={{ gap: 'var(--space-12)' }}>
                <span className="stack"><span className="t-strong" id="lbl-sessrem">{$t("Rappel de séance")}</span><span className="t-caption c-moderate">{$t("Le matin d’une séance prévue, et rappels de renouvellement du plan. Suspendus pendant une interruption.")}</span></span>
                <Switch checked={prefs.sessionReminder !== false} labelledBy="lbl-sessrem" onChange={(v) => setPrefs({ sessionReminder: v })} />
              </div>
              {prefs.sessionReminder !== false && (
                <div className="field">
                  <span className="lbl">{$t("Heure du rappel de séance")}</span>
                  <IntField label={$t("Heure du rappel de séance")} unit="h" value={prefs.reminderHour} onChange={(x) => setPrefs({ reminderHour: x ?? 7 })} min={0} max={23} />
                </div>
              )}
              <div className="between" style={{ gap: 'var(--space-12)' }}>
                <span className="stack"><span className="t-strong" id="lbl-sleeprem">{$t("Rappel du sommeil")}</span><span className="t-caption c-moderate">{$t("Chaque matin, une notification t’invite à valider tes heures de coucher et de lever, ou à les corriger.")}</span></span>
                <Switch checked={prefs.sleepReminder !== false} labelledBy="lbl-sleeprem" onChange={(v) => setPrefs({ sleepReminder: v })} />
              </div>
              {prefs.sleepReminder !== false && (
                <div className="field">
                  <span className="lbl">{$t("Heure du rappel du sommeil")}</span>
                  <IntField label={$t("Heure du rappel du sommeil")} unit="h" value={prefs.sleepReminderHour ?? 8} onChange={(x) => setPrefs({ sleepReminderHour: x ?? 8 })} min={5} max={12} />
                </div>
              )}
              <div className="between" style={{ gap: 'var(--space-12)' }}>
                <span className="stack"><span className="t-strong" id="lbl-weekrem">{$t("Rappel du point de la semaine")}</span><span className="t-caption c-moderate">{$t("Chaque dimanche, une notification t’invite à remplir le point de la semaine : relevé de ta montre (VO₂max, ressenti, prédictions) et corrections de pas, étages, calories et sommeil d’après Garmin Connect. L’application s’ouvre alors directement sur le formulaire.")}</span></span>
                <Switch checked={prefs.weeklyReminder !== false} labelledBy="lbl-weekrem" onChange={(v) => setPrefs({ weeklyReminder: v })} />
              </div>
              {prefs.weeklyReminder !== false && (
                <div className="field">
                  <span className="lbl">{$t("Heure du rappel du point de la semaine")}</span>
                  <IntField label={$t("Heure du rappel du point de la semaine")} unit="h" value={prefs.weeklyReminderHour ?? 18} onChange={(x) => setPrefs({ weeklyReminderHour: x ?? 18 })} min={0} max={23} />
                </div>
              )}
            </div>
          </Section>
        )}

        <Section id="p-about" title={$t("À propos")}>
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <span data-component="AppLogo"><Logo size={18} /></span>
            <span className="t-caption c-neutral">{$t("Application personnelle de suivi d’entraînement multisport. Les données restent les tiennes : sur cet appareil et, si tu te connectes, dans ton espace Firebase privé. Version 2.0.")}</span>
            {cut === null
              ? <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setCut('2026-08-02')}>{$t("Effacer l’historique avant une date")}</button>
              : (
                <div className="stack-8">
                  <label className="field"><span className="lbl">{$t("Effacer tout ce qui est daté avant le")}</span><input className="input" type="date" value={cut} max={d.today} onChange={(e) => setCut(e.target.value)} /></label>
                  {/^\d{4}-\d{2}-\d{2}$/.test(cut) && <span className="t-caption-strong c-critical">{$t("{0} enregistrement(s) seront effacés : séances, plans, sommeil, poids, calories, pas, relevés… Le profil, la course, les zones et les modèles restent.", { 0: purgePlan(getData(), cut).length })}{sync.user ? $t(" Effacé aussi sur tes autres appareils.") : ''}</span>}
                  <div className="row wrap">
                    <button type="button" className="btn btn-danger" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(cut) || purgePlan(getData(), cut).length === 0} onClick={() => { const r = purgeBefore(cut); setCut(null); showToast($t("{0} enregistrement(s) effacé(s)", { 0: r.count }), { undo: () => restore(r.snap) }); }}>{$t("Effacer")}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setCut(null)}>{$t("Annuler")}</button>
                  </div>
                </div>
              )}
            {!reset
              ? <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => { setReset(true); setTyped(''); }}>{$t("Effacer toutes mes données")}</button>
              : (
                <div className="stack-8">
                  {/* deux étapes, jamais la même question deux fois (décision du 06/09) */}
                  <label className="field">
                    <span className="lbl c-critical">{$t("Pour continuer, recopie le nombre de séances réalisées enregistrées :")} {total}</span>
                    <input className="input num" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
                  </label>
                  {typed.trim() === String(total) && (
                    <span className="t-caption-strong c-critical">{$t("Séances, plans, relevés, réglages d’athlète : tout sera effacé")}{sync.user ? $t(", sur tous tes appareils") : ''}{$t(". Exporte d’abord une sauvegarde si tu veux pouvoir revenir en arrière.")}</span>
                  )}
                  <div className="row wrap">
                    <button type="button" className="btn btn-danger" disabled={typed.trim() !== String(total)} onClick={wipe}>{$t("Tout effacer définitivement")}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setReset(false)}>{$t("Annuler")}</button>
                  </div>
                  {sync.user && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--text-neutral)' }} onClick={() => deleteCloud().then(() => showToast($t("Copie en ligne supprimée")))}>{$t("Supprimer seulement la copie en ligne")}</button>}
                </div>
              )}
          </div>
        </Section>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ Profil
const WD_LABEL: Record<Weekday, string> = { mon: $t("Lun"), tue: $t("Mar"), wed: $t("Mer"), thu: $t("Jeu"), fri: $t("Ven"), sat: $t("Sam"), sun: $t("Dim") };

export function ProfileScreen() {
  const { data, d } = useCalc();
  const a = data.athlete.main && !data.athlete.main.deleted ? data.athlete.main : null;
  const [name, setName] = useState(a?.displayName ?? '');
  const [birth, setBirth] = useState(a?.birthDate ?? '');
  const [cal, setCal] = useState(false);
  const [sex, setSex] = useState<'M' | 'F' | null>(a?.sex ?? null);
  const [height, setHeight] = useState(a?.heightCm ? String(a.heightCm) : '');
  const [restKcal, setRestKcal] = useState(a?.restKcal ? String(a.restKcal) : '');
  const [avail, setAvail] = useState<Weekday[]>(a?.availability ?? []);
  const [equip, setEquip] = useState((a?.equipment ?? []).join(', '));
  const [injuries, setInjuries] = useState<InjuryEntry[]>(a?.injuries ?? []);
  const [newInjury, setNewInjury] = useState('');
  const save = () => {
    saveAthlete({ displayName: name.trim() || null, birthDate: birth || null, sex, heightCm: (() => { const h = Number(height.replace(',', '.')); return Number.isFinite(h) && h >= 100 && h <= 250 ? Math.round(h) : null; })(), restKcal: (() => { const k = Number(restKcal); return Number.isFinite(k) && k >= 800 && k <= 4500 ? Math.round(k) : null; })(), availability: WEEKDAYS.filter((w) => avail.includes(w)), equipment: equip.split(',').map((x) => x.trim()).filter(Boolean), injuries });
    showToast($t("Profil enregistré"));
    navigate('/parametres', { replace: true });
  };
  return (
    <div className="screen screen-white" data-screen="profil">
      <SubHeader title={$t("Profil")} fallback="/parametres" bordered />
      <div className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-16) var(--screen-margin) var(--space-24)' }}>
          <label className="field"><span className="lbl">{$t("Prénom")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="field"><span className="lbl">{$t("Date de naissance")}</span>
            <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setCal(!cal)}><span>{birth ? $t("{0} · {1} ans", { 0: dateFr(birth), 1: ageAt(birth) }) : $t("Choisir")}</span><Icon name="calendar" size={20} /></button>
            {cal && <DatePicker value={birth || '1990-01-01'} onChange={(v) => { setBirth(v); setCal(false); }}  onClose={() => setCal(false)} />}
            <span className="hint">{$t("Sert à estimer la FC max (Tanaka) tant qu’aucune valeur testée n’est déclarée.")}</span>
          </div>
          <div className="field"><span className="lbl">{$t("Sexe")}</span>
            <div className="seg" role="group" aria-label={$t("Sexe")}><button type="button" aria-pressed={sex === 'M'} onClick={() => setSex('M')}>{$t("Homme")}</button><button type="button" aria-pressed={sex === 'F'} onClick={() => setSex('F')}>{$t("Femme")}</button></div>
            <span className="hint">{$t("Le sexe sert à estimer les calories de repos.")}</span>
          </div>
          <div className="field"><span className="lbl">{$t("Taille (cm)")}</span><IntField label={$t("Taille (cm)")} unit="cm" value={numOf(height)} onChange={(x) => setHeight(x === null ? '' : String(x))} min={120} max={230} clearable initial={175} /><span className="hint">{$t("Sert à estimer ta dépense de repos (calories), avec ton poids, ton âge et ton sexe.")}</span></div>
          <div className="field" data-anchor="repos"><span className="lbl">{$t("Calories de repos de ta montre (par jour)")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><IntField label={$t("Calories de repos de ta montre (par jour)")} unit="kcal" value={numOf(restKcal)} onChange={(x) => setRestKcal(x === null ? '' : String(x))} min={1000} max={4000} step={10} clearable initial={2000} />
            <span className="hint">{$t("Le total de calories vient de Health Connect ; le partage entre repos et actives, lui, diffère de Garmin Connect. Recopie ici les calories de repos d’une journée complète affichées par Garmin Connect (par exemple 2 150) : Apogée en déduit les actives comme la montre.")}</span></div>
          <div className="field"><span className="lbl">{$t("Jours disponibles pour s’entraîner")}</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {WEEKDAYS.map((w) => <button key={w} type="button" className="chip" aria-pressed={avail.includes(w)} onClick={() => setAvail(avail.includes(w) ? avail.filter((x) => x !== w) : [...avail, w])}>{WD_LABEL[w]}</button>)}
            </div>
          </div>
          <label className="field"><span className="lbl">{$t("Matériel")}</span><input className="input" value={equip} placeholder={$t("Home trainer, piscine 25 m, capteur de puissance…")} onChange={(e) => setEquip(e.target.value)} /><span className="hint">{$t("Séparé par des virgules. Transmis au coach.")}</span></label>
          <div className="field" data-anchor="blessures"><span className="lbl">{$t("Blessures et points de vigilance")}</span>
            <ul className="tile-list divided">
              {injuries.map((i) => (
                <li key={i.id} className="between" style={{ padding: 'var(--space-8) 0', gap: 'var(--space-8)' }}>
                  <span className="stack"><span className="t-strong" style={i.resolved ? { textDecoration: 'line-through', color: 'var(--text-moderate)' } : undefined}>{i.label}</span><span className="t-caption c-moderate">{i.date ? dateFr(i.date) : $t("date inconnue")}{i.resolved ? $t(" · résolue") : ''}</span></span>
                  <span className="row" style={{ gap: 0 }}>
                    <button type="button" className="icon-btn" aria-label={i.resolved ? $t("Marquer active") : $t("Marquer résolue")} onClick={() => setInjuries(injuries.map((x) => (x.id === i.id ? { ...x, resolved: !x.resolved } : x)))}><Icon name={i.resolved ? 'refresh' : 'check'} size={20} /></button>
                    <button type="button" className="icon-btn" aria-label={$t("Retirer")} onClick={() => setInjuries(injuries.filter((x) => x.id !== i.id))}><Icon name="trash" size={20} /></button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="row" style={{ gap: 'var(--space-8)' }}>
              <input className="input grow" value={newInjury} placeholder={$t("Tendinite d’Achille gauche…")} onChange={(e) => setNewInjury(e.target.value)} />
              <button type="button" className="btn btn-secondary" disabled={!newInjury.trim()} onClick={() => { setInjuries([...injuries, { id: newId(), label: newInjury.trim(), date: d.today, notes: null, resolved: false }]); setNewInjury(''); }}>{$t("Ajouter")}</button>
            </div>
          </div>
        </div>
        <div className="sticky-foot"><div className="form-narrow"><button type="button" className="btn btn-primary block" onClick={save}>{$t("Enregistrer")}</button></div></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Chargement
// Pas d'écran de connexion au premier lancement (décision du 12/10) : la connexion Google se fait depuis
// Paramètres › Compte, ou depuis la carte de bienvenue de l'Accueil.
export function LoadingScreen() {
  return (
    <div className="screen" aria-busy="true" aria-label={$t("Chargement")} data-component="Skeleton">
      <div className="stack-16" style={{ padding: 'calc(var(--safe-top) + var(--space-16)) var(--screen-margin)' }}>
        <div className="skel" style={{ height: 44, borderRadius: 'var(--radius-full)' }} />
        <div className="skel" style={{ height: 150, borderRadius: 'var(--radius-16)' }} />
        <div className="skel" style={{ height: 96, borderRadius: 'var(--radius-16)' }} />
        <div className="row" style={{ gap: 'var(--space-16)' }}>
          {[1, 2, 3].map((k) => <div key={k} className="skel grow" style={{ height: 64, borderRadius: 'var(--radius-12)' }} />)}
        </div>
        <div className="skel" style={{ height: 120, borderRadius: 'var(--radius-16)' }} />
      </div>
    </div>
  );
}

export { getPrefs };
