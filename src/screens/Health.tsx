// État de la liaison avec la montre (Health Connect, APK Android) : ce qui est accordé, ce qui a été lu,
// quand, et ce que l'app contient déjà. Affiché en carte dans Paramètres, et en rappel sur l'Accueil tant
// que la liaison n'est pas faite.
import { ExtLink } from './Help';
import { APK_PAGE } from './help-content';
import { $t } from '../i18n';
import { useState } from 'react';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { showToast, Info } from '../ui/kit';
import { useCalc, usePrefs } from '../data/store';
import { native } from '../native/bridge';
import { openHealthSettings, requestHealthPermissions, runHealthSync, useHealth } from '../native/healthSync';
import { liveRecords, sessionDay } from '../domain/load';
import { dateFr, dateTimeFr, num } from '../ui/format';

export type HealthLevel = 'web' | 'bridge' | 'module' | 'unavailable' | 'update' | 'permissions' | 'never' | 'ok' | 'error';

export function useHealthLevel(): HealthLevel {
  const h = useHealth();
  const prefs = usePrefs();
  if (!native.isApp()) return native.inWebView() ? 'bridge' : 'web';
  if (!native.hasHealth() || h.availability === 'absent') return 'module';
  if (h.availability === 'update_required') return 'update';
  if (h.availability === 'unavailable') return 'unavailable';
  if (h.availability === 'error') return 'error';
  if (h.missing.includes('ExerciseSession') || h.granted.length === 0) return 'permissions';
  if (!prefs.healthLastRun) return 'never';
  if (prefs.healthLastError) return 'error';
  return 'ok';
}

/** Ce que contient l'app, venu de la montre. */
function useWatchStats() {
  const { data } = useCalc();
  const health = liveRecords(data.actual).filter((s) => s.source === 'health' && !s.sourceId.startsWith('legacy:'));
  const lastSession = health.map((s) => sessionDay(s)).sort().pop() ?? null;
  const nights = liveRecords(data.sleep);
  const resting = liveRecords(data.resting);
  const weights = liveRecords(data.weight).filter((w) => w.source === 'health');
  const energy = liveRecords(data.energy), vitals = liveRecords(data.vitals);
  return {
    energy: energy.length, lastEnergy: energy.map((e) => e.day).sort().pop() ?? null,
    vo2: vitals.filter((v) => v.vo2max !== null).length, hrv: vitals.filter((v) => v.hrvMs !== null).length,
    weights: weights.length,
    lastWeight: weights.map((r) => r.day).sort().pop() ?? null,
    sessions: health.length,
    withHr: health.filter((s) => s.hasSeries).length,
    lastSession,
    nights: nights.length,
    lastNight: nights.map((n) => n.nightDate).sort().pop() ?? null,
    resting: resting.length,
    lastResting: resting.map((r) => r.day).sort().pop() ?? null,
  };
}

export function HealthCard({ compact = false }: { compact?: boolean }) {
  const level = useHealthLevel();
  const h = useHealth();
  const prefs = usePrefs();
  const st = useWatchStats();
  const [busy, setBusy] = useState(false);
  const report = prefs.healthLastReport ? (JSON.parse(prefs.healthLastReport) as { found: number; inserted: number; updated: number; nights: number; restingDays: number }) : null;
  const read = async () => {
    setBusy(true);
    try {
      const r = await runHealthSync();
      showToast(r ? $t("Montre lue : {0} séance(s) vue(s), {1} nouvelle(s), {2} complétée(s), {3} nuit(s)", { 0: r.found, 1: r.inserted, 2: r.updated, 3: r.nights }) : $t("Lecture impossible : vérifie les autorisations"), { error: !r });
    } finally { setBusy(false); }
  };
  const grant = async () => { await requestHealthPermissions(); };

  if (level === 'web') {
    const android = native.isAndroid();
    if (compact && !android) return null;
    return (
      <div className={compact ? 'card g12 dspan-12' : 'stack-12'} data-component="HealthCard">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-12)' }}>
          <Icon name={android ? 'alert' : 'phone'} style={{ color: android ? 'var(--warning-text)' : 'var(--text-moderate)', flexShrink: 0 }} />
          <span className="stack grow">
            <span className="t-strong" style={android ? { color: 'var(--warning-text)' } : undefined}>{android ? $t("Health Connect non relié : tu n’es pas dans l’APK") : $t("Health Connect : lu par le téléphone Android")}</span>
            <span className="t-caption c-neutral">{android
              ? $t("Cette page tourne dans le navigateur (ou l’app installée depuis Chrome), qui n’a pas accès à Health Connect. Installe et ouvre l’APK Apogée (lien ci-dessous).")
              : $t("Health Connect n’existe que sur Android : l’APK Apogée y lit les séances, le sommeil et la FC de repos envoyés par Garmin Connect, puis la synchronisation les amène ici.")}</span>
          </span>
        </div>
        {android && <ExtLink href={APK_PAGE} className="help-link"><Icon name="download" size={20} /><span>{$t("Télécharger l’APK Apogée (GitHub › Releases)")}</span></ExtLink>}
        {!compact && <WatchKv st={st} />}
        {compact && <div className="row wrap"><button type="button" className="btn btn-tertiary" onClick={() => navigate('/parametres')}>{$t("Détails")}</button></div>}
        {!compact && <span className="t-legal c-moderate">{$t("Diagnostic :")} {native.diagnostic()}</span>}
      </div>
    );
  }
  if (compact && level === 'ok') return null;

  const status: Record<Exclude<HealthLevel, 'web'>, { tone: 'ok' | 'warn' | 'crit'; title: string; text: string }> = {
    bridge: { tone: 'crit', title: $t("APK ouvert, mais module natif non chargé"), text: $t("L’app n’a pas reçu le pont vers Android, donc ni Health Connect ni les notifications. Ferme complètement l’app (balaye-la des apps récentes) et rouvre-la ; si le message reste, réinstalle la dernière version de l’APK.") },
    module: { tone: 'crit', title: $t("Module Health Connect introuvable"), text: $t("Cette version de l’APK ne contient pas le lecteur Health Connect. Réinstalle la dernière version (page Releases du dépôt GitHub).") },
    update: { tone: 'warn', title: $t("Health Connect doit être mis à jour"), text: $t("Mets à jour « Health Connect » depuis le Play Store, puis reviens dans l’app.") },
    unavailable: { tone: 'crit', title: $t("Health Connect indisponible"), text: $t("Health Connect n’est pas installé sur ce téléphone. Installe-le depuis le Play Store, puis relie Garmin Connect à Health Connect.") },
    error: { tone: 'crit', title: $t("La dernière lecture a échoué"), text: prefs.healthLastError || h.error || $t("Erreur inconnue.") },
    permissions: { tone: 'warn', title: $t("Montre pas encore reliée"), text: $t("Autorise Apogée à lire tes séances, ta FC, ton sommeil, ta FC de repos et ton poids dans Health Connect. Coche aussi « Historique » pour reprendre tes séances passées.") },
    never: { tone: 'warn', title: $t("Autorisations accordées, montre jamais lue"), text: $t("Lance une première lecture : elle remonte jusqu’à 400 jours si l’historique est autorisé.") },
    ok: { tone: 'ok', title: $t("Montre reliée"), text: $t("Dernière lecture le {0}{1}.", { 0: dateTimeFr(prefs.healthLastRun!), 1: report ? $t(" : {0} séance(s) vue(s), {1} nouvelle(s), {2} complétée(s), {3} nuit(s), {4} FC de repos", { 0: report.found, 1: report.inserted, 2: report.updated, 3: report.nights, 4: report.restingDays }) : '' }) },
  };
  const s = status[level];
  const color = s.tone === 'ok' ? 'var(--success-text)' : s.tone === 'warn' ? 'var(--warning-text)' : 'var(--critical-text)';

  return (
    <div className={compact ? 'card g12 dspan-12' : 'stack-12'} data-component="HealthCard">
      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-12)' }}>
        <Icon name={s.tone === 'ok' ? 'success' : 'alert'} style={{ color, flexShrink: 0 }} />
        <span className="stack grow">
          <span className="t-strong" style={{ color }}>{s.title}</span>
          <span className="t-caption c-neutral">{s.text}</span>
        </span>
      </div>
      {!compact && level !== 'module' && level !== 'bridge' && (
        <dl className="kv">
          <dt>{$t("Autorisations")}</dt><dd className="t-caption">{h.granted.length ? $t("{0} accordée(s){1}{2}", { 0: h.granted.length, 1: h.missing.length ? $t(", {0} manquante(s)", { 0: h.missing.length }) : '', 2: h.history ? $t(" · historique") : $t(" · sans historique") }) : $t("aucune")}</dd>
        </dl>
      )}
      {!compact && <WatchKv st={st} />}
      {!compact && h.missing.length > 0 && h.granted.length > 0 && <span className="t-legal c-moderate">{$t("Manquantes :")} {h.missing.join(', ')}</span>}
      <div className="row wrap">
        {level !== 'bridge' && (level === 'permissions' || (level !== 'module' && level !== 'unavailable' && level !== 'update' && (!h.history || h.missing.length > 0))) && (
          <button type="button" className="btn btn-primary" onClick={grant}><Icon name="link" size={18} />{$t("Autoriser Health Connect")}</button>
        )}
        {(level === 'ok' || level === 'never' || level === 'error') && (
          <button type="button" className="btn btn-secondary" disabled={busy || h.running} onClick={read}><Icon name="refresh" size={18} />{busy || h.running ? $t("Lecture…") : $t("Lire la montre")}</button>
        )}
        {compact ? <button type="button" className="btn btn-tertiary" onClick={() => navigate('/parametres')}>{$t("Détails")}</button>
          : level !== 'module' && level !== 'unavailable' && level !== 'bridge' && <button type="button" className="btn btn-tertiary" onClick={() => openHealthSettings()}>{$t("Ouvrir Health Connect")}</button>}
      </div>
      {!compact && (level === 'bridge' || level === 'module' || level === 'error') && <span className="t-legal c-moderate">{$t("Diagnostic :")} {native.diagnostic()}</span>}
      {!compact && <Info>{$t("La montre est relue à chaque ouverture de l’app (au plus toutes les 10 min) et avec le bouton ↻ de l’en-tête. Garmin Connect doit lui-même être relié à Health Connect (Garmin Connect › Paramètres › Health Connect).")}</Info>}
    </div>
  );
}

function WatchKv({ st }: { st: ReturnType<typeof useWatchStats> }) {
  const none = $t("aucune");
  return (
    <dl className="kv">
      <dt>{$t("Séances de la montre")}</dt><dd className="t-caption">{st.sessions ? $t("{0} ({1} avec courbe cardio) · dernière {2}", { 0: num(st.sessions), 1: num(st.withHr), 2: dateFr(st.lastSession) }) : none}</dd>
      <dt>{$t("Nuits")}</dt><dd className="t-caption">{st.nights ? $t("{0} · dernière {1}", { 0: num(st.nights), 1: dateFr(st.lastNight) }) : none}</dd>
      <dt>{$t("FC de repos")}</dt><dd className="t-caption">{st.resting ? $t("{0} jour(s) · dernier {1}", { 0: num(st.resting), 1: dateFr(st.lastResting) }) : none}</dd>
      <dt>{$t("Poids")}</dt><dd className="t-caption">{st.weights ? $t("{0} pesée(s) · dernière {1}", { 0: num(st.weights), 1: dateFr(st.lastWeight) }) : none}</dd>
      <dt>{$t("Dépense du jour")}</dt><dd className="t-caption">{st.energy ? $t("{0} jour(s) · dernier {1}", { 0: num(st.energy), 1: dateFr(st.lastEnergy) }) : none}</dd>
      <dt>{$t("VO₂max")}</dt><dd className="t-caption">{st.vo2 ? $t("{0} valeur(s)", { 0: num(st.vo2) }) : $t("aucune pour l’instant")}</dd>
      <dt>{$t("Variabilité cardiaque")}</dt><dd className="t-caption">{st.hrv ? $t("{0} valeur(s)", { 0: num(st.hrv) }) : $t("aucune pour l’instant")}</dd>
    </dl>
  );
}
