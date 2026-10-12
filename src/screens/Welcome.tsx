// Premier lancement sur un appareil : l'app publiée ne contient aucune donnée personnelle.
import { useRef, useState } from 'react';
import { useSync, signIn } from '../data/sync';
import { getData } from '../data/store';
import { dossierMessage, importDossier, importLegacy, readJsonFile, restoreBackup } from '../data/backup';
import { navigate, openSheet } from '../ui/router';
import { showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { dateFr } from '../ui/format';

export function WelcomeCard({ className = '' }: { className?: string }) {
  const db = useRef<HTMLInputElement>(null);
  const js = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const sync = useSync();
  const onDb = async (f: File) => {
    setBusy(true);
    try {
      const prev = getData();
      const r = importLegacy(new Uint8Array(await f.arrayBuffer()));
      showToast(`Reprise : ${r.counts.actual ?? 0} séances réalisées (dernière le ${r.lastActual ? dateFr(r.lastActual) : '—'}), ${r.counts.planned ?? 0} prévues`, { undo: () => restoreBackup(prev) });
    } catch (e) { showToast('Reprise impossible : ' + (e as Error).message, { error: true }); } finally { setBusy(false); }
  };
  const onJson = async (f: File) => {
    try {
      const prev = getData();
      const file = readJsonFile(await f.text());
      if (file.kind === 'dossier') showToast(dossierMessage(importDossier(file.dossier)), { undo: () => restoreBackup(prev) });
      else { restoreBackup(file.data); showToast('Sauvegarde restaurée', { undo: () => restoreBackup(prev) }); }
    } catch (e) { showToast('Lecture impossible : ' + (e as Error).message, { error: true }); }
  };
  return (
    <section className={'card g16 ' + className} aria-labelledby="welcome-title" data-component="WelcomeCard">
      <h2 id="welcome-title">Bienvenue sur Iron App</h2>
      <p className="c-neutral">
        Aucune séance sur cet appareil pour l’instant.{' '}
        {sync.configured && !sync.user ? 'Connecte-toi avec Google pour retrouver tes données, ou reprends la base de l’ancienne application Android.' : 'Reprends la base de l’ancienne application Android (Paramètres › Export › Partager le fichier) pour retrouver tout ton historique.'}
      </p>
      {sync.configured && !sync.user && (
        <button type="button" className="btn btn-primary block" onClick={() => signIn().catch((e) => showToast('Connexion impossible : ' + (e as Error).message, { error: true }))}>Se connecter avec Google</button>
      )}
      <button type="button" className={'btn block ' + (sync.configured && !sync.user ? 'btn-secondary' : 'btn-primary')} disabled={busy} onClick={() => db.current?.click()}>
        <Icon name="database" size={20} /> {busy ? 'Lecture en cours…' : 'Reprendre l’ancienne base (.db)'}
      </button>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 'var(--space-16)' }}>
        <button type="button" className="btn btn-tertiary" onClick={() => js.current?.click()}>Restaurer ou compléter (.json)</button>
        <button type="button" className="btn btn-tertiary" onClick={() => (location.hash.startsWith('#/accueil') ? openSheet('ajouter') : navigate('/seances/saisie'))}>Saisir une séance</button>
      </div>
      <input ref={db} type="file" accept=".db,.sqlite,application/octet-stream,application/x-sqlite3,application/vnd.sqlite3" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onDb(f); e.target.value = ''; }} />
      <input ref={js} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onJson(f); e.target.value = ''; }} />
    </section>
  );
}
