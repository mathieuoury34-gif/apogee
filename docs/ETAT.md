# ETAT — Apogée

**Dernière mise à jour** 17 octobre 2026
**Phase** Application **livrée et en usage** (web + APK), en finition. Dossier de documentation remis à plat le
16/10/2026 pour pouvoir refaire l'application de zéro : `PRD.md` (quoi / pourquoi), `SPECS-TECH.md` (comment),
`GUIDE-REPRISE.md` (par où recommencer), `HISTORIQUE-RN.md` (archive de l'ancienne version React Native),
`claude/BRIEF-DESIGN.md` (brief nom et logo).
**Dernier commit** `3eb962d` (lot 5) — CI : voir l'onglet Actions (lots 1 à 4 verts, y compris la compilation Kotlin).

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
| Qualité | `npm test` : 29 tests verts ; `npm run typecheck` propre |
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
| 5 | Export `.FIT` d'une séance prévue pour la montre | `3eb962d` | non |

**Retrait du 17/10 (soir, décision de Mathieu).** Testé sur son téléphone avec l'APK à jour : l'écran « Data and access »
de Garmin Connect dans Health Connect ne liste ni puissance, ni variabilité cardiaque, ni poids, et la lecture du tracé
GPS d'une séance répond « aucun tracé ». Ces trois fonctions n'avaient rien à lire : elles ont été supprimées (code,
écrans, plugin Android, aide, tests). Un import de fichier `.FIT` / `.GPX` les aurait rendues possibles ; Mathieu l'a refusé.
La collection `hrv` n'existe plus ; une sauvegarde qui en contient une est lue sans erreur (clé ignorée).

À valider par Mathieu sur appareil : exporter une séance simple en `.FIT` (course, vélo, natation ou renforcement), la
copier dans `GARMIN/Workouts` de la Fenix 7S Pro et vérifier qu'elle apparaît.

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

1. **ACWR et très longues séances (GR20)** — non décidé. L'écart avec Garmin (0,26 contre 2,1) vient probablement de
   sorties de ~1 200 de charge/jour qui gonflent la chronique et d'une échelle différente de l'EPOC. Piste :
   rendements décroissants du ressenti sur les très longues séances. À trancher avec Mathieu avant le GR20.
2. **Rappels (APK)** — les quatre comportements n'ont jamais été observés en conditions réelles. (Le texte de
   Paramètres › Calculs qui annonçait un rappel inexistant a été corrigé le 17/10.)
3. **Interruptions** — jamais confirmées formellement sur appareil par Mathieu (technique complète, testée côté web).
4. **Export `.FIT`** — livré le 17/10, jamais ouvert sur la montre de Mathieu (voir §2 bis). (Puissance, variabilité et tracé GPS : retirés.)
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
- [ ] **Lots du 17/10** : tester un export `.FIT` sur la montre (copie dans `GARMIN/Workouts`).
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
