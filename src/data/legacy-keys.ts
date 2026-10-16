// Reprise des réglages enregistrés sous l'ancien nom de l'app (clés « ironapp:… »). Copie sans rien supprimer.
// À importer en tout premier (avant le thème et la langue, qui lisent leur clé au chargement).
const OLD = 'ironapp:';
const NEW = 'quadra:';
try {
  for (const k of ['theme', 'lang', 'withOther', 'prefs']) {
    const v = localStorage.getItem(OLD + k);
    if (v !== null && localStorage.getItem(NEW + k) === null) localStorage.setItem(NEW + k, v);
  }
} catch { /* stockage indisponible : rien à reprendre */ }
export {};
