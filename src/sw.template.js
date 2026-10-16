// Service worker de Quadra : l'application fonctionne hors ligne.
const VERSION = '__VERSION__';
const SHELL = 'quadra-shell-' + VERSION;
const RUNTIME = 'quadra-runtime';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('iron-') || (k.startsWith('quadra-shell-') && k !== SHELL)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Dans l'APK (WebView Android), rien ne passe par ici : Capacitor doit voir chaque page pour y injecter son pont.
const IN_APP = /Android/.test(self.navigator.userAgent) && /; wv\)/.test(self.navigator.userAgent);
self.addEventListener('fetch', (e) => {
  if (IN_APP) return;
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // polices Google : en cache après le premier chargement
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'www.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return; // Firebase : toujours en direct
  if (req.mode === 'navigate' && !url.pathname.endsWith('auth.html')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./', copy)); } return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
