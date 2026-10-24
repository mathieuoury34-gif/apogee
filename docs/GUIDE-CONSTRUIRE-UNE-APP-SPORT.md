# Guide : construire une application personnelle de suivi sportif (course, natation, musculation)

> **À l'attention de Claude (et de la personne qui te donne ce fichier).**
> Ce document est le retour d'expérience complet d'**Apogée**, une application personnelle de suivi d'entraînement
> construite en quelques semaines, en binôme : un humain qui porte le produit et valide sur son téléphone, et Claude qui
> écrit tout le code. Apogée est volontairement un projet à **0 € de coût récurrent**, sans serveur à maintenir, qui
> fonctionne sur PC, iPhone et Android, hors ligne, avec synchronisation entre appareils.
>
> Ce guide ne décrit **pas les fonctionnalités** (c'est le rôle du cahier des charges de la personne). Il décrit **la
> direction technique à prendre** : architecture, comptes à créer (GitHub, Firebase, Google), façon de coder, charte
> graphique, pièges rencontrés. Utilise-le comme point de départ, pas comme un cahier des charges à copier : la
> section 14 liste ce qu'il vaut mieux **ne pas** reproduire dans une première version.
>
> Les noms propres d'Apogée (nom, identifiants, couleurs) sont des exemples : remplace-les.

---

## Table des matières

1. [Le principe en une page](#1-le-principe-en-une-page)
2. [Pile technique et pourquoi ces choix](#2-pile-technique-et-pourquoi-ces-choix)
3. [Architecture et arborescence](#3-architecture-et-arborescence)
4. [Principes de conception (à respecter dès le premier jour)](#4-principes-de-conception)
5. [Modèle de données et stockage local](#5-modèle-de-données-et-stockage-local)
6. [Comptes à créer : GitHub, Firebase, Google](#6-comptes-à-créer--github-firebase-google)
7. [Synchronisation et connexion Google](#7-synchronisation-et-connexion-google)
8. [Publication : GitHub Pages et intégration continue](#8-publication--github-pages-et-intégration-continue)
9. [Application web installable (PWA) et démarrage](#9-application-web-installable-pwa-et-démarrage)
10. [Android : coque Capacitor et lecture de la montre (Health Connect)](#10-android--coque-capacitor-et-lecture-de-la-montre-health-connect)
11. [Interface et charte graphique](#11-interface-et-charte-graphique)
12. [Langues, tests, aide intégrée](#12-langues-tests-aide-intégrée)
13. [Façon de travailler avec Claude](#13-façon-de-travailler-avec-claude)
14. [Ce qu'il ne faut PAS reproduire en version 1](#14-ce-quil-ne-faut-pas-reproduire-en-version-1)
15. [Ordre de construction conseillé](#15-ordre-de-construction-conseillé)
16. [Pièges rencontrés (liste à relire avant de coder)](#16-pièges-rencontrés)
17. [Premier message à donner à Claude](#17-premier-message-à-donner-à-claude)

---

## 1. Le principe en une page

- **Une seule application web** (HTML + JavaScript, React), publiée gratuitement sur **GitHub Pages**. Elle est
  installable sur PC, iPhone et Android (PWA) et fonctionne hors ligne.
- **Un APK Android** (optionnel) : une coque **Capacitor** qui affiche le site publié et ajoute ce que le web ne sait
  pas faire : lire les séances de la montre via **Health Connect**, envoyer des notifications locales, partager des
  fichiers. Le code de l'interface n'est pas dupliqué : mettre le site à jour met l'APK à jour.
- **Les données restent d'abord sur l'appareil** (IndexedDB). Une synchronisation **Firebase** (connexion Google +
  base Firestore, offre gratuite Spark) les recopie entre appareils. Sans configuration Firebase, l'app marche 100 % en
  local.
- **Rien de ce qui se calcule n'est stocké.** On enregistre des faits (séances, ressentis, réglages) ; charges, bilans,
  courbes sont recalculés à chaque affichage par des fonctions pures et testées.
- **Un compte, un propriétaire.** Chaque compte Google ne lit et n'écrit que ses propres données (règles Firestore).
  C'est une application **personnelle**, pas un service multi-utilisateurs : cela simplifie énormément (pas de serveur,
  pas de modération, pas de RGPD à gérer pour des tiers, pas de paiement).
- **Coût : 0 €.** GitHub Pages + GitHub Actions (dépôt public) + Firebase Spark. Aucun secret dans le dépôt.

```
┌───────────────────────────── Appareil (PC / iPhone / Android) ─────────────────────────────┐
│  Interface React  ──►  Store en mémoire  ◄──►  IndexedDB (copie locale, hors ligne)        │
│       │                     │ (dirty)                                                      │
│       │                     ▼                                                              │
│       │              Synchronisation ◄──────► Firestore (users/{uid}/…) ◄── Auth Google   │
│       ▼                                                                                    │
│  Fonctions de calcul pures (domain/)   ·   Pont natif (APK uniquement) ─► Health Connect   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
        Code publié par GitHub Actions ─► GitHub Pages (site)   +   Release « apk » (APK)
```

---

## 2. Pile technique et pourquoi ces choix

| Choix | Raison |
|---|---|
| **TypeScript strict** | Le modèle de données est riche ; le compilateur attrape des erreurs que personne ne verrait avant de les avoir sur le téléphone. |
| **React 19, sans bibliothèque d'état** | Un petit store maison + `useSyncExternalStore` suffit. Moins de dépendances = moins de pannes à comprendre. |
| **esbuild** (script `scripts/build.mjs`) | Construction en une seconde, pas de configuration lourde. Découpage en modules (`splitting`), cibles `es2020 chrome90 safari15`. |
| **Aucune bibliothèque de graphiques** | Les graphiques sont des SVG écrits à la main (`ui/charts.tsx`) : taille nulle, contrôle total, rendu identique clair/sombre. |
| **PWA + service worker** | Installable, démarrage instantané, hors ligne. |
| **Capacitor 7 pour Android** | Réutilise l'application web telle quelle ; on ajoute un seul module natif Kotlin (Health Connect). Pas de React Native, pas de second code à maintenir. |
| **IndexedDB** | Stockage local fiable, volumineux (les courbes de fréquence cardiaque pèsent ≈ 5 Ko par séance). `localStorage` seulement pour les petites préférences d'appareil. |
| **Firebase Auth (Google) + Firestore** | Pas de serveur à écrire. Hors ligne et temps réel intégrés. Gratuit pour un usage personnel. |
| **GitHub Pages + Actions** | Hébergement, tests et construction de l'APK gratuits, déclenchés à chaque envoi sur `main`. |
| **Tests Node natifs** (`node --test` + `tsx`) | Pas de framework de test à installer. Les calculs sont des fonctions pures, donc faciles à tester. |

Dépendances d'exécution d'Apogée : **trois** (`react`, `react-dom`, `jszip` pour un export Excel facultatif).
Dépendances de développement : `esbuild`, `tsx`, `typescript`. Garde cet esprit : chaque dépendance ajoutée est un
risque de plus.

Le SDK Firebase n'est **pas** dans le bundle : il est chargé à l'exécution depuis
`https://www.gstatic.com/firebasejs/<version>/…` (import dynamique), ce qui garde le bundle léger et permet de
démarrer l'application sans attendre Firebase.

---

## 3. Architecture et arborescence

```
index.html                  écran de démarrage écrit directement dans la page, polices, CSS critique, chargeur d'app.js
public/                     manifest.webmanifest, auth.html (page de connexion pour l'APK), icons/, fonts/
scripts/build.mjs           construction esbuild → dist/, préchargement des modules, service worker
src/main.tsx                point d'entrée : charge le store, lance la synchronisation
src/App.tsx                 routes, barre d'onglets (mobile) / barre latérale (ordinateur), feuilles
src/auth.ts                 script de la page de connexion de l'APK
src/i18n.ts, i18n-en.ts     traduction : $t("texte français") → anglais via un dictionnaire
src/theme.ts                thème clair / sombre / système
src/sw.template.js          service worker (version et liste de fichiers injectées au build)
src/styles/                 tokens.css (jetons de design), app.css
src/domain/                 CALCULS PURS : types, dates, charge, bilans, formats d'échange… sans aucune interface
src/data/                   store, idb (IndexedDB), sync (Firebase), actions (écritures + « Annuler »), backup, firebase-config
src/native/                 pont Capacitor : Health Connect, notifications, fichiers
src/screens/                un fichier par écran
src/ui/                     composants partagés, graphiques SVG, icônes, routeur par hash
tests/                      tests des fonctions de domain/
tools/                      jeu de données fictif, génération d'icônes, captures d'écran (jamais publiés)
android-shell/              configuration Capacitor, script de « patch » Android, module Kotlin, icônes, keystore
firestore.rules             règles de sécurité Firestore
.github/workflows/publier.yml   intégration continue (copie dans github-workflows/ pour la reconstruire à la main)
docs/                       cahier des charges, spécifications techniques, état d'avancement
```

**Règle de dépendances (à faire respecter)** : `domain/` n'importe rien d'autre que lui-même (ni React, ni le
navigateur, ni Firebase). `data/` importe `domain/`. `screens/` et `ui/` importent `data/` et `domain/`. Jamais
l'inverse. C'est ce qui rend les tests simples et le code calculable en CI sans navigateur.

**Une règle partagée entre deux écrans a un seul fichier d'origine.** Aucune logique dupliquée dans les écrans.

Taille d'Apogée complet : ≈ 4 000 lignes de domaine/données/natif + ≈ 4 900 lignes d'écrans et d'interface.

---

## 4. Principes de conception

Ces principes ont évité la plupart des bugs graves. Ils sont gratuits à appliquer au début, coûteux à rétrofiter.

1. **Rien de calculé n'est stocké.** Charge d'entraînement, totaux, records, courbes : toujours recalculés depuis les
   faits. Conséquence : on peut corriger une formule et tout l'historique se met à jour, sans migration.
2. **Une suppression est une « pierre tombale ».** On ne détruit pas un enregistrement : on le remplace par
   `{id, updatedAt, deleted: true}`, sinon la suppression ne se propage pas aux autres appareils.
3. **La version la plus récente gagne** (comparaison de `updatedAt`). Simple, prévisible, suffisant pour un seul
   utilisateur. Un enregistrement modifié localement et pas encore envoyé ne doit jamais être écrasé par un document
   distant plus ancien ou égal.
4. **Un enregistrement = un document Firestore** (limite d'1 Mo par document : ne jamais stocker « toute la collection
   dans un document »).
5. **Unités SI partout** dans les données (mètres, secondes, mètres par seconde, watts, battements par minute,
   joules). On convertit à l'**affichage seulement** (km, min/km, kcal…).
6. **Dates : instants en ISO 8601 UTC** (`startAt`) ; **jours civils en `AAAA-MM-JJ` locaux**. Le jour d'une séance
   dépend du fuseau où elle a eu lieu (stocker le décalage horaire de la séance), pas de celui du téléphone au moment
   de l'affichage. N'écris jamais une date en dur dans l'interface.
7. **Identifiants d'import stables** : une séance venue de la montre garde l'identifiant de la montre
   (`sourceId`), immuable. C'est la clé de **déduplication** (la même séance peut arriver deux fois).
8. **Ne jamais écraser une saisie humaine.** Si l'utilisateur corrige une valeur importée (durée, distance, FC),
   marquer le champ comme « édité » et ne plus le réécrire lors des imports suivants. Idem pour une valeur supprimée à
   la main (ne pas la ré-importer).
9. **Aucun nombre sans sa méthode.** Chaque indicateur affiché a un texte d'explication (comment c'est calculé, avec
   quelles limites). Si une donnée manque, on le dit plutôt que d'afficher une valeur inventée.
10. **Lecture seule vers la montre.** L'app ne doit jamais écrire dans Health Connect.
11. **Toutes les écritures de l'interface passent par un seul fichier** (`data/actions.ts`) : un seul endroit pour
    l'horodatage, la propagation cloud et l'**annulation** (le bandeau « Annuler » après une suppression).
12. **Fonctions pures + tests** pour tout calcul. Les écrans ne calculent presque rien.
13. **Le démarrage ne dépend jamais du réseau.** L'écran s'affiche et fonctionne même si Firebase est lent ou absent.

Schéma du store (esquisse, ≈ 100 lignes dans Apogée) :

```ts
// commit() : lot atomique d'écritures. Un seul chemin pour modifier les données.
commit((tx) => {
  tx.put('actual', session);        // horodate (updatedAt = maintenant), écrit dans IndexedDB, marque « sale »
  tx.remove('planned', plannedId);  // écrit une pierre tombale
}, 'local');                        // 'remote' pour ce qui vient du cloud : garde l'horodatage reçu, ne marque rien

// lecture dans l'interface :
const data = useData();             // useSyncExternalStore(subscribe, getData)
const { d } = useCalc();            // données dérivées, mises en cache par (data, jour)
```

---

## 5. Modèle de données et stockage local

### 5.1 Forme générale

Une seule source de vérité en mémoire, `AppData`, un objet de **collections** indexées par identifiant. Tout
enregistrement : `{ id: string, updatedAt: ISO, deleted?: true, … }`. Exemple de collections pour une application
course / natation / musculation (à adapter) :

| Collection | Contenu |
|---|---|
| `athlete` | profil : nom, date de naissance, sexe (si utile aux formules), blessures éventuelles |
| `actual` | séance réalisée : source (montre ou saisie manuelle), discipline, début/fin, décalage horaire, durée, distance, FC moyenne/max, calories, dénivelé, ressenti (RPE 1–10), commentaire, champs corrigés à la main |
| `series` | courbes brutes d'une séance (FC, vitesse) — **même identifiant que la séance**, stockées à part car volumineuses |
| `planned` | séances prévues (si l'app a un plan) : date, discipline, titre, notes, blocs |
| `zones` | références chiffrées de l'athlète (FC max, allure/vitesse de référence, etc.), **historisées** avec leur source (test / estimation / manuel) |
| `sleep`, `resting`, `weight` | santé au quotidien (facultatif) ; une valeur saisie à la main n'est jamais écrasée |
| `templates` | séances types, semaines types (facultatif) |

Identifiants créés dans l'app : numériques et strictement croissants (`Date.now()*1000 + aléa`). Empreintes
déterministes (FNV-1a 32 bits) pour les saisies manuelles : une même saisie importée deux fois ne crée pas de doublon.

### 5.2 IndexedDB

Base `monapp`, deux stores : `records` (clé `collection/id`) et `meta` (file d'envoi « dirty », curseurs). La file
d'envoi est persistée, pour ne rien perdre si l'application est fermée avant la synchronisation.

### 5.3 Sauvegarde

Prévoir dès la v1 un export/import `.json` (`{ format: 'monapp-backup/1', exportedAt, data }`) **avec un test
aller-retour exact** (export → restauration = mêmes données, collection par collection). C'est la ceinture de sécurité
la plus précieuse : elle a servi lors d'une migration de projet Firebase et de plusieurs renommages.

### 5.4 Renommer sans rien perdre

Apogée a changé de nom trois fois. Règle apprise : au premier lancement, la nouvelle base IndexedDB **recopie** les
anciennes sans les supprimer ; les anciennes clés `localStorage` sont recopiées vers les nouvelles ; les anciens noms de
formats de fichiers restent acceptés ; la **clé de signature de l'APK ne change jamais**. Choisis ton nom
définitivement avant de publier si possible.

---

## 6. Comptes à créer : GitHub, Firebase, Google

Tout est gratuit, sans carte bancaire. Compte une heure au total. À faire **par la personne**, Claude ne peut pas créer
de compte à sa place.

### 6.1 GitHub

1. Créer (ou réutiliser) un compte GitHub.
2. Créer un dépôt **public** (nom court, sans espace, par ex. `monapp`). Public = Actions et Pages gratuits sans limite
   gênante ; **rien de secret ne doit donc y figurer** (voir 6.3).
3. Envoyer le code sur la branche `main`.
4. **Settings › Pages › Source : « GitHub Actions »** (et non « Deploy from a branch »).
5. Le workflow de publication doit être dans `.github/workflows/publier.yml`. **L'interface web de GitHub ignore les
   dossiers commençant par un point** : si tu envoies les fichiers par glisser-déposer, crée ce fichier à la main
   (Add file › Create new file, en tapant le chemin complet). D'où la copie gardée dans `github-workflows/`.
6. L'adresse du site sera `https://<compte>.github.io/<dépôt>/`.
7. **Si le dépôt est renommé** : l'adresse du site change, donc `SITE_URL` (calculée par la CI), l'APK (qui charge
   cette adresse) et le domaine autorisé dans Firebase changent ensemble. Il faut republier l'APK.
8. La CI publie l'APK dans une **release de tag fixe `apk`** (`.../releases/tag/apk`) : le lien de téléchargement reste
   toujours le même.

### 6.2 Firebase (offre Spark, gratuite)

1. https://console.firebase.google.com › **Ajouter un projet** (nom libre ; l'**identifiant** généré, du type
   `monapp-ab12c`, ne peut plus être changé — choisis le nom avec soin). Google Analytics : **non**.
2. **Build › Authentication › Commencer › Google** : activer, renseigner une adresse d'assistance.
3. **Authentication › Settings › Domaines autorisés** : ajouter `<compte>.github.io` (et `localhost` pour le
   développement local).
4. **Build › Firestore Database › Créer** : emplacement **Europe (eur3)** si les données sont personnelles et que tu es
   en Europe ; **mode production**.
5. Onglet **Règles** : coller ceci, puis **Publier** :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

6. **Paramètres du projet › Vos applications › Web `</>`** : donner un surnom, **ne pas cocher Hosting**. On obtient un
   bloc `firebaseConfig` avec six valeurs (`apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId`).
   Les copier dans `src/data/firebase-config.ts`.

Quotas gratuits Spark (à vérifier sur la page de tarification Firebase, ils peuvent évoluer) : de l'ordre de
50 000 lectures et 20 000 écritures par jour et 1 Go de stockage — très largement suffisant pour une personne, à
condition de **ne pas** réécrire toute la base à chaque changement (on n'envoie que les enregistrements « sales », par
lots de 400).

### 6.3 Ce qui est secret et ce qui ne l'est pas

- La configuration Firebase **web** (`apiKey`, etc.) **n'est pas secrète** : elle est visible dans tout site Firebase.
  La protection vient des **règles Firestore** (6.2 étape 5). Ne jamais laisser Firestore en mode test / règles
  ouvertes.
- Ne mets **jamais** dans le dépôt : mots de passe, clés de compte de service, jetons personnels, fichiers `.env` avec
  des secrets. Tout ce que la CI utilise est public ou fourni par GitHub automatiquement (`GITHUB_TOKEN`).
- Tant que `apiKey` est vide dans `firebase-config.ts`, l'application reste **100 % locale** : bon mode de départ pour
  développer sans compte Firebase.

### 6.4 Google (connexion)

Aucune console Google Cloud à configurer à la main : activer le fournisseur « Google » dans Firebase Authentication
suffit (Firebase crée le client OAuth). Seul l'écran de consentement affichera le nom du projet Firebase.

---

## 7. Synchronisation et connexion Google

### 7.1 Schéma Firestore

Chemin : `users/{uid}/{préfixe}_{collection}/{id}` = `{ data: JSON.stringify(enregistrement), updatedAt, deleted }`.
On stocke l'enregistrement **sérialisé** dans un champ : pas de schéma Firestore à maintenir, pas de problème avec les
champs imbriqués ou `undefined`.

### 7.2 Algorithme

- **Envoi** (`push`) : par lots de 400 (`writeBatch`), planifié ~1,2 s après un changement local, relancé à ~5 s en cas
  d'échec. Seuls les enregistrements de l'ensemble `dirty` partent.
- **Écoute** : `onSnapshot` sur chaque collection. Au **premier instantané** de chaque collection, ce qui n'existe que
  localement part vers le cloud (c'est ce qui fait « monter » les données du premier appareil vers un projet
  Firestore vide). Quand toutes les collections ont répondu, l'état passe à « ok ».
- **Fusion** : le `updatedAt` le plus récent gagne ; un distant plus récent n'écrase pas un local « sale » plus récent
  ou égal.
- **Hors ligne** : `persistentLocalCache()` de Firestore (repli sur `getFirestore`).
- **Suppression complète** : tombstones pour tout (`deleteCloud`), par lots de 400.
- **Doublons** : après chaque réception du cloud, un passage de déduplication fusionne les enregistrements ayant le même
  `sourceId` (on garde celui qui contient le plus de saisie humaine).

### 7.3 Connexion sur le web

`signInWithPopup` avec le fournisseur Google (`prompt: select_account`), **repli `signInWithRedirect`** si la fenêtre
est bloquée. L'application s'affiche et marche **avant** que la connexion soit terminée.

### 7.4 Connexion dans l'APK (point délicat)

**Google refuse la connexion depuis une WebView intégrée** (erreur `disallowed_useragent`). Solution retenue :

1. Dans l'APK, `signIn()` ouvre `auth.html?app=1&lang=fr` dans le **navigateur du téléphone** (plugin Capacitor
   `Browser`).
2. Cette page (`public/auth.html` + `src/auth.ts`) charge le SDK Firebase, fait `signInWithPopup`, puis récupère le
   jeton Google (`GoogleAuthProvider.credentialFromResult`).
3. Elle renvoie les jetons à l'application par un **lien profond** : `monapp://auth#id_token=…&access_token=…`
   (déclaré dans le manifeste Android par le script de patch).
4. L'application (écoute `appUrlOpen` + `getLaunchUrl`) appelle `signInWithCredential(...)` et ouvre la même session
   Firebase. Elle ferme le navigateur.

`auth.html` ne doit **jamais** être mis en cache par le service worker.

---

## 8. Publication : GitHub Pages et intégration continue

Un seul workflow, déclenché à chaque envoi sur `main` (et manuellement), avec `concurrency` pour annuler les
exécutions en double :

```yaml
name: Publier
on:
  push: { branches: [main] }
  workflow_dispatch:
concurrency: { group: publier, cancel-in-progress: true }

jobs:
  web:
    runs-on: ubuntu-latest
    permissions: { contents: read, pages: write, id-token: write }
    environment: { name: github-pages, url: ${{ steps.deploy.outputs.page_url }} }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22 }
      - run: npm install --no-audit --no-fund
      - run: npm test            # les calculs sont testés AVANT toute mise en ligne
      - run: npm run typecheck
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deploy
        uses: actions/deploy-pages@v4

  apk:                            # facultatif : seulement si tu fais l'APK
    needs: web
    runs-on: ubuntu-latest
    permissions: { contents: write }
    defaults: { run: { working-directory: android-shell } }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22 }
      - uses: actions/setup-java@v5
        with: { distribution: temurin, java-version: 21 }
      # le SDK Android est DÉJÀ installé sur ubuntu-latest : ne PAS ajouter setup-android (ça casse la construction)
      - run: npm install --no-audit --no-fund
      - name: Adresse de l'app web
        run: |
          OWNER=$(echo "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')
          REPO="${GITHUB_REPOSITORY#*/}"
          echo "SITE_URL=https://$OWNER.github.io/$REPO/" >> "$GITHUB_ENV"
      - run: npm run configure     # écrit capacitor.config.json (server.url = SITE_URL)
      - run: npx cap add android   # crée android/ : jamais versionné, régénéré à chaque fois
      - run: npm run patch         # permissions, plugin Kotlin, keystore, icônes, écran de lancement
      - run: npx cap sync android
      - working-directory: android-shell/android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon
          cp app/build/outputs/apk/debug/app-debug.apk ../../apogee.apk
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: apk
          name: "MonApp — APK Android"
          files: apogee.apk
          make_latest: true
```

Remarques :
- Pas de fichier `package-lock.json` dans Apogée (`npm install` simple) : à ta convenance ; un lockfile rend la CI plus
  reproductible, ajoute-le si tu préfères.
- Le **projet Android n'est pas versionné** : il est recréé à chaque construction par `cap add android` puis modifié par
  un script **idempotent** (`patch-android.mjs`). Cela évite de maintenir des fichiers Gradle générés.
- Le job `web` (tests + types + build) doit être **vert** pour que l'APK soit construit.
- Premier contrôle après un envoi : onglet **Actions** du dépôt. Rouge = rien n'est publié.

---

## 9. Application web installable (PWA) et démarrage

### 9.1 Service worker (`src/sw.template.js`)

- La **version** est un SHA-256 (10 caractères) de tous les fichiers de `dist/` ; la liste de fichiers est injectée par
  le build. Le cache s'appelle `monapp-shell-<version>`.
- **Installation** : `caches.addAll(files.map(f => new Request(f, { cache: 'reload' })))` — **toujours `reload`**. Sans
  cela, le cache HTTP de GitHub Pages (~10 minutes) peut ranger un *ancien* `app.js` avec de *nouveaux* modules : écran
  noir après deux mises en ligne rapprochées (incident réel).
- **Navigations servies depuis le cache** (`caches.match('./')`, sinon réseau) : démarrage immédiat, même hors ligne ;
  la nouvelle version prend la main au lancement suivant.
- Polices et SDK Firebase : cache « stale-while-revalidate ». Firestore : toujours le réseau.
- **Dans l'APK (WebView), le service worker est contourné** : Capacitor doit voir chaque page pour injecter son pont
  natif. Conséquence : l'APK charge le site à distance et n'ouvre pas hors ligne ; la PWA installée, elle, oui.

### 9.2 Chaîne de démarrage (`index.html`)

Objectif : **jamais de page noire ou blanche entre l'icône et l'interface**, animation fluide partout.

1. Premier octet : fond encre + écran de démarrage (logo animé) **écrit dans le HTML** (pas de JavaScript nécessaire).
2. Polices **servies localement** (`public/fonts/*.woff2`, sous-ensemble latin) et préchargées ; la feuille de style est
   chargée de façon non bloquante.
3. Durée d'affichage minimale (1,7 s dans Apogée, à régler) ; l'écran de démarrage disparaît quand l'application a
   dessiné **et** que la feuille de style est prête **et** que le minimum est écoulé ; sécurité à 8 s.
4. `app.js` est importé **~800 ms après** le début : sinon le téléchargement et l'exécution du JavaScript occupent le
   fil principal pendant l'animation et la rendent saccadée sur téléphone.
5. `scripts/build.mjs` injecte des `modulepreload` à la place d'un marqueur HTML ; **le build échoue si le marqueur est
   absent** (volontaire : sinon la précharge disparaît sans bruit).
6. Animer **uniquement `transform` et `opacity`** ; jamais de `filter` ni de SVG interne animé. Respecter
   `prefers-reduced-motion`.
7. Côté Android : `Theme.SplashScreen` natif (même fond, même logo) maintenu à l'écran jusqu'à ce que la page appelle
   `hideSplash` (module natif), avec un plafond de ~4 s.

### 9.3 Thème

`light | dark | system`, stocké en `localStorage`, **appliqué par un script dans `index.html` avant le premier
dessin** (sinon flash blanc au démarrage en mode sombre).

---

## 10. Android : coque Capacitor et lecture de la montre (Health Connect)

> Partie **facultative**. Sans APK, l'application marche très bien (PWA) et les séances se saisissent à la main.
> L'APK n'est utile que pour lire automatiquement les séances de la montre.

### 10.1 La coque

- `android-shell/configure.mjs` écrit `capacitor.config.json` : `appId` (ex. `com.toi.monapp`), `webDir`, et surtout
  **`server.url = SITE_URL`** (l'APK affiche le site publié), `cleartext: false`, `allowNavigation` vers l'hôte du
  site, `www.gstatic.com`, `*.googleapis.com`, `*.firebaseapp.com`.
- Plugins Capacitor utilisés : `app`, `browser`, `filesystem`, `local-notifications`, `share`.
- **Mise à jour** : modifier le site met l'APK à jour. Réinstaller l'APK n'est nécessaire que si le module natif, les
  permissions, les icônes ou l'écran de lancement changent.
- **Signature** : un keystore **de debug versionné** dans le dépôt permet à toute nouvelle version de s'installer
  **par-dessus** l'ancienne (même signature). Ne jamais le changer ensuite. C'est acceptable pour un APK **personnel**
  distribué à soi-même ; pour une vraie diffusion, passer à un keystore secret (secret GitHub) et au Play Store.
- Installation sur le téléphone : télécharger l'APK depuis la release, autoriser l'installation depuis le navigateur.

### 10.2 Health Connect

Health Connect est l'API Android qui centralise les données de santé ; les applications de montres (Garmin Connect,
etc.) y déposent des données si on l'autorise. Dans Apogée, un seul module natif Kotlin (`ApogeeHealthPlugin.kt`,
≈ 230 lignes) expose : `availability`, `permissions`, `requestAccess`, `openSettings`, `readSessions(range)`,
`readSleep`, `readResting`, `readWeight`, `hideSplash`. **Lecture seule.**

Points d'attention :
- Permissions déclarées dans le manifeste par le script de patch : `READ_EXERCISE`, `READ_HEART_RATE`, `READ_SPEED`,
  `READ_DISTANCE`, `READ_ACTIVE_CALORIES_BURNED`, `READ_TOTAL_CALORIES_BURNED`, `READ_ELEVATION_GAINED`, `READ_SLEEP`,
  `READ_RESTING_HEART_RATE`, `READ_WEIGHT` et **`READ_HEALTH_DATA_HISTORY`** (sinon Health Connect ne rend que les 30
  derniers jours : demander l'historique à l'utilisateur lors de la première autorisation). Plus `POST_NOTIFICATIONS`
  pour les rappels.
- Ajouter dans le manifeste : `<queries>` vers `com.google.android.apps.healthdata`, un filtre d'intention
  `ACTION_SHOW_PERMISSIONS_RATIONALE`, et (Android 14) un `activity-alias ViewPermissionUsageActivity`. Sans cela,
  l'écran d'autorisation n'apparaît pas ou l'application n'est pas listée dans Health Connect.
- Dépendances : `androidx.health.connect:connect-client` (1.1.0-alpha10 dans Apogée), coroutines, activity-ktx ;
  Kotlin 2.0.x, Java 21, `minSdk 26`.
- Toujours **agréger** les totaux (distance, calories, dénivelé) avec `aggregate` de Health Connect (dédoublonné entre
  sources) plutôt que de sommer des enregistrements bruts.
- **Les courbes** (FC, vitesse) sont lues séparément sur la durée de chaque séance. Un trou de plus de ~30–60 s ne doit
  être « facturé » à personne dans les calculs (pause de la montre).
- **Ce que la montre n'envoie pas** (constaté sur une Garmin Fenix 7S Pro) : pas de **puissance vélo**, pas de
  **variabilité cardiaque (HRV)**, pas de **poids** (sauf balance connectée), pas de **tracé GPS** dans Health Connect.
  Ne construis aucune fonctionnalité qui en dépend sans l'avoir vérifié sur *ta* montre avant, avec la carte de
  diagnostic des autorisations accordées.
- **Sommeil** : l'enregistrement donne début–fin (temps **au lit**, éveils compris), alors que Garmin Connect affiche le
  temps **réellement endormi**. Pour s'aligner, sommer les étapes de sommeil (`SLEEPING`, `LIGHT`, `DEEP`, `REM`) et
  exclure l'éveil.
- **Garmin et fichiers d'entraînement** : un entraînement structuré peut être exporté en `.FIT` et copié en USB dans
  `GARMIN/NewFiles` de la montre. La page « Importer des données » de Garmin Connect (site) n'accepte que des séances
  **déjà faites**, jamais un entraînement à venir. Fichier écrit à la main selon le format FIT (en-tête, messages,
  CRC-16), sans bibliothèque.
- Code Kotlin compilé **uniquement dans la CI** : une faute de frappe ne se voit qu'après l'envoi. Relis ce fichier
  deux fois, garde-le petit.
- Un appel de plugin n'existe que dans l'APK **installé** : après avoir ajouté une méthode native, il faut réinstaller
  l'APK, et l'interface doit prévoir le cas « méthode absente » (ancien APK).

### 10.3 Notifications locales

`LocalNotifications` : reprogrammées **en entier** à chaque changement (annuler tout ce qui est en attente, puis
reprogrammer) ; `allowWhileIdle: true`. Évite toute logique incrémentale : elle se désynchronise.

---

## 11. Interface et charte graphique

### 11.1 Identité visuelle d'Apogée (à remplacer par la tienne, en gardant la méthode)

Ton : **sobre, précis, calme.** Un instrument de mesure, pas un jeu. Pas de gamification, pas de mascotte, pas de ton
motivationnel, pas de flammes ni d'éclairs. Fond papier chaud, encre presque noire, couleurs terreuses et profondes.
Mots justes : rigoureux, lisible, tranquille. À éviter : agressif, néon, futuriste, « performance à tout prix ».

- **Typographie** : titres et chiffres en **Montserrat** 500/600/700 ; texte en **Open Sans** 400/600/700 ; logotype
  serif **Cormorant Garamond** 600. Polices **hébergées localement** (`public/fonts`, woff2 sous-ensemble latin, depuis
  Fontsource) et déclarées dans `index.html` : pas de dépendance à Google Fonts au démarrage.
- **Échelle de tailles** : 11 / 12 / 14 / 16 / 18 / 24 / 28 / 34 / 40 px ; chaque style de texte est un jeton complet
  (`--type-h1`, `--type-body`, `--type-caption`, `--type-button`, `--type-amount-m`…).
- **Couleur d'action = l'encre.** Le bouton principal est noir (`#16181B`) en clair, **clair** (`#ECE8E0`) en sombre.
  Règle : **la couleur est un budget** — la couleur d'action est réservée aux boutons d'action principaux, pas aux
  icônes, flèches, chips sélectionnées ou indicateurs de chargement.
- **Palette claire** : papier `#FBFAF7`, surfaces `#F2F0EA`, brand minimal `#E9E3D6`, texte `#16181B`, texte neutre
  `#55595F`, bordures `#DCD8CF` / `#C3BEB2`. États : succès `#2E7560`, critique `#8E2B20`, avertissement `#9A6B12`,
  info `#1D6E80` (chacun avec un fond pâle `-bg`).
- **Une couleur par discipline**, utilisée partout (pastilles, graphiques, chips) : course `#B4432A` (rouille), vélo
  `#9A6B12` (ocre), natation `#1D6E80` (bleu-vert), renforcement `#4B4499` (violet). Chacune a un fond pâle associé.
  Pour ton app : prends 3 couleurs bien distinctes (course, natation, musculation) et garde-les **identiques** dans toute
  l'application.
- **Mode sombre** : mêmes rôles de jetons, valeurs différentes (fond `#0E1215`, texte `#ECE8E0`). Le mode sombre n'est
  pas une inversion : l'encre devient claire, boutons et info-bulles passent en clair avec texte sombre.
- **Logo** : trois lunes qui montent en diagonale (croissant, demi-lune, pleine lune ambrée = le sommet). Sources en SVG
  générées par script (`tools/icons.py`, rendu Chromium via Playwright) → favicon, icône 192/512, icône « maskable »,
  icônes Android (lanceur, rond, premier plan adaptatif), **icône de notification monochrome**. Le trait des contours
  s'épaissit quand l'icône rapetisse (lisibilité).

### 11.2 Jetons de design (`src/styles/tokens.css`)

**Toute valeur visuelle vient d'un jeton CSS.** Aucune couleur, taille ou rayon écrit « en dur » dans un composant.
Extrait :

```css
:root {
  --font-heading: Montserrat, system-ui, sans-serif;
  --font-body: "Open Sans", system-ui, sans-serif;
  --type-h1: 700 28px/42px var(--font-heading);
  --type-body: 400 14px/21px var(--font-body);

  --brand-primary: #16181B;         /* encre : actions principales */
  --bg-page: #FBFAF7;  --bg-surface-minimal: #F2F0EA;
  --text: #16181B;     --text-neutral: #55595F;
  --success: #2E7560;  --critical: #8E2B20;  --warning: #9A6B12;  --info: #1D6E80;

  --d-RUN: #B4432A;  --d-RUN-bg: #F5E4DE;     /* une paire couleur / fond pâle par discipline */
  --d-SWIM: #1D6E80; --d-SWIM-bg: #DDEBEE;

  --radius-8: 8px; --radius-16: 16px; --radius-full: 999px;
  --space-4: 4px; --space-8: 8px; --space-12: 12px; --space-16: 16px; --space-24: 24px; --space-32: 32px;
  --screen-margin: 16px;  --touch-min: 44px;  --button-height: 40px;  --input-height: 48px;
  --shadow-s: 0 4px 16px 0 #16181B12;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --brand-primary: #ECE8E0;  --bg-page: #0E1215;  --text: #ECE8E0;
  /* … mêmes noms, autres valeurs … */
}
```

Les jetons d'Apogée viennent d'un autre projet personnel (même structure, mêmes noms de rôles, couleurs différentes) :
**garde cette approche « mêmes rôles, valeurs propres à chaque projet »**, elle permet de réutiliser tout le code
d'interface d'une app à l'autre.

Grille de base : **espacements** 2/4/6/8/10/12/16/20/24/32/40/48/64 ; **rayons** 2…40 et `full` ; boutons en pilule
(`radius-full`), champs à 48 px de haut avec coins 4 px ; chips 36 px ; cibles tactiles **≥ 44 px** ; marges d'écran
16 px ; ombres légères (`xs`, `s`, `m`, `l`, `fab`, `sticky`).

### 11.3 Mise en page et navigation

- **Mobile** : barre d'onglets fixe en bas, **5 entrées maximum** (Apogée : Accueil, Calendrier, Séances, Progression,
  Coach), bouton d'action flottant (+) pour l'ajout. En-tête qui se compacte au défilement.
- **Ordinateur** : barre latérale à gauche avec le logotype serif ; contenu en **colonnes qui se remplissent d'elles-
  mêmes** (`.dmasonry`). Piège : ne pas laisser la grille répartir la hauteur restante (`align-content`), cela crée de
  grands espaces vides.
- **Routeur par hash** (`#/accueil`, `#/seances/482`) : pas de serveur à configurer sur GitHub Pages. L'historique du
  navigateur porte la **profondeur** (`history.state.depth`) : le bouton retour d'Android ferme d'abord les **feuilles**
  (bottom sheets), puis revient à l'écran précédent. Le lancement à froid arrive toujours sur l'Accueil.
- **Feuilles** (bottom sheets) pour les actions secondaires et les formulaires courts ; écrans plein écran pour les
  éditeurs. Les gestes tactiles d'une feuille ne doivent pas remonter à l'écran dessous.
- **Sélection de texte désactivée** partout sauf champs, `pre`, `code` et `.selectable` (sinon un appui long sélectionne
  du texte au lieu d'ouvrir le menu).
- **Appui long** (≈ 380 ms) pour un menu contextuel ; **balayage** pour modifier/supprimer ; **« Annuler »** dans un
  bandeau après chaque suppression (toast avec `undo`) plutôt qu'une boîte de confirmation.
- **Suppression irréversible** (tout effacer) : confirmation **en deux étapes**, avec rappel de faire une sauvegarde.

### 11.4 Composants et graphiques

- Composants partagés dans `ui/kit.tsx` : cartes, héros (grande carte sombre avec un chiffre clé), chips groupées,
  sélecteur de date, sélecteur de sport (50 pictogrammes dans `sport-icons.ts`), interrupteurs, feuilles, toasts,
  en-têtes.
- **Graphiques SVG maison** : barres, courbes, anneau (donut), escalier, jauge. Principes : **échelles séparées** pour
  des grandeurs différentes (jamais deux unités sur le même axe) ; **valeurs aberrantes écrêtées** ; légende toujours
  présente ; texte d'axe qui ne déborde pas du cadre (largeur de la colonne de repères calculée selon les valeurs) ;
  tableau de données accessible (`aria-label` descriptif) ; couleurs par jetons, donc automatiquement clair/sombre.
- **Accessibilité** : contrastes vérifiés dans les deux thèmes, cibles ≥ 44 px, focus visible (`--focus-indicator`),
  libellés ARIA sur les graphiques et icônes seules, ne jamais porter le sens par la couleur seule (toujours un libellé
  ou une icône en plus).
- **Cartes « diagnostic »** : un écran qui dit à l'utilisateur ce que l'app voit de son environnement (« APK ou
  navigateur ? », autorisations accordées, date de dernière lecture, dernière erreur). Cela a économisé des heures de
  débogage à distance.

### 11.5 Textes d'interface

- Phrases courtes, tutoiement, vocabulaire du sport (pas de jargon informatique).
- Chaque indicateur a sa **note de méthode** en légende (« Comment c'est calculé »). Écrire pour quelqu'un qui n'a jamais
  entendu le terme.
- Les chiffres affichés dans l'**aide intégrée** doivent rester alignés sur ceux du code : à chaque changement de calcul,
  mettre à jour l'aide.
- Pas de ton motivationnel (« Bravo ! », flammes, séries de jours). Constater, ne pas encourager.

---

## 12. Langues, tests, aide intégrée

### 12.1 Traduction

```ts
$t("Séance ajoutée")                       // la CLÉ est le texte français (source de vérité)
$t("{n} séances", { n: 3 })                // variables {nom}
// i18n-en.ts : export const EN = { "Séance ajoutée": "Session added", "{n} séances": "{n} sessions" }
```

Pas de bibliothèque. La langue est une préférence d'appareil (`localStorage`) ; changer de langue **recharge** l'app
(plus simple et sans bug d'état). Ne sont **jamais** traduits : les données saisies par l'utilisateur, les formats
d'échange, les exports tableur. Prévoir deux petits scripts : `add-en.py fichier.json` (ajoute des traductions) et
`missing-en.py` (liste les textes sans traduction) — ils évitent d'oublier des chaînes. Si tu n'as besoin que d'une
langue, saute cette section **mais** garde l'habitude d'écrire les textes via une fonction (`$t`) : retrofiter coûte cher.

### 12.2 Tests

`node --import tsx --test tests/*.test.ts`. Apogée : 32 tests, uniquement sur les fonctions de `domain/` et sur la
sauvegarde. Ce qu'il faut absolument tester :
- les **calculs** avec des valeurs que tu peux vérifier à la main ;
- l'**aller-retour sauvegarde** (export → restauration identique) ;
- la **déduplication** (la même séance reçue deux fois) ;
- les **règles de non-écrasement** (une saisie manuelle survit à un import) ;
- les **frontières de dates** (semaine du lundi, fuseau, dimanche/lundi) — source d'écarts réels : un total « 12
  semaines » qui ne retombait pas sur le bilan « depuis le début » parce qu'une séance tombait un dimanche, juste avant
  le premier lundi ;
- tout **format de fichier écrit à la main** (FIT, tableur) avec un **lecteur indépendant** écrit pour le test.

`tsc --noEmit` est limité à `src/` (pas de `@types/node` ; les tests passent par `tsx`).

### 12.3 Données de démonstration et captures

- `tools/demo.ts` génère un **jeu fictif reproductible** (graine fixe) : 17 semaines de séances inventées. Il sert aux
  captures d'écran, aux démonstrations et à vérifier l'interface sans toucher aux vraies données. Jamais publié avec des
  vraies données personnelles.
- `tools/shots.py` (Playwright) prend des captures d'écran à plusieurs largeurs (390 px mobile, 1280 px ordinateur) en
  clair et en sombre. **Regarde les captures** après chaque changement visuel : plusieurs débordements (texte hors du
  cadre, boutons à la ligne, graphiques coupés) n'ont été vus que comme ça.

### 12.4 Aide intégrée

Un écran Aide (`help-content.ts`, textes FR/EN par paires) qui explique : où est chaque chose, **d'où vient chaque
chiffre**, et les procédures qui sortent de l'app (installer l'APK, accorder les autorisations, copier un fichier sur la
montre). C'est aussi la documentation vivante du produit.

---

## 13. Façon de travailler avec Claude

Le binôme qui a fonctionné :

- **L'humain porte le produit et valide** (sur son vrai téléphone, avec ses vraies données) ; **Claude écrit le code**,
  lance les tests, regarde les captures, pousse, vérifie que la CI est verte, et rend compte en langage simple.
- **Trois documents vivants** à la racine de `docs/`, relus au début de chaque session et mis à jour à la fin :
  1. `PRD.md` — le produit : à qui ça sert, ce qui est dans le périmètre (MVP) et ce qui n'y est pas, décisions prises ;
  2. `SPECS-TECH.md` — l'architecture **telle qu'elle est dans le code**, avec les constantes exactes ;
  3. `ETAT.md` — où on en est : ce qui est livré (avec le commit), ce qui reste à valider sur téléphone, les décisions
     récentes.
  Un quatrième, `GUIDE-REPRISE.md`, décrit comment tout reconstruire de zéro si un compte ou le dépôt disparaissait.
- **Périmètre explicite** : toute fonctionnalité hors MVP est **signalée comme telle** avant d'être codée. L'humain
  refuse parfois (une fonctionnalité d'import de fichiers a été refusée, puis plusieurs fonctionnalités livrées ont été
  **retirées** quand la montre s'est révélée ne pas fournir la donnée). Retirer proprement est une compétence : commit
  dédié, documents mis à jour.
- **Valider avant d'avancer** : une série de changements → l'humain teste sur l'appareil → seulement alors on passe à
  la suite. Pas de fonctionnalité empilée sur une autre non validée.
- **Vérifier avant d'affirmer.** Quand un chiffre semble faux (records, totaux, sommeil), Claude cherche la **cause**
  dans le code, explique en mots simples, corrige, ajoute un test, et dit clairement **ce qu'il n'a pas pu vérifier**
  (par exemple « je n'ai pas tes vraies données, compare avec Garmin Connect »). Ne pas affirmer qu'un fichier ou une
  fonction marche sur un matériel qu'on n'a pas : le dire, proposer un test minimal de 5 minutes.
- **Réponses à l'humain** : français simple, non technique, étapes complètes numérotées, une seule prochaine action
  proposée. Les termes techniques restent dans les documents.
- **Livrer des fichiers complets, jamais des diffs à recopier.** Un diff collé à la main a un jour produit 479 erreurs
  de compilation. Claude modifie les fichiers du dépôt lui-même.
- **Ne jamais importer un nom d'un fichier non lu** dans la conversation ; ne jamais modifier un fichier dont on n'a pas
  vu le contenu entier.
- **Après chaque changement** : `npm test`, `npm run typecheck`, `npm run build`, capture d'écran, commit au message
  clair (« Analyse : respect du plan en couleur sur 3 semaines… »), envoi, **attendre la CI verte**.
- **Un test sur appareil bat dix hypothèses.** Exemple vécu : l'écran de diagnostic de l'APK a montré en une capture que
  l'ancienne version était installée, ce qui expliquait des heures d'erreurs « GPS introuvable ».

Règles TypeScript apprises à la dure :
- `noUncheckedIndexedAccess` actif : un accès `rows[0]` doit être capturé dans une variable et testé `undefined`.
- Pour typer un dictionnaire, préférer `Record<UnionLiteral, Interface>` à `satisfies` quand il y a des champs optionnels.
- Garder les valeurs de domaine en anglais (`RUN`, `planned`) et traduire à la frontière d'affichage dans **un seul
  fichier**.

---

## 14. Ce qu'il ne faut PAS reproduire en version 1

Apogée a beaucoup de fonctionnalités liées à la préparation d'une course longue. Pour une application course / natation /
musculation, commence **beaucoup plus petit** :

| À éviter en v1 | Pourquoi |
|---|---|
| Échange avec un coach IA par fichiers, périodisation, plan de course | Spécifique à la préparation d'une épreuve ; gros volume de logique (format d'échange, validation, rappels). |
| Séances composées de blocs imbriqués + export `.FIT` | Le modèle de blocs est le gros morceau de l'éditeur. Commence par « discipline + durée + distance + ressenti ». |
| Charge d'entraînement de Banister (forme, fatigue, fraîcheur), « forme du jour » | Demande des FC fiables, une FC max/repos, un historique long. À ajouter quand l'app tourne et que les données sont propres. |
| Enchaînements (séance suivie d'une autre), records par distance, efficacité | Utiles mais secondaires ; les records en particulier sont **délicats** (temps de déplacement vs temps total, pauses, précision d'échantillonnage). |
| Excel, reprise d'une ancienne base SQLite, formats hérités | Seulement nécessaires à cause de l'historique d'Apogée. |
| Anglais + français | Une seule langue suffit au départ, mais garde `$t()`. |

**Noyau recommandé (v1)** :
1. Saisie manuelle d'une séance (discipline, date, durée, distance, ressenti, commentaire) + journal + modification/
   suppression avec annulation.
2. Totaux par semaine / par discipline (graphiques en barres + anneau de répartition).
3. Stockage local IndexedDB + sauvegarde `.json` avec test aller-retour.
4. Thème clair/sombre, charte par jetons, PWA installable.
5. **Puis** : connexion Google + synchronisation Firebase.
6. **Puis** : APK + Health Connect pour importer les séances de la montre (avec déduplication).
7. **Puis** : indicateurs (charge, zones de FC, records) un par un, chacun avec sa note de méthode et ses tests.

**Précision utile pour la musculation** : les montres ne décrivent généralement la séance de musculation que par sa
durée et sa FC (pas les séries / charges). Si tu veux des séries, des répétitions et des charges, c'est une **saisie
manuelle** dans l'application : prévois un modèle dédié (exercice, séries, répétitions, charge) plutôt que de compter
sur la montre.

---

## 15. Ordre de construction conseillé

Chaque étape est testable seule et peut être publiée.

1. **Squelette** : dépôt, `package.json`, `scripts/build.mjs`, `index.html` avec écran de démarrage, CI qui publie
   sur GitHub Pages. Vérifier que le site s'affiche (vide) sur ton téléphone. *(C'est l'étape qui fait découvrir
   les pièges de GitHub Pages et du service worker : elle vaut qu'on la fasse en premier.)*
2. **Domaine pur** : types, dates (jour civil local, semaine du lundi), premiers calculs (totaux), **tests**.
3. **Données** : IndexedDB, store (`commit`, `dirty`), `actions.ts` (avec `Snapshot` et annulation), sauvegarde `.json`.
4. **Interface** : `tokens.css` (clair + sombre), composants partagés, routeur par hash, écrans (Accueil, Journal,
   Saisie, Statistiques, Paramètres, Aide).
5. **PWA** : manifeste, icônes, service worker (`cache: 'reload'`), thème sans flash.
6. **Compte Firebase** (section 6.2) → `firebase-config.ts` → synchronisation → connexion Google web.
7. **APK** : configuration Capacitor, script de patch idempotent, keystore, connexion via `auth.html` + lien profond
   `monapp://auth`, écran de diagnostic.
8. **Health Connect** : module natif, autorisations, import des séances + déduplication, puis sommeil/FC de repos si utiles.
9. **Indicateurs avancés**, un à la fois.
10. **Finitions** : notifications, aide, anglais, captures d'écran, documents de reprise.

Principes à ne jamais perdre : rien de calculé n'est stocké ; la version la plus récente gagne ; une suppression laisse
une pierre tombale ; aucun nombre sans sa méthode ; l'app n'écrit jamais dans la montre ; un import n'écrase jamais une
saisie humaine.

---

## 16. Pièges rencontrés

À relire avant d'écrire du code. Chacun a coûté du temps.

**Publication et cache**
1. **Cache HTTP de GitHub Pages + service worker** → écran noir. Toujours `cache: 'reload'` à l'installation.
2. **Dépôt GitHub renommé** → l'URL du site, la CI, le `server.url` de l'APK et le domaine autorisé Firebase changent
   ensemble ; republier l'APK.
3. **`.github/` ignoré par l'interface web de GitHub** → créer le workflow à la main ; garder une copie visible.
4. **`setup-android` dans la CI** → casse la construction (le SDK est déjà là).
5. **`pkill -f` dans un script de test** → peut tuer le shell lui-même (motif qui se reconnaît).
6. **Mise en ligne de test sans CI verte** : le site n'est publié que si les tests passent ; ne jamais contourner.

**Démarrage et performance**
7. **Animation de démarrage saccadée sur téléphone** : tout ce qui n'est pas `transform`/`opacity` bloque le fil
   principal ; différer `app.js` d'~800 ms.
8. **Trou noir/blanc entre l'écran natif et la page** → maintenir l'écran de lancement natif jusqu'à ce que la page
   dise « j'ai dessiné ».
9. **Flash blanc en mode sombre** → appliquer le thème dans `index.html` avant le premier dessin.
10. **Firestore : 1 Mo par document** → un document par enregistrement.
11. **Courbes lourdes** : stocker FC/vitesse à part de la séance (collection `series`), sinon la liste des séances devient
    lente. Un cache du TRIMP/derive par séance a divisé le temps de recalcul par ~5.

**Connexion et Android**
12. **Google refuse la connexion dans une WebView** → navigateur du téléphone + lien profond `monapp://auth`.
13. **Service worker et Capacitor** → le contourner dans la WebView, sinon le pont natif n'est pas injecté (la carte
    « Montre » dit « web » alors qu'on est dans l'APK).
14. **APK ≠ PWA installée depuis Chrome** : deux applications différentes ; la seconde n'a pas Health Connect.
    Désinstaller la PWA si on utilise l'APK.
15. **Changer la clé de signature** → les mises à jour ne s'installent plus par-dessus.
16. **Changer l'identifiant d'application Android** → c'est une **autre** application (s'installe à côté, ne remplace
    pas). Choisir `appId` une fois pour toutes.
17. **Nouvelle autorisation Health Connect** → après réinstallation, rouvrir l'écran d'autorisation pour accorder les
    nouvelles lectures.
18. **Une méthode de plugin ajoutée n'existe que dans l'APK réinstallé** → prévoir le repli « module trop ancien ».
19. **Kotlin compilé seulement en CI** → petit module, relu avec soin.

**Données**
20. **Doublons montre** : la même séance peut arriver deux fois ; clé = identifiant client de la montre. Garder la
    version la plus saisie, recopier ce qui manque, supprimer l'autre, remapper les liens.
21. **Une séance « nuit » ou « jour »** : le jour civil dépend du décalage de la séance, pas du téléphone.
22. **Semaines du lundi vs « depuis le début »** : une séance un dimanche, avant le premier lundi, disparaissait d'un
    total « tout ». Fais toujours démarrer une période « tout » au **lundi de la semaine de la première séance**.
23. **Records de distance** : utiliser le **temps de déplacement** (les arrêts ne comptent pas, comme dans l'application
    de la montre), interpoler le franchissement de la distance, recaler la courbe de vitesse sur la distance
    enregistrée de la séance. Sans cela les records sont faux de plusieurs dizaines de secondes.
24. **Sommeil** : temps au lit ≠ temps endormi (voir 10.2).
25. **Renommages** : voir 5.4.
26. **Ne jamais livrer de diff à recopier** ; ne jamais modifier un fichier non lu.
27. **Mettre à jour l'Aide** quand un calcul change.

---

## 17. Premier message à donner à Claude

À copier dans la première conversation après avoir joint ce fichier (adapter les crochets) :

> Voici un guide technique issu d'une application personnelle de suivi sportif (Apogée). Je veux construire ma propre
> application pour **[course à pied, natation, musculation]**, sur **[Android + web]**, avec **[ou sans]** lecture de ma
> montre **[marque/modèle]**. Je porte le produit et je valide sur mon téléphone ; tu écris le code.
>
> 1. Lis tout le guide. Commence par me poser **les questions qui changent la direction** (au plus 5) : nom de
>    l'application, fonctionnalités du MVP, montre/Health Connect oui ou non, une ou deux langues, thème clair/sombre.
> 2. Crée `docs/PRD.md` (produit + périmètre MVP), `docs/SPECS-TECH.md` (architecture) et `docs/ETAT.md` (avancement),
>    et tiens-les à jour à chaque session.
> 3. Suis l'**ordre de construction de la section 15**, une étape à la fois : tu me dis quoi tester sur mon téléphone,
>    j'ai la main pour valider avant de passer à la suivante.
> 4. Signale **toute fonctionnalité hors MVP** avant de la coder. Ne reproduis pas ce que la section 14 déconseille
>    sans que je le demande.
> 5. Explique-moi les choses en français simple et donne-moi des étapes numérotées, complètes, quand j'ai quelque chose à
>    faire moi-même (créer un compte GitHub / Firebase, installer l'APK, etc.).
> 6. Pour les comptes (GitHub, Firebase, Google), dis-moi exactement où cliquer ; ne me demande **jamais** de te
>    donner un mot de passe. Les six valeurs de configuration Firebase web, elles, peuvent être partagées (elles ne sont
>    pas secrètes).

---

*Document rédigé le 24 octobre 2026 à partir du dépôt et de l'historique d'Apogée. Les valeurs de quotas et de
versions (Firebase Spark, Capacitor 7, Health Connect `1.1.0-alpha10`, Kotlin 2.0.x) étaient exactes à cette date : à
revérifier dans la documentation officielle avant de s'y fier.*
