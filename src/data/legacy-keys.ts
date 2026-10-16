// Reprise des réglages enregistrés sous les anciens noms de l'app (clés « quadra:… » puis « ironapp:… »). Copie sans rien supprimer.
// À importer en tout premier (avant le thème et la langue, qui lisent leur clé au chargement).
const NEW = 'apogee:';
try {
  for (const k of ['theme', 'lang', 'withOther', 'prefs']) {
    if (localStorage.getItem(NEW + k) !== null) continue;
    for (const old of ['quadra:', 'ironapp:']) {
      const v = localStorage.getItem(old + k);
      if (v !== null) { localStorage.setItem(NEW + k, v); break; }
    }
  }
} catch { /* stockage indisponible : rien à reprendre */ }
export {};
