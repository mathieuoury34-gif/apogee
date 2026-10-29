# ETAT — Apogée

**Dernière mise à jour** 29 octobre 2026
**Phase** Application **livrée et en usage** (web + APK), en finition. Dossier de documentation remis à plat le
16/10/2026 pour pouvoir refaire l'application de zéro : `PRD.md` (quoi / pourquoi), `SPECS-TECH.md` (comment),
`GUIDE-REPRISE.md` (par où recommencer), `HISTORIQUE-RN.md` (archive de l'ancienne version React Native),
`claude/BRIEF-DESIGN.md` (brief nom et logo).
**Dernier commit** `f4af884` (fenêtres à méthodes publiées : Training Effect, VO₂max, prédictions, disponibilité… ; lots du 27/10, voir §2 ter) — CI : voir l'onglet Actions.

---

## 1. En une page

| | |
|---|---|
| Nom | **Apogée** (Iron App → Quadra → Apogée, 16/10/2026) |
| Quoi | Suivi d'entraînement multisport (RUN, BIKE, SWIM, STRENGTH + enchaînements) pour Mathieu, half Ironman Aix-en-Provence le 23/05/2027 |
| Où | Site : https://mathieuoury34-gif.github.io/apogee/ — APK : release `apk` du dépôt, fichier `apogee.apk` |
| Code | GitHub `mathieuoury34-gif/apogee` (public), branche `main`, publication automatique à chaque envoi |
| Données | IndexedDB sur l'appareil + Firestore (projet `apogee-d171c`, Europe `eur3`), connexion Google |
| Montre | Garmin Fenix 7S Pro → Health Connect → APK (Android seulement) |
| Stack | React 19 + esbuild (PWA), Capacitor 7 + Kotlin pour l'APK, Firebase Spark. 0 €/mois |
| Qualité | `npm test` : 36 tests verts ; `npm run typecheck` propre |
| Appareils de Mathieu | PC (Chrome) et téléphone Android (APK) connectés au même compte Google ; synchronisation en service depuis le 16/10 |

## 2. Ce qui est fait (fonctionnel)

Détail des écrans et fonctions : `PRD.md` §7 ; construction : `SPECS-TECH.md`.

- **Calculs** : TRIMP, charge à 4 niveaux d'assise, Banister 42/7 j, ACWR, forme du jour, rattachement prévu ↔
  réalisé (auto + manuel), bilan, dérive, alertes, statistiques, objectif — 18 corrections par rapport à l'ancienne
  version, listées dans `docs/ANALYSE.md`.
- **Données** : stockage local, synchronisation par enregistrement avec Google, Annuler partout, sauvegarde JSON,
  export Excel, reprise de l'ancienne base `.db` et du dossier coach de l'ancienne app, déduplication Garmin.
- **Écrans** : Accueil, Calendrier (semaine / mois, éditeur de blocs, périodisation, appui long), Séances (journal,
  bilan, saisie, statistiques), Progression (charge, ACWR, forme du jour, objectif, zones), Coach, Paramètres, Aide
  (FR/EN, 16 rubriques), Interruptions, thèmes clair / sombre, anglais.
- **APK** : Health Connect en lecture (400 jours à la première lecture), connexion Google par le navigateur,
  notifications locales, partage des exports, écran de lancement natif, mises à jour du site sans réinstaller.
- **Démarrage** : écran animé identique PC / téléphone, 1,7 s minimum, fluide (validé par Mathieu le 16/10 :
  « absolument parfait »).

## 2 bis. Lots du 17/10/2026 (sélection de Mathieu, 19 améliorations)

| Lot | Contenu | Commit | Nécessite l'APK ? |
|---|---|---|---|
| 1 | Recalcul ≈ 5× plus rapide (cache cardiaque), textes corrigés, recherche et période dans le journal, respect du plan | `0d3164a` | non |
| 2 | Onglet Analyse : bilan de semaine, zones de FC et 80/20, forme par discipline, records, efficacité, enchaînements ; prévisionnel de charge ; estimations VMA / CSS ; alerte blessure | `5645825` | non |
| 3 | Copier une semaine, semaines types, séances favorites (collection `templates`) | `822bc22` | non |
| 4 | Poids (saisie à la main) et sommeil ; la puissance vélo, la variabilité cardiaque et le tracé GPS livrés avec ce lot ont été **retirés** (voir ci-dessous) ; nouvelle collection `weight` | `eb01b8d`, retrait `8538c5f` | non |
| 4b | Retouches Analyse (18/10) : bilan sans copie, respect du plan 3 sem./3 mois en couleur, zones FC 4 sem. par défaut, forme de fond expliquée, efficacité vélo dès 2 séances, records recalculés en temps de déplacement, sommeil en temps endormi (étapes) | `0bf8c1d` | **oui** pour le sommeil |
| 5 | Export `.FIT` d'une séance prévue pour la montre | `3eb962d` | non |

**Retrait du 17/10 (soir, décision de Mathieu).** Testé sur son téléphone avec l'APK à jour : l'écran « Data and access »
de Garmin Connect dans Health Connect ne liste ni puissance, ni variabilité cardiaque, ni poids, et la lecture du tracé
GPS d'une séance répond « aucun tracé ». Ces trois fonctions n'avaient rien à lire : elles ont été supprimées (code,
écrans, plugin Android, aide, tests). Un import de fichier `.FIT` / `.GPX` les aurait rendues possibles ; Mathieu l'a refusé.
La collection `hrv` n'existe plus ; une sauvegarde qui en contient une est lue sans erreur (clé ignorée).

À valider par Mathieu sur appareil : exporter une séance simple en `.FIT` (course, vélo, natation ou renforcement), la
copier dans `GARMIN/NewFiles` (ou `GARMIN/Workouts`) de la Fenix 7S Pro et vérifier qu'elle apparaît.

## 2 ter. Lots du 27/10/2026 (demande de Mathieu, captures Garmin Connect)

| Lot | Contenu | Commit | Nécessite l'APK ? |
|---|---|---|---|
| A | Dénivelé (course, vélo) et calories actives ; durées « 2h05 » ; sélecteur de durée qui roule ; export coach sur 1 semaine par défaut | `2b33cb4` | non |
| B | Charge à la Garmin : charge aiguë + entonnoir, rapport, statut par semaine en bande colorée, répartition de la charge | `44930d5` | non |
| C | Menus : Séances = Journal / Statistiques (+ bilans) ; Progression = Charge / Santé / Capacités / Objectif ; Analyse supprimée ; Paramètres › Athlète = profil ; interruptions depuis le Calendrier | `ac25a82` | non |
| D | Calories (actives, repos estimé ou Health Connect, journal de repas), point hebdomadaire notifié (VO₂max, seuil de lactate, HRV, ressenti, prédictions), taille dans le profil, 4 nouvelles collections (`energy`, `meals`, `vitals`, `checkins`) ; lecture Health Connect de la dépense du jour, du VO₂max et de la HRV (**sonde**) | `ac25a82` | **oui** (dépense du jour, VO₂max, HRV) |

| E | Fenêtres « à la Garmin » à **méthodes publiées** (étiquetées *estimation Apogée*, méthode citée sur chaque carte) : Training Effect aérobie/anaérobie par séance, VO₂max estimée, prédictions 5 km–marathon, disponibilité à l'entraînement, réserve d'énergie, indice d'endurance, indice de côtes ; statut HRV retiré du point hebdomadaire | `f4af884` | non |
| E bis | Éditeur de bloc : **roulettes** (comme la durée de séance) pour le temps, la distance (pas de 25 m en natation, 10 m sinon), les répétitions et toutes les intensités (zone, allure, vitesse, puissance, FC, charge, RPE, pourcentages) ; borne haute facultative (bouton) | commit suivant `f4af884` | non |
| E ter | Textes d'explication (méthodes, lecture des graphes, modèles) **repliés par défaut** derrière une icône « i » (composants `InfoCard` / `InfoToggle` / `Info` de `ui/kit.tsx`), l'icône étant **à côté du titre** de la carte (elle n'étire plus la carte) : un appui les affiche, un second les masque. Les messages d'état et avertissements restent visibles | commit suivant | non |
| E quater | 28/10 : « i » bleu clair ; graphes de charge/ratio/forme plus clairs ; **roulette en fenêtre pop-up pour toutes les valeurs de temps, distance et intensité** (`WheelField`, `DurationField`, `IntField`, `DecField`, `DistanceField`, `PaceField`, `MeasureField`, `TargetField` : séances, éditeur de blocs, objectif de course, zones, poids, calories, point hebdo, profil, interruptions) ; sommeil : sessions coupées recollées (≤ 90 min) + détail des 7 dernières nuits ; calories : réglage « calories de repos de la montre » (profil) qui partage le total Health Connect comme Garmin Connect ; répartition de charge pondérée par zone (poids 1–5) et renforcement en anaérobie ; prédictions : exposant amateur 1,12, colonne « Potentiel (VO₂max) » en retrait ; VO₂max : lignes Uth et VDOT retirées de l'affichage ; courbes de capacité calculées par Apogée sur 12 semaines ; disponibilité : liste de ce qui manque quand le score n'est pas calculable | commit suivant | non |

| E quinquies | **28/10 (2e série de remarques, captures Garmin)** : **charge de séance recalée sur Garmin** (modèle d'effort saturant de type EPOC dans `hr.ts` : taux 24,8·(FC/FCmax − 0,5)^1,5, constante 44,7 min, charge = pic ; ajusté sur 4 séances Garmin à ≈ 2 %, remplace le TRIMP de Banister ; **toutes les charges, rapports et statuts changent d'échelle**) ; **période + flèches + curseur + valeurs** (`ui/period.tsx`, `ui/daychart.tsx`, `ui/readout.tsx`) sur charge aiguë, rapport, forme/fatigue/fraîcheur, répartition de charge (datée, fenêtre 2 sem–3 mois), forme par discipline, disponibilité (jour par jour), réserve d'énergie, sommeil, poids, calories, pas/étages, courbes de capacité ; tuiles **chiffres clés** 459 / 1,34 ; couleurs de graphes plus vives ; roulettes sans zéros inutiles ; « i » des commentaires de séances planifiées en bleu clair ; VO₂max sans ligne répétée ; prédictions sans « Potentiel », **calées sur les prédictions de la montre** (coefficient) et ramenées à la forme du jour ; **courbes de capacité quotidiennes** (VO₂max pondérée par l'ancienneté, demi-vie 21 j) ; réserve d'énergie recalée (dépense 55 + 25/séance) ; **sommeil éditable** (coucher/lever, nuit « validée » jamais écrasée) + rappel du matin (Paramètres) ; **pas et étages** (Health Connect `READ_STEPS`, `READ_FLOORS_CLIMBED`, `readDailyActivity`) + carte Santé + **4 tuiles sur l'Accueil** (pas, étages, calories, rapport de charge) | commit de la session | **oui** (pas, étages : nouvelles autorisations ; réinstaller l'APK) |

| E sexies | **28/10 (3e série de remarques, 11 captures)** : « i » repliable pour le commentaire de séance planifiée et la consigne de chaque bloc (`Info title`) ; **titre de série modifiable** (éditeur) ; **liens d'ancre** partout (`?ancre=nom` + `data-anchor` + `useAnchorScroll`, surbrillance `anchor-flash` ; Accueil, tuiles, alertes, notifications, Santé, Capacités, Paramètres) ; **bases de temps uniques** 1 sem. / 2 sem. / 1 mois / 3 mois / 6 mois / 1 an / Tout, **défaut 1 sem.**, sur tous les graphes, le Coach, le Journal, les Statistiques et le statut d'entraînement (cases par jour jusqu'à 1 mois, par semaine au-delà) ; tuiles jaunes en double retirées (charge aiguë) ; Aide : 2 boutons APK côte à côte ; carte Montre : détail dans une flèche dépliable (`Disclosure`) ; **calories** : filtre sur les sources Garmin, lecture de la dépense de base (`READ_BASAL_METABOLIC_RATE`) + relecture unique de 120 jours de dépense (`healthEnergyScan`), phrase « ce que ta montre… » retirée | commit de la session | **oui** (réinstaller l'APK ; nouvelle autorisation « dépense de base ») |

**Proposition en attente de validation (28/10)** : nouvel agencement des onglets Séances et Progression (données les plus pertinentes en haut). Rien n'est modifié tant que Mathieu n'a pas validé.

| E septies | **29/10 (4e série)** : consignes de bloc de nouveau visibles (seul le commentaire de séance reste derrière « i ») ; Aide fermée par défaut ; bases de temps sur **une seule ligne défilante** (balayage des flèches limité à la ligne des dates) ; bandeau du statut retiré ; **agencement validé** : Journal (résumé de la période), Statistiques (bilan de semaine, respect du plan, bilan global, répartition, détail par discipline, zones FC, records, efficacité, enchaînements), Charge (statut, charge aiguë, forme/fatigue/fraîcheur, répartition, prévisionnel, forme par discipline), Santé (disponibilité, réserve, sommeil, pas/étages, calories, poids, détail de la forme), Capacités (VO₂max, prédictions, endurance/côtes, courbes, point de la semaine) ; **lecteur Health Connect refait** : sources Garmin seules (détection sur 7 jours, pas + calories), **mesures qui se recouvrent comptées une seule fois** (séance déposée en plus du suivi de la journée), relecture de 180 jours une fois (`healthGarminScan` = 2) puis des 7 derniers jours à chaque lecture, **diagnostic Garmin** (Paramètres › Montre › Détail) ; **hors ligne** : cause trouvée (le service worker n'était jamais enregistré car le programme s'exécute après l'événement « load »), manifest sombre (`#16181B`), barre d'état sombre pendant le démarrage (`refreshThemeColor`), script `scripts/pwa-offline-check.py` (PASSE), APK : rouverture depuis la mémoire du téléphone sans réseau (`MainActivity`, `ACCESS_NETWORK_STATE`) | commit de la session | **oui** (réinstaller l'APK pour les calories, pas, étages et le hors ligne de l'APK) |
| E octies | **29/10 (5e série)** : **Statistiques** : « Respect du plan » juste après « Temps par zone de FC », « Bilan de semaine » retiré (il reste sur l'Accueil) ; **Objectif** : « Respect du plan » retiré ; **Capacités** : « Point de la semaine » en premier, coche verte « Fait cette semaine » + date du prochain dimanche, **jour du relevé** choisissable (par défaut le prochain dimanche, passé autorisé pour recopier d'anciennes prédictions de la montre ; une fiche par semaine, champ `day`) ; **calage des prédictions** : à chaque point daté, Apogée compare ce qu'il annonçait CE jour-là à la montre, coefficient = médiane sur les 8 derniers points (`watchCalibration`) ; **histogramme des calories** en couleurs chaudes (actives orange-rouge, repos ambre) ; **lecteur de pas** : pages de 300, tranches de 7 jours, repli sur le total du jour de Health Connect, erreurs affichées dans le diagnostic (`version` 3) ; **import de relevés Garmin** (`apogee-garmin/1`, Paramètres › Sauvegarde › Importer un fichier JSON) : ne remplace rien, comble les jours/fiches manquants (`src/domain/garminGraph.ts`) ; fichier mesuré sur les 16 captures de Mathieu (calories, pas, étages, prédictions du 12/07 au 29/10) | commit de la session | **oui** (lecteur de pas et diagnostic) |

| E nonies | **29/10 (suite de la 5e série, retours de Mathieu sur l'APK)** : **coche verte** si le dernier dimanche (ou la semaine en cours, saisie à l'avance) a son point (`checkinStatus` : `due`, `next`) ; **pas** : cause trouvée sur l'appareil — Garmin dépose parfois une mesure à 0 pas et la lecture mesure par mesure plante (« count must not be less than 1 ») ; les pas passent désormais par le **total du jour de Health Connect** (±0,5 % de Garmin sur les 6 jours vérifiés) ; **étages** : Health Connect en contient ≈ 3 de moins par jour que Garmin (non récupérable) ; **calories** : le diagnostic montre l'heure à laquelle Garmin a écrit chaque jour (un jour figé avant minuit n'a pas la fin de journée ; 25/10 = jour de changement d'heure) ; **courbes de la montre** : mêmes périodes, même curseur (aujourd'hui par défaut) et mêmes flèches que les autres graphes, relevés reliés, le curseur lit le dernier relevé connu ; **.FIT** : chaque étape porte un commentaire de 1 à 5 mots (consigne du bloc, à défaut son libellé), champ `notes` du FIT, affiché par la montre en séance | commit de la session | **oui** (pas, diagnostic) |

**Réponse de fond (27/10)** — les indices de Garmin (Firstbeat) sont propriétaires et ne sont pas dans Health Connect ; Apogée calcule ses **propres
équivalents** avec des méthodes de la littérature (voir SPECS-TECH §5.11 ter), étiquetés comme tels et non comparables un à un. Mathieu a confirmé
(27/10) que **Health Connect ne remplit ni VO₂max ni HRV** malgré l'autorisation : le point hebdomadaire saisi à la main et les estimations restent les sources.
Décision de Mathieu : **pas de statut HRV** (ni dans les fenêtres ni dans le formulaire).

À valider par Mathieu avec l'APK à jour : la carte Montre doit dire combien de jours de dépense, de VO₂max et de HRV ont été lus.

## 3. Journal condensé (Iron App 2 et suites)

| Date | Événement |
|---|---|
| 12/10/2026 | Décision de Mathieu : reconstruire sur le modèle de PEAnalyze (web + APK, compte Google). Livraison complète du domaine (14 tests), des écrans, de l'APK, de la CI. Firebase `ironapp-99f99` créé, site et APK en ligne. Reprise de l'ancienne base `.db` (46 séances réalisées, 34 prévues vérifiées). Reprise complétée par le dossier coach. Anglais. Aide. Diagnostic de la carte Montre ; service worker contourné dans la WebView |
| 16/10 matin | 22 améliorations d'usage : éditeur (nom de bloc, duplication, appui long + glisser, couleurs), balayage, Paramètres réordonnés, graphe de charge en 3 panneaux, ACWR détaillé, « Inclure Autre », export coach enrichi, sous-sports d'« Autre », nouveau logo, teintes |
| 16/10 | Renommage **Quadra** (commits `9672670`, `23a70a1`, `a8b4260`) puis **Apogée** (`11afaf9`) : texte, manifeste, identifiant Android `com.mathieu.apogee`, plugin `ApogeeHealth`, lien `apogee://`, formats `apogee/1`, `apogee-backup/1`, clés `apogee:*`, base `apogee`, icônes (`tools/icons.py`). Aucune perte : anciens noms acceptés, clés recopiées, même clé de signature. Éditeur : glisser entre séries ; graphes de charge ; appui long ; titres libres |
| 16/10 | Nouveau projet Firebase **`apogee-d171c`** branché (`ec66444`) ; PC et téléphone reconnectés |
| 16/10 soir | Retours ordinateur (`b6bccc0`, `8f40f46`) : colonnes qui se remplissent (`.dmasonry`), calendrier qui garde sa période, test de sauvegarde. **Écran noir sur PC** corrigé (service worker `cache: 'reload'`, `6f24c4c`). **Doublons Garmin** fusionnés (`b3d2f55` : 101 → 58 séances sur le PC). Sélection de texte désactivée, gestes des feuilles isolés, **50 pictogrammes** de sports (`92e6b00`) |
| 16/10 nuit | **Démarrage** : cause du « noir → blanc → app » = attente réseau à chaque lancement. Écran de démarrage inline, polices locales, CSS non bloquant, modulepreload, navigations en cache (`65ffb7a`) ; écran natif de l'APK maintenu (`45aea42`) ; animation maintenue 1,7 s (`b7dd12a`) ; animation fluide sur téléphone : transform/opacity seulement, lueur par dégradé, `app.js` après 800 ms (`07c9cbc`). Validé par Mathieu |
| 16/10 nuit | **Documentation entièrement remise à jour** (ce dossier) |
| 17/10 | Cinq lots d'améliorations demandés par Mathieu (voir §2 bis) ; documentation mise à jour |

## 4. Points ouverts (par priorité)

1. **ACWR et très longues séances (GR20)** — à revoir : le modèle d'effort saturant (28/10) réduit déjà le poids des très longues séances faciles. Ancien constat : L'écart avec Garmin (0,26 contre 2,1) vient probablement de
   sorties de ~1 200 de charge/jour qui gonflent la chronique et d'une échelle différente de l'EPOC. Piste :
   rendements décroissants du ressenti sur les très longues séances. À trancher avec Mathieu avant le GR20.
2. **Rappels (APK)** — les quatre comportements n'ont jamais été observés en conditions réelles. (Le texte de
   Paramètres › Calculs qui annonçait un rappel inexistant a été corrigé le 17/10.)
3. **Interruptions** — jamais confirmées formellement sur appareil par Mathieu (technique complète, testée côté web).
4. **Export `.FIT`** — livré le 17/10, validé sur la montre le 19/10 (copie dans `NewFiles`). (Puissance, variabilité et tracé GPS : retirés.)
5. **APK sans mode hors ligne** — il charge le site à distance. Option : embarquer l'app dans l'APK (non faite ;
   imposerait de réinstaller l'APK à chaque mise à jour).
6. **Aide** (`help-content.ts`) — mise à jour le 17/10 pour les lots 1 à 5 ; à relire si un calcul change ; non revérifiée ligne à ligne contre le code.
7. ~~Texte « À propos »~~ — corrigé le 17/10 (« multisport »).
8. **Guide Excel / dossier coach** restent en français (par choix).

## 5. À faire par Mathieu (hors code)

- [ ] Supprimer l'ancien projet Firebase **`ironapp-99f99`** vers le **23/10/2026**, après vérification que PC et
      téléphone affichent les mêmes séances.
- [ ] Désinstaller l'ancienne application Android « Quadra » (identifiant `com.mathieu.quadra`) et, si elle traîne,
      « Iron App ».
- [ ] Supprimer dans la release `apk` les anciens fichiers `iron-app.apk` et `quadra.apk` (le proxy de Claude ne peut
      pas le faire).
- [ ] Vérifier que le dépôt GitHub s'appelle bien `apogee` (le remote local pointe encore vers l'ancienne adresse
      `ironapp`, qui redirige) et que le dossier local de l'ordinateur est à jour (`Perso\Apogee`).
- [ ] Déposer `docs/coach-context-apogee-1.md` dans les connaissances du projet Claude de coaching s'il ne l'est pas.
- [ ] Faire une sauvegarde `.json` (Paramètres › Données) après chaque grosse saisie ; garder une copie de l'archive du
      code livrée avec ce dossier.
- [x] **Lots du 17/10** : export `.FIT` testé sur la montre (OK) (copie dans `GARMIN/NewFiles` (ou `GARMIN/Workouts`)).
- [ ] Observer les rappels pendant quelques jours (§4.2).

## 6. À faire par Claude (si demandé)

- Trancher et construire l'atténuation de l'ACWR (§4.1) une fois la règle choisie.
- Option « APK avec l'app embarquée ».
- Tout ajout hors périmètre MVP : le signaler explicitement (`PRD.md` §3 et §8).

## 7. Méthode de travail (à garder)

- Mathieu porte le produit et valide ; Claude écrit le code et répond en français avec des étapes complètes.
- Livrer des **fichiers complets**, jamais des diffs à recopier. Vérifier par `npm test`, `npm run typecheck`, build,
  captures Playwright (`tools/shots.py` + `tools/demo.json`), vidéos pour les animations.
- Pousser sur `main` : la CI teste, publie le site et reconstruit l'APK. Vérifier qu'elle est verte.
- Toute modification de calcul → mettre à jour l'Aide, `docs/ANALYSE.md` et `SPECS-TECH.md` §5.
- Signaler tout ce qui sort du périmètre MVP avant de le faire.
- Un problème de démarrage/cache : voir `SPECS-TECH.md` §9 et §13 avant de chercher ailleurs.

**19/10/2026 — export `.FIT`** : Mathieu a tenté d'envoyer les fichiers par « Importer des données » de Garmin Connect (site) : refus de
tous, car cette page n'accepte que des **séances faites** (`.fit` d'activité, `.tcx`, `.gpx`), jamais un entraînement à venir. Ce n'est pas un défaut
des fichiers (les RPE ne sont pas transmis : étape ouverte, simple avertissement). Voie correcte : copie USB dans `GARMIN/NewFiles` (ou
`Workouts`). Textes de l'app et aide corrigés. **Validé par Mathieu le 19/10 sur sa montre** : copie dans `GARMIN/NewFiles`, les séances apparaissent. Aide et texte du calendrier précisent ce dossier.
