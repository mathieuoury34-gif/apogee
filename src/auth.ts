// Page de connexion ouverte par l'APK Android dans le navigateur du téléphone (Google refuse la connexion
// depuis une vue web intégrée). Une fois connecté, la page rend le jeton Google à l'app par le lien
// ironapp://auth#id_token=…&access_token=… ; l'app s'en sert pour ouvrir la même session Firebase.
import { FIREBASE_CONFIG } from './data/firebase-config';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const $ = (id: string) => document.getElementById(id)!;

function status(text: string, error = false) {
  const el = $('status');
  el.textContent = text;
  el.className = error ? 'err' : '';
}

function handOff(cred: Any) {
  const p = new URLSearchParams();
  if (cred?.idToken) p.set('id_token', cred.idToken);
  if (cred?.accessToken) p.set('access_token', cred.accessToken);
  const url = 'ironapp://auth#' + p.toString();
  const back = $('back') as HTMLAnchorElement;
  back.href = url;
  back.hidden = false;
  ($('go') as HTMLButtonElement).hidden = true;
  status('Connecté. Retour dans Iron App…');
  location.href = url;
}

async function main() {
  const go = $('go') as HTMLButtonElement;
  if (!FIREBASE_CONFIG.apiKey) { status('La synchronisation n’est pas encore configurée (firebase-config.ts).', true); go.disabled = true; return; }
  const [app, a] = await Promise.all([import(/* @vite-ignore */ SDK + 'firebase-app.js'), import(/* @vite-ignore */ SDK + 'firebase-auth.js')]) as [Any, Any];
  const auth = a.getAuth(app.initializeApp(FIREBASE_CONFIG));
  auth.languageCode = 'fr';
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const r = await a.getRedirectResult(auth);
    if (r) { handOff(a.GoogleAuthProvider.credentialFromResult(r)); return; }
  } catch (e) { status('Connexion impossible : ' + (e as Error).message, true); }
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    status('Ouverture de Google…');
    try {
      const r = await a.signInWithPopup(auth, provider);
      handOff(a.GoogleAuthProvider.credentialFromResult(r));
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code.includes('popup-blocked') || code.includes('operation-not-supported')) { await a.signInWithRedirect(auth, provider); return; }
      status(code.includes('popup-closed') || code.includes('cancelled') ? 'Connexion annulée.' : 'Connexion impossible : ' + (e as Error).message, !code.includes('popup-closed'));
      go.disabled = false;
    }
  };
}

main().catch((e) => status('Erreur : ' + (e as Error).message, true));
