# GUIDE DE REPRISE — refaire ou reprendre Apogée de zéro

**Version** 1.1 — 17 octobre 2026
But : si le code, le dépôt ou un compte était perdu, ce guide permet de **tout reconstruire** en suivant les
étapes dans l'ordre, sans rien deviner. Il complète `PRD.md` (produit), `SPECS-TECH.md` (architecture exacte) et
`ETAT.md` (où on en est).

---

## 0. Où est quoi (inventaire)

| Élément | Où | Remarque |
|---|---|---|
| Code source | GitHub `mathieuoury34-gif/apogee` (public), branche `main` ; une copie complète est livrée en archive `.zip` avec ce dossier | L'ancienne adresse `.../ironapp` redirige |
| Site | https://mathieuoury34-gif.github.io/apogee/ | GitHub Pages, source « GitHub Actions » |
| APK | https://github.com/mathieuoury34-gif/apogee/releases/tag/apk → `apogee.apk` | reconstruit à chaque envoi sur `main` |
| Données | Firestore, projet **`apogee-d171c`** (Europe `eur3`), chemins `users/{uid}/iron_*` ; copie locale IndexedDB `apogee` sur chaque appareil | |
| Connexion | Compte Google de Mathieu | seul utilisateur |
| Clé de signature APK | `android-shell/keystore/apogee-debug.keystore` (dans le dépôt, mots de passe `android`, alias `androiddebugkey`) | à **ne jamais changer** : sinon les mises à jour ne s'installent plus par-dessus |
| Projet Claude | « Apogée » : `PRD.md`, `SPECS-TECH.md`, `ETAT.md`, `GUIDE-REPRISE.md`, `HISTORIQUE-RN.md`, `claude/BRIEF-DESIGN.md` | |
| Projet Claude « coach » | séparé ; contient `docs/coach-context-apogee-1.md` | |
| Ancienne app (React Native) | archivée dans `HISTORIQUE-RN.md` (texte) ; code dans l'archive locale `docs/historique/ancienne-app.zip` sur l'ordinateur de Mathieu (absente de GitHub) | |
| Dossier de l'ordinateur | dossier de travail de Mathieu (nommé `Iron App`, puis `Perso\Quadra`, à renommer `Perso\Apogee` — non confirmé) | copie du dépôt |
| Ancien Firebase | `ironapp-99f99` — à supprimer vers le 23/10/2026 | |

**Ordre de priorité si tout est perdu** : (1) données = Firestore ou un fichier `.json` de sauvegarde ; (2) code =
GitHub ou l'archive `.zip` ; (3) le reste se reconstruit avec ce guide.

## 1. Sauvegardes à garder (et comment les refaire)

1. **Sauvegarde des données** : Paramètres › Données › *Exporter une sauvegarde (.json)* → `apogee-sauvegarde-<date>.json`
   (format `apogee-backup/1`, relisible par Paramètres › Données › *Restaurer ou compléter*).
2. **Classeur Excel** (lecture humaine) : Paramètres › Données › *Exporter en Excel*.
3. **Dossier coach** : onglet Coach › Exporter (contient séances et plan).
4. **Code** : l'archive `.zip` livrée + le dépôt GitHub (clone : `git clone https://github.com/mathieuoury34-gif/apogee`).
5. **Ces documents** : dans le projet Claude « Apogée » ET dans le dépôt (`docs/`).

## 2. Reconstruire le dépôt et le site (≈ 15 min)

1. Créer un compte GitHub (ou réutiliser `mathieuoury34-gif`) ; créer un dépôt **public** `apogee`.
2. Décompresser l'archive, envoyer tout le contenu sur la branche `main`. Le workflow doit être à
   `.github/workflows/publier.yml` (copie dans `github-workflows/publier.yml` : l'interface web de GitHub ignore les
   dossiers commençant par un point — créer le fichier à la main si besoin).
3. **Settings › Pages › Source : GitHub Actions**.
4. Onglet **Actions** : le workflow « Publier » enchaîne tests → types → build → mise en ligne → APK. Il doit finir
   **vert**. Le site apparaît sur `https://<compte>.github.io/<dépôt>/`.
5. Si le dépôt change de nom : l'adresse du site, `SITE_URL` (calculé automatiquement par la CI) et l'APK changent
   ensemble ; il faut **republier l'APK** (le nouveau charge la nouvelle adresse), puis ajouter le nouveau domaine dans
   Firebase › Authentication › Domaines autorisés si le compte GitHub change.

Poste de travail : Node 22. `npm install`, `npm test` (29 tests), `npm run typecheck`, `npm run build`,
`npm run dev` (http://127.0.0.1:5173).

## 3. Reconstruire Firebase (≈ 20 min, gratuit, sans carte bancaire)

1. https://console.firebase.google.com › **Ajouter un projet** › nom `apogee` (Analytics : non). L'identifiant
   généré (`apogee-xxxxx`) ne peut pas être changé.
2. **Build › Authentication › Commencer › Google** : activer, adresse d'assistance = celle de Mathieu.
3. **Authentication › Settings › Domaines autorisés** : ajouter `mathieuoury34-gif.github.io` (et `localhost` pour le
   développement local si besoin).
4. **Build › Firestore Database › Créer** : emplacement **eur3 (Europe)**, **mode production**.
5. Onglet **Règles** : coller `firestore.rules` (chaque compte ne lit et n'écrit que `users/{son uid}/…`), **Publier**.
6. **Paramètres du projet › Vos applications › Web `</>`** : surnom `Apogée`, sans Hosting → copier les six valeurs
   (`apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId`) dans `src/data/firebase-config.ts`.
   Ces valeurs ne sont pas secrètes.
7. Envoyer sur GitHub ; le site republié propose « Continuer avec Google ».
8. **Récupérer les données** : se connecter sur l'appareil qui a les données les plus complètes (elles montent vers le
   nouveau projet), puis sur les autres (fusion, la version la plus récente gagne). Si aucun appareil n'a les données :
   Paramètres › Données › *Restaurer ou compléter (.json)* avec la dernière sauvegarde, puis se connecter.
9. Guide détaillé d'une migration de projet : `docs/migration-firebase-apogee.md`.

Tant que `firebase-config.ts` a un `apiKey` vide, l'app fonctionne 100 % en local (aucune synchronisation).

## 4. Reconstruire l'APK Android

Rien à installer en local : **la CI construit l'APK** (Java 21, SDK Android déjà présent sur le runner).
Étapes de la CI (reproductibles à la main dans `android-shell/`) :

```
npm install
SITE_URL=https://<compte>.github.io/<dépôt>/ npm run configure   # capacitor.config.json
npx cap add android                                                # crée android/ (non versionné)
npm run patch                                                      # permissions, Kotlin, plugin, keystore, icônes, splash
npx cap sync android
cd android && ./gradlew assembleDebug                              # app/build/outputs/apk/debug/app-debug.apk
```

Installation sur le téléphone : télécharger `apogee.apk` depuis la release `apk`, autoriser l'installation depuis le
navigateur, ouvrir. Une nouvelle version s'installe **par-dessus** (même clé de signature). Puis :
1. Paramètres › Compte → *Continuer avec Google* (la page s'ouvre dans le navigateur du téléphone, puis renvoie vers
   l'app par `apogee://auth`).
2. Paramètres › Montre → *Accorder les autorisations* en cochant **Historique** (1ʳᵉ lecture : 400 jours).
3. Si la carte Montre dit « web » : ce n'est pas l'APK mais l'app installée depuis Chrome (désinstaller cette dernière).
4. Autoriser les notifications pour les rappels.

Réinstaller l'APK n'est nécessaire que si le module natif, les permissions, les icônes ou l'écran de lancement changent.
Après une réinstallation qui ajoute une donnée lue, rouvrir Paramètres › Montre › *Autoriser Health Connect* pour
accorder les nouvelles autorisations.

## 5. Icônes, logo, captures, démonstration

- **Logo** : trois lunes qui montent en diagonale ; encre `#16181B`, lunes `#ECE8E0`, pleine lune `#F0A61E` (clair :
  `#9A6B12`). Source des SVG : `tools/icons.py` (rendu par Chromium/Playwright). Régénérer : `pip install playwright`
  puis `python3 tools/icons.py` → écrit `public/icons/*` (favicon-32, apple-touch-icon, icon-192/512, maskable-192/512) et
  `android-shell/res/*` (lanceur `ic_launcher`, rond, premier plan adaptatif `ic_launcher_foreground`, icône de notification `ic_stat_apogee`). L'épaisseur du trait augmente quand l'icône rapetisse.
- **Jeu de démonstration** (jamais publié) : `npm run demo` écrit `tools/demo.json` (17 semaines fictives, graine 42).
  `tools/shots.py <url> <préfixe> <routes> [l h] [light|dark] [vide]` prend des captures Playwright.
- **Polices** : Montserrat 500/600/700, Open Sans 400/600/700, Cormorant Garamond 600 — `public/fonts/*.woff2`
  (sous-ensemble latin, depuis Fontsource) ; déclarées dans `index.html`.

## 6. Ordre conseillé pour RÉÉCRIRE l'application (si le code est perdu)

Chaque étape est testable seule. Les constantes sont dans `SPECS-TECH.md` §5.

1. **Domaine pur** (`src/domain/`) : types (15 collections, vocabulaire de blocs) → dates (jour civil local avec
   décalage de la montre) → `hr.ts` (nettoyage, TRIMP, dérive, pic soutenu) → `load.ts` (FC max, repos, charge, Banister)
   → `form.ts` → `blocks.ts` (estimation) → `links.ts` → `review.ts` → `stats.ts`, `objective.ts` → `engine.ts`
   (`derive`) → analyses (`zones`, `compliance`, `forecast`, `records`, `body`,
   `loadByDiscipline`, `summary`) → `fit.ts`. Écrire les 29 tests au fur et à mesure (liste dans `SPECS-TECH.md` §12).
2. **Données** : `idb.ts` → `store.ts` (`commit`, `dirty`) → `actions.ts` (avec `Snapshot`/annuler) → `backup.ts` →
   `sync.ts` (Firestore) → `dedupe.ts`.
3. **Échanges** : `coach.ts` (export/import `apogee/1`, voir `docs/coach-context-apogee-1.md`), `manual.ts`,
   `health.ts`, `dossier.ts`, `sqlite.ts` + `legacy.ts` (reprise de l'ancienne base), Excel.
4. **Interface** : jetons (`tokens.css`) → composants (`kit.tsx`, `charts.tsx`, `icons.tsx`) → routeur par hash →
   écrans dans l'ordre Accueil, Calendrier + Éditeur, Séances, Progression, Coach, Paramètres, Aide.
5. **Plateforme** : build esbuild, service worker, écran de démarrage (`index.html`), CI, puis coque Android.
6. **Reprise des données** : sauvegarde `.json` ou connexion Google.

Principes à ne pas perdre : rien de calculé n'est stocké ; la version la plus récente gagne ; une suppression laisse
une pierre tombale ; aucun nombre sans sa méthode ; l'app n'écrit jamais dans Health Connect ; l'import coach
n'écrit jamais en aveugle ; le vocabulaire de blocs est figé.

## 7. Réglages de référence (à ressaisir si on repart d'une base vide)

Ces valeurs sont **dans les données** (donc restaurées par la sauvegarde / Google) ; les noter ici évite de les perdre
si tout est vide. À vérifier dans l'app, elles évoluent :

- Course : half Ironman d'Aix-en-Provence, 23/05/2027, 1,9 km / 90 km / 21,1 km ; chrono cible 5h45 (hypothèse).
- Zones : saisies avec leur source (test / estimation / manuel) dans Progression › Zones ; FC max déclarée > Tanaka.
- Disponibilités et matériel : Paramètres › Athlète › Profil.
- Plan en cours : importé depuis le projet Claude de coaching (clés `session:<n>`).

## 8. Vérifications après une reconstruction

- [ ] Actions : workflow vert ; site accessible ; release `apk` contient `apogee.apk`.
- [ ] Site : l'écran de démarrage s'anime puis l'Accueil s'affiche ; thème clair/sombre ; langue FR/EN.
- [ ] Connexion Google OK (web et APK) ; les séances apparaissent identiques sur PC et téléphone.
- [ ] APK : carte Montre = « disponible », lecture OK, notifications autorisées.
- [ ] Import de la sauvegarde `.json` redonne le même nombre de séances ; export coach puis réimport d'un plan test OK.
- [ ] `npm test` (29) et `npm run typecheck` verts.
