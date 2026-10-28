// Thème de l'interface : clair, sombre ou celui du système. Préférence propre à l'appareil,
// appliquée sans recharger (attribut data-theme sur <html>, couleurs dans styles/tokens.css).
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'apogee:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = typeof window === 'undefined' ? 'system' : read();
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function themePref(): ThemePref {
  return pref;
}

export function resolvedTheme(): 'light' | 'dark' {
  return pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  refreshThemeColor();
  listeners.forEach((l) => l());
}

/** Couleur de la barre d'état : le fond sombre de l'écran de démarrage tant qu'il est visible (pas de barre claire dessus), ensuite celle du thème. */
export function refreshThemeColor(): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const s = document.getElementById('splash');
  const splashing = !!s && !s.classList.contains('out');
  meta.setAttribute('content', splashing ? '#16181B'
    : getComputedStyle(document.documentElement).getPropertyValue('--bg-surface-minimal').trim() || (resolvedTheme() === 'dark' ? '#0E1215' : '#F2F0EA'));
}

export function setThemePref(p: ThemePref): void {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch { /* stockage indisponible */ }
  apply();
}

/** Notifié quand le thème affiché change (choix de l'utilisateur ou réglage du système). */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply(); });
apply();

// appelée par index.html dès que l'écran de démarrage se retire
if (typeof window !== 'undefined') (window as unknown as { apogeeThemeColor?: () => void }).apogeeThemeColor = refreshThemeColor;
