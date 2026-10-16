// Identifiants. Les séances et blocs de périodisation créés dans l'app ont un identifiant NUMÉRIQUE :
// leur clé d'échange coach reste donc `session:<chiffres>` / `phase:<chiffres>`, exactement comme dans
// la version Android (règle du document coach-context-quadra-1.md, inchangée). Les identifiants
// repris de l'ancienne base (1, 2, 482…) sont conservés tels quels : les clés déjà connues du coach
// restent valides après la migration.
let last = 0;
export function newId(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (n <= last) n = last + 1;
  last = n;
  return String(n);
}

/** FNV-1a 32 bits (empreinte des saisies manuelles et des fichiers coach, comme avant). */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function nowIso(): string {
  return new Date().toISOString();
}
