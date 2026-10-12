// État de la liaison avec la montre (Health Connect, APK Android) : ce qui est accordé, ce qui a été lu,
// quand, et ce que l'app contient déjà. Affiché en carte dans Paramètres, et en rappel sur l'Accueil tant
// que la liaison n'est pas faite.
import { useState } from 'react';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { showToast } from '../ui/kit';
import { useCalc, usePrefs } from '../data/store';
import { native } from '../native/bridge';
import { openHealthSettings, requestHealthPermissions, runHealthSync, useHealth } from '../native/healthSync';
import { liveRecords, sessionDay } from '../domain/load';
import { dateFr, dateTimeFr, num } from '../ui/format';

export type HealthLevel = 'web' | 'module' | 'unavailable' | 'update' | 'permissions' | 'never' | 'ok' | 'error';

export function useHealthLevel(): HealthLevel {
  const h = useHealth();
  const prefs = usePrefs();
  if (!native.isApp()) return 'web';
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
  return {
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
      showToast(r ? `Montre lue : ${r.found} séance(s) vue(s), ${r.inserted} nouvelle(s), ${r.updated} complétée(s), ${r.nights} nuit(s)` : 'Lecture impossible : vérifie les autorisations', { error: !r });
    } finally { setBusy(false); }
  };
  const grant = async () => { await requestHealthPermissions(); };

  if (level === 'web') {
    if (compact) return null;
    return (
      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-12)' }}>
        <Icon name="phone" style={{ color: 'var(--text-moderate)' }} />
        <span className="stack">
          <span className="t-strong">Lu depuis l’application Android</span>
          <span className="t-caption c-moderate">Health Connect n’existe que sur Android : l’APK Iron App y lit les séances, le sommeil et la FC de repos envoyés par Garmin Connect, puis la synchronisation les amène ici.{st.lastSession ? ` Dernière séance de la montre : ${dateFr(st.lastSession)}.` : ''}</span>
        </span>
      </div>
    );
  }
  if (compact && level === 'ok') return null;

  const status: Record<Exclude<HealthLevel, 'web'>, { tone: 'ok' | 'warn' | 'crit'; title: string; text: string }> = {
    module: { tone: 'crit', title: 'Module Health Connect introuvable', text: 'Cette version de l’APK ne contient pas le lecteur Health Connect. Réinstalle la dernière version (page Releases du dépôt GitHub).' },
    update: { tone: 'warn', title: 'Health Connect doit être mis à jour', text: 'Mets à jour « Health Connect » depuis le Play Store, puis reviens dans l’app.' },
    unavailable: { tone: 'crit', title: 'Health Connect indisponible', text: 'Health Connect n’est pas installé sur ce téléphone. Installe-le depuis le Play Store, puis relie Garmin Connect à Health Connect.' },
    error: { tone: 'crit', title: 'La dernière lecture a échoué', text: prefs.healthLastError || h.error || 'Erreur inconnue.' },
    permissions: { tone: 'warn', title: 'Montre pas encore reliée', text: 'Autorise Iron App à lire tes séances, ta FC, ton sommeil et ta FC de repos dans Health Connect. Coche aussi « Historique » pour reprendre tes séances passées.' },
    never: { tone: 'warn', title: 'Autorisations accordées, montre jamais lue', text: 'Lance une première lecture : elle remonte jusqu’à 400 jours si l’historique est autorisé.' },
    ok: { tone: 'ok', title: 'Montre reliée', text: `Dernière lecture le ${dateTimeFr(prefs.healthLastRun!)}${report ? ` : ${report.found} séance(s) vue(s), ${report.inserted} nouvelle(s), ${report.updated} complétée(s), ${report.nights} nuit(s), ${report.restingDays} FC de repos` : ''}.` },
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
      {!compact && level !== 'module' && (
        <dl className="kv">
          <dt>Autorisations</dt><dd className="t-caption">{h.granted.length ? `${h.granted.length} accordée(s)${h.missing.length ? `, ${h.missing.length} manquante(s)` : ''}${h.history ? ' · historique' : ' · sans historique'}` : 'aucune'}</dd>
          <dt>Séances de la montre</dt><dd className="t-caption">{st.sessions ? `${num(st.sessions)} (${num(st.withHr)} avec courbe cardio) · dernière ${dateFr(st.lastSession)}` : 'aucune'}</dd>
          <dt>Nuits</dt><dd className="t-caption">{st.nights ? `${num(st.nights)} · dernière ${dateFr(st.lastNight)}` : 'aucune'}</dd>
          <dt>FC de repos</dt><dd className="t-caption">{st.resting ? `${num(st.resting)} jour(s) · dernier ${dateFr(st.lastResting)}` : 'aucune'}</dd>
        </dl>
      )}
      {!compact && h.missing.length > 0 && h.granted.length > 0 && <span className="t-legal c-moderate">Manquantes : {h.missing.join(', ')}</span>}
      <div className="row wrap">
        {(level === 'permissions' || (level !== 'module' && level !== 'unavailable' && level !== 'update' && (!h.history || h.missing.length > 0))) && (
          <button type="button" className="btn btn-primary" onClick={grant}><Icon name="link" size={18} />Autoriser Health Connect</button>
        )}
        {(level === 'ok' || level === 'never' || level === 'error') && (
          <button type="button" className="btn btn-secondary" disabled={busy || h.running} onClick={read}><Icon name="refresh" size={18} />{busy || h.running ? 'Lecture…' : 'Lire la montre'}</button>
        )}
        {compact ? <button type="button" className="btn btn-tertiary" onClick={() => navigate('/parametres')}>Détails</button>
          : level !== 'module' && level !== 'unavailable' && <button type="button" className="btn btn-tertiary" onClick={() => openHealthSettings()}>Ouvrir Health Connect</button>}
      </div>
      {!compact && <span className="t-legal c-moderate">La montre est relue à chaque ouverture de l’app (au plus toutes les 10 min) et avec le bouton ↻ de l’en-tête. Garmin Connect doit lui-même être relié à Health Connect (Garmin Connect › Paramètres › Health Connect).</span>}
    </div>
  );
}
