// Navigation par hash (#/accueil…) — reprise telle quelle de PEAnalyze avec l'historique du navigateur :
// le bouton retour d'Android ferme les feuilles et revient à l'écran précédent.
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string; // ex. '/seances/482'
  parts: string[]; // ['seances', '482']
  query: URLSearchParams;
  key: string;
}

export const HOME = '/accueil';

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || HOME;
  const [p, q = ''] = h.split('?');
  const path = p.startsWith('/') ? p : '/' + p;
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q), key: h };
}

// À l'ouverture de l'application (nouveau lancement, pas un simple rechargement), on arrive toujours sur l'Accueil.
try {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if ((!nav || nav.type === 'navigate') && location.hash.replace(/^#/, '').split('?')[0] !== HOME) history.replaceState(null, '', '#' + HOME);
} catch { /* navigateur ancien : on garde l'adresse demandée */ }

let current = parse();
const listeners = new Set<() => void>();
const depth = () => ((history.state as { depth?: number } | null)?.depth ?? 0);
if (history.state?.depth === undefined) history.replaceState({ depth: 0 }, '');

function emit(scrollTop: boolean) {
  const prevPath = current.path;
  current = parse();
  listeners.forEach((l) => l());
  if (scrollTop && prevPath !== current.path) window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => emit(true));
window.addEventListener('hashchange', () => { if (parse().key !== current.key) emit(true); });

export function useRoute(): Route {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState({ depth: depth() }, '', '#' + to);
  else history.pushState({ depth: depth() + 1 }, '', '#' + to);
  emit(true);
}

/** Retour : historique interne s'il existe, sinon écran parent. */
export function back(fallback: string): void {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function openSheet(name: string, params: Record<string, string> = {}): void {
  const r = parse();
  r.query.set('sheet', name);
  for (const [k, v] of Object.entries(params)) r.query.set(k, v);
  history.pushState({ depth: depth() + 1 }, '', '#' + r.path + '?' + r.query.toString());
  emit(false);
}

export function closeSheet(): void {
  const r = parse();
  if (!r.query.get('sheet')) return;
  if (depth() > 0) { history.back(); return; }
  r.query.delete('sheet');
  r.query.delete('date');
  const q = r.query.toString();
  history.replaceState({ depth: 0 }, '', '#' + r.path + (q ? '?' + q : ''));
  emit(false);
}

export type Tab = 'accueil' | 'calendrier' | 'seances' | 'progression' | 'coach' | 'none';
export function tabOf(path: string): Tab {
  const p = path.split('/')[1];
  if (p === 'accueil' || p === 'calendrier' || p === 'seances' || p === 'progression' || p === 'coach') return p;
  return 'none';
}

// Retour dans l'application après plus de 15 minutes en arrière-plan : comme une nouvelle ouverture, on revient à l'Accueil.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000 && current.path !== HOME && !/\/(editer|saisie)/.test(current.path)) {
    history.replaceState({ depth: 0 }, '', '#' + HOME);
    emit(true);
  }
  hiddenAt = 0;
});
