// Page de connexion ouverte par l'APK Android dans le navigateur du téléphone (Google refuse la connexion
// depuis une vue web intégrée). Une fois connecté, la page rend le jeton Google à l'app par le lien
// quadra://auth#id_token=…&access_token=… ; l'app s'en sert pour ouvrir la même session Firebase.
import { FIREBASE_CONFIG } from './data/firebase-config';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const $ = (id: string) => document.getElementById(id)!;

// Langue transmise par l'app (?lang=en), gardée le temps d'une éventuelle redirection Google.
const EN = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  try { if (q) sessionStorage.setItem('quadra:auth-lang', q); return (q ?? sessionStorage.getItem('quadra:auth-lang')) === 'en'; } catch { return q === 'en'; }
})();
const T: Record<string, string> = {
  'Connecté. Retour dans Quadra…': 'Signed in. Back to Quadra…',
  'La synchronisation n’est pas encore configurée (firebase-config.ts).': 'Sync is not configured yet (firebase-config.ts).',
  'Connexion impossible : ': 'Sign-in failed: ',
  'Ouverture de Google…': 'Opening Google…',
  'Connexion annulée.': 'Sign-in cancelled.',
  'Erreur : ': 'Error: ',
};
const t = (fr: string) => (EN ? T[fr] ?? fr : fr);
if (EN) {
  document.documentElement.lang = 'en';
  document.title = 'Sign in · Quadra';
  $('lead').textContent = 'Sign in with your Google account: the Android app will get your synced data back.';
  $('go-label').textContent = 'Continue with Google';
  $('back').textContent = 'Back to Quadra';
}

function status(text: string, error = false) {
  const el = $('status');
  el.textContent = text;
  el.className = error ? 'err' : '';
}

function handOff(cred: Any) {
  const p = new URLSearchParams();
  if (cred?.idToken) p.set('id_token', cred.idToken);
  if (cred?.accessToken) p.set('access_token', cred.accessToken);
  const url = 'quadra://auth#' + p.toString();
  const back = $('back') as HTMLAnchorElement;
  back.href = url;
  back.hidden = false;
  ($('go') as HTMLButtonElement).hidden = true;
  status(t('Connecté. Retour dans Quadra…'));
  location.href = url;
}

async function main() {
  const go = $('go') as HTMLButtonElement;
  if (!FIREBASE_CONFIG.apiKey) { status(t('La synchronisation n’est pas encore configurée (firebase-config.ts).'), true); go.disabled = true; return; }
  const [app, a] = await Promise.all([import(/* @vite-ignore */ SDK + 'firebase-app.js'), import(/* @vite-ignore */ SDK + 'firebase-auth.js')]) as [Any, Any];
  const auth = a.getAuth(app.initializeApp(FIREBASE_CONFIG));
  auth.languageCode = EN ? 'en' : 'fr';
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const r = await a.getRedirectResult(auth);
    if (r) { handOff(a.GoogleAuthProvider.credentialFromResult(r)); return; }
  } catch (e) { status(t('Connexion impossible : ') + (e as Error).message, true); }
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    status(t('Ouverture de Google…'));
    try {
      const r = await a.signInWithPopup(auth, provider);
      handOff(a.GoogleAuthProvider.credentialFromResult(r));
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code.includes('popup-blocked') || code.includes('operation-not-supported')) { await a.signInWithRedirect(auth, provider); return; }
      status(code.includes('popup-closed') || code.includes('cancelled') ? t('Connexion annulée.') : t('Connexion impossible : ') + (e as Error).message, !code.includes('popup-closed'));
      go.disabled = false;
    }
  };
}

main().catch((e) => status(t('Erreur : ') + (e as Error).message, true));
