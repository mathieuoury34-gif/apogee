// Paramètres (même organisation que PEAnalyze : sections titrées, cartes, lignes à chevron),
// profil athlète, interruptions, écran de connexion et écran de chargement.
import { $t, lang, setLang } from '../i18n';
import { useRef, useState } from 'react';
import { DatePicker, Empty, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { navigate, useRoute } from '../ui/router';
import { getData, getPrefs, setPrefs, useCalc, usePrefs } from '../data/store';
import { deleteCloud, signIn, signOut, syncNow, useSync } from '../data/sync';
import { backupBlob, dossierMessage, importDossier, importLegacy, readJsonFile, restoreBackup } from '../data/backup';
import { deleteEverything, deleteInterruption, restore, saveAthlete, saveInterruption } from '../data/actions';
import { native } from '../native/bridge';
import { HealthCard } from './Health';
import { openHealthSettings, requestHealthPermissions, runHealthSync, useHealth } from '../native/healthSync';
import { addDays, ageAt } from '../domain/dates';
import { newId } from '../domain/ids';
import { liveRecords } from '../domain/load';
import type { InjuryEntry, Interruption, InterruptionReason, Weekday } from '../domain/types';
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

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="stack-8">
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
  const [typed, setTyped] = useState('');
  const [theme, setTheme] = useState<ThemePref>(themePref());
  const jsonInput = useRef<HTMLInputElement>(null);
  const dbInput = useRef<HTMLInputElement>(null);
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
      await native.saveFile($t("Iron App ") + stamp() + $t(".xlsx"), await exportExcel(getData(), d));
      showToast($t("Classeur Excel exporté"));
    } catch (e) { showToast($t("Export impossible : ") + (e as Error).message, { error: true }); } finally { setBusy(''); }
  };
  const exportJson = async () => {
    try { await native.saveFile('ironapp-sauvegarde-' + stamp() + $t(".json"), backupBlob(getData())); showToast($t("Sauvegarde exportée")); }
    catch (e) { showToast($t("Export impossible : ") + (e as Error).message, { error: true }); }
  };
  const onJson = async (f: File) => {
    try {
      const prev = getData();
      const file = readJsonFile(await f.text());
      if (file.kind === 'dossier') showToast(dossierMessage(importDossier(file.dossier)), { undo: () => restoreBackup(prev) });
      else { restoreBackup(file.data); showToast($t("Sauvegarde restaurée"), { undo: () => restoreBackup(prev) }); }
    } catch (e) { showToast($t("Lecture impossible : ") + (e as Error).message, { error: true }); }
  };
  const onDb = async (f: File) => {
    setBusy('db');
    try {
      const prev = getData();
      const r = importLegacy(new Uint8Array(await f.arrayBuffer()));
      showToast($t("Reprise : {0} séances réalisées (dernière le {1}), {2} prévues{3}", { 0: r.counts.actual ?? 0, 1: r.lastActual ? dateFr(r.lastActual) : '—', 2: r.counts.planned ?? 0, 3: r.skipped.length ? $t(", {0} élément(s) ignoré(s)", { 0: r.skipped.length }) : '' }), { undo: () => restoreBackup(prev) });
    } catch (e) { showToast($t("Reprise impossible : ") + (e as Error).message, { error: true }); } finally { setBusy(''); }
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
                  <span className="t-caption c-moderate">{$t("Les données sont enregistrées sur cet appareil. La connexion Google sera disponible dès que le projet Firebase « ironapp » sera relié à l’app (voir le README).")}</span>
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

        <Section id="p-health" title={$t("Montre (Health Connect)")}>
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            <HealthCard />
          </div>
        </Section>

        <Section id="p-athlete" title={$t("Athlète")}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="user" title={$t("Profil")} sub={a ? [a.displayName, a.birthDate ? $t("{0} ans", { 0: ageAt(a.birthDate) }) : null, a.availability.length ? $t("{0} jour(s) dispo.", { 0: a.availability.length }) : null].filter(Boolean).join(' · ') || $t("À compléter") : $t("Date de naissance, sexe, disponibilités, blessures")} onClick={() => navigate('/parametres/profil')} />
            <Row icon="gauge" title={$t("Indicateurs (VMA, FTP, CSS, FC max)")} sub={$t("Historique des tests et estimations")} onClick={() => navigate('/progression/zones')} />
            <Row icon="flag" title={$t("Course objectif")} sub={data.race.main && !data.race.main.deleted ? `${data.race.main.name} · ${dateFr(data.race.main.raceDate)}` : $t("À renseigner")} onClick={() => navigate('/progression/objectif')} />
            <Row icon="layers" title={$t("Périodisation")} sub={$t("{0} bloc(s)", { 0: liveRecords(data.phases).length })} onClick={() => navigate('/calendrier/periodisation')} />
            <Row icon="pause" title={$t("Interruptions")} sub={running ? $t("En cours : {0}", { 0: running.label }) : $t("{0} enregistrée(s) · blessure, voyage, charge externe", { 0: interruptions.length })} onClick={() => navigate('/parametres/interruptions')} />
          </ul>
        </Section>

        <Section id="p-calc" title={$t("Calculs")}>
          <div className="card g12" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="between" style={{ gap: 'var(--space-12)' }}>
              <span className="stack"><span className="t-strong" id="lbl-prov">{$t("Charge provisoire")}</span><span className="t-caption c-moderate">{$t("Une séance sans FC ni ressenti compte d’après tes habitudes (charge par minute × durée), marquée « estimée », au lieu de zéro.")}</span></span>
              <Switch checked={prefs.provisionalLoad} labelledBy="lbl-prov" onChange={(v) => setPrefs({ provisionalLoad: v })} />
            </div>
            {app && (
              <label className="field">
                <span className="lbl">{$t("Heure des rappels de séance")}</span>
                <select className="input" value={prefs.reminderHour} onChange={(e) => setPrefs({ reminderHour: Number(e.target.value) })}>
                  {[6, 7, 8, 9, 12, 18, 20].map((h) => <option key={h} value={h}>{h} h 00</option>)}
                </select>
                <span className="hint">{$t("Rappel le matin d’une séance prévue, et la veille d’un ressenti oublié. Suspendus pendant une interruption.")}</span>
              </label>
            )}
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

        <Section id="p-data" title={$t("Données")}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="sheet" title={$t("Exporter en Excel (.xlsx)")} sub={busy === 'xlsx' ? $t("Préparation du fichier…") : $t("Tableau de bord, séances, plan, charge, zones, périodisation — formules et graphiques")} onClick={exportXlsx} />
            <Row icon="download" title={$t("Exporter une sauvegarde (.json)")} sub={$t("Toutes les données, relisibles par l’app")} onClick={exportJson} />
            <Row icon="upload" title={$t("Restaurer ou compléter (.json)")} sub={$t("Sauvegarde Iron App (remplace les données) ou dossier coach de l’ancienne app (ajoute les séances qui manquent)")} onClick={() => jsonInput.current?.click()} />
            <Row icon="database" title={$t("Reprendre l’ancienne base (.db)")} sub={busy === 'db' ? $t("Lecture en cours…") : $t("Fichier exporté par l’ancienne app Android — fusion sans doublon")} onClick={() => dbInput.current?.click()} />
          </ul>
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onJson(f); e.target.value = ''; }} />
          <input ref={dbInput} type="file" accept=".db,.sqlite,application/octet-stream,application/x-sqlite3,application/vnd.sqlite3" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onDb(f); e.target.value = ''; }} />
        </Section>

        <Section id="p-about" title={$t("À propos")}>
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <span data-component="AppLogo"><Logo size={18} /></span>
            <span className="t-caption c-neutral">{$t("Application personnelle de suivi d’entraînement triathlon. Les données restent les tiennes : sur cet appareil et, si tu te connectes, dans ton espace Firebase privé. Version 2.0.")}</span>
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
  const [avail, setAvail] = useState<Weekday[]>(a?.availability ?? []);
  const [equip, setEquip] = useState((a?.equipment ?? []).join(', '));
  const [injuries, setInjuries] = useState<InjuryEntry[]>(a?.injuries ?? []);
  const [newInjury, setNewInjury] = useState('');
  const save = () => {
    saveAthlete({ displayName: name.trim() || null, birthDate: birth || null, sex, availability: WEEKDAYS.filter((w) => avail.includes(w)), equipment: equip.split(',').map((x) => x.trim()).filter(Boolean), injuries });
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
            {cal && <DatePicker value={birth || '1990-01-01'} onChange={(v) => { setBirth(v); setCal(false); }} />}
            <span className="hint">{$t("Sert à estimer la FC max (Tanaka) tant qu’aucune valeur testée n’est déclarée.")}</span>
          </div>
          <div className="field"><span className="lbl">{$t("Sexe")}</span>
            <div className="seg" role="group" aria-label={$t("Sexe")}><button type="button" aria-pressed={sex === 'M'} onClick={() => setSex('M')}>{$t("Homme")}</button><button type="button" aria-pressed={sex === 'F'} onClick={() => setSex('F')}>{$t("Femme")}</button></div>
            <span className="hint">{$t("Le TRIMP de Banister utilise un coefficient différent selon le sexe.")}</span>
          </div>
          <div className="field"><span className="lbl">{$t("Jours disponibles pour s’entraîner")}</span>
            <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {WEEKDAYS.map((w) => <button key={w} type="button" className="chip" aria-pressed={avail.includes(w)} onClick={() => setAvail(avail.includes(w) ? avail.filter((x) => x !== w) : [...avail, w])}>{WD_LABEL[w]}</button>)}
            </div>
          </div>
          <label className="field"><span className="lbl">{$t("Matériel")}</span><input className="input" value={equip} placeholder={$t("Home trainer, piscine 25 m, capteur de puissance…")} onChange={(e) => setEquip(e.target.value)} /><span className="hint">{$t("Séparé par des virgules. Transmis au coach.")}</span></label>
          <div className="field"><span className="lbl">{$t("Blessures et points de vigilance")}</span>
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

// ------------------------------------------------------------------ Interruptions
const REASON_LABEL: Record<InterruptionReason, string> = { injury: $t("Blessure"), travel: $t("Voyage"), external_load: $t("Charge externe"), other: $t("Autre") };

export function InterruptionsScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const ask = route.query.get('nouvelle');
  const [edit, setEdit] = useState<Interruption | 'new' | null>(ask !== null ? 'new' : null);
  const list = liveRecords(data.interruptions).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const remove = (i: Interruption) => { const snap = deleteInterruption(i.id); showToast($t("Interruption supprimée"), { undo: () => restore(snap) }); };
  return (
    <div className="screen" data-screen="interruptions">
      <SubHeader title={$t("Interruptions")} fallback="/parametres" right={<button type="button" className="icon-btn" aria-label={$t("Nouvelle interruption")} onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      <main className="content stack-16 form-narrow-d">
        <p className="t-caption c-neutral">{$t("Une interruption (blessure, voyage, charge externe comme un déménagement) suspend les rappels et les alertes de séances manquées. Une charge forfaitaire quotidienne peut remplacer la charge mesurée, pour que la forme de fond reflète la réalité.")}</p>
        {!list.length ? <Empty icon="pause" title={$t("Aucune interruption")} text={$t("Ajoute une période avec le bouton +.")} /> : (
          <ul className="tile-list divided card" style={{ padding: '0 var(--space-16)' }}>
            {list.map((i) => {
              const now = i.startDate <= d.today && d.today <= i.endDate;
              return (
                <li key={i.id}>
                  <button type="button" className="settings-row" onClick={() => setEdit(i)}>
                    <Icon name="pause" style={{ color: now ? 'var(--warning-text)' : 'var(--text-neutral)' }} />
                    <span className="stack"><span className="t-strong">{i.label}{now ? <span className="var-chip warn" style={{ marginLeft: 8 }}>{$t("en cours")}</span> : null}</span><span className="t-caption c-moderate">{REASON_LABEL[i.reason]} {$t("· du")} {dateFr(i.startDate)} {$t("au")} {dateFr(i.endDate)}{i.dailyLoadOverride !== null ? $t(" · forfait {0}/j", { 0: num(i.dailyLoadOverride, 0) }) : ''}</span></span>
                    <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {edit && <InterruptionSheet value={edit === 'new' ? null : edit} defaultStart={d.today} onDelete={edit !== 'new' ? () => { remove(edit); setEdit(null); } : undefined} onClose={() => { setEdit(null); if (ask !== null) navigate('/parametres/interruptions', { replace: true }); }} />}
    </div>
  );
}

function InterruptionSheet({ value, defaultStart, onClose, onDelete }: { value: Interruption | null; defaultStart: string; onClose: () => void; onDelete?: () => void }) {
  const [label, setLabel] = useState(value?.label ?? '');
  const [reason, setReason] = useState<InterruptionReason>(value?.reason ?? 'injury');
  const [start, setStart] = useState(value?.startDate ?? defaultStart);
  const [end, setEnd] = useState(value?.endDate ?? addDays(defaultStart, 6));
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const [load, setLoad] = useState(value?.dailyLoadOverride !== null && value?.dailyLoadOverride !== undefined ? toInput(value.dailyLoadOverride, 0) : '');
  const [suspends, setSuspends] = useState(value?.suspendsReminders ?? true);
  const [notes, setNotes] = useState(value?.notes ?? '');
  const lv = load.trim() ? parseNum(load) : null;
  const bad = !label.trim() || end < start || (lv !== null && (!Number.isFinite(lv) || lv < 0));
  const save = () => {
    saveInterruption({ id: value?.id ?? newId(), updatedAt: '', label: label.trim(), reason, startDate: start, endDate: end, dailyLoadOverride: lv, suspendsReminders: suspends, notes: notes.trim() || null });
    onClose(); showToast($t("Interruption enregistrée"));
  };
  return (
    <Sheet title={value ? $t("Modifier l’interruption") : $t("Nouvelle interruption")} onClose={onClose} full footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>{$t("Enregistrer")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        <label className="field"><span className="lbl">{$t("Nom")}</span><input className="input" value={label} placeholder={$t("Entorse cheville, vacances…")} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="field"><span className="lbl">{$t("Motif")}</span>
          <div className="chips g6" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{(Object.keys(REASON_LABEL) as InterruptionReason[]).map((r) => <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{REASON_LABEL[r]}</button>)}</div>
        </div>
        <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
          <div className="field"><span className="lbl">{$t("Du")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'start' ? null : 'start')}><span>{dayTitle(start)}</span><Icon name="calendar" size={20} /></button></div>
          <div className="field"><span className="lbl">{$t("Au")}</span><button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} onClick={() => setOpen(open === 'end' ? null : 'end')}><span>{dayTitle(end)}</span><Icon name="calendar" size={20} /></button></div>
        </div>
        {open && <DatePicker value={open === 'start' ? start : end} onChange={(v) => { if (open === 'start') { setStart(v); if (end < v) setEnd(v); } else setEnd(v); setOpen(null); }} />}
        {end < start && <span className="t-caption-strong c-critical">{$t("La fin précède le début.")}</span>}
        <label className="field"><span className="lbl">{$t("Charge forfaitaire par jour")} <span className="c-moderate" style={{ fontWeight: 400 }}>{$t("(facultatif)")}</span></span><input className="input num" inputMode="numeric" value={load} placeholder={$t("vide = charge mesurée")} onChange={(e) => setLoad(e.target.value)} /><span className="hint">{$t("Remplace la charge des jours sans séance. 0 pour un arrêt complet ; une valeur pour un effort non mesuré (déménagement, randonnée).")}</span></label>
        <div className="between" style={{ gap: 'var(--space-12)' }}><span className="t-strong" id="lbl-susp">{$t("Suspendre les rappels et alertes")}</span><Switch checked={suspends} labelledBy="lbl-susp" onChange={setSuspends} /></div>
        <label className="field"><span className="lbl">{$t("Notes")}</span><textarea className="input textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {onDelete && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)' }} onClick={onDelete}><Icon name="trash" size={18} />{$t("Supprimer")}</button>}
      </div>
    </Sheet>
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
