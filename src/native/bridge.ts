// Pont vers le natif quand l'app tourne dans l'APK Android (Capacitor). Rien n'est importé : les modules
// natifs sont exposés par Capacitor sur `window.Capacitor.Plugins`. Sur PC et iPhone, tout ceci est absent
// et l'app fonctionne normalement (sans Health Connect, sans notifications locales).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function cap(): Any {
  return typeof window !== 'undefined' ? (window as Any).Capacitor : undefined;
}
function plugin(name: string): Any {
  return cap()?.Plugins?.[name];
}

/** Adresse publique de l'app web (GitHub Pages), d'où l'APK charge l'interface. */
export function siteUrl(): string {
  if (typeof location === 'undefined') return '';
  const u = new URL(location.href);
  u.hash = '';
  u.search = '';
  return u.href.replace(/[^/]*$/, '');
}

const authCallbacks = new Set<(idToken: string, accessToken: string) => void>();
let linkListening = false;

function parseAuthLink(url: string) {
  if (!url.startsWith('ironapp://auth')) return;
  const frag = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url.slice(url.indexOf('?') + 1);
  const p = new URLSearchParams(frag);
  const id = p.get('id_token') || '', acc = p.get('access_token') || '';
  if (id || acc) authCallbacks.forEach((cb) => cb(id, acc));
  plugin('Browser')?.close?.().catch?.(() => undefined);
}

export const native = {
  /** Vue web Android d'une application (l'APK), par opposition à Chrome ou à l'app installée depuis Chrome. */
  inWebView(): boolean {
    return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent) && /; wv\)/.test(navigator.userAgent);
  },
  isAndroid(): boolean {
    return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
  },
  /** Ce que voit l'app de son environnement, pour l'écran Montre. */
  diagnostic(): string {
    const c = cap();
    const plugins = c?.Plugins ? Object.keys(c.Plugins).filter((k) => ['IronHealth', 'App', 'Browser', 'LocalNotifications'].includes(k)).join(', ') : '';
    return [native.inWebView() ? 'WebView Android' : native.isAndroid() ? 'navigateur Android' : 'navigateur', c ? 'Capacitor ' + (c.getPlatform?.() ?? '?') : 'sans Capacitor', plugins ? 'modules : ' + plugins : 'aucun module natif', navigator.serviceWorker?.controller ? 'service worker actif' : 'sans service worker'].join(' · ');
  },
  isApp(): boolean {
    return !!cap()?.isNativePlatform?.() && cap()?.getPlatform?.() === 'android';
  },
  hasHealth(): boolean {
    return native.isApp() && !!plugin('IronHealth');
  },
  async openBrowser(url: string): Promise<void> {
    const b = plugin('Browser');
    if (b) await b.open({ url, presentationStyle: 'popover' });
    else window.open(url, '_blank');
  },
  onAuthLink(cb: (idToken: string, accessToken: string) => void) {
    authCallbacks.add(cb);
    const app = plugin('App');
    if (!app || linkListening) return;
    linkListening = true;
    app.addListener('appUrlOpen', (e: { url: string }) => parseAuthLink(e.url));
    app.getLaunchUrl?.().then((r: { url?: string } | undefined) => r?.url && parseAuthLink(r.url)).catch(() => undefined);
  },
  onResume(cb: () => void) {
    const app = plugin('App');
    if (app) app.addListener('appStateChange', (s: { isActive: boolean }) => { if (s.isActive) cb(); });
    else document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); });
  },
  // ---------------------------------------------------------------- Health Connect (module IronHealth de l'APK)
  health(): Any {
    return plugin('IronHealth');
  },
  // ---------------------------------------------------------------- fichiers
  /** Enregistre un fichier : téléchargement sur le web, partage Android dans l'APK. */
  async saveFile(name: string, blob: Blob): Promise<void> {
    const fsys = plugin('Filesystem'), share = plugin('Share');
    if (native.isApp() && fsys && share) {
      const b64 = await blobToBase64(blob);
      const res = await fsys.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await share.share({ title: name, url: res.uri, dialogTitle: name });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  // ---------------------------------------------------------------- notifications locales
  notifications(): Any {
    return native.isApp() ? plugin('LocalNotifications') : undefined;
  },
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
