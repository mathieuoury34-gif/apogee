# SPECS-TECH — Apogée

**Version** 2.0 (réécriture complète)
**Date** 16 octobre 2026
**Dernier commit décrit** `07c9cbc` (dépôt `mathieuoury34-gif/apogee`)

Ce document décrit **comment l'application est construite, telle qu'elle est dans le code**. Toutes les constantes
citées ont été relues dans le code le 16/10/2026. Pour le *quoi* et le *pourquoi* : `PRD.md`. Pour refaire
l'application de zéro, pas à pas : `GUIDE-REPRISE.md`. L'ancienne architecture (React Native / Expo / SQLite /
Drizzle) est archivée dans `HISTORIQUE-RN.md` et **ne s'applique plus**.

---

## 1. Décisions verrouillées

| Sujet | Décision |
|---|---|
| Langage / UI | TypeScript 6, React 19.2.8, aucune bibliothèque d'état (store maison + `useSyncExternalStore`) |
| Construction | esbuild 0.28.2 (`scripts/build.mjs`), ESM, découpage en modules (`splitting`), cibles `es2020 chrome90 safari15` |
| Application | PWA servie par GitHub Pages ; routeur par hash ; service worker avec cache du « shell » |
| Android | Coque **Capacitor 7** (dossier `android-shell/`, projet `android/` généré en CI, jamais versionné) + module natif Kotlin `ApogeeHealth` |
| Stockage local | IndexedDB base `apogee` (stores `records` et `meta`) ; préférences d'appareil dans `localStorage` (`apogee:*`) |
| Synchronisation | Firebase (offre Spark) : Authentication Google + Firestore ; SDK chargé à l'exécution depuis `www.gstatic.com/firebasejs/10.14.1/` (pas dans le bundle) |
| Calcul | Fonctions pures dans `src/domain/`, sans interface ; **rien de calculé n'est stocké** |
| Tests | `node --import tsx --test tests/*.test.ts` : **18 tests** verts ; `tsc --noEmit -p .` limité à `src/` |
| Coût | 0 € (Pages, Actions, Spark). Aucun secret dans le dépôt |
| Identifiants | Android `com.mathieu.apogee` ; schéma de lien `apogee://auth` ; plugin Capacitor `ApogeeHealth` ; formats `apogee/1` et `apogee-backup/1` ; base `apogee` ; clés `apogee:*` ; caches `apogee-shell-<hash>` et `apogee-runtime` |

**Unités et conventions** (héritées, inchangées) : instants `*At` en ISO 8601 UTC ; jours civils `*Date` / `day` en
`AAAA-MM-JJ` **locaux** (le décalage horaire de la montre `zoneOffsetMinutes` décide du jour d'une séance) ; unités
SI partout (mètres, secondes, m/s, watts, bpm, joules pour les calories) ; conversion seulement à l'affichage ;
vitesses de référence VMA/CSS en m/s.

## 2. Arborescence

```
index.html                  écran de démarrage inline, polices, CSS critique, chargeur d'app.js
public/                     manifest.webmanifest, auth.html, icons/ (6 PNG), fonts/ (7 woff2)
scripts/build.mjs           build esbuild → dist/, modulepreload, service worker
src/main.tsx                point d'entrée (importe legacy-keys en premier, charge le store, lance la synchro)
src/App.tsx                 routes, barre d'onglets / barre latérale, feuilles
src/auth.ts                 script de la page de connexion (auth.html)
src/i18n.ts, i18n-en.ts     $t(texte français) → anglais ; dictionnaire EN
src/theme.ts                thème clair / sombre / système
src/sw.template.js          service worker (version et fichiers injectés au build)
src/styles/                 tokens.css (jetons), app.css
src/domain/                 calculs purs (voir §6–§10)
src/data/                   store, idb, sync, actions, backup, excel/xlsx, legacy-keys, firebase-config
src/native/                 bridge (Capacitor), healthSync, notify
src/screens/                Home, Calendar, Editor, Periodization, Sessions, Progress, Coach, Settings, Health, Help, Welcome
src/ui/                     kit (composants), charts (SVG), icons, sport-icons (50 pictogrammes), menu, format, router
tests/domain.test.ts        18 tests ; tests/fixtures/ (migrations SQL de l'ancienne base + make_legacy_db.py)
tools/                      demo.ts (jeu fictif), icons.py (icônes), shots.py (captures) — jamais publiés
android-shell/              configure.mjs, patch-android.mjs, plugin/ApogeeHealthPlugin.kt, res/, keystore/, www/
.github/workflows/publier.yml   (copie de github-workflows/publier.yml)
firestore.rules
docs/                       ANALYSE, coach-context-apogee-1, brief-design-nom-logo, migration-firebase-apogee, + ce dossier
```

Taille du code : ≈ 4 250 lignes dans `src/domain`, `src/data`, `src/native` (hors écrans et interface).

## 3. Modèle de données (`src/domain/types.ts`)

Une seule source de vérité : `AppData`, gardée en mémoire, persistée par enregistrement dans IndexedDB, synchronisée
par enregistrement avec Firestore. Tout enregistrement : `{ id: string, updatedAt: ISO, deleted?: true, … }`.
**Suppression = pierre tombale** (`{id, updatedAt, deleted:true}`) pour que la suppression se propage.

### 3.1 Les 12 collections

| Collection | Contenu (champs principaux) | Clé |
|---|---|---|
| `athlete` | `displayName, birthDate, sex ('M'/'F'), availability (Weekday[]), equipment (string[]), injuries (InjuryEntry[])` | `main` |
| `race` | `name, raceDate, swim/bike/runDistanceM, targetTotalSeconds, targetSwim/Bike/Run/TransitionSeconds, targetRevisedAt, notes` | `main` |
| `zones` | relevé historisé : `kind ('vma'|'ftp'|'css'|'hr_max'), value (SI), measuredAt, source ('test'|'estimation'|'manual'), notes` | id numérique |
| `phases` | bloc de périodisation : `label, phase, startDate, endDate, intent, objective, notes, idempotencyKey, coachExchangeId` | id numérique |
| `planned` | séance prévue : `discipline (RUN/BIKE/SWIM/STRENGTH/BRICK), plannedDate, title, notes, origin ('manual'|'coach'), idempotencyKey, coachExchangeId, blocks (Block[]), createdAt, editedAt` | id numérique |
| `actual` | séance réalisée : `sourceId, source ('health'|'manual'), discipline (+OTHER), subSport, title, rawExerciseType, startAt, endAt, zoneOffsetMinutes, durationSec, distanceM, calories (J), elevationGainM, avg/max/minHrBpm, hrCoverageRatio, hrSampleCount, avg/maxSpeedMs, hasSeries, edited (EditableField[]), rpe, comment, manualPlannedId, ingestedAt` | id numérique |
| `series` | courbes brutes d'une séance (même id que `actual`) : `hr: [epoch s, bpm][]`, `speed: [epoch s, m/s][]` (≈ 5 Ko par séance) | = id séance |
| `bricks` | paire d'enchaînement spontané : `firstId, secondId, day, status ('confirmed'|'declined')` | id |
| `interruptions` | `label, startDate, endDate, reason (injury|travel|external_load|other), dailyLoadOverride, suspendsReminders, notes` | id |
| `sleep` | nuit : `nightDate (jour du réveil), startAt, endAt, zoneOffsetMinutes, durationSec, sourceId` | = nightDate |
| `resting` | FC de repos du jour : `day, bpm` | = day |
| `exchanges` | journal coach : `direction ('export'|'import'), schemaVersion, occurredAt, status (applied|rejected|cancelled), operationCount, payloadHash, planValidUntil, exportSessions, importSummary, error` | id |

Règles de champs :
- `actual.sourceId` : `clientRecordId` Garmin (Health Connect) ou `manual:<empreinte FNV-1a>` ou `dossier:…` (reprise coach)
  ou `legacy:…`. **Immuable** ; sert de clé de déduplication.
- `actual.edited` : champs corrigés à la main (`date, discipline, durationSec, distanceM, avgHrBpm`) → assise « saisie ».
- `actual.manualPlannedId` : `undefined` = automatique ; `null` = « n'était pas prévue » ; sinon id du prévu choisi.
- Identifiants créés dans l'app : **numériques** (`Date.now()*1000 + aléa`, strictement croissants) → clés coach
  `session:<chiffres>` / `phase:<chiffres>` (compatibles avec l'ancienne version).
- Empreinte `fnv1a` 32 bits (hex 8 car.) pour les saisies manuelles et les plans coach.

### 3.2 Vocabulaire des blocs (FIGÉ — le format d'échange en dépend)

| Axe | Membres |
|---|---|
| `kind` | `WARMUP, WORK, RECOVERY, REST, COOLDOWN, TRANSITION, SET` |
| `measure` | `TIME, DISTANCE, REPS, OPEN` |
| `setMode` | `REPEAT, AMRAP, EVERY` |
| `targetType` | `NONE, ZONE, PACE, SPEED, POWER, HR, LOAD, RPE` |
| `relativeTo` | `FTP, VMA, CSS, HRMAX, ONE_RM` |

Bloc : `{kind, measure, measureValue, setMode, setCount, setWindowS, targetType, targetLow, targetHigh, relativeTo,
label, notes, discipline, children}`. Règles : profondeur 1 maximum (un SET ne contient pas de SET) ; une récupération
est un bloc **frère** (pas de `restSec`) ; `RECOVERY` actif ≠ `REST` arrêt (sans cible, `TIME` ou `OPEN`) ; pas de
`DRILL` (un éducatif = `WORK` + `targetType NONE` + `notes`) ; `discipline` d'un bloc `null` sauf dans un BRICK ;
`TRANSITION` seulement dans un BRICK ; une séance sans bloc est refusée ; `ONE_RM` jamais résolu en kilos ; allure
en s/km (s/100 m en SWIM), vitesse en m/s, `relativeTo` ⇒ pourcentages.

## 4. Stockage, synchronisation (`src/data/`)

### 4.1 Store (`store.ts`)
- `commit(fn, origin)` : lot atomique de `tx.put(coll, rec)` / `tx.remove(coll, id)`. `origin 'local'` horodate
  (`updatedAt = maintenant`), écrit dans IndexedDB et ajoute `collection/id` à l'ensemble **`dirty`** (file d'envoi,
  persistée sous la méta `dirty` après 300 ms). `origin 'remote'` garde l'horodatage reçu et ne marque rien.
- `replaceAll` (restauration) supprime ce qui manque et réécrit tout ; `mergeAll` fusionne ; `wipeLocal` efface
  l'appareil seulement ; `deleteEverything()` (actions) supprime aussi côté cloud via tombstones.
- Hooks : `useData()`, `useCalc()` (→ `{data, d: Derived}`), `usePrefs()`, `useReady()`.
- **Préférences d'appareil** (`apogee:prefs`, JSON) : `skipLogin, syncedUid, provisionalLoad (défaut true),
  healthSyncedUntil, healthLastRun, healthLastError, healthLastReport, reminderHour (défaut 7)`. Autres clés
  `localStorage` : `apogee:theme`, `apogee:lang`, `apogee:withOther` (bouton « Inclure Autre »).
- `getDerived` met `derive()` en cache par (objet `data`, jour, `provisionalLoad`).

### 4.2 IndexedDB (`idb.ts`)
Base `apogee` version 1, stores `records` (clé `collection/id`) et `meta`. À la **première création**, recopie sans rien
supprimer les bases `quadra` puis `ironapp` si elles existent (migration sans perte des renommages).
`legacy-keys.ts` recopie de même `quadra:*` / `ironapp:*` → `apogee:*` pour `theme, lang, withOther, prefs`
(importé tout en premier dans `main.tsx`). `index.html` lit aussi les trois anciens noms pour le thème.

### 4.3 Firestore (`sync.ts`)
- Chemin : `users/{uid}/iron_{collection}/{id}` (préfixe `iron_` conservé volontairement) =
  `{ data: JSON.stringify(rec), updatedAt, deleted }`.
- **Règle de fusion : le `updatedAt` le plus récent gagne.** Un document distant plus récent que le local n'écrase pas
  un enregistrement local `dirty` plus récent ou égal.
- Envoi : `push()` par lots de 400 (`writeBatch`), planifié 1,2 s après un changement local, relancé à 5 s en cas
  d'échec ; `syncNow()` marque tout comme sale et renvoie tout.
- Écoute : `onSnapshot` sur chacune des 12 collections ; au premier instantané de chaque collection, ce qui n'existe
  que localement part vers le cloud ; quand les 12 sont reçues → `syncedUid` enregistré, état `ok`.
- Persistance hors ligne Firestore : `persistentLocalCache()` (repli `getFirestore`).
- Connexion web : `signInWithPopup` (Google, `prompt: select_account`), repli `signInWithRedirect` si popup bloquée.
  **Dans l'APK** Google refuse les vues web intégrées : `signIn()` ouvre `auth.html?app=1&lang=` dans le navigateur
  du téléphone (plugin Browser) ; la page se connecte et rend le jeton par le lien **`apogee://auth#id_token=…&access_token=…`** ;
  l'app (écoute `appUrlOpen` + `getLaunchUrl`) fait `signInWithCredential`.
- `deleteCloud()` supprime tous les documents du compte (par lots de 400).
- L'app **n'attend plus** la connexion Firebase pour s'afficher (`App.tsx` ne dépend plus de `sync.ready` ; la carte de
  bienvenue patiente).
- **Règles** (`firestore.rules`) : `match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }`.
- Configuration (`firebase-config.ts`) : projet **`apogee-d171c`**. Ces valeurs ne sont pas secrètes (la protection
  vient des règles). Tant que `apiKey` est vide, l'app est 100 % locale.

### 4.4 Doublons Garmin (`dedupe.ts`, `actions.mergeDuplicateActuals`)
Deux séances de même `sourceId` = une seule. On garde celle qui a le plus de saisie
(`score = rpe 4 + comment 2 + title 2 + manualPlannedId 4 + edited 4 + hasSeries 1`), départage déterministe
(`ingestedAt` puis `id`), on recopie ce qui manque (rpe, commentaire, titre, rattachement), on supprime l'autre
(séance et série) et on remappe les `bricks`. Lancé au démarrage et 1,5 s après chaque réception du cloud.

### 4.5 Sauvegarde (`backup.ts`)
`{ format: 'apogee-backup/1', exportedAt, data: AppData }`. Anciens formats acceptés : `quadra-backup/1`,
`ironapp-backup/1`. Un test vérifie export → restauration = données identiques, collection par collection.
« Restaurer ou compléter » accepte aussi un dossier coach exporté (détection `isDossier`).

### 4.6 Reprise de l'ancienne base (`sqlite.ts`, `legacy.ts`)
Lecteur SQLite écrit à la main (pages B-tree, ~140 lignes) qui lit le fichier `.db` de l'ancienne app et reconstruit
`AppData` en **conservant les identifiants** (clés coach valides). Le rapport donne le nombre de séances et la date de
la dernière. Limite : le partage Android n'emporte pas le fichier annexe WAL ; une saisie très récente peut manquer
(compléter par le dossier coach ou la lecture Health Connect). Bouton uniquement dans la **carte de bienvenue**.

### 4.7 Dossier coach de l'ancienne app (`dossier.ts`)
Ajoute sans doublon les séances jointes (`sourceId 'dossier:…'`) et prévues absentes ; complète RPE et commentaire ;
quand la montre remonte plus tard une séance de même discipline à ±180 s (`SAME_START_SEC`), elle complète l'entrée au
lieu de la dupliquer.

### 4.8 Exports Excel (`excel.ts`, `xlsx.ts`)
Classeur 6 onglets écrit sans bibliothèque (`jszip` seul) : Tableau de bord, Séances, Plan, Charge, Zones,
Périodisation ; formules et graphiques recalculés à l'ouverture. Reste en français (les formules filtrent sur les
libellés). Dans l'APK : fichier écrit dans le cache (`Filesystem`) puis feuille de partage (`Share`) ; sur le web :
téléchargement.

## 5. Calculs (`src/domain/`) — valeurs exactes

### 5.1 Série cardio et TRIMP (`hr.ts`)
- Échantillon valide : 25–230 bpm. Durée d'un échantillon = écart au suivant plafonné à **33 s** (`MAX_GAP_SEC`),
  11 s nominaux pour le dernier. Un trou n'est facturé à personne.
- **TRIMP de Banister exponentiel**, échantillon par échantillon : `Σ (dt/60) · r · a · e^(b·r)` avec
  `r = clamp((bpm − repos)/(FCmax − repos), 0, 1)`. Coefficients **Homme a=0,64 b=1,92 ; Femme a=0,86 b=1,64**.
  Minimum 10 échantillons et réserve de FC ≥ 20 bpm, sinon pas de TRIMP.
- **TRIMP sur FC moyenne** (`trimp_avg`) : même formule avec la FC moyenne × durée totale.
- **sRPE** (Foster) : `RPE × minutes`.
- **Dérive cardiaque** : (FC moyenne pondérée 2ᵉ moitié − 1ʳᵉ) / 1ʳᵉ ; chaque moitié ≥ 300 s et ≥ 10 échantillons.
- **Pic soutenu** : plus haute médiane glissante sur 60 s (fenêtre ≥ 75 % remplie), ≥ 30 échantillons.
- Agrégats d'ingestion : trous > 60 s exclus de la couverture.

### 5.2 FC max, FC de repos (`load.ts`)
- `resolveHrMax` : (1) valeur **déclarée** (dernier relevé `hr_max`) l'emporte ; elle n'est relevée que si le **pic
  soutenu observé** (course et vélo seulement, jamais > **210**) la dépasse d'au moins **2 bpm** ; (2) sinon
  max(Tanaka `208 − 0,7·âge`, pic observé) plafonné à 210. `origin` : `test/estimation/manual/observed/tanaka`.
- **FC de repos** : médiane glissante des **14** derniers jours ; repli médiane globale.

### 5.3 Charge par séance (`computeSessionLoads`) — ordre de priorité
1. `trimp` (série cardio + FC max + repos du jour) — assise **mesurée**.
2. `trimp_avg` (FC moyenne saisie) — **estimée**.
3. `srpe` : `RPE × minutes × facteur` — **estimée**. Facteur = **médiane** de `TRIMP ÷ (RPE×min)` sur les séances
   ayant série ET RPE, à partir de **5** paires, borné **[0,12 ; 0,60]** ; **0,30** par défaut.
4. `provisional` (si réglage actif) : médiane de charge/min des séances de **même discipline** sur **90 jours** (hors
   provisoires), sinon toutes disciplines (**jamais** pour OTHER) × durée. Jamais un jour couvert par une
   interruption à forfait.
5. `pending` (charge `null`).
Assise : `measured | estimated | entered | none`. La dérive est calculée avec la série.

### 5.4 Banister, séries quotidiennes (`buildLoadSeries`)
- Charge du jour = somme des séances ; un jour à charge nulle couvert par une interruption à `dailyLoadOverride`
  prend le forfait (jamais ajouté à une charge réelle).
- `fitness(t) = fitness(t−1)·e^(−1/42) + charge·(1 − e^(−1/42))` ; `fatigue` idem avec **7** ; `fraîcheur = fitness −
  fatigue`. **Amorçage** : fitness = fatigue = moyenne des **14** premiers jours. « Amorçage en cours » tant que
  l'historique < **42** jours.
- `coachConstat` : valeurs du jour, variations sur 7 jours, **ACWR = charge cumulée des 7 jours ÷ (charge des 28 jours / 4)**,
  calculé **seulement si 28 jours** de données et chronique > 0 ; jour le plus chargé et sa part ; rampe hebdomadaire.

### 5.5 Forme du jour (`form.ts`)
Quatre composantes (poids) : **sommeil 0,30** (durée de la nuit), **FC de repos 0,25** (direction inverse),
**fraîcheur 0,30** (celle de la **fin de la veille**), **RPE de la veille 0,15** (max du jour précédent, inverse).
Pour chaque composante : référence = médiane des **14 jours précédents** (jour évalué exclu) ; centre 0 pour la
fraîcheur ; écart-type avec plancher (sommeil 1 800 s, FC repos 1,5 bpm, fraîcheur 5, RPE 0,8) ; `z` borné ±2 ;
`score = clamp(50 + 25·z, 0, 100)`. Il faut ≥ **3** observations par composante et un poids cumulé ≥ **0,5** ; les
poids sont renormalisés sur les composantes présentes. Paliers : `<25 Épuisé`, `25–45 Entamé`, `45–65 Correct`,
`65–83 Disponible`, `≥83 Frais`. Historique recalculé sur 120 jours.

### 5.6 Rattachement prévu ↔ réalisé (`links.ts`) — recalculé, jamais stocké
- Un « créneau » par séance prévue (par discipline pour un BRICK) ; durée attendue = estimation des blocs.
- Passe 1 (même jour) : score = **0,6** (`BASE`) + **0,4** (`DURATION_WEIGHT`) × accord de durée
  `1 − |attendu − réel| / max(attendu, réel)` ; sans durée attendue : 0,6.
- Passe 2 (J±1, séance déplacée) : base **0,42** (`SHIFTED_BASE`).
- Glouton par score décroissant ; **garde-fou d'ambiguïté 0,08** : si un concurrent est à moins de 0,08, la paire est
  gelée (pas de rattachement automatique).
- Manuel : `manualPlannedId` (fenêtre de choix **±3 jours**) ; si le prévu a disparu → retour à l'automatique.
- Le coach reçoit `matchConfidence: "linked"` (auto ou manuel) ou `"heuristic"` (repli même jour/même discipline).
- BRICK spontané : deux séances RUN/BIKE/SWIM de disciplines différentes le même jour, non déjà appariées, hors cas
  où les deux sont rattachées au même BRICK prévu.

### 5.7 Estimation durée/distance d'un prévu (`blocks.ts`)
- Une **fourchette** d'allure/vitesse compte pour son **milieu**.
- Une cible **relative** (% VMA, % CSS) se résout avec la dernière valeur connue (% de la **vitesse**) ; le total est
  alors « estimé ».
- Bloc sans cible : allure d'endurance par défaut **70 % de la VMA** (course), **90 % de la vitesse CSS** (natation),
  marquée « approchée ».
- Certitude : `exact | partial | unknown`. Durée et distance se déduisent l'une de l'autre via une allure absolue.

### 5.8 Bilan et alertes (`review.ts`)
- Comparaison au plan : ratio réel/attendu sur l'axe durée (ou distance) ; **conforme si |ratio − 1| ≤ 10 %** ;
  alerte `PLAN_GAP` au-delà de **25 %**. Pour un BRICK, seule la partie de la discipline réalisée est comparée.
- Rapport aux habitudes : charge ÷ médiane des **8 dernières semaines (56 j)**, même discipline, hors provisoires ;
  `> 1,15` plus chargée, `< 0,85` plus légère. Le verdict suit le **plan d'abord**, sinon les habitudes.
- Dérive : interprétable seulement si séance ≥ **20 min**, plan rattaché, effort continu (pas de SET) ; alerte
  `HR_DRIFT_HIGH` si **> 8 %**.
- Alertes d'accueil : `MISSED_SESSIONS` (prévus des 7 derniers jours sans réalisé, hors jours suspendus), `RPE_HIGH_STREAK`
  (3 dernières séances avec RPE ≥ **8**), `LOAD_RAMP` (ACWR **> 1,5**), `PENDING_RPE` (séances des 14 derniers jours en
  attente/provisoires).

### 5.9 Statistiques, objectif
- `stats.ts` : barres sur **12** semaines ; le meilleur record d'allure ne compte que les séances d'au moins **20 min** ; référence par discipline
  (RUN→VMA, BIKE→FTP, SWIM→CSS, allure /100 m en natation) ; `OTHER` exclu du total sauf bouton.
- `objective.ts` : allure/vitesse requise par discipline à partir du temps alloué manuellement (course s/km, natation
  s/100 m, vélo km/h) ; `ofReference = vitesse requise ÷ VMA (ou CSS)` ; **aucun verdict**.

### 5.10 Montre (`health.ts`)
- `exerciseType` Health Connect → discipline : 8, 9 → BIKE ; 56, 57 → RUN ; 73, 74 → SWIM ; 70, 81, 13, 36, 10 →
  STRENGTH ; autres → OTHER (+ sous-sport par `subsports.ts`).
- Séance nouvelle → insérée ; connue → **mise à jour** si la montre apporte ≥ **5** mesures cardio de plus et si elle
  n'est pas corrigée à la main ; séance reprise du dossier coach → complétée. Plusieurs sommeils pour la même nuit :
  le plus long. Lecture : depuis `healthSyncedUntil − 48 h` ; première lecture **400 jours** (avec autorisation
  « historique », sinon 30).

## 6. Échange coach (`coach.ts`, contrat `docs/coach-context-apogee-1.md`)

- `SCHEMA = 'apogee/1'` ; alias acceptés `quadra/1`, `ironapp/1`. Le dossier exporté est **construit à l'export** :
  `athlete, race, zones (valeur SI + unité m_s/w/bpm), phases, loadSummary (fitness, fatigue, freshness, ratio,
  volumes sur 6 semaines, srpeFactor, méthodes), upcomingPlannedSessions (56 jours), recentPlannedSessions
  (statut done/missed), recentActualSessions (sélection), responseContract {instructions, example}`.
- `refKey` = `idempotencyKey` ou `session:<id>` / `phase:<id>`.
- Import : analyse (tolère les balises ```json), validation par opération, aperçu `Preview` (created / updated /
  deleted / rejected / noop + `malformedCount`), empreinte `payloadHash` (FNV-1a) pour signaler un plan déjà importé ;
  chevauchement des phases vérifié **après** import dans l'ordre du fichier ; une opération invalide n'invalide pas le
  fichier ; `planValidUntil` alimente les rappels.
- Les séances modifiées par l'athlète portent `editedAt` ; l'export les marque `editedByAthleteAt`. Le coach qui les
  réécrit remet `editedAt` à `null`.

## 7. Rappels (`native/notify.ts`, APK uniquement)
Reprogrammés **en entier** à chaque changement (annulation des notifications en attente puis `schedule`) :
séance prévue dans les **3** prochains jours non encore réalisée ; plan à échéance (**3** jours avant `planValidUntil`) ;
plan échu (**7** jours après, relance tous les **7** jours) ; aucun rappel un jour couvert par une interruption à
`suspendsReminders`. Heure = `reminderHour` (défaut **7**). Plugin `LocalNotifications` (icône `ic_stat_apogee`,
couleur `#16181B`), `allowWhileIdle: true`.

## 8. Interface

- **Routes** (hash) : `#/accueil`, `#/calendrier[/…]`, `#/seances[/saisie|/<id>|…]`, `#/progression`, `#/coach`,
  `#/parametres[/profil|/aide|…]`. `calendrier/editer`, `seances/saisie`, `parametres/profil` sont plein écran. Au
  lancement (hors rechargement) on arrive toujours sur l'Accueil. Le retour d'Android ferme feuilles puis écrans
  (historique du navigateur, profondeur dans `history.state`). Période du calendrier dans l'adresse (`?sem=`, `?mois=&sel=`).
- **Mise en page** : mobile = barre d'onglets à 5 entrées ; ordinateur = barre latérale avec logotype serif ;
  groupes à deux colonnes qui se remplissent d'eux-mêmes (`.dmasonry`) — la grille ne doit **pas** répartir la hauteur
  restante (`align-content`), cause de l'espace parasite corrigé le 16/10.
- **Composants** (`ui/kit.tsx`) : cartes, feuilles (gestes tactiles isolés : ils ne remontent pas à l'écran dessous),
  sélecteur de date, `SportPicker` (50 pictogrammes `sport-icons.ts`), menu d'appui long (`menu.tsx`, 380 ms),
  graphiques SVG maison (`charts.tsx`), icônes (`icons.tsx`). Sélection de texte désactivée sauf champs, `pre`, `code`,
  `.selectable`.
- **Éditeur** : glisser-déposer entre séries (trait bleu = point de dépôt, vers la droite pour entrer dans une série),
  duplication, couleurs par type de bloc (échauffement/retour au calme vert, effort rouille, récupération bleu, repos
  gris, transition prune, série violet).
- **Graphiques de charge** : trois panneaux à échelles séparées (forme de fond + fatigue / charge du jour / fraîcheur),
  valeurs aberrantes écrêtées, vue par défaut 1 semaine.
- **Annuler** : `Snapshot` (état avant) + bandeau de toast avec `undo`.
- **Thème** : `light | dark | system` (`apogee:theme`), application immédiate dans `index.html` avant le premier dessin.
- **Langue** : `$t("texte français", {vars})` ; `EN[texte français]` ; changer de langue recharge l'app ; ne sont jamais
  traduits : données saisies, contrat `apogee/1`, classeur Excel.
- **Aide** : `screens/help-content.ts` (FR/EN). Les chiffres doivent rester alignés sur ce document.

### 8.1 Jetons de design (`styles/tokens.css`)
Typographie : Montserrat 500/600/700 (titres, boutons), Open Sans 400/600/700 (texte), Cormorant Garamond 600
(logotype). Couleurs : action/encre `#16181B` (hover `#2C3035`), secondaire `#3E7A86`, tertiaire `#1D6E80`, papier
`#FBFAF7`, surfaces `#F2F0EA`, brand-minimal `#E9E3D6` (fond d'icône), texte `#16181B`/neutre `#55595F`, succès
`#2E7560`, critique `#8E2B20`, avertissement `#9A6B12`, info `#1D6E80`. Disciplines : RUN `#B4432A`, BIKE `#9A6B12`,
SWIM `#1D6E80`, STRENGTH `#4B4499`, BRICK `#7C3663`, OTHER `#6B6F76` (fonds clairs `-bg`). Rampe de forme :
depleted `#4A3A6B`, strained `#4C5C8E`, steady `#3E7A86`, ready `#4E9C86`, fresh `#7BBFA8`. Mode sombre : fond `#0E1215`.

## 9. Service worker et démarrage

**`src/sw.template.js`** (version = SHA-256 des fichiers de `dist`, 10 car. ; liste de fichiers injectée par le build) :
- Installation : `caches.addAll` avec `cache: 'reload'` (jamais le cache HTTP de GitHub Pages, ~10 min : sinon un ancien
  `app.js` se retrouvait rangé avec de nouveaux modules → **écran noir**, corrigé le 16/10) ; `skipWaiting`.
- Activation : supprime `iron-*`, `quadra-*` et les anciens `apogee-shell-*` ; `clients.claim`.
- **Navigations servies depuis le cache** (`caches.match('./')` sinon réseau) : démarrage immédiat, même hors ligne ; une
  nouvelle version prend la main au lancement suivant. `auth.html` jamais mis en cache.
- Polices Google/gstatic et SDK Firebase : cache runtime « stale-while-revalidate ». Autres origines (Firestore) : réseau.
- **Dans l'APK (WebView `; wv)`) le service worker est contourné et désinstallé** : Capacitor doit voir chaque page
  pour y injecter son pont. Conséquence : l'APK n'ouvre pas hors ligne (il charge le site à distance).

**Chaîne de démarrage (`index.html`)** — objectif : jamais de noir/blanc intermédiaire, animation fluide partout.
1. Premier octet : fond encre `#16181B` (`:root:not(.app-ready)`) + `#splash` (3 lunes en SVG séparés, 128 px,
   `animation` limitée à `transform`/`opacity`, `will-change`, lueur par `radial-gradient`, délais .1/.35/.6 s,
   `prefers-reduced-motion` respecté).
2. Polices **servies localement** (`public/fonts`, 7 woff2) et préchargées ; `app.css` chargé en non bloquant
   (`media=print` → `all` au `onload`, avec `window.__css`).
3. Script inline : `MIN = 1700` ms d'affichage minimum ; `go()` retire le splash (fondu 0,3 s) quand l'app a rendu
   (`window.apogeeReady`) **et** que la feuille de style est prête **et** que 1,7 s sont écoulées ; sécurité à 8 s ;
   `hideNative()` appelle `ApogeeHealth.hideSplash` (APK) quand la page a dessiné son écran.
4. `app.js` est importé **800 ms après** le début (`setTimeout(import('./app.js'), d)`) pour ne pas occuper le fil
   principal pendant l'animation (cause des saccades sur téléphone). `scripts/build.mjs` injecte les `modulepreload` à la
   place du marqueur `  <!-- modulepreload -->` (le build **échoue** si le marqueur est absent).
5. Côté Android : `Theme.SplashScreen` (fond `#16181B`, logo `ic_launcher_foreground`) maintenu par
   `setKeepOnScreenCondition(!SplashGate.ready && < 4 s)` jusqu'à `hideSplash`.

## 10. Android (`android-shell/`)

- `configure.mjs` : écrit `capacitor.config.json` avec `appId com.mathieu.apogee`, `appName Apogée`, `webDir www`,
  `server.url = SITE_URL` (cleartext false), `allowNavigation [host, www.gstatic.com, *.googleapis.com,
  *.firebaseapp.com]`, `backgroundColor #16181B`, LocalNotifications (icône/couleur).
- `npx cap add android` puis `patch-android.mjs` (**idempotent**) : permissions Health Connect (lecture seule :
  EXERCISE, HEART_RATE, SPEED, DISTANCE, ACTIVE_CALORIES_BURNED, TOTAL_CALORIES_BURNED, ELEVATION_GAINED, SLEEP,
  RESTING_HEART_RATE, **READ_HEALTH_DATA_HISTORY**) + `POST_NOTIFICATIONS` ; `queries` vers
  `com.google.android.apps.healthdata` ; filtre `ACTION_SHOW_PERMISSIONS_RATIONALE` ; lien `apogee://auth` ;
  `activity-alias ViewPermissionUsageActivity` (Android 14) ; `minSdk 26` ; Kotlin 2.0.21 ; Java 21 ; dépendances
  `androidx.health.connect:connect-client:1.1.0-alpha10`, coroutines 1.8.1, activity-ktx 1.9.3 ; **keystore de debug
  versionné** (`android-shell/keystore/apogee-debug.keystore`, mots de passe `android`, alias `androiddebugkey`) pour que
  toute version s'installe **par-dessus** l'ancienne ; `MainActivity.java` généré (SplashScreen + `registerPlugin`) ;
  icônes `res/` ; thème de lancement ; fond de fenêtre sombre.
- Plugins Capacitor : app, browser, filesystem, local-notifications, share (7.x).
- **Module `ApogeeHealth`** (`plugin/ApogeeHealthPlugin.kt`) : `hideSplash`, `availability`, `permissions`,
  `requestAccess`, `openSettings`, `readSessions(range)`, `readSleep(range)`, `readResting(range)`. Lecture seule.
  `readSessions` rend, par séance : `id, clientRecordId, startTime, endTime, startZoneOffsetSeconds, exerciseType,
  distanceM, activeKcal, totalKcal, elevationM, hr[], speed[]`.
- L'APK affiche le **site publié** : une mise à jour du site met l'app à jour sans réinstaller. Réinstaller l'APK
  seulement si le module natif ou l'écran de lancement change (le « Release apk » est reconstruit à chaque envoi).

## 11. Construction, publication

- `npm run build` : copie `public/` et `index.html` dans `dist/`, esbuild (`app.js` + `auth.js`), `modulepreload`,
  service worker. `npm run dev` : serveur local http://127.0.0.1:5173.
- **CI** (`.github/workflows/publier.yml`, déclenché à chaque envoi sur `main` + manuel, `concurrency publier`) :
  job `web` = `npm install` (pas de lockfile) → `npm test` → `npm run typecheck` → `npm run build` →
  `configure-pages` → `upload-pages-artifact` → `deploy-pages` ; job `apk` (après `web`) = Java 21 Temurin, SDK
  Android déjà présent sur `ubuntu-latest` (ne PAS ajouter `setup-android`), calcule `SITE_URL`
  (`https://<owner>.github.io/<repo>/`), `npm run configure`, `npx cap add android`, `npm run patch`, `npx cap sync
  android`, `./gradlew assembleDebug`, publie `apogee.apk` dans la release de tag **`apk`** (nom « Apogée — APK
  Android », `make_latest`). Versions des actions : checkout/setup-node/setup-java v5, upload-artifact v4,
  configure-pages v5, upload-pages-artifact v3, deploy-pages v4, action-gh-release v2.
- Pas de `@types/node` : `tsc` est limité à `src/` ; les tests tournent avec `tsx`.

## 12. Tests (`tests/domain.test.ts`, 18 tests)
Dates et semaines ; lecteur SQLite + reprise ; TRIMP/dérive ; FC max (valeur saisie jamais écrasée) ; sRPE recalé et
charge provisoire ; Banister (série continue, amorçage, forfait) ; forme du jour (fraîcheur du réveil, référence sans
le jour même) ; estimation durée/distance (fourchette, % VMA) ; rattachement (J±1) ; import manuel en lot ; coach
(export, import, chevauchement après import) ; Health Connect (mise à jour d'une série tardive, nuit la plus longue) ;
bloc sans cible ; BRICK ; dossier coach de l'ancienne app ; sauvegarde (aller-retour exact) ; anciens noms de
formats ; doublons Garmin. Les fixtures SQL reproduisent les migrations Drizzle de l'ancienne base.

## 13. Pièges rencontrés (à ne pas refaire)

1. **Cache HTTP de GitHub Pages + service worker** : toujours `cache: 'reload'` à l'installation du shell.
2. **Animation de démarrage saccadée sur téléphone** : tout ce qui n'est pas `transform`/`opacity` occupe le fil
   principal ; ne jamais animer de `filter`/SVG interne ; différer `app.js`.
3. **Trou noir/blanc entre l'écran natif et la page** : maintenir l'écran natif jusqu'à `hideSplash`.
4. **Google refuse la connexion dans une WebView** : passer par le navigateur + `apogee://auth`.
5. **Service worker et Capacitor** : le contourner dans la WebView, sinon Capacitor n'injecte pas son pont (carte
   Montre « web »).
6. **Firestore 1 Mo par document** : un document par enregistrement, jamais un document par collection.
7. **`pkill -f` dans les scripts de test** : le motif peut matcher le shell lui-même (code 144).
8. **`tsc` sans `@types/node`** : limiter à `src/`.
9. **Gradle/CI** : le SDK Android est déjà sur le runner ; `setup-android` casse la construction.
10. **Renommages** : jamais de perte — recopier clés `localStorage` et bases IndexedDB, accepter les anciens noms de
    formats, garder la même clé de signature.
11. **Dépôt GitHub renommé** : l'URL du site, `SITE_URL` de la CI et `server.url` de l'APK changent ensemble ;
    renommer le dépôt est une action de Mathieu (le proxy de Claude la bloque).
12. **Éviter les dates en dur dans l'UI** : le jour civil dépend du décalage horaire de la séance (`sessionDay`).
13. **Ne jamais livrer de diff à recopier** : toujours des fichiers complets (leçon de l'ancienne version).
14. **Mettre à jour l'Aide** (`help-content.ts`) quand un chiffre de calcul change.
