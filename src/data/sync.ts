// Synchronisation cloud gratuite : Firebase (offre Spark), connexion Google — même principe que PEAnalyze,
// mais enregistrement par enregistrement (une séance = un document) pour ne jamais buter sur la taille
// maximale d'un document Firestore (1 Mo) quand les séries cardio s'accumulent.
//   users/{uid}/iron_{collection}/{id} = { data: <JSON>, updatedAt, deleted }
// Règle de fusion : la version la plus récente (updatedAt) gagne. Les calculs ne sont jamais synchronisés :
// chaque appareil les refait à l'identique.
//
// Dans l'APK Android, Google refuse la connexion depuis une vue web intégrée : la connexion passe par le
// navigateur du téléphone (page auth.html), qui renvoie le jeton à l'app par le lien ironapp://auth.
import { $t, lang } from '../i18n';
import { useSyncExternalStore } from 'react';
import { FIREBASE_CONFIG } from './firebase-config';
import { commit, dirty, getData, getPrefs, markClean, onChange, setPrefs } from './store';
import type { CollectionName } from '../domain/types';
import { COLLECTIONS } from '../domain/types';
import { native, siteUrl } from '../native/bridge';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = (m: string): Promise<Any> => import(/* @vite-ignore */ SDK + m);

export interface SyncStatus {
  configured: boolean;
  ready: boolean;
  user: { name: string; email: string; photo: string } | null;
  state: 'off' | 'syncing' | 'ok' | 'error';
  lastSync: string;
  pending: number;
  error: string;
}
let status: SyncStatus = { configured: !!FIREBASE_CONFIG.apiKey, ready: !FIREBASE_CONFIG.apiKey, user: null, state: 'off', lastSync: '', pending: 0, error: '' };
const listeners = new Set<() => void>();
const set = (s: Partial<SyncStatus>) => { status = { ...status, ...s, pending: dirty.size }; listeners.forEach((l) => l()); };
export function useSync(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

let auth: Any, db: Any, fa: Any, fs: Any;
let unsubs: (() => void)[] = [];
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing = false;

async function init(): Promise<boolean> {
  if (auth) return true;
  if (!status.configured) return false;
  try {
    const [app, a, f] = await Promise.all([load('firebase-app.js'), load('firebase-auth.js'), load('firebase-firestore.js')]);
    fa = a; fs = f;
    const fbApp = app.initializeApp(FIREBASE_CONFIG);
    auth = a.getAuth(fbApp);
    auth.languageCode = lang;
    try { db = f.initializeFirestore(fbApp, { localCache: f.persistentLocalCache() }); } catch { db = f.getFirestore(fbApp); }
    return true;
  } catch (e) {
    set({ ready: true, state: 'error', error: $t("Service de synchronisation injoignable (hors ligne ?)") });
    console.warn('[sync] init', e);
    return false;
  }
}

const collPath = (uid: string, c: CollectionName) => fs.collection(db, 'users', uid, 'iron_' + c);

async function push(): Promise<void> {
  const u = auth?.currentUser;
  if (!u || pushing || !dirty.size) return;
  pushing = true;
  set({ state: 'syncing' });
  try {
    const keys = [...dirty];
    const data = getData();
    for (let i = 0; i < keys.length; i += 400) {
      const batch = fs.writeBatch(db);
      const chunk = keys.slice(i, i + 400);
      for (const k of chunk) {
        const j = k.indexOf('/');
        const c = k.slice(0, j) as CollectionName, id = k.slice(j + 1);
        const rec = (data[c] as Record<string, { updatedAt: string; deleted?: boolean }>)[id];
        if (!rec) continue;
        batch.set(fs.doc(collPath(u.uid, c), id), { data: JSON.stringify(rec), updatedAt: rec.updatedAt, deleted: !!rec.deleted });
      }
      await batch.commit();
      markClean(chunk);
    }
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  } catch (e) {
    set({ state: 'error', error: $t("Envoi impossible : ") + ((e as Error).message || $t("erreur")) });
  } finally {
    pushing = false;
    if (dirty.size) schedulePush(5000);
  }
}

function schedulePush(ms = 1200) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, ms);
}

function watch(uid: string) {
  unsubs.forEach((u) => u());
  unsubs = [];
  let first = COLLECTIONS.length;
  for (const c of COLLECTIONS) {
    let initial = true;
    unsubs.push(fs.onSnapshot(collPath(uid, c), (snap: Any) => {
      const local = getData()[c] as Record<string, { updatedAt: string }>;
      const incoming: { id: string; rec: Any }[] = [];
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue;
        const v = ch.doc.data() as { data: string; updatedAt: string };
        const mine = local[ch.doc.id];
        if (dirty.has(c + '/' + ch.doc.id) && mine && mine.updatedAt >= v.updatedAt) continue;
        if (!mine || v.updatedAt > mine.updatedAt) {
          try { incoming.push({ id: ch.doc.id, rec: JSON.parse(v.data) }); } catch { /* document illisible */ }
        }
      }
      if (incoming.length) commit((tx) => incoming.forEach((x) => tx.put(c, x.rec)), 'remote');
      if (initial) {
        initial = false;
        // ce qui n'existe que sur cet appareil (première connexion, saisie hors ligne) part vers le cloud
        const remoteIds = new Set(snap.docs.map((x: Any) => x.id));
        for (const id of Object.keys(getData()[c])) if (!remoteIds.has(id)) dirty.add(c + '/' + id);
        if (--first === 0) { setPrefs({ syncedUid: uid }); set({ state: 'ok', lastSync: new Date().toISOString() }); schedulePush(300); }
      }
    }, (e: Error) => set({ state: 'error', error: e.message })));
  }
}

export async function startSync(): Promise<void> {
  onChange((changes) => { if (changes.some((x) => x.origin === 'local')) { set({}); if (auth?.currentUser) schedulePush(); } });
  if (!(await init())) return;
  fa.getRedirectResult(auth).catch(() => undefined);
  fa.onAuthStateChanged(auth, (u: Any) => {
    if (u) {
      set({ ready: true, user: { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }, state: 'syncing' });
      setPrefs({ skipLogin: false });
      watch(u.uid);
    } else {
      unsubs.forEach((x) => x()); unsubs = [];
      set({ ready: true, user: null, state: 'off' });
    }
  });
  // APK : retour de la page de connexion ouverte dans le navigateur
  native.onAuthLink(async (idToken, accessToken) => {
    try {
      await fa.signInWithCredential(auth, fa.GoogleAuthProvider.credential(idToken || null, accessToken || null));
    } catch (e) {
      set({ error: $t("Connexion impossible : ") + (e as Error).message, state: 'error' });
    }
  });
}

export async function signIn(): Promise<void> {
  if (!(await init())) throw new Error($t("Synchronisation non configurée"));
  if (native.isApp()) { await native.openBrowser(siteUrl() + 'auth.html?app=1&lang=' + lang); return; }
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fa.signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported') || code.includes('web-storage')) await fa.signInWithRedirect(auth, provider);
    else if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) throw e;
  }
}

export async function signOut(): Promise<void> {
  if (auth) await fa.signOut(auth);
}

export async function syncNow(): Promise<void> {
  if (!auth?.currentUser) return;
  // renvoie tout : utile si un appareil a été effacé ou si un doute existe
  const data = getData();
  for (const c of COLLECTIONS) for (const id of Object.keys(data[c])) dirty.add(c + '/' + id);
  await push();
}

/** Supprime toutes les données Quadra du cloud (compte connecté). */
export async function deleteCloud(): Promise<void> {
  const u = auth?.currentUser;
  if (!u) return;
  for (const c of COLLECTIONS) {
    const snap = await fs.getDocs(collPath(u.uid, c));
    const docs = snap.docs as Any[];
    for (let i = 0; i < docs.length; i += 400) {
      const b = fs.writeBatch(db);
      docs.slice(i, i + 400).forEach((d: Any) => b.delete(d.ref));
      await b.commit();
    }
  }
}


export function isSignedIn(): boolean {
  return !!status.user;
}
