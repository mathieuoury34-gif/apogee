// Langue de l'interface : français (texte source) ou anglais (dictionnaire EN, clé = texte français),
// sur le modèle de PEAnalyze. Préférence propre à l'appareil ; changer de langue recharge l'application.
// Les données (titres de séances, notes, plan du coach) ne sont jamais traduites, ni le contrat quadra/1,
// ni le classeur Excel exporté.
import { EN } from './i18n-en';

export type Lang = 'fr' | 'en';
const KEY = 'quadra:lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
    return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export const lang: Lang = typeof window === 'undefined' ? 'fr' : detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* stockage indisponible */ }
  location.reload();
}

/** Traduit un texte de l'interface ; {nom} est remplacé par vars.nom. */
export function $t(fr: string, vars?: Record<string, unknown>): string {
  let s = lang === 'en' ? EN[fr] ?? fr : fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  return s;
}
