import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getDerived, getData, loadStore, onChange } from './data/store';
import { startSync } from './data/sync';
import { native } from './native/bridge';
import { refreshHealthState, runHealthSync } from './native/healthSync';
import { scheduleReminders } from './native/notify';
import './styles/tokens.css';
import './styles/app.css';
import './theme';

createRoot(document.getElementById('root')!).render(<App />);

(async () => {
  await loadStore();
  startSync();
  if (native.isApp()) {
    // APK : la montre est relue à l'ouverture et à chaque retour au premier plan (garde de 10 min).
    let last = 0;
    const read = () => { if (Date.now() - last < 10 * 60 * 1000) return; last = Date.now(); runHealthSync().catch(() => undefined); };
    await refreshHealthState();
    read();
    native.onResume(read);
    // Rappels locaux, recalculés quand les données changent (regroupés)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const plan = () => { clearTimeout(timer); timer = setTimeout(() => scheduleReminders(getData(), getDerived()).catch(() => undefined), 2000); };
    onChange(plan);
    plan();
  }
})();

// Application hors ligne (service worker) – uniquement en production (https), et jamais dans l'APK : une page
// servie par le service worker ne passe pas par Capacitor, qui n'y injecte alors pas son pont natif (plus de
// Health Connect, plus de notifications). Dans l'APK, on désinstalle donc un service worker resté d'avant.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  if (native.inWebView()) {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      if (!native.isApp()) {
        try { if (sessionStorage.getItem('ironapp:sw-reload')) return; sessionStorage.setItem('ironapp:sw-reload', '1'); } catch { /* rien */ }
        location.reload();
      }
    }).catch(() => undefined);
  } else {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  }
}
