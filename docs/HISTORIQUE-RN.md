# HISTORIQUE — ancienne application Iron App (React Native)

**Statut : ARCHIVE. Ne décrit plus l'application actuelle (Apogée).** Ce fichier conserve, **sans les modifier**,
les trois documents de l'ancienne version (Android seulement, React Native / Expo, SQLite / Drizzle, 100 % locale,
développée du 21/08 au 09/09/2026) :

1. **Partie A — ETAT.md (historique)** : journal détaillé de chaque tranche (T0 à T6.5), des bugs, des décisions et des
   incidents d'outillage.
2. **Partie B — PRD v1.4** : produit tel qu'il était avant la reconstruction (contraintes aujourd'hui levées : voir
   `PRD.md` §3).
3. **Partie C — SPECS-TECH v1.4 (§1–§25)** : architecture React Native / Drizzle, schéma SQL, règles d'interface,
   écrans, migrations.

À quoi ça sert encore : comprendre **pourquoi** une règle existe (la plupart des règles de calcul et de produit
d'Apogée viennent d'ici), retrouver le détail d'une décision, ou refaire un module à l'identique. Les leçons utiles
ont été reportées dans `PRD.md` §10 et `SPECS-TECH.md` §13. Le code de cette version n'est plus maintenu ; une archive
`ancienne-app.zip` (sans `node_modules`) se trouve sur l'ordinateur de Mathieu, pas sur GitHub.

Correspondance rapide ancien → nouveau : `metrics/*` → `src/domain/{hr,load,form,review,stats,objective}.ts` ;
`planning/plannedSessions.ts` → `blocks.ts` ; `planning/sessionLinks.ts` → `links.ts` ; `planning/coach*.ts` → `coach.ts` ;
`health/ingest.ts` → `health.ts` ; tables Drizzle (16 tables) → 12 collections (`SPECS-TECH.md` §3) ;
format `ironapp/1` → `apogee/1` ; `daily_load` / `session_link` (caches stockés) → recalcul à la volée (`engine.ts`).

---

# PARTIE A — ETAT.md (historique de l'ancienne application, état au 09/09/2026)

# Historique — ancienne application (React Native)

**Dernière mise à jour** 9 septembre 2026
**Phase en cours** Refonte visuelle quasi intégrale de l'application,
menée en une seule très longue conversation le 09/09, sur la maquette
Claude Design (`Iron_App__Refonte_dc.html`) et sa spécification
d'accompagnement (`HANDOFF.md`). **L'icône n'est plus un point ouvert au
sens du 06/09** : premier plan, monochrome et version plate sont conçus,
rastérisés et `app.json` configuré. Il reste à les placer dans le projet,
lancer un build EAS (`--clear-cache`) et vérifier sur un lanceur Android
réel — jamais fait à ce jour. **Mathieu a fixé le périmètre de la
prochaine conversation à trois points précis, voir « Message de
lancement » en fin de document — considérée comme la DERNIÈRE du projet.**

---

## Où en est le projet

**Session du 09/09 : refonte visuelle de la quasi-totalité de l'application,
en une seule conversation.** Partie d'un écran (Saisie manuelle) déjà
refondu par une session précédente non documentée dans cette version
d'ETAT.md, la conversation a reconstruit ou corrigé, dans l'ordre où
Mathieu les a signalés : Coach, Statistiques, Paramètres, Health Connect
(nouvel écran d'explication), Périodisation (nouvel écran, remplace
l'ancien `PhasesScreen.tsx` jamais migré), Édition d'une séance réalisée
(nouvelle feuille), le Calendrier (bouton d'ajout toujours masqué à tort,
carte Prévu enrichie au niveau du bloc), l'Accueil (VMA/CSS, objectif,
barème, légende du graphe de charge), l'éditeur de séance planifiée
(calcul croisé durée/distance, allure calculée pour une cible relative),
et l'icône de l'application. Voir « Fait — cette conversation (09/09) »
pour le détail complet, très long.

**Écarté sur décision de Mathieu, à ne pas reproposer :**
- **Écran de premier lancement** — envisagé un temps par Claude, retiré du
  périmètre après réflexion de Mathieu (« c'est nul »).
- **Détail d'un bloc réalisé** — n'a pas de sens dans ce domaine : une
  séance réalisée (Health Connect ou saisie manuelle) n'a pas de structure
  de blocs à détailler, contrairement à une séance planifiée.

### Fichiers jamais reçus de toute cette session, connus pour exister

`planning/coachImport.ts`, `metrics/disciplineStats.ts`, `health/client.ts`
— tous les trois utilisés par du code livré cette session sur la seule foi
de leur usage observé dans d'autres fichiers, jamais vérifiés contre le
fichier réel. Aucun n'a produit d'incohérence connue à ce jour, mais aucun
n'a été confirmé non plus. À demander si la prochaine conversation touche
Coach ou Statistiques en profondeur.

---

## Fait — cette conversation (9 septembre 2026)

**Refonte visuelle de la quasi-totalité de l'application sur la maquette
Claude Design, en une seule très longue conversation. Détail exhaustif
ci-dessous — sauter à « Message de lancement » en fin de document pour le
strict nécessaire de la prochaine session.**

### Méthode et système visuel

Tout écran refondu ou créé cette session utilise les composants v2 déjà
posés avant cette conversation (`ui/Nombre.tsx`, `ui/Picto.tsx`,
`ui/Pastille.tsx`, `theme/tokens.ts`) plutôt que les compat v1
(`ui/DataValue.tsx`, `ui/Icon.tsx`, `ui/SessionChip.tsx`) — voir §15 de
SPECS-TECH pour le détail des règles et le piège découvert sur
`Pastille.discipline`.

**Reconstruction, pas restylage, pour les écrans suivants** (fichier
complet redonné à chaque fois, jamais un diff) : Coach, Statistiques,
Paramètres. Les trois avaient une structure visuelle suffisamment
éloignée de la maquette (bandeau global de Statistiques, sélecteur de
séances en feuille séparée sur Coach, deux `Alert` natifs pour la
suppression sur Paramètres) pour qu'un patch chirurgical n'aurait fait que
complexifier le fichier sans converger vers la maquette.

**Patch chirurgical, pour tout le reste** : `HomeScreen.tsx`,
`CalendarScreen.tsx`, `AppNavigator.tsx`, `SessionReviewScreen.tsx`,
`planning/plannedSessions.ts`, `health/manualEntry.ts`, `ui/DayFocusView.tsx`,
`ui/LoadChart.tsx`, `screens/BlockSheet.tsx`,
`screens/PlannedSessionEditorScreen.tsx` — déjà dans le bon système visuel
ou déjà fonctionnellement corrects pour l'essentiel, seule la partie
concernée a été touchée.

### Coach — reconstruit

- **Le sélecteur de séances à exporter n'ouvre plus de feuille séparée**
  (`SessionPickerSheet.tsx`, ancien composant, plus utilisé sur cet
  écran). La liste est directement sur l'écran, filtrée par des pastilles
  de période — **1/2/4/8 semaines** (le « 1 semaine » et le bouton « Tout
  sélectionner » sont des ajouts de Mathieu en cours de route, absents de
  la maquette initiale).
- **Aperçu de l'import** reconstruit en feuille remontante (`Modal`
  transparent, grabber, coins arrondis) avec des badges de compte par type
  de changement (ajoutée/modifiée/supprimée) et une liste plate à icône
  par ligne plutôt que des sections groupées par type.
- **Écart assumé** : `PreviewItem.label` (`coachExport.ts`, reçu cette
  session) est déjà « un résumé lisible : discipline et date pour une
  séance » — une seule chaîne, pas de champs structurés séparés. Chaque
  ligne de l'aperçu affiche donc ce label tel quel, sans pastille de
  discipline ni colonne de date dédiée comme la maquette le suggérait.

### Statistiques — reconstruit

- Sélecteur de discipline reconstruit en cinq carrés (plein+blanc actif,
  contour+teinté sinon) — `ui/DisciplineSelector.tsx` n'a jamais été reçu
  de toute la session.
- **L'aperçu global (« depuis le X · N séances · N heures »), commun à
  toutes les disciplines, a été retiré** pour suivre la maquette : le
  triplé Séances/Volume/Distance appartient désormais à la discipline
  choisie, pas à l'ensemble.
- **Contradiction découverte avec Paramètres** (voir plus bas, section
  Paramètres) : la suppression des données demande de recopier « le
  nombre affiché sur Statistiques », qui n'existe plus sous cette forme.
  **Corrigé a minima** : une ligne de total global
  (`stats.overview.total`) a été réintroduite sous le titre, suffisante
  pour que Paramètres reste cohérent, mais PAS le traitement visible que
  Mathieu demande maintenant pour ce total — voir « Message de
  lancement », point 2.
- Journal : `Pastille` remplace `SessionChip`. Chaque ligne montre le nom
  de la discipline, pas un titre de séance individuel — `LogEntry`
  (`metrics/disciplineStats.ts`, jamais reçu) pourrait porter un champ
  titre inutilisé par l'ancien écran ; non vérifié.
- **État vide du Brick reconstruit** (« Aucun enchaînement confirmé… »,
  deux façons d'en obtenir un, aperçu de ce que l'écran affichera) —
  n'existait pas avant cette session, construit à partir d'une capture de
  Mathieu.

### Paramètres — reconstruit

- Thème en trois boutons segmentés (Clair/Sombre/Système), plus large que
  l'ancienne rangée de radios.
- **Le mécanisme de suppression change de nature, pas seulement
  d'habillage** : les deux `Alert.alert` successifs (voir §23) sont
  remplacés par un flux ENTIÈREMENT DANS L'ÉCRAN, en deux étapes — l'étape
  1 demande de recopier le nombre total de séances (calculé via
  `loadStatsOverview().sessions`) avant de pouvoir continuer, l'étape 2
  redemande une confirmation différente (jamais la même question deux
  fois, principe déjà en place au 06/09) puis déclenche `deleteAllData`.
  Aucune des deux fonctions de `settings/appData.ts` n'a changé.
- **« Dernière lecture »** ajoutée sous le statut Health Connect, à partir
  de `health/ingest.ts::readSyncState()` — `syncedUntil`, jamais
  `lastRunAt` (qui avance à chaque tentative même refusée ; `syncedUntil`
  n'avance que sur une ingestion réellement réussie, exactement ce que
  « depuis quand plus rien n'est lu » doit refléter).

### Health Connect · état refusé — écran neuf

N'existait pas avant cette session. Explique ce qui change quand les
permissions ne sont pas accordées (tout passe par Saisie manuelle, assise
`saisie` ; forme du jour non calculée, pas remplacée par une valeur de
secours ; charge/fond/fatigue continuent de se calculer sur les séances
saisies, en assise estimée) et montre un aperçu de ce que devient l'Accueil
dans cet état. Relié depuis Paramètres, visible seulement quand Health
Connect n'est pas pleinement accordé. **Simplification assumée** : la
ligne « dernière lecture » y est absente au premier jet (avant réception
d'`ingest.ts`), puis ajoutée avec la même fonction `readSyncState` que
Paramètres.

### Périodisation — écran neuf, remplace l'ancien `PhasesScreen.tsx`

**Découverte importante** : l'ancien `screens/PhasesScreen.tsx` (T3.3.a,
jamais mentionné dans les versions précédentes de ce document comme
composant d'un système de route) était ouvert par `CalendarScreen.tsx` via
un **`Modal` local codé en dur dans l'écran appelant**, entièrement
EN DEHORS du système `navigation/routes.ts`/`AppNavigator.tsx`. Ce
mode d'ouverture n'était documenté nulle part dans SPECS-TECH ni ETAT.
`screens/PeriodizationScreen.tsx` (nouveau) + `screens/PhaseSheet.tsx`
(nouveau, feuille de création/édition) reprennent la même logique
(`planning/trainingPhases.ts`, inchangée) sous une vraie route
(`{ kind: 'periodization' }`), et `CalendarScreen.tsx` est corrigé pour
pousser cette route au lieu d'ouvrir l'ancien `Modal`.

**`PhasesScreen.tsx` n'a donc plus aucun appelant — supprimable du
projet.** `ui/WeekRow.tsx` et `ui/DayList.tsx` également, confirmé par une
note dans l'en-tête de `CalendarScreen.tsx` lui-même (« n'ont plus
d'appelant après ce fichier ») — probablement de longue date, pas causé
par cette session.

L'édition (créer/modifier un bloc, formulaire complet) est CONSERVÉE dans
le nouvel écran, même si la capture d'écran fournie par Mathieu ne montrait
que l'état liste — `fr.ts` portait déjà tout un jeu de clés `phase.*` pour
un formulaire complet, vestige de l'ancien écran ; rien n'indiquait que
cette fonctionnalité ait été volontairement supprimée. **À confirmer avec
Mathieu si c'était en fait l'intention.**

Le bloc « Course » de la liste (couleur `discipline.course`, un seul jour)
est identifié par comparaison de date (`phase.endDate === race.raceDate`)
— `Phase`, le type lu par `listPhases()`, ne porte pas `raceId` bien que
la colonne existe dans le schéma.

### Édition d'une séance réalisée — feuille neuve

HANDOFF (fenêtres dérivables) : feuille sur le Bilan, champs de Saisie
manuelle préremplis, éditer une valeur mesurée bascule son assise en
`saisie`. **`health/manualEntry.ts` gagne `updateActualSession()`** —
délibérément un vrai `UPDATE`, jamais un supprimer-puis-recréer :
`deleteActualSession` (30/08) nettoie explicitement `feedback` et
`session_link` avant de supprimer la ligne, ce qui aurait effacé le RPE et
tout rattachement existant à chaque édition. `updateActualSession` pose
`rawExerciseType: 'manual'` à chaque appel — c'est ce même champ qui fait
basculer l'assise en `saisie` ailleurs dans l'app, y compris pour une
séance venue de Health Connect à l'origine. Un conflit possible sur
`garmin_activity_id` (recalculé à chaque édition, puisqu'il dépend des
champs modifiés) est rendu comme un échec `DUPLICATE` explicite plutôt que
de laisser SQLite refuser l'écriture en silence.

### Calendrier — deux bugs corrigés

1. **Impossible d'ajouter une deuxième séance le même jour.**
   `ui/DayFocusView.tsx` n'affichait le bouton d'ajout (Prévu comme
   Réalisé) QUE quand la liste était vide — `planned.length === 0 ?
   <Ajouter> : <Liste>`, jamais les deux. Rien dans le domaine ne borne un
   jour à une séance ; c'était un défaut de ce fichier, pas une règle.
   Corrigé : le bouton reste visible sous la liste, vide ou non.
2. **Carte Prévu enrichie au niveau du bloc.** `ui/DayFocusView.tsx`
   notait dans son propre en-tête ne jamais avoir reçu
   `planning/plannedSessions.ts`/`planning/blockText.ts`, et ne montrait
   donc qu'un résumé (titre, nombre de blocs, durée) — pas les blocs
   eux-mêmes, contrairement à HANDOFF §8.3. Les deux fichiers étant
   désormais en main, la carte descend au niveau du bloc (rôle en chasse
   fixe à gauche, contenu à droite, même vocabulaire que l'éditeur). Blocs
   de premier niveau seulement — un SET se résume à sa propre ligne, ses
   enfants restent le détail de l'éditeur.
3. Le glyphe de blocs de l'en-tête pointe désormais vers `periodization`
   (voir section Périodisation ci-dessus) au lieu de l'ancien `Modal`.

### Bug de fond corrigé — flash de l'onglet au changement d'écran

`AppNavigator.tsx` redéclenchait l'animation de fondu (`opacity` remise à
0 puis ranimée) à CHAQUE changement de route, y compris en se déplaçant
DANS une pile déjà ouverte (Profil → Identité, par exemple), pas seulement
à l'ouverture depuis la racine d'un onglet. Un repaint laissait voir
l'onglet actif en dessous (l'Accueil, le plus souvent, puisque c'est
depuis lui que Profil s'ouvre). Corrigé en liant le fondu à la transition
« aucun détail ↔ un détail », jamais à un déplacement interne à une pile
déjà visible.

### Calcul croisé durée ↔ distance — `planning/plannedSessions.ts`

Signalé par Mathieu sur appareil : une séance en distance + allure
affichait « 0 min » de durée totale, une séance en durée + allure
affichait une distance à « — ». `estimateDuration`/`estimateDistance` ne
dérivaient jamais l'une de l'autre — un bloc `measure: 'DISTANCE'` avec
une allure cible ne contribuait JAMAIS à la durée, et réciproquement.
Corrigé : les deux fonctions dérivent désormais la grandeur manquante à
partir d'une cible **ABSOLUE** de rythme (allure ou vitesse chiffrée,
`relativeTo === null`). Un pourcentage relatif (% VMA/CSS/FTP) n'est
jamais résolu ici — ça demanderait de lire les zones de l'athlète depuis
une couche de données qui n'a pas à le faire ; le bloc reste alors « non
chronométré », comme avant. Signature étendue d'un second paramètre
optionnel `discipline` (pour la convention allure/100 m de la natation),
rétrocompatible — les deux call sites connus (`PlannedSessionEditorScreen.tsx`,
`metrics/sessionReview.ts::compareToPlan`) le fournissent désormais.

### Cible relative affichée en allure calculée — `PlannedSessionEditorScreen.tsx`

Sur demande de Mathieu : une cible en % VMA/CSS/FTP affiche désormais
l'allure/puissance/FC équivalente (à partir du dernier relevé de zone
connu) plutôt que le pourcentage brut, sur la ligne de bloc de l'éditeur.
**Convention posée cette session, sans précédent à vérifier** : `X %` est
toujours lu comme « X % de la VITESSE (ou de la puissance, ou de la FC
max) », jamais du TEMPS — y compris pour la CSS, un pas de temps traité
comme l'inverse d'une vitesse pour rester cohérent avec VMA. Confirmé en
lisant `planning/blockText.ts` (reçu en cours de session) : ce fichier
n'a JAMAIS fait cette conversion, il affiche le pourcentage brut — la
fonctionnalité est donc entièrement nouvelle, pas une correction d'une
formule existante. **À valider sur l'appareil.**

### Accueil — quatre corrections

- **VMA/CSS de la carte d'identité, vraie cause enfin trouvée.** Le code
  testait `reading.unit === 'm/s'` pour déclencher la conversion — mais
  l'unité réellement stockée est `m_s` (documenté comme piège connu, jamais
  vérifié sur appareil avant cette session). La condition ne se
  déclenchait donc jamais, produisant l'affichage brut vu sur appareil
  (« VMA 4.388888888888889m_s »). Corrigé avec `referenceNumeric()`
  (`metrics/disciplineStats.ts`), qui convertit par nature du socle et non
  par comparaison de chaîne d'unité.
- **Objectif de la carte d'identité en format `XhXX`** au lieu de minutes
  brutes (« 345 min » → « 5h45 ») — un formateur dédié à ce seul usage,
  distinct de celui qui reste en minutes pour la séance du jour.
- **Barème « Forme du jour » colorié en escalier** : tous les crans
  jusqu'au cran courant inclus sont désormais colorés (chacun de sa propre
  teinte), pas seulement le cran courant seul.
- **Légende du graphe de charge** accordée aux nouvelles couleurs de
  `LoadChart.tsx` (voir plus bas) — sinon graphe et légende se
  contrediraient.

### Couleurs du graphe de charge — écart assumé à un principe déjà écrit

SPECS-TECH §15 : « la couleur est un budget, et un seul élément par écran
le dépense » — Statistiques déjà notée comme exception délibérée.
`ui/LoadChart.tsx` reçoit une seconde exception, sur demande explicite de
Mathieu : Fond en `theme.form.steady`, Fatigue en `theme.form.strained`,
Fraîcheur en `theme.form.fresh`/`depleted` selon le signe de chaque barre.
Choix fait pour limiter l'écart : réutilisation d'une palette déjà
dépensée ailleurs (la Forme du jour de l'Accueil) plutôt qu'ouverture
d'une troisième palette isolée.

### Icône de l'application

Les deux SVG (`icone-app-foreground.svg`, `icone-app-monochrome.svg` —
deux traits, l'un plein l'autre tireté, motif déjà présent ailleurs dans
l'app pour mesuré/estimé) ont été fournis par Mathieu cette session — je
ne les avais jamais eus avant, malgré une mention dans une passation
antérieure. Rastérisés en PNG 1024×1024 via `sharp` (déjà disponible dans
l'environnement d'exécution de Claude, aucune installation nécessaire) :
premier plan transparent, monochrome, et une version composée à plat
(premier plan sur fond `#E9E3D6`) pour l'icône de secours. `app.json`
modifié : `icon`, `android.adaptiveIcon.foregroundImage`/
`.monochromeImage`/`.backgroundColor`. **Aucun de ces trois PNG n'a été
placé dans le projet ni buildé à ce jour** — voir « Message de lancement ».

### Documents de contexte — reconstruits une fois par erreur, puis corrigés

Avant que Mathieu ne retrouve et renvoie les trois fichiers réels
(`PRD.md`, `SPECS-TECH.md`, `ETAT.md`), Claude en avait produit une
reconstruction complète à partir de sa seule mémoire du projet — search
jamais comparée aux fichiers réels, action reconnue comme un doublon
maladroit une fois les vrais fichiers reçus. Cette version-ci édite les
fichiers RÉELS, par ajout, sans toucher à l'historique déjà écrit.

### Deux leçons de méthode

**Le mésusage de `Pastille`** — `Pastille.discipline` (`ui/Pastille.tsx`,
reçu cette session) attend le jeton FRANÇAIS
(`course`/`velo`/`natation`/`renforcement`/`brick`/`autre`), jamais la
discipline anglaise du domaine sans passer par `disciplineToken()`
(`ui/discipline.ts`). Une conversion oubliée a fait planter Coach et
Statistiques au premier essai (`tokens.pictos['RUN']` est `undefined`) ;
deux hypothèses de correction distinctes ont été tentées avant de trouver
la vraie cause avec `Pastille.tsx`/`Picto.tsx` en main. Vérifié depuis sur
tous les écrans livrés cette session : plus aucune occurrence.

**Le contrôle de syntaxe par comptage d'accolades est insuffisant.** Un
comptage naïf peut rater une vraie erreur de structure si le total global
reste juste par coïncidence — exactement ce qui est arrivé sur
`CoachScreen.tsx` : une signature de fonction supprimée par erreur en
insérant du code juste avant elle. **`tsc` est disponible dans
l'environnement d'exécution de Claude** (`--noEmit --jsx react-jsx
--noResolve`, filtré aux erreurs `TS1xxx` pour ignorer le bruit de la
compilation hors projet) — un vrai contrôle de grammaire, adopté comme
méthode standard à partir de cette session. Voir SPECS-TECH §15.

---

### Résumé du 06/09, pour mémoire (détail complet plus bas)

**Quatre retours d'usage du 01/09 traités, T6.5 construit et validé de
bout en bout sur appareil.** Résumé :

1. **OTHER exclu du total de Statistiques** — filtre ajouté à
   `loadStatsOverview` seulement, `dailyLoad.ts` inchangé (la charge
   physiologique d'une séance OTHER continue de compter dans la forme du
   jour). Validé.
2. **Splash et icône personnalisés** — générés programmatiquement à partir
   du pictogramme BRICK de `tokens.ts` (roue + chevrons + ligne de sol,
   teinte `action.primary`). Le splash fonctionne. **L'icône, elle, ne
   s'affiche toujours pas sur le lanceur du téléphone malgré une
   configuration `app.json` correcte — voir « Point ouvert : icône »
   ci-dessous.**
3. **BRICK spontané** — construit, RETIRÉ, puis reconstruit différemment
   après un test réel sur appareil qui a révélé un problème
   d'architecture. Voir « Fait — cette conversation » pour le détail :
   `brick_pair`, une table indépendante de `session_link`, est la version
   qui tient. Validé sur appareil (1 paire confirmée dans l'export SQLite).
4. **T6.5 — Paramètres** : construit en entier, validé sur appareil.
   Thème (persistant), Health Connect (statut + relance), export
   (fichier SQLite brut, un bug d'URI corrigé après un premier essai
   raté), suppression (non testée sur les vraies données de Mathieu,
   volontairement — mécanisme revu et jugé correct). Entrée unique
   sur l'Accueil (bouton flottant), retirée de Statistiques après
   décision de Mathieu.

### Point ouvert : icône de l'application

L'icône générée (`icon.png`/`adaptive-icon.png`, dérivée du pictogramme
BRICK) est bien référencée dans `app.json`, le splash fonctionne — mais
le lanceur Android continue d'afficher l'icône par défaut, y compris
après un désinstall/réinstall complet. Piste principale, non vérifiée :
le build effectivement installé pourrait dater d'avant l'ajout de la
config icône, ou `eas build` a réutilisé un prebuild en cache
(`--clear-cache` jamais essayé). **Mathieu souhaite reprendre ce sujet
dans une nouvelle conversation, avec une révision plus large de
l'identité visuelle plutôt qu'un simple correctif ponctuel.**

### Incident : client de développement dans un état instable

Après la livraison de T6.5, plusieurs crashs natifs en série
(`NullPointerException` dans `ReactActivityDelegate`, puis « Android
internal error » au niveau du client de développement lui-même) —
aucun rapport avec le code livré (relu ligne à ligne, `tsc --noEmit`
propre). Résolu par désinstallation complète puis réinstallation de
l'APK. **Leçon pour la suite** : en cas d'écran blanc ou de crash natif
sans erreur JS visible dans Metro, désinstaller/réinstaller avant de
chercher un bug dans le code — un client de développement peut se
corrompre après des crashs successifs, indépendamment de tout changement
de code.

### Fichiers reçus cette session, tous exploités

`disciplineStats.ts`, `StatsScreen.tsx`, `sessionLinks.ts`, `app.json`,
`ThemeProvider.tsx`, `client.ts` (db), `client.ts` (health), `eas.json`,
`schema.ts`, `plannedSessions.ts`, `SessionReviewScreen.tsx`,
`ScreenShell.tsx`, `NavigationContext.tsx`, `routes.ts`, `profile.ts`,
`AppNavigator.tsx`, `HomeScreen.tsx`, `package.json`. **Aucun fichier
bloquant restant connu.**

---

## Fait — cette conversation (6 septembre 2026)

**Quatre retours d'usage du 01/09 traités, T6.5 construit et validé en
entier sur appareil. Deux révisions d'architecture en cours de route,
toutes deux déclenchées par un test réel sur appareil plutôt que par une
relecture de code.**

### 1 — OTHER exclu du total de Statistiques

`metrics/disciplineStats.ts::loadStatsOverview` filtre désormais
`ne(actualSession.discipline, 'OTHER')`. Portée volontairement limitée à
cette fonction : `dailyLoad.ts`/`pipeline.ts` (non touchés) continuent
d'inclure la charge physiologique d'une séance OTHER dans la forme du
jour — une randonnée fatigue réellement, qu'elle ait ou non un total à
elle. Validé.

### 2 — Splash et icône

Générés programmatiquement (Python/PIL, sans réseau) à partir du glyphe
BRICK de `tokens.ts` — roue + deux chevrons + ligne de sol, seul
pictogramme du système déjà pensé comme symbole d'enchaînement. Rendu par
supersampling 4× puis réduction, pour un anti-aliasing propre y compris
sur le canal alpha de l'icône adaptive (transparente). `app.json` étendu :
`icon`, `android.adaptiveIcon`, plugin `expo-splash-screen` (variantes
clair/sombre). Le splash fonctionne. **L'icône ne s'affiche toujours pas
sur le lanceur — voir « Point ouvert » plus haut.**

### 3 — BRICK spontané : deux architectures, la seconde retenue

**Première version (retirée le jour même).** Un prévu BRICK minimal créé
à la confirmation (`planning/plannedSessions.ts::saveDraft`, deux blocs
WORK avec surcharge de discipline), les deux réalisés rattachés dessus via
`session_link`/`linkManually`. Cohérent avec le principe « réutiliser un
mécanisme existant plutôt qu'en dupliquer un second ». **Cassé par un test
réel** : les deux séances de test (RUN, SWIM) avaient CHACUNE déjà un
rattachement individuel correct (un prévu RUN, un prévu SWIM, tous deux
honorés à 100 % de confiance). `session_link` n'autorise qu'UN
rattachement par réalisé (`readLinkForActual` ne rend jamais qu'une
ligne) : regrouper en BRICK aurait effacé ces deux rattachements
pourtant justes, remplacé la comparaison prévu/réalisé de chacun par le
bilan générique du BRICK synthétique, et laissé le Calendrier montrer un
RUN et un SWIM prévus-mais-jamais-rattachés à côté d'un BRICK marqué fait.

**Seconde version, retenue.** Nouvelle table `brick_pair` (migration
`0005`), INDÉPENDANTE de `session_link` — deux colonnes
`*_actual_session_id`, un `day`, un `status` (`confirmed`/`declined`).
Elle ne rattache rien : elle dit seulement « ces deux réalisés vont
ensemble ». RUN et SWIM gardent leur rattachement individuel intact,
comptent dans leurs Statistiques respectives ET dans BRICK — deux
relations, deux tables, aucune exclusivité entre elles. Conséquence
directe : le Calendrier n'est plus du tout affecté par un BRICK spontané
(aucun prévu synthétique créé). `metrics/disciplineStats.ts::
loadBrickStats` lit `brick_pair` (`status='confirmed'`) au lieu de
`session_link` × `planned_session`. Chaque ligne du journal BRICK porte
sa propre discipline (`LogEntry.entryDiscipline`) — pas de moyenne
d'allure globale, un BRICK mélange des unités incompatibles.

Proposition affichée dans une carte dédiée du bilan de séance
(`SessionReviewScreen.tsx`), INDÉPENDANTE du bloc « Séance prévue » —
elle peut apparaître même si la séance a déjà un rattachement individuel,
contrairement à la première version. Refus enregistré comme
`status='declined'` : ne redemande jamais la même paire.

**Validé sur appareil** : export SQLite du 06/09 confirme 1 paire
`brick_pair` avec `status='confirmed'`.

### 4 — T6.5 (Paramètres), close

| Bloc | Détail |
|---|---|
| Stockage | **Pas de nouvelle table.** `athlete.themePreference` existait depuis `0000`, jamais utilisée — `planning/profile.ts` en a le seul foyer d'écriture (`readThemePreference`/`writeThemePreference`), pas un fichier à part. |
| Thème | Système/Clair/Sombre. `ThemeProvider.tsx` inchangé (`setPreference` existait déjà) ; `DatabaseProvider.tsx` charge la préférence persistée une fois les migrations passées — seul endroit qui connaît à la fois le thème et l'état de la base, `ThemeProvider` étant monté au-dessus de lui. |
| Health Connect | Statut (`ensureInitialized`/`readPermissionState`) + bouton de relance (`requestAllPermissions`) + lien vers les réglages système (`openSettings`) — tout `health/client.ts` réutilisé tel quel, aucun changement. |
| Export | `settings/appData.ts::exportDatabaseFile` — partage du fichier SQLite brut via `expo-sharing`. **Bug réel trouvé sur appareil** : `SQLite.defaultDatabaseDirectory` rend un chemin sans schéma, la classe `File` d'`expo-file-system` (nouvelle API) exige une URI absolue (`URI is not absolute`). Corrigé en préfixant `file://`. Validé sur appareil après correction (fichier reçu et inspecté par Claude : 20 tables, cohérent). |
| Suppression | `settings/appData.ts::deleteAllData` — ferme la connexion (`closeAsync`, checkpoint WAL) puis supprime le fichier (`SQLite.deleteDatabaseAsync`). Aucune bibliothèque de relance (`expo-updates` absent) : l'écran affiche un message « ferme et rouvre » après coup, cesse toute interaction. **Non testée sur les vraies données de Mathieu**, volontairement. |
| Entrée dans l'app | Bouton flottant en haut à droite de l'Accueil (`HomeScreen.tsx`), PAS dans `ScreenShell` — l'accueil n'a jamais eu de ligne de titre. Posé d'abord sur Statistiques par erreur d'interprétation de la proposition initiale, **déplacé sur demande explicite de Mathieu** : Paramètres n'apparaît que sur l'Accueil. |
| Écran | `screens/SettingsScreen.tsx`, nouveau — écran de détail (`DetailRoute.kind: 'settings'`), pas un onglet : hérite du chevron de retour et du titre du chrome commun de `AppNavigator.tsx`, comme `SessionReviewScreen`/`ProfileScreen`. Double confirmation pour la suppression (deux `Alert` au texte différent, pas la même question répétée). |

Migration `0005` (`brick_pair`) et le typage `$type<ThemePreference>()`
sur `athlete.themePreference` (sans effet SQL, TS seul) sont les deux
seuls changements de schéma de cette session.

### Incident de conversation : trois blocages d'outillage, aucun dans le code livré

Trois pannes distinctes rencontrées en testant, aucune causée par le code
livré cette session :

1. **Erreur de syntaxe dans `fr.ts`** — deux fermetures de commentaire
   `*/ */` sur la même ligne au moment du collage des nouvelles clés,
   erreur de Claude dans le format donné à coller (pas un problème côté
   Mathieu). Corrigée après lecture du fichier.
2. **`sessionLinks.ts` introuvable** — disparu ou mal enregistré entre
   deux livraisons, `tsc` échouait sur huit fichiers qui en dépendent.
   Recollé au bon endroit, résolu.
3. **Client de développement corrompu** — voir « Incident : client de
   développement dans un état instable » plus haut. Résolu par
   désinstallation/réinstallation complète, sans lien avec le code.

---

**T6.2 est close.** L'écran Objectif décompose `race.target_total_seconds`
en temps alloué par discipline (natation, vélo, course, transitions — un
seul champ, pas T1/T2 séparés) et confronte l'allure ou la vitesse qui en
résulte à la dernière valeur connue de VMA/FTP/CSS (`zone`, alimentée
depuis T6.1). Décomposition manuelle, jamais un pourcentage type. Le
chrono cible s'édite ICI et seulement ici : `planning/profile.ts::
saveRaceProfile` (Profil) ne le reçoit plus en entrée du tout depuis cette
tranche — nouvelle fonction `saveRaceTarget`, seule à écrire ces cinq
colonnes. `target_revised_at` se met à jour automatiquement si et
seulement si `target_total_seconds` change de valeur. **Aucun verdict de
faisabilité** : l'écran juxtapose deux nombres, ne juge jamais — même
principe que le bloc « ajustement proposé » du Coach, déjà écarté. Le vélo
est un cas à part assumé : FTP (puissance) et vitesse requise ne sont pas
directement comparables, l'écran le dit en toutes lettres.

Migration `0004` : quatre colonnes nullable sur `race`. Nom de fichier
exact non confirmé par Claude — généré par Mathieu via `drizzle-kit
generate`, jamais vu par Claude qui n'a pas accès au dossier `drizzle/`.

**T6.3 est techniquement complète**, à réception de cinq fichiers demandés
pour la débloquer (`metrics/dailyLoad.ts`, `metrics/pipeline.ts`,
`metrics/banister.ts`, `screens/CalendarScreen.tsx`, `db/bootstrap.ts`).
Le vocabulaire `INTERRUPTION_REASONS` est posé dans `schema.ts` (même
traitement que `ZONE_KINDS` en T6.1, aucune migration — `interruption.
reason` existe depuis `0000`). `planning/interruptions.ts` (nouveau) porte
le CRUD complet : non-chevauchement strict entre interruptions (codes,
même principe que la périodisation §14). `screens/InterruptionsScreen.tsx`
(nouveau) expose formulaire et liste. Le lien d'accès vit dans la carte
Disponibilités du Profil, pas sur l'accueil (PRD §7 ne l'y place pas) :
disponibilité hebdomadaire récurrente et indisponibilité ponctuelle datée
sont le même sujet sous deux formes.

**Correction importante en cours de route.** La première version de
`planning/interruptions.ts` écrivait la charge forfaitaire d'une
interruption dans `manual_override`, faute d'avoir vu `metrics/
dailyLoad.ts`. À sa réception : ce n'est PAS le mécanisme réel.
`rebuildDailyLoad` lit `interruption` DIRECTEMENT et comble un jour à
charge nulle avec `dailyLoadOverride` — jamais en s'ajoutant à une séance
réelle. `manual_override` sert à autre chose : un correctif manuel
générique appliqué en LECTURE sur `daily_load` déjà calculée
(`readDailyLoadRange`). Écrire aussi dans `manual_override` aurait été
FAUX, pas seulement inutile : un jour de GR20 où la montre capte malgré
tout une activité aurait vu sa charge réelle — correctement calculée par
`rebuildDailyLoad` — écrasée en lecture par le forfait complet, `manual_
override` s'appliquant sans la logique « seulement si la journée est
vide » du calcul. Corrigé : `planning/interruptions.ts` ne touche plus
`manual_override`, et rejoue `runMorningSync(false)` après chaque écriture
pour que `rebuildDailyLoad` (reconstruction complète du cache à chaque
appel) absorbe le changement — même principe que `sessionFeedback.ts` en
T4. Le non-chevauchement strict entre interruptions, choisi par prudence
avant cette découverte, s'avère nécessaire pour une raison différente de
celle imaginée : `dailyLoad.ts` résout un chevauchement par `.find()`,
arbitrairement — le premier résultat gagne, en silence.

**`db/bootstrap.ts` est retiré.** Reçu à la demande de clôture — Profil et
Objectif couvrent tout ce qu'il amorçait. `App.tsx` ne l'appelle plus,
`Shell()` monte `AppNavigator` directement. **Le fichier peut être
supprimé du projet.**

**`screens/CalendarScreen.tsx` affiche un bandeau minimal** si une
interruption couvre le jour courant, visible en vue semaine comme en vue
jour, via `activeInterruption` (fonction pure exportée de `planning/
interruptions.ts`, réutilisable telle quelle par les Notifications, T6.4).
Aucune modification de `WeekRow.tsx`/`DayList.tsx` (non reçus, fichier
déjà documenté comme fragile — PanResponder, pagineur à trois pages) :
pas de marque sur les pastilles de semaine ou de jour.

**T6.3 n'est PAS déclarée close** : comme toutes les tranches précédentes,
elle attend le test sur appareil de Mathieu. Un point non recontrôlé avec
lui : « replanification autour » (PRD §7 point 10) a été interprétée par
Claude au sens le plus étroit — aucune séance planifiée n'est touchée par
une interruption, cohérent avec SPECS-TECH §8 mais jamais reconfirmé.

**L'icône réglage vue sur les captures du 31/08, probablement résolue le
01/09.** `ScreenShell.tsx`/`DataValue.tsx`, reçus depuis, ne la déclarent
ni l'un ni l'autre. Hypothèse formulée le 01/09 : le menu de développement
d'Expo, chrome ajouté par le client de dev, invisible pour le code
Iron App — cohérent avec le fait que Mathieu utilise désormais un build
`preview` sans ce chrome. **Non confirmée formellement** : à vérifier que
l'icône a bien disparu sur les captures du build `preview`.

**T6.4 (Notifications locales) est construite, le 01/09, dans une
conversation distincte de T6.2/T6.3.** `notifications/schedule.ts` calcule
les quatre comportements de SPECS-TECH §8 (rappel de séance, plan à
échéance, plan échu, suspension par interruption) et les reprogramme en
entier à chaque `runMorningSync` — jamais d'incrément, même logique que
`daily_load`. `notifications/handler.ts` règle l'affichage au premier
plan. Aucun nouvel écran : rien n'est prévu avant Paramètres (T6.5).

Aller-retour EAS nécessaire comme annoncé (`expo-notifications` est un
module natif) : `npm install`, `expo prebuild`, puis `eas build --profile
development`, réinstallation sur le téléphone. Un ajustement trouvé par
`tsc --noEmit` sur appareil — `NotificationBehavior` attend désormais
`shouldShowBanner`/`shouldShowList` plutôt que l'ancien `shouldShowAlert`
seul, corrigé dans `notifications/handler.ts`.

**Sur appareil : la demande de permission s'est affichée et a été
acceptée.** Ça confirme que le module natif fonctionne — mais **les quatre
comportements eux-mêmes n'ont pas encore été observés se déclencher**,
ce qui n'a rien d'anormal : ce sont des notifications programmées pour des
dates futures (demain 7h au plus tôt pour un rappel de séance), pas
vérifiables en une seule séance de test. À confirmer dans les jours qui
viennent.

**Rappel à ne pas perdre : T6.3 n'a jamais reçu de confirmation explicite
de Mathieu.** La conversation est passée directement de la livraison de
T6.3 corrigée à la demande de lancer T6.4, sans retour de test sur
appareil entre les deux. T6.3 reste donc documentée comme « techniquement
complète, pas close » tant que ce retour n'arrive pas.

---

## Fait — cette conversation (1 septembre 2026, T6.4)

**Construite en une seule passe, sur trois fichiers reçus en plus de ceux
déjà en main** (`coachExport.ts`, `coachImport.ts`, `trainingAlerts.ts`,
`homeData.ts`, `app.json`). Module natif confirmé sur appareil ; les
quatre comportements programmés restent à observer.

| Quoi | Détail |
|---|---|
| `app.json` — étendu | Plugin `expo-notifications` ajouté à la liste des plugins Expo. |
| `src/notifications/handler.ts` — nouveau | Comportement d'affichage au premier plan. Corrigé une fois sur appareil : `shouldShowBanner`/`shouldShowList` plutôt que `shouldShowAlert`, changement de forme entre versions d'`expo-notifications`. |
| `src/notifications/schedule.ts` — nouveau | Les quatre comportements de SPECS-TECH §8, recalculés et reprogrammés en entier à chaque appel (`cancelAllScheduledNotificationsAsync` puis reprogrammation) — aucune tâche de fond, même logique que `daily_load`. Lit `coach_exchange` (dernier import, `plan_valid_until`) et `interruption` (`activeInterruption`, T6.3) directement. Horaire fixé à 7h, heure locale de l'appareil (accesseurs `Date` locaux, pas l'arithmétique UTC des jours civils). |
| `src/metrics/pipeline.ts` — étendu | Nouvelle étape `notifications`, ajoutée à `SyncOutcome`. Déclenchée que `withIngestion` soit vrai ou faux : une interruption ou un import coach doivent se répercuter immédiatement. |
| `src/App.tsx` — étendu | `configureNotificationHandler()` appelée une fois au chargement du module, avant tout rendu. |
| `src/i18n/locales/fr.ts` — étendu | Bloc `notification.*` — ton neutre sur le plan échu, aucune tournure culpabilisante (SPECS-TECH §8). |

### Aller-retour EAS, comme annoncé

`npm install expo-notifications`, `npx expo prebuild`, puis `eas build
--profile development` — le client de dev existant (celui de T1 à T6.3) ne
connaissait pas encore le module natif, `npm start` seul ne peut pas
compiler du natif. Après réinstallation de l'APK sur le téléphone : la
demande de permission s'est affichée, Mathieu l'a acceptée.

### Non traité, restant après cette passe

- **Les quatre comportements n'ont pas encore été observés se
  déclencher** — question de calendrier, pas de doute sur le code. À
  confirmer dans les prochains jours d'usage réel.
- **Aucun outil de diagnostic** pour lister les notifications réellement
  programmées sans attendre qu'elles se déclenchent
  (`Notifications.getAllScheduledNotificationsAsync()`) — pourrait
  accélérer la confirmation si Mathieu le souhaite, pas construit faute
  d'avoir été demandé.
- **Réglage de l'heure des notifications** (7h fixe) — candidat naturel
  pour Paramètres (T6.5).

---

**T6.2, close et validée sur appareil par Mathieu.** T6.3 enchaînée dans la
foulée sur sa demande — techniquement complète à la fin de cette même
conversation, sur réception de cinq fichiers supplémentaires ; encore non
close, en attente de test sur appareil.

| Quoi | Détail |
|---|---|
| `src/db/schema.ts` — étendu (T6.2) | Quatre colonnes nullable sur `race` : `target_swim_seconds`, `target_bike_seconds`, `target_run_seconds`, `target_transition_seconds`. Migration `0004` (nom exact non confirmé, voir SPECS-TECH §3). |
| `src/db/schema.ts` — étendu (T6.3) | `INTERRUPTION_REASONS`/`InterruptionReason` déclarés à côté de `interruption`, même traitement que `ZONE_KINDS` en T6.1. **Aucune migration** : `interruption.reason` existe depuis `0000`. |
| `src/planning/profile.ts` — étendu (T6.2) | `RaceProfile` porte désormais la décomposition et `targetRevisedAt`. `saveRaceProfile` restreinte à nom/date/distances (`RaceCourseInput`, plus `Omit<RaceProfile,'id'>`) : elle ne reçoit et n'écrit plus jamais `target*`. `saveRaceTarget`, nouvelle, seule à écrire ces cinq colonnes ; révise `target_revised_at` automatiquement si et seulement si `target_total_seconds` change de valeur par rapport à la base. |
| `src/metrics/disciplineStats.ts` — étendu (T6.2) | `readReference` exportée (vivait en privé, appelée seulement par `loadDisciplineStats`). Aucun changement de comportement pour `StatsScreen.tsx`. |
| `src/metrics/raceTargetReview.ts` — nouveau (T6.2) | Calcule l'allure/vitesse requise par discipline à partir de la décomposition, juxtapose à `readReference`. **Aucun verdict** — décision de Mathieu. BIKE marqué `comparable: false` : FTP (puissance) et vitesse requise (dérivée du temps et de la distance) ne sont pas la même grandeur physique. |
| `src/screens/ObjectiveScreen.tsx` — nouveau (T6.2) | Chrono cible et décomposition en heures + minutes (échelle horaire, pas minutes+secondes comme les blocs de séance). Écart alloué/objectif affiché en direct sur la saisie, jamais de correction automatique. Confrontation en trois lignes (natation, vélo, course), note explicite sur le cas BIKE. |
| `src/screens/ProfileScreen.tsx` — étendu (T6.2 puis T6.3) | Appel à `saveRaceProfile` nettoyé du passthrough `targetTotalSeconds`, devenu inutile. Lien « Voir l'objectif » ajouté sous la carte Course. Lien « Déclarer une interruption » ajouté sous la carte Disponibilités (T6.3) — même sujet que la disponibilité hebdomadaire, sous une forme datée ponctuelle. |
| `src/navigation/routes.ts`, `AppNavigator.tsx` — étendus | Routes `{ kind: 'objective' }` (T6.2) et `{ kind: 'interruptions' }` (T6.3), sans paramètre — la donnée est lue directement par l'écran, même logique que `profile`. |
| `src/i18n/locales/fr.ts` — étendu | Bloc `objective.*` (T6.2) et `interruption.*` (T6.3) complets, plus `calendar.interruption.active`. **`detail.profile.title`/`home.profile.open` renommés** de « Profil et objectif » à « Profil » (T6.2) : les deux écrans sont désormais distincts, garder l'ancien libellé sur les deux aurait été confus. |
| `src/planning/interruptions.ts` — nouveau, puis corrigé (T6.3) | CRUD complet. Non-chevauchement strict entre interruptions, porté par du code (`validateInterruption`, rend des codes), pas par la base — même principe que la périodisation. **Version finale** : ne touche PAS `manual_override` (voir correction ci-dessous) ; `saveInterruption`/`deleteInterruption` rejouent `runMorningSync(false)`. `activeInterruption` (nouvelle, exportée) : fonction pure rendant l'interruption couvrant un jour donné, réutilisée par `CalendarScreen.tsx` et prévue pour les Notifications (T6.4). `enumerateDays` : petite arithmétique de jour en UTC locale au fichier, gardée pour l'affichage du nombre de jours seulement. |
| `src/screens/InterruptionsScreen.tsx` — nouveau (T6.3) | Un seul formulaire réutilisé pour créer/modifier (pas une carte par interruption comme `ZoneCard` en T6.1) — une interruption n'a jamais besoin d'édition parallèle, le non-chevauchement l'interdit par construction. Liste avec modification et suppression (confirmation `Alert`). |
| `src/App.tsx` — étendu (T6.3) | `bootstrapProfileAndRace` retiré : import, état `bootstrapped` et effet supprimés. `Shell()` monte `AppNavigator` directement après `DatabaseProvider`. |
| `src/screens/CalendarScreen.tsx` — étendu (T6.3) | Bandeau texte (« En interruption : … ») si `activeInterruption` couvre le jour courant, dans l'en-tête, visible en vue semaine et en vue jour. Aucune modification de `WeekRow.tsx`/`DayList.tsx` (non reçus, fichier déjà documenté fragile). |

### Correction apportée en cours de route — mécanisme de la charge forfaitaire

**Erreur de conception initiale dans ce même message, corrigée à réception
des fichiers demandés.** `planning/interruptions.ts` écrivait d'abord la
charge forfaitaire d'une interruption dans `manual_override`
(`target_table='daily_load'`, `target_key='load'`), en s'appuyant sur le
commentaire du schéma (« toute lecture d'une métrique consulte cette table
en premier ») sans pouvoir vérifier si c'était le mécanisme employé pour
CE cas précis, faute d'avoir reçu `metrics/dailyLoad.ts`/`pipeline.ts` —
signalé comme hypothèse non confirmée dans la version précédente de cette
mise à jour.

`dailyLoad.ts::rebuildDailyLoad` révèle un mécanisme différent : il lit
`interruption` DIRECTEMENT, et pour chaque jour où la somme des charges de
séance est nulle, comble le trou avec `dailyLoadOverride` — jamais en
s'ajoutant à une charge réelle. `manual_override` EST bien consultée
(`readDailyLoadRange`), mais comme correctif manuel générique en LECTURE
sur `daily_load` déjà calculée — un mécanisme différent, orthogonal.

**Le bug qu'aurait produit la version initiale si elle avait été livrée
telle quelle** : `readDailyLoadRange` applique un override de
`manual_override` inconditionnellement, sans la logique « seulement si la
journée est vide » que `rebuildDailyLoad` applique correctement au calcul.
Un jour de GR20 où la montre capte malgré tout une activité réelle aurait
vu sa charge réelle — correctement calculée — silencieusement écrasée en
lecture par le forfait complet.

Corrigé : `planning/interruptions.ts` ne touche plus `manual_override` du
tout. `saveInterruption`/`deleteInterruption` rejouent `runMorningSync
(false)` après écriture — `daily_load` étant un cache reconstruit en
entier à chaque appel (jamais d'incrément), aucune diffusion manuelle
« ancienne plage vs nouvelle plage » n'est nécessaire, ce qui a permis de
SIMPLIFIER le module par rapport à sa première version.

Le non-chevauchement strict entre interruptions, choisi par prudence avant
cette découverte (en anticipant un conflit d'écriture sur `manual_override`
qui n'aurait finalement pas eu lieu), s'avère nécessaire pour une raison
différente : `dailyLoad.ts` résout un chevauchement par `interruptions.
find(...)` — le premier résultat dans l'ordre de la base, arbitrairement.

### Autres dettes signalées à la livraison (T6.2, T6.3)

- **BIKE non confronté** (T6.2, décision assumée) : la FTP est une
  puissance, pas une vitesse — les relier exigerait un modèle
  poids/aérodynamique hors périmètre (PRD §4).
- **`referenceStatus`/`referenceStatusKey`/`sourceLabelKey`** dupliqués une
  troisième fois dans `ObjectiveScreen.tsx` (même pattern déjà accepté
  entre `StatsScreen.tsx` et `ProfileScreen.tsx` en T6.1).
- **Interruption non marquée sur les pastilles du calendrier** (T6.3) :
  seul un bandeau texte en en-tête, `WeekRow.tsx`/`DayList.tsx` non reçus.
- **« Replanification autour »** (PRD §7 point 10) interprétée au sens
  étroit : aucune séance planifiée n'est touchée par une interruption,
  cohérent avec SPECS-TECH §8 (« aucune replanification automatique »).
  Mathieu n'a pas encore confirmé que c'est bien l'intention du PRD.
- **`metrics/dailyForm.ts` non reçu** : utilise-t-il `athlete.birthDate`/
  `.sex` sans garde contre `null` ? Question ouverte depuis le retrait de
  `db/bootstrap.ts` — sans conséquence sur l'appareil de Mathieu (colonnes
  déjà renseignées), pertinente seulement pour une base fraîchement
  installée.

---

## Fait — cette conversation (31 août 2026, T6.1)

| Quoi | Détail |
|---|---|
| `src/db/schema.ts` — étendu | `ZONE_KINDS`/`ZoneKind` et `ZONE_SOURCES`/`ZoneSource` déclarés à côté de `DISCIPLINES`, même traitement que le reste du vocabulaire non contraint par `CHECK` (SPECS-TECH §13). **Aucune migration** : `athlete`, `race`, `zone` existent depuis `0000`, seul un vocabulaire TypeScript a été posé sur une colonne texte déjà là. |
| `src/metrics/disciplineStats.ts` — étendu | `referenceNumeric`, désormais `referenceSiFromDisplay` et `zoneUnit`, sortis de leur vie privée dans `StatsScreen.tsx` et étendus à `hr_max` (absent des trois disciplines de référence). Ferme la dette signalée dès la construction de T6.1 : le Profil doit convertir dans le même sens que Statistiques affiche, sans deuxième formule (SPECS-TECH §14 bis). `ReferenceKind` devient `Exclude<ZoneKind, 'hr_max'>` plutôt qu'une union redéclarée à la main. |
| `src/planning/profile.ts` — nouveau | `readProfileSnapshot`, `saveAthleteProfile`, `saveRaceProfile`, `addZoneReading`, puis `readZoneHistory`/`deleteZoneReading` ajoutées en cours de route. Structures JSON de `athlete.availability`/`.equipment`/`.injuries` — jamais spécifiées ailleurs malgré le commentaire « structure fixée en T3 » dans `schema.ts` — fixées ici : `Weekday[]`, `string[]`, `InjuryEntry[]`. |
| `src/screens/ProfileScreen.tsx` — nouveau | Écran unique en sections (Course, Profil, Disponibilités, Matériel, Blessures, Zones). Sélecteur de source (Test/Estimation/Manuel) **obligatoire**, sans défaut, à chaque saisie de zone — décision de Mathieu, cohérente avec « aucun nombre sans sa méthode de calcul » (SPECS-TECH §5). Réutilise `ui/OptionChip.tsx` (reçu cette conversation) pour le sexe, les jours de disponibilité et la source de zone. |
| `src/navigation/routes.ts`, `AppNavigator.tsx` — étendus | Route `{ kind: 'profile' }`, sans paramètre. |
| `src/i18n/locales/fr.ts` — étendu | Bloc `profile.*` complet, plus `stats.reference.edit`/`openProfile`, `unit.suffix.sessions`. `stats.overviewTotals` retirée (remplacée par deux `DataValue`, voir ci-dessous). |
| `src/screens/HomeScreen.tsx` — étendu | Point d'entrée vers le Profil. **Restylé une fois** après retour de Mathieu (« lien texte souligné horrible ») : carte pressable avec icône, libellé et chevron, même grammaire visuelle que les autres cartes de l'écran. Icône déclarée localement (`PROFILE_GLYPH`), même traitement que `BACK_GLYPH` dans `AppNavigator.tsx`. |
| `src/screens/StatsScreen.tsx` — étendu | En-tête (« 23 séances · 17:16 h ») passé en deux `DataValue`, même traitement que les cartes HEURES/KM/SÉANCES en dessous — c'était une légende, ça devient une mesure. Bouton rond « + » **permanent** à côté du nom de l'indicateur de référence (VMA/FTP/CSS), qu'une valeur existe déjà ou non — le texte cliquable de l'état vide, seul point d'entrée avant ce retour, ne permettait pas d'ajouter un second relevé une fois le premier saisi. |

### Journal des zones — ajouté en cours de route

Retour de Mathieu après un premier passage sur appareil : aucun moyen de
corriger une estimation mal saisie, alors que `zone` est historisée
précisément pour suivre une progression, pas pour n'en garder que la
dernière valeur. `readZoneHistory(kind)` liste tout l'historique ;
`deleteZoneReading(id)` supprime une ligne précise. Chaque carte de zone
porte un lien « Voir le journal », chargé à la demande (pas dans
l'instantané principal). Suppression avec confirmation (`Alert`), même
traitement que la suppression d'une séance dans `SessionReviewScreen.tsx`.

### Deux bugs `tsc` trouvés en cours de livraison

| Bug | Cause | Correctif |
|---|---|---|
| `TS1109 Expression expected` | `as Record<ZoneKind, ZoneReading \| null>` coupé sur plusieurs lignes, le `>` fermant seul sur sa ligne — le parseur TypeScript trébuche sur une assertion multi-lignes de ce type. | Annotation de type sur la variable (`const zones: Record<...> = {...}`) plutôt qu'un cast en fin d'expression. Règle générale à retenir : ne jamais couper une assertion `as` générique sur plusieurs lignes. |
| `TS2532 Object is possibly 'undefined'` | `noUncheckedIndexedAccess` (actif dans ce projet) ne relie jamais `rows.length === 0` à l'existence de `rows[0]` dans la branche `else` — `saveRaceProfile` utilisait `rows[0]` inline au lieu de le capturer d'abord, contrairement à `readProfileSnapshot` juste au-dessus qui le faisait déjà correctement. | Capturer `rows[0]` dans une variable et tester `=== undefined` avant tout usage — jamais inline dans un `if (rows.length === 0) / else`. |

### Incident de livraison et changement de pratique

Un bloc de code donné en format `diff` (préfixes `+`/`-`, pensé pour un
outil comme `git apply`) a été copié tel quel par Mathieu dans `fr.ts` —
les `+` en tout début de ligne sont devenus des opérateurs unaires
appliqués à des chaînes, produisant 479 erreurs en cascade à la
compilation. Signalé clairement par Mathieu : **plus aucun format diff ou
ligne isolée à recopier, désormais**. Chaque fichier modifié ou créé est
livré intégralement, en téléchargement (`create_file` + `present_files`),
jamais en extrait à coller à la main.

---

## Fait — cette conversation (30 août 2026)

**Rattrapage des données réelles d'août, plus deux fonctionnalités
permanentes construites au fil de ce besoin.**

| Quoi | Détail |
|---|---|
| Emplacement de la carte d'alertes — **corrigé** | Mathieu l'avait demandée entre la courbe de charge et la dernière séance ; elle avait été posée plus haut (entre séance du jour et semaine) par erreur lors de sa construction le 28/08, jamais déplacée depuis. Corrigé dans `HomeScreen.tsx`. |
| `health/manualEntry.ts` — format de collage étendu | Le format `AAAA-MM-JJ;DISCIPLINE;durée;distance;FC` n'avait pas de case pour le RPE, alors que les captures fournies par Mathieu en portent un pour la plupart des séances. Sixième champ optionnel ajouté (`;RPE`), bornes 1–10 validées. Sans cette extension, les 22 séances importées seraient toutes restées `pending_rpe` malgré la donnée disponible. |
| `planning/manualPlannedImport.ts` | Nouveau — import groupé de séances PLANIFIÉES par collage de texte (`saveDraft`, le même foyer d'écriture que l'éditeur manuel). Une décision a précédé sa construction : Mathieu a d'abord demandé pourquoi un format JSON Coach n'était pas utilisé (il existe déjà) plutôt qu'un nouveau mécanisme — réponse : le schéma exact de `coachImport.ts` n'a jamais été vu, ce mécanisme-ci n'exige de deviner la forme d'aucun fichier absent. |
| `screens/ManualActualSessionScreen.tsx` | Étendu — troisième mode « Planifiées (coller) », même écran que le rattrapage des séances réalisées. Pas de détection de doublon côté planifié (`saveDraft` crée toujours une séance neuve) — documenté et assumé, à la charge de l'utilisateur. |
| `health/manualEntry.ts::deleteActualSession` | Nouveau — l'app ne permettait de supprimer AUCUNE séance réalisée, manuelle ou non. Devenu nécessaire en pratique : trois séances de renforcement déjà en base (probablement captées par Health Connect avant l'import groupé) se sont retrouvées en double. Nettoie `feedback` et `session_link` explicitement (pas de suppression en cascade supposée), relance `runMorningSync(false)` après coup. |
| `screens/SessionReviewScreen.tsx` | Étendu — bouton « Supprimer cette séance » (confirmation, style destructif), reboucle vers l'écran d'où il a été ouvert. |
| `import-planifie-aout-2026.json` | Livré à Mathieu, hors code — 22 opérations `ironapp/1` reconstruites à partir des captures fournies. **Le format exact n'a jamais été vérifié contre `coachImport.ts`** — signalé explicitement à la livraison. Importé sans retour de rejet signalé. |
| `import-realise-aout-2026.txt` | Livré à Mathieu, hors code — 22 lignes au format de collage groupé étendu (avec RPE). Importé avec succès, un doublon corrigé ensuite via la suppression ci-dessus. |

---

## Fait — cette conversation (29 août 2026)

**Trois retours de Mathieu sur T4 après un premier passage sur appareil, une
demande de fonctionnalité permanente, puis deux fichiers manquants
(`planning/weekView.ts`, `metrics/loadRecompute.ts`) qui ont permis de clore
les deux points restés ouverts dans la même journée.** Aucune régression
trouvée sur ce qui avait été construit le 28/08.

| Quoi | Détail |
|---|---|
| Clavier recouvrant le commentaire du bilan | Corrigé deux fois le même jour : d'abord avec `KeyboardAvoidingView` (`ui/useKeyboardHeight.ts` pas encore reçu), puis harmonisé sur ce hook maison dès réception — un seul mécanisme de clavier dans l'app désormais. `SessionReviewScreen.tsx` et l'écran de saisie manuelle l'utilisent tous les deux. |
| Doublon prévu/réalisé sur l'accueil | Trouvé dans `metrics/homeData.ts`, pas dans l'affichage : `plannedToday` et `week[].planned` ignoraient `session_link`. Une séance rattachée ne se montre plus comme « prévue » en plus de « réalisée ». Corrige aussi silencieusement le même risque latent sur le bloc « Séance du jour », qui partage la même donnée. |
| Même doublon dans le Calendrier (vue JOUR et vue SEMAINE) | Signalé par capture d'écran (27 août). Corrigé partout : `ui/DayList.tsx` et `ui/WeekRow.tsx` (nouvelle prop `linkedSessionIds` sur les deux) et `screens/CalendarScreen.tsx` (lecture de `readPlannedIdsWithActual` dans `reload()`, transmise aux deux composants). `planning/weekView.ts`, reçu après coup, confirme que `WeekSummary.days[].sessions[]` porte le même `SessionWithBlocks[]` complet (avec `id`) que `DayList` consommait déjà — aucune extension de ce fichier n'a été nécessaire. |
| `health/manualEntry.ts` | Nouveau — saisie manuelle d'une séance réalisée, **fonctionnalité permanente** (décision de Mathieu), pas un script à usage unique pour août. Identifiant synthétique déterministe (FNV-1a des champs saisis, préfixe `manual:`) : coller deux fois la même ligne ne crée pas de doublon. Jour civil fabriqué à midi UTC pour ne dépendre d'aucun fuseau deviné. |
| `screens/ManualActualSessionScreen.tsx` | Nouveau — saisie unique (formulaire) ou collage groupé. Ouvert comme `DetailRoute` (`newActualSession`) depuis un lien sur l'accueil, sous la semaine en pastilles — emplacement provisoire, à revoir une fois Stats/Paramètres disponibles. |
| `navigation/routes.ts`, `navigation/AppNavigator.tsx` | Étendus — route `newActualSession` déclarée et branchée. |
| Charge des séances manuelles et des RPE tardifs — jusqu'à la courbe | D'abord laissée `null` (limite assumée, faute d'avoir vu la formule). `metrics/loadRecompute.ts` calcule `load`/`loadMethod` (TRIMP puis repli sRPE), mais n'écrit pas `daily_load` — la table que lit la courbe de charge. `metrics/pipeline.ts`, reçu dans la foulée, révèle que `runMorningSync(false)` enchaîne déjà charges de séance → charge quotidienne → forme du jour sans reprendre Health Connect : c'est cette fonction, pas `recomputeSessionLoads` seule, qui est câblée partout. **Effet de bord découvert au passage** : le RPE saisi depuis le bilan ne déclenchait ce chaînage pour AUCUNE séance depuis sa création en T4, y compris une vraie séance Health Connect. |
| `planning/sessionFeedback.ts` | Étendu — `saveFeedback` et `deleteFeedback` appellent `runMorningSync(false)` après chaque écriture, pour TOUTE séance. |
| `screens/SessionReviewScreen.tsx` | Étendu — relit le bilan après chaque sauvegarde de ressenti (sans le plein écran de chargement de `load()`), pour que la charge recalculée s'affiche sans quitter l'écran. |
| `i18n/locales/fr.ts` | Étendu — clés `manualEntry.*`, `home.week.addPast`, `detail.newActualSession.title`. Bandeau d'avertissement du formulaire corrigé une fois la charge réellement calculable. |

---

## Fait — cette conversation (28 août 2026, T4)

| Quoi | Détail |
|---|---|
| `planning/sessionLinks.ts` | Nouveau — rattachement automatique (glouton, garde-fou d'ambiguïté à 0,08), rattachement manuel (fenêtre ± 3 jours), détachement explicite. `session_link` alimentée pour la première fois. |
| `planning/sessionFeedback.ts` | Nouveau — RPE (1–10, borné) et commentaire libre. `feedback` alimentée pour la première fois. |
| `metrics/sessionReview.ts` | Nouveau — `verdictFor` (la seule règle de verdict du projet), comparaison prévu/réalisé, dérive cardiaque avec condition d'interprétabilité, alertes de séance. |
| `metrics/trainingAlerts.ts` | Nouveau — séances manquées (7 jours), RPE élevé répété (3 séances de suite ≥ 8). `LOAD_RAMP` déclarée, pas encore produite — voir Dette. |
| `ui/format.ts` | Nouveau — foyer unique pour `formatDuration`, `durationParts`, `distanceKmParts`, `formatRatioDelta`, `verdictMessageKey`. |
| `ui/RpeScale.tsx` | Nouveau — échelle de Borg au toucher, deux rangées de cinq. |
| `screens/SessionReviewScreen.tsx` | Nouveau — remplace la coquille `ScreenShell` de la route `actualSession` posée en T3.3.c. |
| `planning/plannedSessions.ts` | Étendu — `estimateDistance`, symétrique d'`estimateDuration`. |
| `metrics/homeData.ts` | Étendu — le verdict de la dernière séance vient de `verdictForActual` au lieu d'un calcul local à la charge médiane. |
| `screens/HomeScreen.tsx` | Étendu — foyer unique de formatage, carte d'alertes, verdict unifié. |
| `health/ingest.ts` | Étendu — `runIngestion` reconstruit les rattachements sur la fenêtre civile du cycle. |
| `navigation/AppNavigator.tsx` | Étendu — route `actualSession` branchée sur `SessionReviewScreen`. |
| `i18n/locales/fr.ts` | Étendu — clés `review.*` et `alerts.*`. |

---

## Fait — pour mémoire (25–27 août 2026)

**Trois tranches livrées en une conversation : la finition de l'accueil, les
statistiques par discipline, et le Coach en entier.** L'app a ses quatre
onglets pleinement fonctionnels depuis cette date, et l'aller-retour manuel
avec un projet Claude dédié au coaching fonctionne de bout en bout.

Deux bugs réels ont été trouvés en cours de route, tous deux invisibles au
compilateur et tous deux silencieux à l'écran jusqu'à ce qu'on les cherche
explicitement : `runMorningSync()` perdait son argument `withSync` dans
`HomeScreen.tsx` (collecte relancée trop souvent, sans gravité dans ce
sens-là) ; et le client Health Connect n'était jamais initialisé par
l'ingestion (`ensureInitialized()` jamais appelée dans `health/ingest.ts`),
ce qui a interrompu la collecte du 22 au 26/08 sans aucun signal visible.
Les deux corrigés et confirmés fonctionnels le 27/08.

Trois décisions ouvertes depuis le 25/08 ont été tranchées : le format
d'échange coach est `ironapp/1`, JSON maison versionné, contrat de réponse
généré depuis les mêmes énumérés que le schéma ; l'export porte le
dossier-athlète complet ; la saisie des indicateurs de performance attendra
l'écran Profil (T6, désormais construit).

### T3.3.c — Finition accueil, T3.4 — Statistiques, T5 — Coach

Détail complet des livrables de ces trois tranches : voir versions
précédentes de ce document si nécessaire — résumé ici pour ne pas alourdir
l'historique. Points clés qui restent structurants :

- `metrics/disciplineStats.ts`, `ui/DisciplineSelector.tsx`, `ui/WeekBars.tsx`,
  `screens/StatsScreen.tsx`, `ui/ReferenceTrend.tsx` (T3.4) — écran
  Statistiques complet, cinq vues, BRICK creux et assumé.
- `metrics/coachSummary.ts`, `planning/coachExport.ts`,
  `planning/coachImport.ts`, `ui/Checkbox.tsx`, `ui/SessionPickerSheet.tsx`,
  `screens/CoachScreen.tsx` (T5) — échange coach complet, format `ironapp/1`,
  testé de bout en bout avec un vrai fichier.
- `coach-context-ironapp-1.md`, `test-import-ironapp-1.json` — livrés hors
  `src/`, pour le futur projet Claude de coaching.

---

## Prochaine action — icône de l'application, puis révision du design

**T6 est ENTIÈREMENT clos, y compris T6.5.** T6.3 reste techniquement
complète mais jamais formellement confirmée par Mathieu ; T6.4 reste à
observer sur plusieurs jours d'usage réel (rien de nouveau sur ces deux
points cette session). Le sujet immédiat de la prochaine conversation est
différent : **l'icône de l'application, restée sur le visuel par défaut
malgré une configuration `app.json` correcte**, dans le cadre d'une
révision plus large du design demandée par Mathieu.

**À vérifier sur appareil, T6.3 (jamais fait à ce jour) :**
- Créer une interruption avec charge forfaitaire (cas GR20) et vérifier
  qu'elle apparaît dans `daily_load`/la courbe de charge de l'accueil
  après le prochain `runMorningSync` (déclenché automatiquement par
  `saveInterruption`).
- Vérifier le refus d'un chevauchement (deux interruptions sur des dates
  communes).
- Vérifier le bandeau sur le Calendrier quand une interruption couvre le
  jour courant, en vue semaine et en vue jour.
- Modifier/supprimer une interruption et vérifier que la charge forfaitaire
  disparaît bien de la courbe de charge.
- Vérifier qu'aucune régression n'apparaît sur l'écran d'accueil ni la
  course/le profil après le retrait de `db/bootstrap.ts`.

**À observer dans les jours qui viennent, T6.4 :**
- Un rappel de séance le matin d'un jour avec une séance planifiée non
  encore réalisée (fenêtre de 3 jours à l'avance, donc observable vite).
- Le comportement en présence d'une interruption qui suspend les
  relances : aucun rappel ne doit tomber sur ces jours-là — bon moment
  pour tester T6.3 et T6.4 ensemble.
- Le rappel de plan à échéance / plan échu dépend de la date réelle
  d'expiration du plan en cours — potentiellement une attente plus longue,
  ou observable plus vite si Mathieu ajuste `plan_valid_until` d'un test
  pour forcer le cas.

Une option pour accélérer cette confirmation sans attendre : un petit
outil de diagnostic listant les notifications réellement programmées
(`Notifications.getAllScheduledNotificationsAsync()`), pas construit à ce
jour faute d'avoir été demandé — à proposer si l'attente réelle gêne.

**Décision non recontrôlée avec Mathieu :** « Replanification autour »
(PRD §7 point 10) a été interprétée au sens le plus étroit possible :
aucune séance planifiée n'est touchée, modifiée ou annulée par la
déclaration d'une interruption, cohérent avec SPECS-TECH §8 (« aucune
replanification automatique, aucune séance générée par l'app »). Si
Mathieu voulait un geste plus actif (ex. proposer d'annuler en bloc les
séances qui tombent dans la période), ce serait un changement de portée,
pas un ajustement.

**Proposition de découpage de T6, désormais entièrement soldée** :

1. ~~T6.1 — Écran Profil~~ **Fait, validé le 31/08.**
2. ~~T6.2 — Écran Objectif~~ **Fait, validé le 31/08.**
3. **T6.3 — Interruptions** — techniquement complète le 31/08, jamais confirmée sur appareil
4. **T6.4 — Notifications locales** — construite le 01/09, module natif confirmé, comportements à observer
5. ~~T6.5 — Paramètres~~ **Fait, validé le 06/09** (thème, Health Connect, export, suppression)

**Nouveau sujet, hors découpage T6 : icône de l'application.** Voir
« Point ouvert : icône » en tête de document — à traiter dans la
prochaine conversation, dans le cadre d'une révision du design que
Mathieu souhaite mener plus largement (pas seulement l'icône).

**Hors code, toujours en attente — à ne pas oublier avant le GR20 :**
- Construire l'APK `preview` (profil existant dans `eas.json`) — **non
  confirmé fait à ce jour**, malgré le rappel lors de l'aller-retour EAS de
  T6.4. Reste le risque le plus urgent et le seul irréversible du projet.
- Vérifier `android.package` sur les profils `development`/`preview`.
- Installer Android Studio (`adb`, compilation locale) — partiellement
  résolu le 06/09 : `platform-tools` seul (`adb`) suffit pour les logs de
  crash, pas besoin de l'IDE complet.
- Supprimer `src/db/bootstrap.ts` du projet (plus appelé par `App.tsx`).

## Dette et provisoire

| Quoi | Où | À traiter |
|---|---|---|
| Format JSON du rattrapage planifié jamais vérifié | `import-planifie-aout-2026.json`, `planning/coachImport.ts` (jamais vu) | Reconstruit depuis la documentation, pas depuis un exemple réel. Aucun rejet signalé par Mathieu à l'import — mais la certitude viendrait de `coachImport.ts` ou d'un export Coach réel à comparer. |
| Pas de détection de doublon sur l'import planifié | `planning/manualPlannedImport.ts` | `saveDraft` crée toujours une séance neuve. Documenté, assumé — à la charge de l'utilisateur de ne pas rejouer un import. |
| RPE non pris en compte dans le hachage de déduplication | `health/manualEntry.ts::synthId` | Recoller une ligne identique en y ajoutant un RPE après coup ne l'écrira pas (doublon absorbé avant l'appel à `saveFeedback`). Limite documentée, à corriger si ça gêne à l'usage — passer la saisie du RPE par l'écran de bilan dans ce cas. |
| `coach.pending`, `stats.pending`, `calendar.prev`/`next`/`pending`, `nav.comingSoon` orphelines | `i18n/locales/fr.ts` | Lot de finition i18n, à faire un jour sans urgence |
| Marge basse du pied de modale Coach : valeur fixe, pas de constante d'encoche partagée | `screens/CoachScreen.tsx`, `ui/insets.ts` | `BOTTOM_INSET` reste local à `TabBar.tsx`, jamais reçu |
| Écriture non transactionnelle — rollback manuel dans le `catch` | `planning/plannedSessions.ts` | Vérifier ce qu'expose le pilote dans `db/client.ts` |
| Confirmations par `Alert` système — ignore les jetons | Plusieurs écrans | À reprendre en feuille maison si ça jure |
| Glyphes d'action déclarés localement, absents des jetons | `AppNavigator.tsx` (`BACK_GLYPH`), `HomeScreen.tsx` (`PROFILE_GLYPH`, `CHEVRON_RIGHT_GLYPH`) | Un seul aller-retour vers Claude Design pour les replier dans `tokens.icon.nav` |
| Structure JSON de `availability`/`equipment`/`injuries` fixée par Claude, jamais discutée avec Mathieu au préalable | `planning/profile.ts` | Fonctionne à l'usage, aucun rejet signalé — à ajuster si un besoin concret s'en écarte |
| `ui/OptionChip.tsx` réutilisé pour un choix MULTIPLE (disponibilités) alors qu'il porte `accessibilityRole="radio"` | `screens/ProfileScreen.tsx` | Sémantique d'accessibilité imparfaite pour ce cas précis, signalée en commentaire, pas corrigée — un composant dédié coûterait plus que le gain pour un seul écran |
| Sommeil jugé sur la seule durée, `phases` non exploité | `metrics/dailyForm.ts` | À rouvrir sur données réelles |
| Encoches approximées, `BOTTOM_INSET` réglé à l'œil | `ui/insets.ts`, `navigation/TabBar.tsx` | Prochain build natif |
| `ui/ScreenShell.tsx` et `ui/DataValue.tsx` — **reçus et vérifiés le 31/08** | — | Usage observé confirmé fidèle sur les deux fichiers. **Ne lèvent PAS l'énigme de l'icône réglage** (ligne suivante) : ni l'un ni l'autre ne la déclare, elle vient d'ailleurs. |
| Appui exact sur les pixels d'une pastille — risque théorique | `ui/WeekRow.tsx` | `pointerEvents: 'none'` pas appliqué là, contrairement à ailleurs |
| Détection d'un fichier coach rejoué par erreur | `planning/coachExport.ts` (`payloadHash`) | Calculé et stocké, non exploité par une alerte |
| Chevauchement de deux phases DANS le même fichier importé | `planning/coachImport.ts` | Non détecté à l'aperçu — limite documentée, cas marginal |
| `health/client.ts` — permissions non revérifiées par l'ingestion | `health/ingest.ts` | `ensureInitialized()` vérifie le SDK, pas les permissions accordées |
| `LOAD_RAMP` déclarée, sans producteur | `metrics/trainingAlerts.ts` | Son seul juge honnête est le ratio aigu/chronique de `coachSummary.ts` — à brancher, pas à réécrire |
| `StatsScreen.tsx` (bandeau BRICK creux) — **résolu le 06/09** | `screens/StatsScreen.tsx`, `metrics/disciplineStats.ts` | La vue BRICK lit désormais `brick_pair` (pas `session_link`), voir « Fait — 06/09 ». `plannedOnly` reste `true` tant qu'aucune paire n'est confirmée. |
| `ui/discipline.ts` jamais vérifié contre l'usage observé avant réception | — | **Reçu et confirmé le 31/08** — sans conséquence, l'usage observé était fidèle |
| Ambiguïté du rattachement automatique sur un BRICK partiellement réalisé — **résolu le 06/09** | `planning/sessionLinks.ts` | Le cas s'est produit en pratique (retour d'usage du 01/09) et a mené à `brick_pair`, indépendante de `session_link` — voir « Fait — 06/09 ». |
| Icône « réglage » visible en haut à droite sur les captures du 31/08 — **probablement du même ordre que l'incident du 06/09** | Origine toujours non formellement confirmée | Le 06/09, un gear identique est apparu sur des captures qui se sont révélées être l'écran du CLIENT DE DÉVELOPPEMENT lui-même, pas l'app — hypothèse renforcée mais toujours pas vérifiée noir sur blanc pour l'occurrence du 31/08. |
| **Icône de l'application ne reflète pas `icon.png`/`adaptive-icon.png` sur le lanceur** | `app.json`, build EAS | **Nouveau, 06/09.** Configuration relue et jugée correcte ; piste non vérifiée : build installé antérieur à la config, ou cache de prebuild EAS (`--clear-cache` jamais essayé). À traiter en priorité dans la prochaine conversation. |
| Suppression des données (T6.5) jamais testée sur les vraies données de Mathieu | `settings/appData.ts::deleteAllData` | Décision volontaire — mécanisme revu et jugé correct (fermeture propre puis suppression du fichier), mais irréversible sur de vraies données. À tester quand Mathieu le décidera, pas urgent. |
| **BIKE non confronté à la FTP sur l'écran Objectif** | `metrics/raceTargetReview.ts` | **Décision assumée (T6.2)**, pas un oubli — FTP (puissance) et vitesse requise ne sont pas la même grandeur physique, aucun modèle poids/aérodynamique dans l'app |
| `referenceStatus`/`referenceStatusKey`/`sourceLabelKey` dupliqués une troisième fois | `screens/ObjectiveScreen.tsx` | Même pattern déjà accepté deux fois (StatsScreen ↔ ProfileScreen, T6.1) — jugé trop mineur pour toucher un fichier tiers |
| Nom exact de la migration `0004` non confirmé par Claude | `db/schema.ts`, SPECS-TECH §3 | Généré par Mathieu via `drizzle-kit generate` — Claude n'a pas accès à son dossier `drizzle/` |
| **`manual_override` — comportement confirmé, hypothèse initiale corrigée** | `metrics/dailyLoad.ts` (reçu le 31/08) | Consultée en LECTURE par `readDailyLoadRange` — pas par la charge forfaitaire d'interruption, qui lit `interruption` directement dans `rebuildDailyLoad`. Voir ETAT « Correction apportée en cours de route ». |
| Interruption non marquée sur les pastilles du calendrier | `ui/WeekRow.tsx`/`ui/DayList.tsx` (jamais reçus) | Bandeau texte en en-tête seulement (`CalendarScreen.tsx`, reçu et étendu le 31/08). Amélioration possible avec ces deux fichiers. |
| `bootstrapProfileAndRace` — **retiré le 31/08 (T6.3)** | `db/bootstrap.ts`, `App.tsx` | Les deux reçus. `App.tsx` ne l'appelle plus. **Le fichier `db/bootstrap.ts` peut être supprimé du projet.** |
| « Replanification autour » (PRD §7 pt 10) interprétée au sens étroit, non confirmée par Mathieu | `planning/interruptions.ts` | Aucune séance planifiée touchée par une interruption — cohérent avec SPECS-TECH §8, mais l'intention exacte du PRD n'a pas été reconfirmée pour T6.3 |
| `metrics/dailyForm.ts` jamais reçu — usage de `athlete.birthDate`/`.sex` sans garde `null` ? | `db/bootstrap.ts` retiré | Question ouverte depuis le retrait de l'amorçage — sans conséquence sur l'appareil de Mathieu (colonnes déjà renseignées), pertinente seulement pour une base fraîchement installée |

## Risques actifs

| Risque | État |
|---|---|
| **APK final avec la bonne icône jamais construit ni installé** | **Nouveau, 09/09 — remplace le risque icône précédent.** Icône conçue, rastérisée, `app.json` configuré (voir « Fait — 09/09 »). Aucun des trois PNG n'a été placé dans `assets/icon/` à ce jour, aucun build EAS n'a suivi. Seul point technique de la prochaine conversation (point 3 du « Message de lancement »). |
| **Refonte visuelle du 09/09 non validée sur les écrans les plus récents** | **Nouveau, 09/09.** Coach, Statistiques, Paramètres, Health Connect, Périodisation, Édition d'une séance réalisée, le calcul croisé durée/distance et l'allure calculée pour une cible relative ont été livrés et corrigés au fil des retours de Mathieu au cours de LA MÊME conversation — mais aucun n'a eu de confirmation finale après le tout dernier correctif. À surveiller au premier usage réel qui suit cette session. |
| **Convention de conversion `% cible relative → allure`, posée sans précédent à vérifier** | **Nouveau, 09/09.** `PlannedSessionEditorScreen.tsx` interprète `X %` comme `X %` de la vitesse/puissance/FC, jamais du temps — y compris pour la CSS. Aucun code existant ne faisait cette conversion avant cette session (confirmé en lisant `blockText.ts`) : rien à contredire, mais rien à confirmer non plus. À valider sur l'appareil. |
| **Icône de l'application ne reflète pas la configuration** | **Remplacé le 09/09** par le risque ci-dessus, plus précis sur ce qui reste réellement à faire. |
| **Oubli d'ouvrir l'app plus de 7 jours** | **Levé le 01/09.** APK `preview` construit et installé, confirmé fonctionnel sans Metro ni PC allumé — données intactes après passage au nouveau build. |
| **Écrasement de la base par réinstallation** | **Partiellement levé.** Le passage à `preview` n'a pas effacé les données de Mathieu. `eas.json` toujours jamais reçu : la relation exacte entre `android.package` de `development` et `preview` reste non confirmée. |
| **Plus de client `development` installé** | **Levé le 04/09.** Reconstruit, fonctionnel — a servi à valider BRICK et T6.5 sur appareil. |
| **Client de développement corruptible après des crashs natifs successifs** | **Nouveau risque identifié le 06/09.** Un client de dev peut se retrouver dans un état instable (crash immédiat, écran blanc) sans lien avec le code — désinstallation/réinstallation complète est le correctif qui a fonctionné. À garder en tête avant de chercher un bug côté code. |
| **Chiffres faux sans signal** | **Actif, élargi historiquement, aucune nouvelle occurrence depuis T4.** Toujours aucun mécanisme d'alerte proactive. |
| **SQL généré non relu** | **Actif, tenu.** Migrations `0004` (T6.2) et `0005` (`brick_pair`, 06/09) relues avant exécution — même pratique que `0003`. |
| **Absence de SDK Android local** | **Actif.** Chaque module natif impose un aller-retour EAS. `adb` indisponible. |
| Instabilité du tunnel Expo | Actif — non testé, faute de SDK Android local |
| Puissance vélo inconnue | En attente — resonder en octobre 2026 |
| Abandon de l'aller-retour manuel Coach | Actif — outil de relance construit (T6.4), déclenchement effectif pas encore observé |
| Objectif 5h45 irréaliste | Actif — outil de confrontation livré (T6.2), révision toujours à la discrétion de Mathieu |
| Indisponibilité du développeur | Actif — déménagement, GR20, stage TUM |
| **T6.3 non validée sur appareil** | **Actif, ouvert le 31/08, toujours ouvert le 01/09.** Techniquement complète, comportement de `manual_override`/`interruption` confirmé — reste le test sur appareil habituel avant clôture, jamais fait à ce jour. |
| **T6.4, quatre comportements pas encore observés** | **Actif, ouvert le 01/09.** Module natif et permission confirmés sur appareil. Rappel de séance, plan à échéance, plan échu, suspension par interruption : à observer dans les prochains jours d'usage réel. |
| `manual_override` jamais consultée, à confirmer | **Levé le 31/08.** `metrics/dailyLoad.ts` reçu : consultée en lecture par `readDailyLoadRange`, mécanisme distinct de la charge forfaitaire d'interruption — voir Dette et provisoire. |
| **T6.1 non validée** | **Levé le 31/08.** Testé sur appareil (course, profil, disponibilités, matériel, blessures, zones avec source obligatoire, journal, suppression) — confirmé fonctionnel par Mathieu. |
| **T6.2 non validée** | **Levé le 31/08.** Testé sur appareil (décomposition, confrontation) — confirmé fonctionnel par Mathieu (« Cela fonctionne parfaitement »). |
| Duplication de `referenceNumeric` entre Statistiques et Profil | **Levé le 31/08.** Consolidée dans `metrics/disciplineStats.ts`, étendue à `hr_max`. |
| Format d'échange coach fragile | **Largement levé.** Construit, testé de bout en bout. |
| Client Health Connect non initialisé par l'ingestion | **Levé le 27/08.** Confirmé fonctionnel sur appareil. |
| Health Connect trop pauvre | **Levé** par la sonde, T1 et T2 |
| Perte d'historique avant collecte | **Levé** — collecte en marche depuis le 22/08 |
| **T6.5 (Paramètres) non construite** | **Levé le 06/09.** Construite et validée en entier sur appareil — voir « Fait — cette conversation ». |
| **BRICK spontané non détecté** | **Levé le 06/09**, après une révision d'architecture en cours de route. Voir « Fait — cette conversation ». |
| **Retours d'usage du 01/09 non traités** | **Levé le 06/09.** Les quatre points sont corrigés et validés. |

## Points ouverts

**Tranchées cette conversation (T6.2) :**

- Décomposition du chrono cible : allocation manuelle, jamais un
  pourcentage type — décision de Mathieu, 31/08.
- Édition du chrono cible : sur l'écran Objectif, jamais sur le Profil —
  décision de Mathieu, 31/08.
- Confrontation : juxtaposition seulement, aucun verdict de faisabilité —
  décision de Mathieu, 31/08.
- `target_revised_at` : mise à jour automatique si et seulement si
  `target_total_seconds` change de valeur — décision de Mathieu, 31/08.

**Tranchées cette conversation (T6.3), par Claude, non contestées à ce jour :**

- Non-chevauchement strict entre interruptions (aucune ne peut chevaucher
  une autre), cohérent avec la périodisation — confirmé nécessaire, pas
  seulement prudent, à réception de `metrics/dailyLoad.ts`.
- Charge forfaitaire lue directement depuis `interruption` par
  `rebuildDailyLoad`, jamais via `manual_override` — correction d'une
  hypothèse initiale, voir « Fait — cette conversation ».
- Un seul champ transitions, pas T1/T2 séparés — mêmes termes que T6.2.
- Lien d'accès depuis la carte Disponibilités du Profil, pas depuis l'accueil.
- `db/bootstrap.ts` retiré de `App.tsx`, à supprimer du projet.

**Précédemment tranchées (T6.1) :**

- Écran Profil : un seul écran en sections — décision de Mathieu, 31/08.
- Saisie d'une zone : source (Test/Estimation/Manuel) obligatoire, sans
  défaut — décision de Mathieu, 31/08.

**Tranchées cette conversation (T6.4), par Claude, non contestées à ce jour :**

- Horaire unique à 7h pour toutes les notifications — pas de réglage en
  v1, candidat pour Paramètres (T6.5).
- Reprogrammation complète à chaque `runMorningSync`, jamais de série
  répétée nativement — une seule occurrence de chaque relance par appel.
- Plan jamais importé traité comme équivalent à un plan échu depuis
  l'origine.
- `cancelAllScheduledNotificationsAsync` sans filtrage — assume qu'Iron
  App est seule à programmer des notifications locales sur l'appareil.

**Sans réponse, T6.3 :**

- « Replanification autour » (PRD §7 point 10) interprétée au sens étroit
  par Claude (aucune séance touchée) — Mathieu n'a pas confirmé que c'est
  l'intention exacte du PRD. À trancher si un besoin concret s'en écarte.

**Tranchées cette conversation (06/09), les quatre retours d'usage du
01/09 et T6.5 — toutes confirmées par un test sur appareil :**

- OTHER exclu du total de `loadStatsOverview` SEULEMENT — la charge
  physiologique continue de compter ailleurs (`dailyLoad.ts`).
- Icône et splash conçus par Claude à partir du pictogramme BRICK de
  `tokens.ts` — décision de Mathieu du 04/09 (« conçois quelque chose de
  simple à partir des tokens »). Splash fonctionnel, icône du lanceur
  toujours en échec (voir « Point ouvert » en tête de document).
- BRICK spontané : table `brick_pair`, indépendante de `session_link` —
  décision retenue APRÈS qu'un premier essai réutilisant `session_link`
  (option A initiale) a été cassé par un test réel sur appareil. Proposé
  depuis une carte dédiée du bilan de séance, refus mémorisé.
- T6.5 : pas de nouvelle table pour le thème (`athlete.themePreference`
  réutilisée) ; entrée unique sur l'Accueil, pas sur Statistiques — les
  deux décisions initiales de la proposition orale du 01/09 ont été
  révisées en cours de route, l'une par découverte de Claude (colonne déjà
  là), l'autre par demande explicite de Mathieu.

**Nouveau, 06/09 — à trancher dans la prochaine conversation :**

- ~~Pourquoi l'icône ne s'affiche pas malgré une configuration `app.json`
  correcte~~ **Traité le 09/09** : icône reconçue à partir de deux SVG
  fournis par Mathieu (pas plus d'hypothèse sur la cause du problème du
  06/09, l'app.json précédent a été remplacé plutôt que débogué).
- ~~Portée de la révision de design souhaitée par Mathieu~~ **Traité le
  09/09** : révision quasi intégrale de tous les écrans, sur la maquette
  Claude Design déjà produite et `HANDOFF.md`.

**Tranchées cette conversation (09/09), par Claude ou sur demande
explicite de Mathieu — voir « Fait — cette conversation (9 septembre
2026) » pour le détail :**

- Reconstruction complète (fichier neuf, pas un patch) pour Coach,
  Statistiques, Paramètres — trop éloignés de la maquette pour un
  ajustement chirurgical. Patch chirurgical pour tout le reste.
- Sélection des séances à exporter sur Coach : liste inline filtrée par
  pastilles de période, plus de feuille séparée (`SessionPickerSheet.tsx`
  abandonné sur cet écran).
- Suppression des données (Paramètres) : flux inline en deux étapes
  (recopier le total de séances, puis confirmer), remplace les deux
  `Alert` du 06/09.
- Aperçu global de Statistiques retiré de l'en-tête commun (suit la
  maquette), puis partiellement réintroduit en une ligne discrète pour ne
  pas contredire Paramètres — **Mathieu a demandé un traitement plus
  visible, décision à prendre en ouverture de la prochaine conversation.**
- Périodisation reconstruite sous une vraie route (`{kind:
  'periodization'}`) — l'ancien `PhasesScreen.tsx` était ouvert par un
  `Modal` local dans `CalendarScreen.tsx`, en dehors de tout le système de
  route. L'édition de blocs est conservée dans le nouvel écran ; **à
  confirmer que c'était bien l'intention**, la capture fournie par
  Mathieu ne montrait que l'état liste.
- `estimateDuration`/`estimateDistance` dérivent l'une de l'autre à partir
  d'une cible de rythme ABSOLUE — jamais un pourcentage relatif.
- Une cible relative (% VMA/CSS/FTP) s'affiche en allure/puissance/FC
  calculée sur la ligne de bloc de l'éditeur — convention posée sans
  précédent (`X %` = `X %` de la vitesse/puissance/FC, jamais du temps,
  y compris pour la CSS). **À valider sur l'appareil.**
- `LoadChart.tsx` reçoit des couleurs (Fond/Fatigue/Fraîcheur), deuxième
  exception assumée au principe « la couleur est un budget » (SPECS-TECH
  §15) — sur demande explicite de Mathieu.
- Écran de premier lancement écarté ; détail d'un bloc réalisé jugé sans
  objet — voir « Où en est le projet » en tête de document.

**Nouveau, 09/09 — à trancher en ouverture de la prochaine conversation
(qui doit être la DERNIÈRE) :**

- Quelle forme donner à la mise en avant du bilan global de Statistiques
  (carte dédiée ? bandeau ? autre ?) — demande de Mathieu, portée non
  précisée à ce jour.
- Si l'édition de blocs de Périodisation doit vraiment exister (voir
  ci-dessus) — capture fournie ne montrait que la liste.
- La convention `% cible relative = % de la vitesse/puissance/FC, jamais
  du temps` (`PlannedSessionEditorScreen.tsx`) — à confirmer sur
  l'appareil, aucun précédent dans le code pour la contredire ou la
  confirmer par ailleurs.

## Repères de numérotation

Drizzle compte à partir de zéro, ETAT et SPECS comptaient à partir de un. Pour
lever l'ambiguïté, **les migrations sont désignées par leur nom de fichier**.

| Fichier | Contenu |
|---|---|
| `0000_jittery_zuras.sql` | Création initiale, 16 tables |
| `0001_quick_the_executioner.sql` | `athlete.sex`, `daily_load.form_components` |
| `0002_steep_sway.sql` | Refonte de `planned_block` — **écrit à la main** |
| `0003_open_golden_guardian.sql` | `training_phase` — généré, **relu avant exécution** |
| `0004_race_target_breakdown.sql` *(nom provisoire)* | Décomposition du chrono cible sur `race` — généré par Mathieu via `drizzle-kit generate`, **nom exact non confirmé par Claude** (accès au dossier `drizzle/` de Mathieu impossible) |
| `0005_slippery_the_call.sql` | `brick_pair` — généré par Mathieu via `drizzle-kit generate`, nom confirmé (Mathieu l'a collé dans sa sortie de terminal) |

**Aucune migration entre `0003` et `0004`.** T3.3.b à T6.1 ont tenu
entièrement dans le schéma existant. `session_link` et `feedback` étaient
déclarées depuis `0000`, alimentées seulement en T4 ; `zone` de même,
alimentée seulement en T6.1. `interruption` et `manual_override`, toutes
deux déclarées depuis `0000`, n'ont eu besoin d'aucune migration non plus
pour être alimentées en T6.3 — même principe, confirmé une fois de plus.
`0004` est la première migration depuis `0003` : la décomposition du
chrono cible (T6.2) avait besoin de colonnes qui n'existaient nulle part,
contrairement à tout ce qui a précédé depuis T3.3.b. `0005` (`brick_pair`,
06/09) est la seule autre migration depuis : le typage
`$type<ThemePreference>()` posé sur `athlete.themePreference` la même
session n'en a produit aucune (confirmé — `drizzle-kit generate` a rendu
« No schema changes, nothing to migrate » avant l'ajout de `brick_pair`).

## Arborescence utile

**Mise à jour 09/09** : fichiers neufs marqués `[neuf]`, fichiers
orphelins (plus aucun appelant, supprimables) marqués `[orphelin]` — voir
« Fait — cette conversation (9 septembre 2026) », section Périodisation.

```
src/
  db/         client.ts, schema.ts
  health/     client.ts, ingest.ts, exerciseTypes.ts, units.ts,
              manualEntry.ts (+ updateActualSession, 09/09)
  metrics/    homeData.ts, dailyForm.ts, dailyLoad.ts, hrSeries.ts,
              sessionAggregates.ts, disciplineStats.ts, coachSummary.ts,
              pipeline.ts, loadRecompute.ts, banister.ts,
              sessionReview.ts, trainingAlerts.ts, raceTargetReview.ts
  planning/   plannedSessions.ts (estimateDuration/estimateDistance
              étendues, 09/09), blockText.ts, trainingPhases.ts,
              weekView.ts, raceInfo.ts, coachExport.ts, coachImport.ts,
              sessionLinks.ts, sessionFeedback.ts, manualPlannedImport.ts,
              profile.ts, interruptions.ts
  ui/         discipline.ts, insets.ts, Icon.tsx, DataValue.tsx,
              SessionChip.tsx, ScreenShell.tsx, OptionChip.tsx,
              MonthGrid.tsx, DateField.tsx, useKeyboardHeight.ts,
              useReduceMotion.ts, WeekRow.tsx [orphelin, 09/09],
              DayList.tsx [orphelin, 09/09],
              DisciplineSelector.tsx, WeekBars.tsx, ReferenceTrend.tsx,
              Checkbox.tsx, SessionPickerSheet.tsx (plus utilisée sur
              Coach depuis le 09/09, statut ailleurs non vérifié),
              format.ts, RpeScale.tsx, Nombre.tsx, Picto.tsx,
              Pastille.tsx, DayFocusView.tsx (corrigée, enrichie, 09/09),
              LoadChart.tsx (couleurs, 09/09)
  theme/      tokens.ts, text.ts, ThemeProvider.tsx
  screens/    HomeScreen.tsx, CalendarScreen.tsx, CoachScreen.tsx
              (reconstruit, 09/09), StatsScreen.tsx (reconstruit, 09/09),
              PhasesScreen.tsx [orphelin, 09/09 — remplacé par
              PeriodizationScreen.tsx],
              PlannedSessionEditorScreen.tsx, BlockSheet.tsx,
              T3ThemeCheckScreen.tsx, SessionReviewScreen.tsx,
              ManualActualSessionScreen.tsx, ProfileScreen.tsx,
              ObjectiveScreen.tsx, InterruptionsScreen.tsx,
              SettingsScreen.tsx (reconstruit, 09/09),
              EditActualSessionSheet.tsx [neuf, 09/09],
              HealthConnectScreen.tsx [neuf, 09/09],
              PeriodizationScreen.tsx [neuf, 09/09],
              PhaseSheet.tsx [neuf, 09/09]
  navigation/ AppNavigator.tsx (routes healthConnect/periodization,
              bug de flash corrigé, 09/09), TabBar.tsx,
              NavigationContext.tsx, routes.ts (+2 routes, 09/09)
  notifications/ schedule.ts, handler.ts
  i18n/       locales/fr.ts
  lib/        dates.ts
```

**Fichiers `src/` jamais reçus de toute la session du 09/09** :
`planning/coachImport.ts`, `metrics/disciplineStats.ts`,
`health/client.ts` — voir « Où en est le projet » en tête de document.

**Hors `src/`, livrés en T5 :**
- `coach-context-ironapp-1.md` — contexte du format d'échange pour le futur projet Claude de coaching
- `test-import-ironapp-1.json` — fichier de test pour l'import, vérifié par exécution réelle

**Hors `src/`, livrés le 30/08 (rattrapage août, hors code) :**
- `import-planifie-aout-2026.json` — 22 séances planifiées, format reconstruit non vérifié
- `import-realise-aout-2026.txt` — 22 séances réalisées, format de collage étendu (RPE)

**Hors `src/`, livrés le 09/09 :**
- `icone-app-foreground.svg`, `icone-app-monochrome.svg` — fournis par
  Mathieu, jamais reçus avant cette session malgré une mention dans une
  passation antérieure
- `icon-foreground.png`, `icon-monochrome.png`, `icon-flat.png` — générés
  par Claude depuis les deux SVG ci-dessus (`sharp`, 1024×1024), jamais
  placés dans le projet à ce jour
- `app.json` — modifié directement par Claude (`icon`,
  `android.adaptiveIcon`)

## Fichiers reçus, T6.3 et T6.4 — tous exploités

Pour T6.3 (31/08) : `metrics/dailyLoad.ts`, `metrics/pipeline.ts`,
`metrics/banister.ts`, `screens/CalendarScreen.tsx`, `db/bootstrap.ts`.
Pour T6.4 (01/09) : `planning/coachExport.ts`, `planning/coachImport.ts`,
`metrics/trainingAlerts.ts`, `metrics/homeData.ts`, `app.json`. Plus aucun
fichier bloquant connu sur l'une ou l'autre tranche — seul le temps et
l'usage réel restent à observer (voir « Prochaine action »).

**Utiles pour une prochaine amélioration, non bloquants :**
- `ui/WeekRow.tsx`, `ui/DayList.tsx` — pour marquer une interruption
  directement sur les pastilles de semaine/jour, au-delà du bandeau texte
  actuel de `CalendarScreen.tsx`.
- `metrics/dailyForm.ts` — pour vérifier l'usage de `athlete.birthDate`/
  `.sex` après le retrait de `db/bootstrap.ts` (voir Dette et provisoire).

**Pour la prochaine conversation (icône + révision du design), à préparer :**
- `eas build:list --platform android --limit 10` — pour dater le build
  effectivement installé face à l'ajout de la config icône.
- `tokens.ts` — déjà en main, base de toute révision de palette/typographie.
- `icon.png`/`adaptive-icon.png` — déjà en main (générés le 04/09),
  utiles pour comparer à ce qui s'affiche réellement sur l'appareil.
- Toute capture d'écran de l'icône actuelle sur le téléphone (lanceur,
  liste des apps) — pour confirmer visuellement ce qui s'affiche.

---

## Message de lancement — nouvelle conversation

> Projet Iron App. Voici PRD.md, SPECS-TECH.md et ETAT.md à jour au
> Projet Iron App. Voici PRD.md, SPECS-TECH.md et ETAT.md à jour au
> 09/09/2026 (mets-les d'abord à jour dans les fichiers du projet Claude
> si ce n'est pas déjà fait).
>
> La refonte visuelle est terminée — tous les écrans sont passés sur le
> nouveau système (`Nombre`/`Picto`/`Pastille`), plusieurs bugs de fond
> corrigés au passage (flash de navigation, calcul croisé durée/distance,
> mésusage de `Pastille`). **Cette conversation doit être la DERNIÈRE du
> projet.** Trois points, rien d'autre :
>
> 1. **Ajouter quelques séances via le Coach** — le flux Export →
>    conversation externe → Import est en place. Si l'usage réel révèle
>    un bug, corrige-le ; sinon c'est un usage guidé, pas du code.
> 2. **Mettre le bilan global de Statistiques plus en avant** — une ligne
>    discrète existe déjà sous le titre (`stats.overview.total`), ajoutée
>    en urgence le 09/09 pour ne pas contredire Paramètres. Je veux un
>    traitement plus visible. [Mathieu précise ici la forme souhaitée :
>    carte dédiée, bandeau, écran séparé.]
> 3. **Exporter l'application avec la bonne icône, fonctionnelle sur
>    Android** — icône et `app.json` prêts depuis le 09/09
>    (`assets/icon/icon-foreground.png`, `icon-monochrome.png`,
>    `icon-flat.png`, à placer dans le projet si ce n'est pas déjà fait).
>    Il reste à lancer un build EAS (`--clear-cache`) et vérifier de bout
>    en bout sur un appareil Android réel — jamais fait à ce jour.
>
> Fichiers joints : les trois PNG d'icône si pas encore placés dans le
> projet, `app.json` (déjà à jour), et toute capture d'écran utile pour
> cadrer le point 2.


---

# PARTIE B — PRD v1.4 (ancienne application, 09/09/2026)

# PRD — Iron App

**Version** 1.4
**Date** 9 septembre 2026
**Porteur produit** Mathieu
**Statut** Validé. **Refonte visuelle quasi intégrale menée le 09/09**, sur
la maquette Claude Design et `HANDOFF.md` — voir SPECS-TECH §24 et
ETAT.md pour le détail exhaustif. **La prochaine conversation doit être la
DERNIÈRE du projet**, bornée à trois points : peupler un plan via le
Coach, mettre le bilan global de Statistiques plus en avant, livrer un
APK fonctionnel avec l'icône définitive sur un appareil Android réel.

> **v1.4 — ce qui change.** Refonte visuelle de la quasi-totalité des
> écrans en une seule conversation. Deux écrans neufs (Health Connect ·
> état refusé, Périodisation — remplace l'ancien `PhasesScreen.tsx`,
> jamais migré et jamais raccroché au système de route), une feuille
> neuve (Édition d'une séance réalisée, HANDOFF fenêtres dérivables).
> Coach, Statistiques et Paramètres reconstruits en entier. Deux bugs de
> fond corrigés : flash de l'onglet actif au changement d'écran, calcul
> croisé durée/distance jamais fait sur une séance planifiée (§5).
> L'icône de l'application est reconçue à partir de deux SVG fournis par
> Mathieu (le pictogramme BRICK généré le 06/09 est abandonné), `app.json`
> reconfiguré — **le build EAS et la vérification sur appareil restent à
> faire**, seul point technique de la dernière conversation. **Deux
> fonctionnalités explicitement écartées après réflexion** : l'écran de
> premier lancement (§10), et le détail d'un bloc pour une séance
> réalisée (n'a pas de sens dans ce domaine — une séance réalisée n'a pas
> de structure de blocs).
>
> **v1.3 — pour mémoire.** Les quatre retours d'usage réel remontés
> après plusieurs jours avec le build `preview` sont traités : OTHER
> exclu du total de Statistiques (décision du §4/§7 point 4 révisée en ce
> sens, portée limitée à l'affichage) ; splash personnalisé ; icône
> conçue mais pas encore effective sur appareil (point ouvert) ; **BRICK
> spontané détecté et proposé** — amende la décision du 25/08 (« l'écran
> BRICK reste creux, confirmé et livré tel quel ») pour le cas d'un
> enchaînement réalisé sans avoir été planifié comme BRICK : l'app
> détecte deux séances réalisées le même jour, propose le regroupement
> depuis le bilan de séance, et la vue BRICK n'est plus creuse dès qu'un
> regroupement est confirmé. **T6.5 (Paramètres) est livré et validé sur
> appareil** : thème (persistant, trois positions), connexion Health
> Connect (statut et relance), export du fichier de données brut,
> suppression complète avec confirmation forte. Langue et restauration
> (import) restent hors périmètre, comme prévu au point 12 ci-dessous.
>
> **v1.2 — pour mémoire.** T6.4 construite et son point le plus risqué
> validé sur appareil : `expo-notifications` intégré (aller-retour EAS,
> comme annoncé), la demande de permission s'affiche et a été acceptée.
> Reste à confirmer, dans les jours qui viennent, que les quatre
> comportements eux-mêmes (rappel de séance, plan à échéance, plan échu,
> suspension par interruption) se déclenchent au bon moment — nature du
> sujet, pas un doute sur le code : ce sont des notifications programmées
> pour un futur proche, invérifiables en une seule séance de test.
> **Rappel signalé à Mathieu** : T6.3 n'a jamais reçu de confirmation
> explicite ; la conversation est passée directement à T6.4 sur sa
> demande. Le PRD la garde donc « pas close » jusqu'à nouvel ordre.
>
> **v1.1 — pour mémoire.** T6.3 (interruptions) est écrite en entier, avec
> une correction importante en cours de route : la charge forfaitaire d'une
> interruption (cas GR20) ne passe PAS par `manual_override` comme
> initialement conçu sans avoir vu le fichier concerné, mais est lue
> directement par `metrics/dailyLoad.ts` depuis la table `interruption` —
> confirmé à réception de ce fichier. Le non-chevauchement strict entre
> interruptions, décidé par prudence avant cette confirmation, s'est avéré
> être exactement la protection nécessaire (`dailyLoad.ts` résout sinon un
> chevauchement de façon arbitraire). `db/bootstrap.ts`, provisoire depuis
> l'origine du projet, est retiré : Profil (T6.1) et Objectif (T6.2)
> couvrent tout ce qu'il amorçait. Le calendrier affiche désormais un
> bandeau si une interruption couvre le jour courant — intégration
> volontairement minimale, sans toucher aux pastilles de semaine/jour
> (`WeekRow.tsx`/`DayList.tsx` non reçus). **Cette tranche n'est PAS
> déclarée close** : elle attend le test sur appareil de Mathieu, comme
> toutes les précédentes avant elle.
>
> **v1.0 — pour mémoire.** T6.2 est validée sur appareil, sans réserve :
> l'écran Objectif décompose le chrono cible en temps alloué par discipline
> (natation, vélo, course, transitions — un seul champ, pas T1/T2 séparés)
> et confronte l'allure ou la vitesse qui en résulte à la dernière valeur
> connue de VMA/FTP/CSS. **Aucun verdict de faisabilité** : l'écran
> juxtapose deux nombres, il ne juge jamais si l'objectif tient — même
> raisonnement que le rejet déjà acté du bloc « ajustement proposé » du
> Coach (§6). Le chrono cible s'édite ici, et seulement ici : le Profil
> (T6.1) ne l'a jamais touché et ne le touchera pas. L'allocation par
> discipline est manuelle, jamais déduite d'un pourcentage type — un
> gabarit de répartition aurait inventé une règle non demandée. Le vélo est
> un cas à part assumé : la FTP est une puissance, pas une vitesse, les
> deux valeurs ne se comparent pas directement, et l'écran le dit en
> toutes lettres plutôt que de suggérer un lien qui n'existe pas.
>
> **v0.9 — pour mémoire.** T6.1 validée sur appareil, sans réserve :
> l'écran Profil couvre le point 1 du §7 dans son intégralité sauf le
> chrono cible, délibérément réservé à T6.2 (§10). C'est **ici, et
> seulement ici**, que les indicateurs de performance (VMA, FTP, CSS, FC
> max) se saisissent désormais — la table `zone`, déclarée depuis
> l'origine, est enfin alimentée. Chaque saisie exige explicitement une
> source (test, estimation, manuel) : aucun défaut silencieux, décision de
> Mathieu cohérente avec le principe déjà posé au §5 (« aucune allure cible
> présentée comme fiable » sans que sa méthode soit dite). Un journal par
> zone, ajouté en cours de tranche sur retour d'usage, permet de consulter
> l'historique complet d'un indicateur et de supprimer un relevé mal saisi
> — la table étant historisée, corriger une estimation ratée exigeait de
> voir et de cibler une ligne précise, pas seulement la plus récente.
>
> **v0.8 — pour mémoire.** T4 validée sur appareil sans réserve : rattachement
> automatique, bilan de séance, ressenti, alertes, saisie manuelle et
> suppression d'une séance ont tous été testés en conditions réelles.
> Août 2026 intégralement reconstruit dans l'app avec des données réelles.
>
> **v0.7 — pour mémoire.** T4 construite le 28/08 : le rattachement
> automatique prévu ↔ réalisé alimente `session_link` (§6, §7 point 8),
> l'écran de bilan de séance remplace sa coquille, le RPE et le commentaire
> libre se saisissent après séance, une première analyse automatique existe
> (écart au plan, dérive cardiaque interprétée, alertes de période).
>
> **v0.6 — pour mémoire.** L'échange coach (§6) construit et validé de bout
> en bout : format JSON maison `ironapp/1` confirmé, export du dossier
> complet, import avec aperçu et confirmation, testés réellement sur
> appareil.
>
> **v0.5 — pour mémoire.** Maquettes Claude Design reçues et revues pour
> Coach et Stats (§7.4, §6). L'écran BRICK (§7.4) est confirmé creux, pas
> masqué. Le bloc « ajustement proposé » de l'onglet Coach est écarté,
> jugé impossible à fiabiliser.
>
> **v0.4 — pour mémoire.** Le calendrier croisé (§7.5) a perdu sa vue MOIS.
> La duplication d'une séance planifiée (§10) a été tranchée.

---

## 1. Contexte

Mathieu est inscrit à un half Ironman en **mai 2027** (1,9 km natation / 90 km vélo / 21,1 km course). Il cherchait une application pour programmer, suivre et analyser son entraînement multi-disciplines. Garmin Connect enregistre bien les performances mais ne permet ni de programmer un plan de façon ergonomique, ni de bénéficier de plans d'entraînement adaptables.

Des solutions concurrentes existent (Humango, Athletica, TriDot, TrainingPeaks, iDO), toutes payantes ou incomplètes. Le choix est fait de construire un outil personnel, gratuit et taillé exactement au besoin.

**Objectif du projet** : avoir l'application *et* la construire soi-même.

## 2. Utilisateur

Un seul utilisateur pour la v1 : Mathieu. Partage éventuel à quelques amis Android plus tard.

### Profil sportif au 21 août 2026

| Discipline | Volume actuel |
|---|---|
| Natation | 2 séances / semaine, 1700–1800 m, ~45 min |
| Course | 3 sorties / semaine, dont 1 fractionné et 1 sortie longue |
| Renforcement | 3 séances / semaine, push / pull / legs |
| Vélo | Néant — démarrage en octobre 2026 |

- Pratique course et natation depuis avril 2026.
- Objectif chrono annoncé : **5h45**, soit environ 38 min natation / 3h05 vélo (29 km/h) / 1h50 course, transitions comprises. Ambitieux compte tenu de l'absence de base vélo. **À traiter comme une hypothèse révisable, pas comme une donnée figée.**
- Zones physiologiques inconnues au lancement du projet (VMA, FTP, CSS). **Saisissables depuis le 31/08 (T6.1)**, avec leur méthode explicite (test/estimation/manuel) — le coach continue de programmer des tests et d'y préparer l'athlète.
- Vie instable sur les prochains mois : déménagement, GR20 (10 jours de bivouac), installation dans le sud de Munich pour un stage à la TUM.

### Arbitrage de charge à anticiper

8 séances par semaine actuellement. L'arrivée du vélo porterait le total à 10–11, ce qui n'est pas tenable. Le renforcement devra descendre à 2 séances, puis à 1 en entretien pendant les blocs chargés. **Le coach doit expliquer ce compromis plutôt que supprimer des séances en silence.**

## 3. Contraintes structurantes

> **Amendement du 12/10/2026 — Iron App 2.** À la demande explicite de
> Mathieu, la nouvelle application (`iron-app-web`) lève trois contraintes
> ci-dessous :
> - **Plateformes.** Elle tourne aussi sur PC et sur iPhone, via une app web
>   installable : pas de licence Apple, coût toujours de 0 €.
> - **Synchronisation.** Les données sont synchronisées par un compte Google
>   (Firebase, offre gratuite), alors que l'app était 100 % locale.
> - **Stack.** Elle est écrite en React web plutôt qu'en React Native / Expo.
>
> La lecture de la montre reste Android seulement (Health Connect, APK).
> Voir ETAT du 12/10 et SPECS-TECH §25.

Ces décisions sont prises et conditionnent tout le reste.

| Contrainte | Décision |
|---|---|
| Plateforme | **Android uniquement.** iOS écarté : distribution hors App Store impose la licence Apple à 99 $/an, refusée. |
| Stack | TypeScript, React Native, Expo |
| Coût de fonctionnement | **0 €/mois**, sans exception |
| Maintenance | **0 h/semaine** une fois la période de rodage terminée |
| Backend | **Aucun.** Application 100 % locale. |
| Distribution | APK installé directement |
| Langues | Français en v1. Architecture i18n en place dès le départ, anglais livré plus tard. |
| Données antérieures | Aucune mise à jour ne doit détruire les données existantes. Schéma versionné et migrations dès le premier jour. |

## 4. Acquisition des données

### Ce qui est possible

L'API Garmin Connect est hors d'atteinte : réservée aux entités légales, usage personnel rejeté, et le programme est suspendu aux nouvelles demandes sans date de réouverture. Les agrégateurs qui détiennent un partenariat Garmin (Terra et consorts) démarrent autour de 499 $/mois.

**Chemin retenu : Health Connect (Android).** Garmin Connect y déverse les séances, la fréquence cardiaque, le sommeil, le poids et les calories. Libre-service, gratuit, sans approbation.

**Écran dédié à l'état refusé, livré le 09/09** (`HealthConnectScreen.tsx`) : explique ce qui change concrètement quand les permissions ne sont pas accordées (tout passe par la saisie manuelle, la forme du jour n'est plus calculée), plutôt que de laisser l'app se comporter différemment sans le dire.

**Montre de l'utilisateur : Garmin Fenix 7S Pro Sapphire Solar.** Capteur optique, suivi HRV, séances structurées supportées en course, vélo, natation en bassin et renforcement. Se monte en périphérique de stockage USB.

### Ce qui n'est pas possible

- **Body Battery, Training Readiness, Training Load, Recovery Time** restent enfermés dans l'écosystème Garmin. Ne seront ni récupérés ni reproduits.
- **Export automatique des séances vers la montre** : c'est l'API Training, donc bloquée. La v1 affiche la séance, l'utilisateur la resaisit dans Garmin Connect.

### Piste à explorer plus tard

Génération de fichiers `.FIT` de séances, déposés sur la montre par câble USB. Intérêt : charger une semaine entière d'un coup. À évaluer après la v1.

### Risque n°1 du projet — et un second, découvert le 27/08

Toute la chaîne repose sur une hypothèse non vérifiée : **Health Connect reçoit-il, depuis Garmin Connect sur Android, des données assez détaillées ?** Sans courbe de fréquence cardiaque, le calcul de charge est impossible et l'architecture change. **Levé** par la sonde de T0 — verdict GO NOMINAL.

**Second risque, bien réel celui-là, constaté le 27/08 : l'ingestion peut s'arrêter en silence sans qu'aucun écran ne le signale.** Le client Health Connect doit être explicitement initialisé avant toute lecture ; si ce n'est fait par aucun écran de la session, l'ingestion échoue à chaque tentative, sur les trois familles de données à la fois, sans qu'aucun message ne remonte à l'utilisateur. Corrigé le 27/08.

**Action préalable à tout développement** : construire une sonde Health Connect (~100 lignes) qui affiche brut tout ce qui remonte de la Fenix. Aucun autre code n'est écrit avant ce résultat.

## 5. Métriques calculées

| Métrique | Approche | Fiabilité |
|---|---|---|
| Charge par séance | TRIMP (fréquence cardiaque × durée) | Solide, science publiée |
| Forme de fond / fatigue / fraîcheur | Modèle impulsion-réponse de Banister | Solide |
| Forme du jour | Composite : sommeil, FC de repos, fraîcheur, RPE de la veille | Approximatif mais transparent |
| Body Battery | **Non reproduit** | — |

Les valeurs n'auront pas la même échelle que Garmin. Chaque calcul doit être explicable à l'utilisateur.

**Saisie manuelle prioritaire** : l'utilisateur peut écraser n'importe quelle valeur calculée par celle lue sur sa montre. La valeur saisie fait foi.

**Zones physiologiques (VMA, FTP, CSS, FC max)** : historisées, une ligne par mesure, jamais écrasées (T6.1). Chaque saisie porte obligatoirement sa source — test, estimation ou manuel — sans défaut silencieux : une valeur sans méthode explicite ne serait qu'une estimation déguisée en mesure.

## 6. Le coach

### Architecture retenue : aller-retour manuel

Pas d'IA embarquée dans l'application. Le coach est Claude, dans un projet dédié, hors de l'app.

```
[Iron App]  --- Exporter ---> fichier dossier-athlète
                                      |
                              [Projet Claude]
                              discussion, négociation du plan
                                      |
[Iron App]  <--- Importer --- fichier plan
                              aperçu des changements → confirmation
```

**Avantages** : coût nul, coach au maximum de ses capacités, accès web, et surtout l'utilisateur négocie son plan avant de l'importer.

**Limites acceptées** : pas de coach de poche en situation, et dépendance à la discipline de l'utilisateur pour faire l'export.

### Format d'échange — construit et validé le 27/08

**JSON maison, versionné `ironapp/1`.** Export d'un dossier complet depuis l'app, réponse importée avec aperçu puis confirmation, testé avec un fichier réel généré puis réimporté sans écart. Un document de référence complet (`coach-context-ironapp-1.md`) a été produit pour le projet Claude dédié au coaching.

Le fichier porte son propre contrat : `responseContract.instructions` est généré depuis les mêmes énumérés que le schéma de la base, donc jamais en désaccord avec ce que l'import sait réellement lire.

**Chaque élément exporté porte une clé de référence** (`refKey`) que le coach doit reprendre pour modifier ou supprimer cet élément.

### Contenu de l'export

- Profil, objectif, date de course, zones connues (VMA, FTP, CSS, FC max, désormais réellement saisies via l'écran Profil)
- Contraintes : disponibilités, matériel, périodes d'indisponibilité déclarées
- État de charge : forme de fond, fatigue, fraîcheur, ratio aigu/chronique, volumes par discipline sur 6 semaines
- Séances réalisées : sélection par cases à cocher, avec un raccourci « N dernières semaines »
- Séances déjà planifiées, sur une fenêtre de huit semaines
- La spécification du format de réponse attendu, avec numéro de version de schéma

**Rattachement prévu ↔ réalisé — construit en T4.**

### Contenu de l'import

Une liste d'opérations (créer / modifier / supprimer une séance, ou un bloc de périodisation), chacune avec une clé d'idempotence.

**L'import n'écrit jamais en aveugle.** Il valide le schéma, refuse proprement en cas de fichier malformé, puis affiche un aperçu des changements. L'utilisateur confirme ou annule. **Une opération individuellement invalide n'invalide pas tout le fichier.**

### Analyse automatique (sans IA) — livrée en T4

- Écart prévu / réalisé — livré
- Dérive cardiaque — livrée
- Évolution de la charge hebdomadaire — via la courbe de charge de l'accueil
- Alertes : séances manquées et RPE élevé répété — livrées. Hausse de charge trop rapide (`LOAD_RAMP`) — déclarée, pas encore produite.

### L'onglet Coach

Trois blocs, construits et validés le 26–27/08 : **Constat** (lecture seule), **Échange** (sélection, export, import), **Journal des échanges**.

Le bloc « ajustement proposé » envisagé sur la maquette est **définitivement écarté**.

### Extensibilité

Le coach est un module remplaçable. L'ajout ultérieur d'un mode conversationnel avec clé API doit être possible sans réarchitecture.

## 7. Périmètre MVP

### Disciplines

Quatre disciplines de fond : **RUN, BIKE, SWIM, STRENGTH**. Le CrossFit vit dans STRENGTH.

**BRICK est une cinquième discipline, mais côté planification seulement.** Symétriquement, **OTHER n'existe qu'en réalisé**. Depuis le 06/09, un enchaînement RÉALISÉ sans avoir jamais été planifié comme BRICK peut néanmoins être détecté et regroupé après coup (voir point 4, §7) — cette relation ne redéfinit pas `PlannedDiscipline`/`ActualDiscipline`, elle vit à côté du rattachement prévu/réalisé, sans jamais s'y substituer.

### Fonctionnalités

1. **Profil — date de course, disponibilités, zones (VMA, FTP, CSS, FC max), matériel, historique de blessures.** **Livré en T6.1 (31/08), sauf le chrono cible.** Un seul écran en sections (Course, Profil, Disponibilités, Matériel, Blessures, Zones) — décision de Mathieu. Chaque saisie de zone exige une source explicite (test/estimation/manuel), sans défaut. Un journal par zone permet de consulter l'historique complet d'un indicateur et de supprimer un relevé — ajouté en cours de tranche sur retour d'usage. **Le chrono cible reste délibérément hors de cet écran** : son édition et sa décomposition par discipline sont l'écran Objectif, point 2, livré en T6.2. Un lien depuis la carte Course y mène.
2. **Écran Objectif — livré en T6.2 (31/08), validé sur appareil.** Décomposition manuelle du chrono cible en temps alloué par discipline (natation, vélo, course, transitions), confrontée à la dernière valeur connue de VMA/FTP/CSS. **Aucun verdict de faisabilité** : l'écran juxtapose l'allure requise et la référence connue, ne juge jamais si l'objectif tient — même principe que le rejet du bloc « ajustement proposé » du Coach (§6). Le vélo est un cas particulier assumé : la FTP (puissance) et la vitesse requise ne sont pas directement comparables, l'écran le dit en toutes lettres.
3. **Modèle de séance structuré** commun aux 4 disciplines : une séance = une liste de blocs.
4. **Vue par discipline** — livrée le 27/08 (T3.4). Cinq écrans, un par discipline. **L'écran BRICK reste creux tant qu'aucun enchaînement n'a été confirmé** — amendé le 06/09 : un BRICK réalisé spontanément (jamais planifié comme tel) peut désormais être détecté et proposé depuis le bilan de séance ; une fois confirmé, la vue affiche de vraies barres et un vrai journal. Le total toutes disciplines de l'en-tête (« X séances · Y h ») **exclut désormais les séances OTHER** — décision révisée le 06/09 après usage réel, portée limitée à ce total : la charge physiologique d'une séance OTHER continue de compter dans la forme du jour.
5. **Calendrier croisé** — T3.3.b et T3.3.c livrées et validées sur appareil.
6. **Import des séances réalisées** via Health Connect, étendu à la saisie manuelle permanente (une séance ou un lot collé), côté réalisé ET planifié, avec suppression. **Édition d'une séance réalisée existante, livrée le 09/09** (feuille sur le Bilan, mêmes champs que la saisie manuelle, préremplis) — éditer une valeur mesurée bascule son assise en « saisie », de façon permanente.
7. **Saisie du RPE** et commentaire libre après séance. Livré en T4, chaque saisie relance le calcul de charge jusqu'à la courbe de l'accueil.
8. **Écran bilan de séance** — prévu vs réalisé, analyse automatique. Livré en T4, validé sur appareil.
9. **Export / import coach** — livré et validé le 26–27/08.
10. **Mode interruption** — déclaration d'une période d'indisponibilité, charge forfaitaire optionnelle. **T6.3, techniquement complète (31/08), en attente de validation sur appareil.** « Replanification autour » interprétée au sens le plus étroit : aucune séance planifiée n'est touchée (cohérent avec le hors-périmètre ci-dessous), interprétation non recontrôlée avec Mathieu.
11. **Notifications locales** — rappel de séance, plan à échéance, plan échu (relance hebdomadaire), suspension pendant une interruption. **T6.4, construite le 01/09.** Module natif confirmé sur appareil (permission acceptée) ; les quatre comportements eux-mêmes restent à observer dans les jours qui viennent, par nature (dates futures).
12. **Paramètres** — thème clair/sombre, connexion Health Connect, export/suppression des données. **T6.5, livré et validé sur appareil le 06/09.** Langue : hors périmètre (v1 mono-langue, §8). Restauration (import) : hors périmètre — seuls export et suppression étaient demandés. Entrée depuis l'Accueil uniquement, décision de Mathieu.
13. **Périodisation** — la préparation se découpe en blocs datés. Mécanisme construit et testé en T5. **Écran dédié livré le 09/09** (`PeriodizationScreen.tsx`) — remplace un ancien `PhasesScreen.tsx` qui n'avait jamais été raccroché au système de route de l'app (ouvert par un `Modal` codé en dur dans `CalendarScreen.tsx`). Liste des blocs passés/courant/à venir/course, plus la création et l'édition d'un bloc — cette dernière partie conservée sans confirmation explicite de Mathieu, la capture fournie ne montrant que l'état liste.

### Écran d'accueil

Hiérarchie validée, de haut en bas :

1. Compte à rebours avant la course
2. **Point d'entrée vers le Profil** — ajouté en T6.1, restylé en carte pressable (icône, libellé, chevron) après un premier jet en texte souligné jugé trop discret par Mathieu. Renommé « Profil » (T6.2) : l'Objectif est désormais un écran séparé, atteint depuis la carte Course du Profil.
3. Forme du jour (indicateur unique, gros)
4. Séance du jour, actionnable → ouvre son détail
5. Semaine en pastilles (7 jours, discipline, fait/à faire) → ouvre la vue jour du calendrier
6. Courbe de charge sur 4 semaines
7. Dernière séance avec son verdict → ouvre le bilan
8. Barre de navigation : accueil, calendrier, coach, statistiques

Principe : le matin, l'utilisateur veut deux réponses — *suis-je frais ?* et *je fais quoi ?* Le reste est du défilement.

## 8. Hors périmètre

Explicitement écarté de la v1, à ne pas construire :

- Réseau social façon Strava
- Multi-utilisateur et tout ce qui l'accompagne
- iOS
- Export automatique vers la montre
- Génération de fichiers `.FIT`
- Anglais (structure prête, traduction reportée)
- Coach conversationnel embarqué
- Nutrition, hydratation, plan de pacing du jour J

## 9. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| Health Connect trop pauvre depuis Garmin | Critique | **Levé** — sonde T0, GO NOMINAL |
| Ingestion interrompue sans signal visible | Critique | **Levé le 27/08** |
| Format d'échange coach fragile | Élevé | **Largement traité** |
| Rattachement automatique absent | Élevé | **Levé, validé sur appareil le 30/08** |
| Historique antérieur à Health Connect perdu | Moyen | **Traité le 29–30/08** |
| Abandon de l'aller-retour manuel par lassitude | Moyen | Rappel construit (T6.4, 01/09) — déclenchement effectif à confirmer sur les prochains jours |
| Objectif 5h45 irréaliste | Faible | **Outil livré (T6.2, 31/08)** : décomposition et confrontation visibles, mais aucun verdict automatique — la décision de réviser reste chez Mathieu |
| Indisponibilité du développeur | Moyen | Découpage en tranches livrables courtes |
| Oubli d'ouvrir l'app plus de sept jours d'affilée | Critique | **Actif, non traité — seul risque irréversible du projet.** |
| Zones physiologiques jamais saisies faute d'écran | Moyen | **Levé le 31/08** — écran Profil livré, source obligatoire à chaque saisie |
| `db/bootstrap.ts` en dur, coexistant avec les écrans réels | Faible | **Levé le 31/08 (T6.3)** — Profil et Objectif couvrent tout ce qu'il amorçait, le fichier peut être supprimé du projet |
| Icône de l'application non conforme au visuel livré | Faible | **Reconçue le 09/09** à partir de deux SVG fournis par Mathieu (le pictogramme BRICK généré le 06/09 est abandonné) — `app.json` reconfiguré. **Build EAS et vérification sur appareil restants** : seul point technique de la dernière conversation du projet. |

## 10. Décisions ouvertes

- Que fait l'app si aucun plan n'est importé depuis 3 semaines ? *(T6.4, notifications)*
- Le rattachement automatique doit-il pouvoir se relancer à la demande sur une fenêtre large ? Pas construit, pas demandé à ce jour.
- **T6.3, non recontrôlé avec Mathieu** : « replanification autour » (point 10, §7) a été interprétée par Claude au sens le plus étroit — aucune séance touchée. À confirmer si un besoin concret s'en écarte.
- **Forme de la mise en avant du bilan global de Statistiques** — Mathieu la veut plus visible qu'une simple ligne sous le titre (ajoutée en urgence le 09/09) ; portée non précisée (carte dédiée, bandeau, écran séparé). À cadrer en ouverture de la dernière conversation.
- **L'édition de blocs de Périodisation doit-elle vraiment exister ?** Conservée le 09/09 par prudence (une fonctionnalité réelle ne devrait pas disparaître sur la seule foi d'une capture qui montre un autre état), jamais confirmée explicitement.
- **Convention de conversion `% cible relative → allure/puissance/FC`** (`PlannedSessionEditorScreen.tsx`, 09/09) : `X %` toujours lu comme `X %` de la vitesse/puissance/FC, jamais du temps — posée sans précédent dans le code à vérifier. À valider sur l'appareil.

**Tranchées depuis la v1.3 (09/09) :**
- **Refonte visuelle quasi intégrale**, sur la maquette Claude Design et `HANDOFF.md` — détail exhaustif dans ETAT.md et SPECS-TECH §24.
- **Écran de premier lancement écarté** après réflexion de Mathieu.
- **Détail d'un bloc pour une séance réalisée jugé sans objet** — une séance réalisée n'a pas de structure de blocs, contrairement à une séance planifiée.
- **Icône reconçue** à partir de deux SVG fournis par Mathieu, le pictogramme BRICK du 06/09 abandonné.
- **`LoadChart.tsx` (courbe de charge) reçoit des couleurs** sur demande explicite de Mathieu — deuxième exception assumée au principe « la couleur est un budget » (SPECS-TECH §15), après Statistiques.
- **Le mécanisme de suppression des données (Paramètres) change de nature** : un flux inline en deux étapes remplace les deux `Alert` du 06/09.

**Tranchées depuis la v1.2 (06/09) :**
- **OTHER exclu du total de Statistiques**, portée limitée à `loadStatsOverview` — la charge physiologique d'une séance OTHER continue de compter dans la forme du jour ailleurs dans l'app.
- **BRICK spontané : détection et proposition depuis le bilan de séance**, jamais automatique à la synchronisation — l'app pose la question, ne décide jamais seule. Stocké dans une relation indépendante de tout rattachement individuel (les deux coexistent sans s'exclure).
- **T6.5 livré sans réglage de langue** — un sélecteur à une seule option n'aurait rien fait, l'anglais reste hors périmètre (§8).
- **Entrée Paramètres sur l'Accueil uniquement** — pas sur Statistiques, décision explicite de Mathieu après une première implémentation sur le mauvais écran.

**Tranchées depuis la v1.0 (31/08, T6.3) :**
- **Non-chevauchement strict entre interruptions** — confirmé nécessaire, pas seulement prudent, à réception de `metrics/dailyLoad.ts` : deux interruptions chevauchantes avec charge forfaitaire résoudraient sinon de façon arbitraire.
- **Charge forfaitaire lue directement depuis `interruption`** par le calcul de charge, jamais via `manual_override` (correction d'une hypothèse initiale non vérifiée).
- **`db/bootstrap.ts` retiré** — Profil et Objectif couvrent tout ce qu'il amorçait.
- **Bandeau calendrier minimal** : texte seul si une interruption couvre le jour, aucune marque sur les pastilles (composants non reçus).

**Tranchées depuis la v0.9 (31/08, T6.2) :**
- **Allocation manuelle**, jamais un pourcentage type — un gabarit de répartition aurait inventé une règle non demandée.
- **Le chrono cible s'édite sur l'écran Objectif**, pas sur le Profil — les deux ont besoin d'être visibles ensemble pour juger la cohérence de la décomposition.
- **Aucun verdict de faisabilité** : juxtaposition seulement, même principe que le rejet du bloc « ajustement proposé » du Coach.
- **`target_revised_at` se met à jour automatiquement** si et seulement si `target_total_seconds` change de valeur — pas à chaque sauvegarde de la décomposition seule, pas via une case à cocher séparée.

**Tranchées depuis la v0.8 (31/08, T6.1) :**
- **Écran unique en sections** pour Profil, Course, Disponibilités, Matériel, Blessures et Zones — pas d'écrans séparés.
- **Source obligatoire, sans défaut**, à chaque saisie de zone (test/estimation/manuel) — un chiffre sans méthode explicite ne serait qu'une estimation déguisée.
- **Structures JSON de `availability`/`equipment`/`injuries`** fixées par Claude faute de spécification préalable : `Weekday[]`, `string[]`, `InjuryEntry[]`. Non contestées à l'usage à ce jour.
- **Chrono cible non édité en T6.1** : réservé à T6.2, qui en a directement besoin pour la décomposition par discipline.
- **Journal par zone** (consultation de l'historique complet, suppression d'un relevé) ajouté en cours de tranche, sur retour d'usage — la table `zone` étant historisée, corriger une estimation mal saisie exigeait de voir et de cibler une ligne précise.

**Tranchées depuis la v0.7 (29–30/08) :**
- Emplacement de la carte d'alertes de période sur l'accueil.
- Rattrapage d'un historique antérieur à Health Connect : saisie manuelle permanente.
- Suppression d'une séance réalisée : ajoutée, accessible depuis son écran de bilan.

**Tranchées depuis la v0.6 (28/08, T4) :** Rattachement automatique vs heuristique du Coach — les deux coexistent. Forme de l'écran de bilan — les deux logiques de verdict (écart au plan, rapport aux habitudes) sont conservées, rangées explicitement.

**Tranchées depuis la v0.5 (26–27/08) :** Format d'échange Coach — JSON maison versionné `ironapp/1`. Portée du mécanisme d'export — un seul fichier. Saisie des indicateurs de performance — attendra l'écran Profil (**livré en T6.1**).

**Tranchées depuis la v0.4 (25/08, maquettes Claude Design) :** l'écran BRICK est confirmé CREUX. Le bloc « ajustement proposé » est écarté.

**Tranchées depuis la v0.3 (25/08) :** la vue MOIS du calendrier croisé est retirée. La duplication d'une séance planifiée écrit directement.

**Tranchées depuis la v0.2 :** la périodisation entre au périmètre. La saisie des blocs vit derrière l'en-tête du calendrier.

**Tranchées depuis la v0.1 :** fréquence coach hebdomadaire plus à la demande ; stockage SQLite via `expo-sqlite` et Drizzle ; système de design livré le 23/08 dans `tokens.ts`.

## 11. Ce qui est modifiable plus tard, et à quel prix

| Sujet | Coût |
|---|---|
| Couleurs, polices, fonds, espacements | **Faible.** Rien n'est en dur : tout passe par `tokens.ts`. |
| Rampe de forme et statut des données | **Décision, pas réglage.** |
| Vocabulaire de blocs | **Élevé après T5.** Les membres sont gelés, le format d'export en dépend. |
| Toute modification, une fois l'APK installé | Reconstruction et réinstallation. |
| Périodisation en deux échelles (phase + bloc) | **Faible tant que T5 n'est pas livrée** — mais T5 est livrée, donc à traiter avec prudence désormais. |
| Structures JSON `availability`/`equipment`/`injuries` (T6.1) | **Faible tant qu'aucun format d'échange (coach, export) ne les porte encore.** À traiter avec la prudence du vocabulaire de blocs le jour où le Coach s'en saisira. |


---

# PARTIE C — SPECS-TECH v1.4 (ancienne application, 09/09/2026, avec §25 « Iron App 2 » du 12/10)

# SPECS-TECH — Iron App

**Version** 1.4
**Date** 9 septembre 2026
**Statut** Cadrage technique. Décisions verrouillées sauf mention contraire. **Refonte visuelle quasi intégrale menée le 09/09 — voir §24.** La prochaine conversation doit être la DERNIÈRE du projet, bornée à trois points non techniques pour l'essentiel (voir ETAT.md, message de lancement).
**Référence** PRD.md v1.4
**Fondé sur** rapport de sonde Health Connect du 21 août 2026 — verdict GO NOMINAL

> **v1.4 — ce qui change.** Refonte visuelle de la quasi-totalité des
> écrans en une seule conversation — nouveau §24. Deux écrans neufs
> (Health Connect · état refusé, Périodisation), une feuille neuve
> (Édition d'une séance réalisée). `health/manualEntry.ts` gagne
> `updateActualSession` — un vrai `UPDATE`, jamais un supprimer-puis-
> recréer, pour ne pas perdre le RPE ni le rattachement d'une séance
> éditée. `planning/plannedSessions.ts::estimateDuration`/
> `estimateDistance` dérivent désormais l'une de l'autre à partir d'une
> cible de rythme absolue. **Découverte notable** : l'ancien
> `screens/PhasesScreen.tsx` n'a jamais été raccroché au système de route
> (`navigation/routes.ts`) — il était ouvert par un `Modal` local codé en
> dur dans `CalendarScreen.tsx`, un mode d'ouverture jamais documenté ici
> ni dans ETAT.md. `Pastille.discipline` (composant reçu cette session)
> attend le jeton FRANÇAIS, jamais la discipline anglaise du domaine sans
> passer par `disciplineToken()` — un oubli a fait planter deux écrans au
> premier essai, voir §15 et §24. `tsc --noEmit`, disponible dans
> l'environnement d'exécution de Claude, est adopté comme méthode
> standard de contrôle de syntaxe (§15) : un comptage d'accolades naïf
> peut rater une vraie erreur de structure si le total global reste juste
> par coïncidence, ce qui s'est produit une fois cette session.
>
> **v1.3 — pour mémoire.** Quatre retours d'usage réel traités (§13,
> §16, nouveau §22) et T6.5 construit (nouveau §23). `db/schema.ts` gagne
> une dix-neuvième table, `brick_pair` (migration `0005`) — voir §3 et
> §16. Elle est délibérément INDÉPENDANTE de `session_link`, après qu'un
> premier essai la réutilisant a été cassé par un test réel sur appareil
> (deux séances déjà individuellement rattachées à un prévu correct —
> `session_link` n'autorise qu'un rattachement par réalisé). `metrics/
> disciplineStats.ts::loadBrickStats` lit `brick_pair` plutôt que
> `session_link` × `planned_session`. `athlete.themePreference`,
> déclarée depuis `0000` et jamais utilisée, est enfin alimentée par
> Paramètres (§23) — aucune nouvelle table pour ça. Un piège d'API
> documenté (§15) : `expo-file-system`, nouvelle classe `File`, exige une
> URI absolue (`file://…`) — `SQLite.defaultDatabaseDirectory` rend un
> chemin brut, sans schéma.
>
> **v1.2 — pour mémoire.** T6.4 (notifications locales) construite —
> nouveau §21. `expo-notifications` intégré comme prévu : aller-retour EAS
> nécessaire (`eas build --profile development`), un ajustement de forme
> trouvé par `tsc --noEmit` sur `NotificationBehavior` (`shouldShowAlert`
> remplacé par `shouldShowBanner`/`shouldShowList` dans la version
> installée — corrigé). Sur appareil : permission demandée et accordée,
> confirmant que le module natif fonctionne. **Les quatre comportements
> programmés (rappel de séance, plan à échéance, plan échu, suspension par
> interruption) restent à observer** — ce sont des notifications
> programmées pour des dates futures, la nature du sujet interdit une
> confirmation immédiate. **Rappel** : T6.3 n'a jamais reçu de confirmation
> explicite de Mathieu, reste documentée comme non close.
>
> **v1.1 — pour mémoire.** T6.3 (interruptions) techniquement complète à réception de `metrics/dailyLoad.ts`, `metrics/pipeline.ts`,
> `metrics/banister.ts`, `screens/CalendarScreen.tsx` et `db/bootstrap.ts`.
> **Correction importante** (§20) : la charge forfaitaire d'une
> interruption ne passe PAS par `manual_override` comme la version
> précédente de cette section le supposait sans avoir vu le fichier
> concerné — `dailyLoad.ts::rebuildDailyLoad` la lit directement depuis
> `interruption`. Le non-chevauchement strict, choisi par prudence avant
> cette confirmation, s'avère nécessaire pour une raison différente de
> celle imaginée (résolution arbitraire d'un chevauchement par `.find()`).
> `db/bootstrap.ts` est retiré (§3, §20) : Profil et Objectif couvrent
> tout ce qu'il amorçait. `screens/CalendarScreen.tsx` affiche un bandeau
> minimal si une interruption couvre le jour courant. **Non close** :
> attend le test sur appareil de Mathieu.
>
> **v1.0 — pour mémoire.** T6.2 validée sur appareil sans réserve. Nouveau
> §19 : écran Objectif — décomposition manuelle du chrono cible
> (`race.target_swim_seconds`/`target_bike_seconds`/`target_run_seconds`/
> `target_transition_seconds`, migration `0004`), confrontation à
> `readReference` (`metrics/disciplineStats.ts`, désormais exportée),
> aucun verdict de faisabilité. `planning/profile.ts::saveRaceProfile` ne
> touche plus le chrono cible du tout ; `saveRaceTarget`, nouvelle, est
> seule à écrire `target*` et gère seule la révision automatique de
> `target_revised_at`. §3 : la table `race` et la section Migrations
> reflètent `0004`. §10 : T6.2 passe à ✅ Fait. §11 : la question de
> formule de décomposition est retirée, tranchée.
>
> **v0.9 — pour mémoire.** T6.1 validée sur appareil sans réserve. Nouveau
> §18 : écran Profil — vocabulaire `ZONE_KINDS`/`ZONE_SOURCES` posé dans
> `db/schema.ts` (aucune migration, les colonnes existent depuis `0000`),
> conversion `referenceNumeric`/`referenceSiFromDisplay`/`zoneUnit`
> consolidée dans `metrics/disciplineStats.ts` (fermeture de la dette
> signalée en T3.4), structures JSON de `athlete.availability`/
> `.equipment`/`.injuries` fixées, source obligatoire à chaque saisie de
> zone, journal par zone ajouté en cours de tranche. Le §15 reçoit deux
> règles issues d'erreurs `tsc` réelles : une assertion `as Record<...>` ne
> se coupe jamais sur plusieurs lignes, et `noUncheckedIndexedAccess`
> exige de capturer `rows[0]` dans une variable avant toute branche
> `if (rows.length === 0) / else`. §10 : T6.1 passe à ✅ Fait.
>
> **v0.8 — pour mémoire.** T4 validée sur appareil sans réserve. Nouveau
> §17 ter (import groupé de séances planifiées) et §17 quater (suppression
> d'une séance réalisée). §10 : T6 scindée en cinq sous-tranches.
>
> **v0.7 — pour mémoire.** Trois retours d'usage sur T4. §16 complété — la
> vue JOUR ET la vue SEMAINE du calendrier affichent le rattachement réel.
> Nouveau §17 bis : saisie manuelle d'une séance réalisée.
>
> **v0.6 — pour mémoire.** T4 construite : §7 note que l'heuristique de
> rattachement coexiste désormais avec un rattachement réel (§16). Nouveaux
> §16 (rattachement automatique) et §17 (bilan de séance et alertes).
>
> **v0.5 — pour mémoire.** Le §7 réécrit : l'échange coach est un format
> construit et testé (`ironapp/1`). Le §15 reçoit six règles issues de
> T3.3.c, T3.4 et T5.
>
> **v0.4 — pour mémoire.** Quatre règles issues de la validation sur appareil
> de T3.3.b.
>
> **v0.3 — pour mémoire.** Ajout du §14 (périodisation) et du §15 (règles
> d'interface de T3.2). Le §12 amendé sur les filtres de discipline.
---

## 1. Décisions verrouillées

| Sujet | Décision | Origine |
|---|---|---|
| Plateforme | Android uniquement | PRD §3, reconfirmé le 22/08 |
| Stack | TypeScript, React Native, Expo | PRD §3 |
| Stockage | SQLite via `expo-sqlite` + Drizzle ORM | Cadrage 22/08 |
| Fabrication | EAS Build, plan gratuit, sortie APK | Cadrage 22/08 |
| Backend | Aucun. 100 % local. | PRD §3 |
| Acquisition | Health Connect, `react-native-health-connect` v4+ | Sonde validée |
| Fréquence coach | Hebdomadaire, plus à la demande. Format d'export unique. | Cadrage 22/08, format livré le 27/08 |
| Fractionné v1 | Comparaison sur totaux. Séries brutes stockées. | Cadrage 22/08 |
| Design system | Reporté, construit dans Claude Design | Cadrage 22/08 |
| Échange coach | JSON maison versionné `ironapp/1` | Tranché le 25/08, livré le 27/08 |
| Écran Profil | Écran unique en sections ; source obligatoire à chaque saisie de zone | Tranché le 31/08, livré le 31/08 |
| Écran Objectif | Décomposition manuelle (pas de %) ; édité sur l'écran Objectif, pas sur le Profil ; aucun verdict de faisabilité | Tranché le 31/08, livré le 31/08 |

## 2. Résultats de sonde — ce sur quoi on peut compter

Mesuré le 21 août 2026, Android API 36, Fenix 7S Pro Sapphire Solar, source `com.garmin.android.apps.connectmobile`.

### Disponible et fiable

| Donnée | Granularité constatée |
|---|---|
| Séance d'exercice | Type, début, fin, fuseau horaire |
| Fréquence cardiaque | 1 point / 11 s, couverture 100 % — course, natation et renforcement |
| Vitesse | 1 point / 11 s, rattachée à la séance |
| Distance | Un total par séance (6810 m sur la course témoin) |
| Calories actives et totales | Un total par séance |
| Dénivelé | ~100 points par séance |
| Sommeil | Phases horodatées, 22 segments sur la nuit témoin |
| FC de repos | Une valeur par jour |
| Pas, étages | Séries continues |

### Absent — à ne pas attendre

Variabilité cardiaque, poids, VO2max, trace GPS (`exerciseRoute` renvoie `NO_DATA`), titre et notes de séance, **structure de fractionné** (`segments: []`, `laps: []` sur toutes les séances).

Puissance vélo : **statut inconnu**, aucun vélo au moment de la sonde. À resonder en octobre 2026 avec le même outil.

Body Battery, Training Load, Training Readiness : confirmés absents. Le PRD §5 est validé sur ce point.

### Contraintes de la source

**Historique limité à 7 jours.** Aucun rattrapage possible, y compris avec `READ_HEALTH_DATA_HISTORY`. Ce qui n'est pas collecté est définitivement perdu. Conséquence directe sur le découpage en tranches, section 10.

**Pagination obligatoire.** `readRecords` plafonne à 1000 enregistrements par appel. Une lecture non paginée perd des données en silence. Toute lecture de série doit boucler sur `pageToken`.

**Clé de jointure : `metadata.clientRecordId`.** C'est l'identifiant d'activité Garmin. Il est identique sur la séance et sur toutes ses séries dérivées. Les enregistrements de FC intra-séance le portent en préfixe, suffixé d'un horodatage. Sert à la fois de clé de rattachement et de clé d'idempotence.

**Fuseaux horaires fournis** (`startZoneOffset`) et à stocker tels quels. Ne jamais recalculer — l'installation près de Munich changera le fuseau en cours de saison.

**Unités.** L'API rend des mètres et des mètres par seconde quelles que soient les préférences d'affichage du téléphone. Conversion systématique depuis le SI, jamais depuis l'écran.

**Le client doit être initialisé avant toute lecture — et personne ne le fait à sa place.** Constaté le 27/08 : `health/client.ts` expose `ensureInitialized()`, idempotente, pensée pour ça — mais rien dans le cycle d'ingestion (`health/ingest.ts`) ne l'appelait, en s'appuyant implicitement sur le fait qu'un autre écran de la session l'aurait déjà fait. `runIngestion` s'assure désormais lui-même de la disponibilité du client avant de tenter quoi que ce soit — voir §15.

## 3. Stockage

### Choix

`expo-sqlite` + Drizzle ORM. Schéma déclaré en TypeScript, migrations générées par `drizzle-kit`, appliquées au démarrage avant tout rendu.

Deux contraintes de mise en œuvre connues : Metro ne charge pas les fichiers `.sql` sans configuration explicite, et l'app doit bloquer son rendu tant que les migrations ne sont pas passées.

### Séries brutes : blob, pas lignes

Les séries de FC et de vitesse ne sont jamais interrogées transversalement — toujours dans le cadre d'une séance. Elles sont donc stockées **en JSON compact sur la ligne de séance**, pas en une ligne par point.

Volume : environ 500 points par séance, ~5 Ko. À 10 séances par semaine, moins de 3 Mo par an. Le stockage n'est pas un sujet.

Les agrégats dérivés (TRIMP, FC moyenne, dérive) sont en colonnes réelles, calculés une fois à l'ingestion.

### `notes` comme foyer de détail structuré — précédent posé le 27/08

`coach_exchange.notes` est du texte libre depuis l'origine. Le journal des échanges y stocke désormais un JSON structuré plutôt qu'une phrase précalculée, sans migration. **Précédent à connaître** avant d'ajouter une nouvelle colonne « pour stocker un peu plus de détail » ailleurs dans le schéma.

**Même précédent réutilisé en T6.1** : `athlete.availability`, `.equipment`, `.injuries` sont des colonnes texte libres depuis l'origine, jamais spécifiées. `planning/profile.ts` y stocke désormais du JSON structuré (`Weekday[]`, `string[]`, `InjuryEntry[]`) — structure fixée par Claude faute de spécification antérieure, voir §18.

### Tables

| Table | Rôle | Points clés |
|---|---|---|
| `schema_meta` | Version du schéma | Une ligne |
| `athlete` | Profil, disponibilités, matériel, blessures | Une ligne. **Alimentée par l'écran Profil depuis le 31/08 (T6.1)**, voir §18. Structure JSON de `availability`/`equipment`/`injuries` fixée dans `planning/profile.ts`. `theme_preference` (déclarée depuis `0000`) **alimentée pour la première fois le 06/09 par Paramètres** — voir §23 ; aucune table dédiée n'a été créée, cette colonne mono-ligne faisait exactement double emploi avec ce qu'une nouvelle table aurait porté. |
| `race` | Course cible et objectif chrono | Objectif traité comme hypothèse révisable (PRD §2). Nom/date/distances alimentés par l'écran Profil depuis T6.1 ; `target_total_seconds` et sa décomposition (`target_swim_seconds`/`target_bike_seconds`/`target_run_seconds`/`target_transition_seconds`, migration `0004`) édités par l'écran Objectif depuis T6.2, voir §19. Le Profil ne touche jamais ces cinq colonnes. |
| `zone` | VMA, FTP, CSS, FC max | Historisées : `value`, `measured_at`, `source` (test / estimation / manuel). **Alimentée pour la première fois le 31/08 (T6.1)** — jamais utilisée jusque-là. Vocabulaire `ZONE_KINDS`/`ZONE_SOURCES` posé dans `schema.ts`, voir §18. |
| `planned_session` | Séance programmée | Discipline, date, origine (coach / manuelle), `idempotency_key`, `coach_exchange_id` |
| `planned_block` | Blocs d'une séance planifiée | **Refondue le 23/08. Spécifiée au §12.** |
| `actual_session` | Séance réalisée | `garmin_activity_id` **UNIQUE**, séries brutes, agrégats |
| `session_link` | Rattachement prévu ↔ réalisé | Les deux côtés nullables. Alimentée depuis T4 par `planning/sessionLinks.ts` — voir §16. |
| `brick_pair` | Regroupement BRICK spontané | **Nouvelle le 06/09 (migration `0005`).** Deux `*_actual_session_id`, un `day`, un `status` (`confirmed`/`declined`). INDÉPENDANTE de `session_link` — voir §16 et §22. |
| `feedback` | RPE et commentaire libre | Saisi par l'utilisateur. Écran de saisie livré en T4. |
| `sleep_night` | Nuit et phases | |
| `resting_hr` | FC de repos quotidienne | |
| `daily_load` | Charge, forme de fond, fatigue, fraîcheur | Dérivé, entièrement recalculable. **Cache pur** (commentaire du schéma : « aucune donnée saisie par l'utilisateur ne vit ici »). Reconstruit en entier à chaque appel de `rebuildDailyLoad` (`metrics/dailyLoad.ts`) — jamais d'incrément. |
| `manual_override` | Valeur saisie écrasant un calcul | Table, clé, date, valeur. **La saisie fait foi** (PRD §5). Consultée par `readDailyLoadRange` (`metrics/dailyLoad.ts`) — correctif manuel générique appliqué en LECTURE sur `daily_load` déjà calculée. **N'est PAS le mécanisme de la charge forfaitaire d'interruption**, corrigé le 31/08 après une hypothèse initiale erronée — voir §20. |
| `interruption` | Période d'indisponibilité | Peut porter une charge forfaitaire (cas GR20), lue DIRECTEMENT par `rebuildDailyLoad` (`metrics/dailyLoad.ts`) pour combler un jour à charge nulle — jamais via `manual_override`. **Alimentée pour la première fois le 31/08 (T6.3)** — voir §20. |
| `coach_exchange` | Journal des exports et imports | `direction`, `exchange_schema_version`, `status`, `operation_count`, `plan_valid_until`, `payload_hash`, `notes` |
| `sync_state` | Point de synchronisation Health Connect | `synced_until` n'avance qu'en l'absence totale d'erreur — voir §15 |

`session_link` est une table à part et non une colonne : une séance peut être réalisée sans avoir été prévue, prévue sans être réalisée, et une séance brick concerne deux disciplines.

`daily_load` est un cache. Sa reconstruction complète depuis les séances doit rester possible à tout instant — c'est le filet en cas de changement de formule.

**`planned_session.idempotency_key` et `training_phase.idempotency_key` restent `NULL` pour tout élément saisi à la main.**

### Migrations

Migrations versionnées dès la première livraison, y compris la création initiale. Aucune migration ne supprime ni ne réécrit de donnée utilisateur sans conversion explicite. Test obligatoire avant livraison : appliquer la migration sur une base contenant des données de la version précédente.

**Désignation par nom de fichier.** Drizzle numérote à partir de zéro, ce document comptait à partir de un. Les migrations sont donc désignées par leur nom complet — `0002_steep_sway.sql` — et jamais par un numéro seul.

**Relecture obligatoire du SQL généré.** Ajouté le 23/08 après un incident réel. SQLite ne sachant pas modifier une colonne par `ALTER`, toute refonte passe par table temporaire, recopie et `DROP`. Aucune migration ne s'exécute sans avoir été relue.

**`0004` — décomposition du chrono cible (T6.2, 31/08).** Quatre colonnes nullable ajoutées sur `race` (`target_swim_seconds`, `target_bike_seconds`, `target_run_seconds`, `target_transition_seconds`). Simple ajout de colonnes, pas de refonte de table. **Nom de fichier exact non confirmé** : généré par Mathieu via `drizzle-kit generate` à partir du `schema.ts` livré, je n'ai pas accès à son dossier `drizzle/` pour le connaître — le tableau de la section suivante porte un nom provisoire (`0004_race_target_breakdown.sql`) en attendant.

**Migrations `0000` à `0003` : aucune nouvelle depuis, jusqu'à T6.2.** T3.3.b à T6.1 ont tous opéré sur le schéma existant. `coach_exchange`, `idempotency_key`, `coach_exchange_id`, `session_link` et `zone` étaient tous déclarés depuis la création initiale, chacun alimenté seulement des tranches plus tard (`session_link`/`feedback` en T4, `zone` en T6.1). **Confirmation d'un principe déjà noté** : le schéma peut porter des colonnes en avance de plusieurs mois sur les écrans qui les remplissent, sans jamais nécessiter de migration pour les activer — seule leur LECTURE ET ÉCRITURE côté code manquait. `interruption`, déclarée depuis `0000` et alimentée pour la première fois en T6.3, en est un nouvel exemple — voir §20. `manual_override`, elle, était DÉJÀ consultée avant T6.3 (`metrics/dailyLoad.ts::readDailyLoadRange`), contrairement à l'hypothèse initialement formée sans avoir vu ce fichier.

## 4. Acquisition

### Permissions

Demandées en deux vagues, principales puis optionnelles, pour qu'un refus isolé ne bloque pas l'ensemble. Les 21 permissions du profil de sonde ont été accordées sans difficulté.

### Cycle d'ingestion

1. **S'assurer que le client Health Connect est initialisé** (`ensureInitialized`, ajouté le 27/08 — voir §2 et §15). Si indisponible, la collecte n'est pas tentée et l'échec est journalisé une seule fois, pas trois.
2. Lecture des séances depuis le dernier point de synchronisation connu
3. Pour chaque séance : rejet si `garmin_activity_id` déjà en base
4. Lecture paginée des séries sur la fenêtre de la séance
5. Calcul et stockage des agrégats
6. Stockage de la série brute en JSON compact
7. Mise à jour du point de synchronisation

Déclenchement à l'ouverture de l'app, plus une action manuelle. Pas de tâche de fond en v1.

**« À l'ouverture de l'app » suppose que l'appelant transmette fidèlement son intention.** Un bug corrigé le 27/08 dans `HomeScreen.tsx` : le paramètre distinguant « avec collecte » de « lecture seule » était perdu en route vers `runMorningSync`, qui retombait toujours sur son défaut.

### Règle de tolérance

Une séance dont la série de FC est absente ou trop clairsemée est ingérée quand même, avec sa charge marquée comme estimée par sRPE. L'app affiche toujours **quelle méthode a produit chaque valeur**.

## 5. Métriques

| Métrique | Méthode | Source |
|---|---|---|
| Charge par séance | TRIMP sur la série de FC | Sonde : 11 s d'intervalle, suffisant |
| Charge de repli | sRPE de Foster — RPE × durée | Si série absente |
| Forme de fond, fatigue, fraîcheur | Banister, impulsion-réponse | Sur `daily_load` |
| Forme du jour | Composite : sommeil, FC de repos, fraîcheur, RPE de la veille | PRD §5, inchangé |
| Ratio aigu / chronique | Charge des 7 derniers jours ÷ moyenne hebdomadaire des 4 dernières semaines | Ajouté en T5, explicitement estimée |
| Dérive cardiaque | Comparaison premier / second demi-temps | Sur série brute |

Chaque valeur affichée porte sa méthode et peut être écrasée par une saisie manuelle.

**Les zones sont désormais saisissables (T6.1)**, chacune avec sa source explicite. Tant qu'aucun test n'est enregistré pour un type donné, l'app continue de calculer avec des estimations explicitement marquées comme telles et n'affiche aucune allure cible présentée comme fiable.

## 6. Comparaison prévu / réalisé

**V1 : sur les totaux.** Durée, distance, FC moyenne, charge. La structure de fractionné ne traverse pas Health Connect.

**Préparation de la suite.** Trois éléments stockés dès la première tranche rendent l'alignement par bloc possible plus tard sans perte : la série brute horodatée, la structure planifiée en blocs, et leur rattachement via `session_link`.

**Hors périmètre MVP, signalé** : l'export des séries brutes vers le coach. Réservé à la v2 du schéma d'échange.

## 7. Échange coach — construit et livré le 27/08

Format unique `ironapp/1`, quelle que soit la fréquence. Deux fichiers, deux directions : le **dossier-athlète** (export) et le **plan** (import). Implémentés dans `planning/coachExport.ts` et `planning/coachImport.ts`.

### Le dossier-athlète

Contenu conforme au PRD §6 : profil, course, zones (dernière valeur connue par type — **désormais réellement alimentée par l'écran Profil, T6.1**), blocs de périodisation, constat de charge, séances planifiées à venir, et les séances réalisées sélectionnées par l'utilisateur.

**Le fichier porte son propre contrat.** `responseContract.instructions` est un texte généré à l'exécution depuis les mêmes énumérés que `schema.ts`.

**Clé de référence (`refKey`).** Chaque séance planifiée et chaque bloc de périodisation exportés portent une clé que le coach doit reprendre pour les modifier ou les supprimer.

**Rattachement prévu ↔ réalisé.** Chaque séance réalisée porte un `matchedPlanned` optionnel avec un `matchConfidence`.

### Le plan

Une liste d'opérations, chacune `{ entity: 'session'|'phase', action: 'create'|'update'|'delete', idempotencyKey, ... }`.

**Deux niveaux de refus.** Un fichier structurellement invalide est refusé EN BLOC. Une opération individuellement invalide n'invalide pas le reste.

**Résolution de référence.** `resolveSessionId`/`resolvePhaseId` cherchent d'abord une correspondance exacte sur `idempotency_key`.

**Aperçu puis application, strictement séparés.**

**Limite connue et documentée** : le non-chevauchement de deux blocs de périodisation est vérifié contre l'état ACTUEL de la base, une fois, avant toute écriture.

### Le journal

`coach_exchange.notes` porte le détail complet en JSON — voir §3.

**Empreinte de fichier.** `payload_hash` (FNV-1a 32 bits) identifie un fichier rejoué par erreur. Calculé, stocké, pas encore exploité par une alerte.

### Ce que ce format prépare pour plus tard

`session_link`, la série brute horodatée et la structure planifiée en blocs restent le socle de l'alignement fin promis au §6 pour une v2 du format.

## 8. Notifications

Locales, sans serveur. Seuils validés le 22 août :

- Rappel de séance du jour
- Plan courant à échéance : notification 3 jours avant
- Plan échu depuis 7 jours sans import : première relance
- Puis relance hebdomadaire, ton neutre, sans culpabilisation
- **Une interruption déclarée suspend toutes ces relances**

Aucune replanification automatique. Aucune séance générée par l'app.

## 9. Thème et langue

Aucune couleur, taille ou espacement en dur. Tout passe par un fichier de jetons unique.

Thème clair et sombre dès le premier écran. Aucun texte en dur : clés i18n partout, français seul livré.

**Exception délibérée à « la couleur est un budget » — l'onglet Statistiques.** Décision de Mathieu le 25/08, étendue le 26/08.

## 10. Découpage en tranches

Ordre contraint par une seule chose : **l'historique Health Connect est de 7 jours et ne se rattrape pas.**

| Tranche | Contenu | Livrable |
|---|---|---|
| **T0** | Sonde Health Connect | ✅ Fait le 21/08/2026 |
| **T1** | Socle : SQLite, migrations, ingestion paginée, stockage brut, agrégats | ✅ Fait |
| **T2** | TRIMP, Banister, forme du jour, écran d'accueil | ✅ Fait |
| **T3** | Séance planifiée en blocs, calendrier croisé, vue par discipline | ✅ Fait |
| **T4** | RPE, commentaire, bilan de séance, analyse automatique, rattachement automatique prévu ↔ réalisé | ✅ Close et validée sur appareil le 30/08. |
| **T5** | Export et import coach | ✅ Fait, validé sur appareil le 26–27/08 |
| **T6.1** | Écran Profil (indicateurs de performance, zones, disponibilités, matériel) | ✅ **Close et validée sur appareil le 31/08.** Étendue en cours de route : journal par zone. |
| **T6.2** | Écran Objectif (décomposition du chrono cible, confrontation aux tests) | ✅ **Fait, validée sur appareil le 31/08.** |
| **T6.3** | Interruptions (période d'indisponibilité, charge forfaitaire) | Techniquement complète le 31/08 — voir §20. **Pas encore close, en attente de validation sur appareil.** |
| **T6.4** | Notifications locales | À suivre — dépend de T6.3 (suspension pendant une interruption) |
| **T6.5** | Paramètres (thème, langue, connexion Health Connect, export/suppression des données) | ✅ Fait, validée le 06/09 |
| **Refonte visuelle** | Reconstruction de la quasi-totalité des écrans sur la maquette Claude Design | ✅ Fait, cette session (09/09) — voir §24 |
| **T7** | Alignement des blocs sur la série brute | Post-v1 |

T5 a été avancée devant T4 (décision du 25/08, ETAT) : construire le Coach avant le rattachement automatique était possible parce que l'export s'appuie sur une heuristique explicitement dégradée en attendant T4.

**T6, initialement une seule tranche, est scindée en cinq (30/08)** — cinq fonctionnalités peu couplées entre elles. L'ordre suit les dépendances réelles : Objectif lit les zones que Profil écrit — **désormais vrai, T6.1 étant livrée** ; Notifications doit savoir suspendre ses relances pendant une Interruption déclarée.

## 11. Points ouverts

- Constantes de temps du modèle de Banister : valeurs de départ à choisir, révisables
- Puissance vélo : à resonder en octobre 2026
- Sauvegarde et restauration des données locales : mécanisme à définir avant T6.5 (Paramètres)
- Détection d'un fichier coach rejoué par erreur (`payload_hash` stocké, non exploité)
- Forme exacte de l'enveloppe JSON `ironapp/1` côté import planifié : reconstruite le 30/08 depuis la documentation pour un rattrapage manuel, jamais comparée au code réel de `planning/coachImport.ts`.
- Origine et destination de l'icône réglage visible sur l'accueil et Statistiques (captures du 31/08) — probablement `ui/ScreenShell.tsx`, jamais reçu.
- **T6.3, non recontrôlé avec Mathieu** : « replanification autour » (PRD §7 point 10) interprétée par Claude au sens le plus étroit — aucune séance planifiée touchée par une interruption. À confirmer si un besoin concret s'en écarte.
- **T6.3, résiduel** : `metrics/dailyForm.ts` (jamais reçu) utilise-t-il `athlete.birthDate`/`.sex` sans garde contre `null` ? Question ouverte depuis le retrait de `db/bootstrap.ts` — sans conséquence sur l'appareil de Mathieu (colonnes déjà renseignées), pertinente seulement pour une base fraîchement installée.

---

## 12. Modèle de séance en blocs

**Figé le 23 août 2026.** Gouverne la table `planned_block`, l'éditeur manuel de T3.2 et le contrat d'échange coach de T5.

**Le gel porte sur les MEMBRES des énumérés, pas sur la liste des champs.**

### Principe

Un bloc n'est pas un type parmi quarante. Ce que décrit un bloc se sépare en trois questions indépendantes.

| Axe | Question | Membres |
|---|---|---|
| `kind` | à quoi sert ce bloc ? | WARMUP, WORK, RECOVERY, REST, COOLDOWN, TRANSITION, SET |
| `measure` | qu'est-ce qui le termine ? | TIME, DISTANCE, REPS, OPEN |
| `set_mode` | comment se répète un conteneur ? | REPEAT, AMRAP, EVERY |
| `target_type` | à quelle intensité ? | NONE, ZONE, PACE, SPEED, POWER, HR, LOAD, RPE |
| `relative_to` | par rapport à quoi, en pourcentage ? | FTP, VMA, CSS, HRMAX, ONE_RM |

Unités SI, comme partout : secondes, mètres, mètres par seconde, watts, battements par minute, kilogrammes.

### Arbitrages

**RECOVERY et REST séparés.** **Pas de membre DRILL.** **EVERY n'est pas un membre CrossFit.** **Un SET peut porter plusieurs enfants non-SET.** **Profondeur 1 maximum.** **Pas de `rest_sec`.** **`label` est du texte libre.** **`ONE_RM` est l'exception assumée de `relative_to`.** **`POWER` déclaré malgré l'absence de vélo.**

### Structure de `planned_block`

Dix-sept colonnes. `parent_block_id` nul pour un bloc racine. `discipline` nullable, héritée de la séance et surchargée dans un BRICK seulement.

**L'unicité porte sur `(planned_session_id, parent_block_id, position)`.**

### Durée d'une séance planifiée

**Jamais stockée, recalculée à la lecture** — même statut que `daily_load`.

### Validation

Les défauts sont rendus sous forme de **codes**, pas de phrases.

### Filtres de discipline — ajoutés le 24/08

`target_type` et `relative_to` sont **proposés** selon la discipline effective du bloc.

| Discipline | `target_type` proposés | `relative_to` proposés |
|---|---|---|
| RUN | NONE, ZONE, PACE, HR, RPE | VMA, HRMAX |
| BIKE | NONE, ZONE, SPEED, POWER, HR, RPE | FTP, HRMAX |
| SWIM | NONE, ZONE, PACE, HR, RPE | CSS, HRMAX |
| STRENGTH | NONE, LOAD, HR, RPE | ONE_RM, HRMAX |
| BRICK | l'union vélo + course | FTP, VMA, HRMAX |

**Ce sont des filtres d'INTERFACE, pas des restrictions de domaine.**

### Unités de saisie

Le stockage est en SI, sans exception (§2). La SAISIE ne l'est pas, et la conversion vit dans un seul endroit, `planning/blockText.ts` :

| Grandeur | Stockage | Saisie et affichage |
|---|---|---|
| Durée, fenêtre de série | secondes | minutes + secondes |
| Allure (`PACE`) | s/km, ou s/100 m en SWIM | minutes + secondes, unité dite en clair |
| Vitesse (`SPEED`) | m/s | km/h |
| Cible relative | pourcentage | pourcentage, jamais résolu |

**La même conversion vit désormais à quatre endroits qui doivent rester
d'accord : `blockText.ts` (édition manuelle), le contrat embarqué dans
l'export coach (§7), l'écran Statistiques et l'écran Profil, qui partagent
tous deux `referenceNumeric`/`referenceSiFromDisplay` dans
`metrics/disciplineStats.ts` depuis le 31/08 (voir §18). Quatre lectures de
la même règle, jamais quatre formules différentes.**

---

## 13. Domaines de discipline

Séparés au niveau du type le 23 août 2026.

| Type | Membres | Usage |
|---|---|---|
| `CoreDiscipline` | RUN, BIKE, SWIM, STRENGTH | Les quatre du MVP |
| `PlannedDiscipline` | les quatre + **BRICK** | Colonne `discipline` du prévu |
| `ActualDiscipline` | les quatre + **OTHER** | Colonne `discipline` du réalisé |
| `Discipline` | union des deux | Affichage seulement |

**BRICK n'existe qu'en prévu.** **OTHER n'existe qu'en réalisé.**

Les colonnes `discipline` sont du `text` SQLite sans `CHECK` : **le domaine n'est tenu que par le typage et par les gardes d'exécution à la lecture**. **Même traitement appliqué à `zone.kind` et `zone.source` depuis le 31/08** : `ZONE_KINDS`/`ZONE_SOURCES` posés dans `schema.ts` sans `CHECK` en base, voir §18.

**Comparer `ActualDiscipline` et `PlannedDiscipline` exige de resserrer vers `CoreDiscipline`.**

## 14. Périodisation

**Figée le 24 août 2026.** Gouverne la table `training_phase`, l'écran de saisie, l'en-tête du calendrier et le contrat d'échange coach du §7.

### Une seule échelle

Une seule table, et `phase` est une **étiquette** portée par le bloc.

### Le rang est dérivé

« Bloc 3 / 9 » se calcule à la lecture, par ordre de date de début.

### Le non-chevauchement n'est pas tenu par la base

La règle est portée par `planning/trainingPhases.ts`, qui rend des **codes**.

### Un jour peut n'appartenir à aucun bloc

État normal, pas défaut.

### Structure

Treize colonnes. `race_id` et `coach_exchange_id` en `ON DELETE SET NULL`.

## 14 bis. Indicateurs de référence et leur tendance — ajouté le 27/08

`metrics/disciplineStats.ts` lit la dernière valeur connue de `zone` par discipline (VMA pour RUN, FTP pour BIKE, CSS pour SWIM — STRENGTH et BRICK n'en ont pas en v1, voir §13) et son historique complet.

**Une seule fonction de conversion, `referenceNumeric`, partagée entre l'écart affiché, le graphique de tendance ET l'écran Profil depuis le 31/08** (voir §18) — deux, puis trois lectures de la même règle de conversion SI → affichage auraient fini par diverger.

**Le graphique espace les points par RANG, pas par date réelle.**

**Aucune inversion d'axe pour la CSS.**

**Rien en dessous de deux points.**

**Le libellé de droite ne dit « aujourd'hui » que si c'est vrai.**

## 15. Règles d'interface

**Issues de la validation sur appareil, T3.2 à T6.1.** Chacune corrige un défaut réel, invisible au compilateur.

### Un enfant absolu ne couvre que son parent

`position: 'absolute'` avec les quatre côtés à zéro se cale sur le PARENT, pas sur l'écran. Conséquence : une feuille qui doit couvrir l'écran depuis un contexte imbriqué passe par **`Modal`**.

### Sortir d'un écran passe par une garde unique

Un écran qui tient un brouillon dépose `registerDetailGuard`, qui rend `true` s'il a absorbé la sortie.

### Un `Pressable` désactivé peut intercepter un `Pressable` parent

`SessionChip` reste un `Pressable`, même sans `onPress`. Chaque pastille posée dans un conteneur cliquable est enveloppée d'une vue en `style={{ pointerEvents: 'none' }}`.

### Une zone tactile étroite se traduit en « ça ne marche pas », pas en « c'est moins pratique »

Constaté sur `WeekRow` (T3.3.b).

### `PanResponder` cohabite mal avec des `Pressable` en dessous

Pour un balayage sur une zone qui contient aussi des éléments cliquables, préférer un `ScrollView` natif à pagination.

### `FlatList` (et toute `VirtualizedList`) ne s'imbrique jamais dans un `ScrollView` de même orientation

Constaté sur le calendrier (T3.3.b).

### Un geste ne change une valeur qu'une fois — ajouté le 25/08 (T3.3.c)

Un verrou (`ref`, pas de rendu) fermé au premier décalage, rouvert au prochain `onScrollBeginDrag`.

### `expo-file-system` a déplacé son API historique sous `/legacy` en SDK 54 — ajouté le 26/08

**Vérifier TOUS les points d'import d'un module concerné, pas seulement celui que l'erreur a montré en premier.**

### Le client Health Connect ne s'initialise pas tout seul — ajouté le 27/08

Toute fonction qui lit Health Connect doit s'assurer elle-même de la disponibilité du client.

### Un paramètre optionnel doit être transmis explicitement à chaque appel — ajouté le 27/08

Un paramètre nommé dans un wrapper doit être répété à l'identique vers la fonction qu'il enveloppe.

### Comparer deux domaines disjoints exige leur intersection réelle, pas l'un des deux en entier

Voir §13.

### Aucun nom de mois ni de jour calculé par `Intl`

Les sept jours et les douze mois sont des clés i18n.

### Toute arithmétique de jour civil se fait en UTC

**Exception unique et documentée : `today()`**.

### Le clavier est mesuré en JS

`useKeyboardHeight` s'appuie sur `Keyboard`, cœur de React Native.

### La couleur est un budget, et un seul élément par écran le dépense

**Exception délibérée et documentée : l'onglet Statistiques.**

### Aucun export nommé ne doit être supposé sans avoir vu le fichier

Constaté le 26/08 : un import `BOTTOM_INSET` depuis `ui/insets.ts`, jamais vérifié, a fait échouer `tsc --noEmit`.

### Une règle d'affichage partagée entre deux écrans a un seul foyer — ajouté le 28/08 (T4)

Extrait dans `ui/format.ts`. **Étendu le 31/08 (T6.1)** : `referenceNumeric` et ses fonctions sœurs (`referenceSiFromDisplay`, `zoneUnit`), déclarées en privé dans `StatsScreen.tsx` depuis T3.4, sont sorties dans `metrics/disciplineStats.ts` dès que l'écran Profil a eu besoin de la même conversion pour SAISIR une valeur, pas seulement l'afficher. Même règle générale : avant d'écrire une fonction de conversion ou de formatage dans un écran, vérifier si un autre en a déjà besoin d'une identique.

### Un seul mécanisme de clavier dans l'app — ajouté le 29/08 (T4)

`ui/useKeyboardHeight.ts` répond à « le clavier recouvre le champ qu'on remplit ».

### Une assertion de type générique ne se coupe jamais sur plusieurs lignes — ajouté le 31/08 (T6.1)

Constaté dans `planning/profile.ts` : `... as Record<\n  ZoneKind,\n  ZoneReading | null\n>;` avec le chevron fermant seul sur sa ligne produit `TS1109: Expression expected` — le parseur TypeScript perd le fil sur une assertion `as` multi-lignes de cette forme précise, alors que le même type écrit sur une seule ligne compile sans problème. **Le remède n'est pas de reformater le cast, c'est de s'en passer** : annoter le type sur la déclaration de la variable (`const zones: Record<ZoneKind, ZoneReading | null> = {...}`) plutôt qu'un cast en fin d'expression. Plus lisible, et à l'abri de ce piège de syntaxe par construction.

### `noUncheckedIndexedAccess` exige de capturer un accès indexé avant de brancher dessus — ajouté le 31/08 (T6.1)

Constaté dans `planning/profile.ts::saveRaceProfile` : `rows[0]` utilisé inline dans `if (rows.length === 0) { ... } else { ... eq(race.id, rows[0].id) ... }` échoue avec `TS2532: Object is possibly 'undefined'`, parce que TypeScript ne relie jamais la longueur d'un tableau à l'existence d'un de ses éléments — même dans une branche `else` où c'est logiquement garanti pour un humain. `readProfileSnapshot`, dans le même fichier, évitait déjà correctement ce piège en capturant `rows[0]` dans une variable puis en testant `=== undefined` avant tout usage. Règle générale, déjà énoncée pour `disciplineStats.ts` (« `noUncheckedIndexedAccess` est actif ») mais pas encore formulée comme geste systématique : **tout accès `array[index]` doit être capturé dans une variable nommée et testé `=== undefined` avant emploi, jamais utilisé à l'intérieur d'une branche conditionnelle sur `.length`.**

### La classe `File` d'`expo-file-system` exige une URI absolue, pas un chemin brut — ajouté le 06/09 (T6.5)

Constaté dans `settings/appData.ts::exportDatabaseFile` : `new File(\`${SQLite.defaultDatabaseDirectory}/${DATABASE_NAME}\`)` plantait sur appareil avec `java.lang.IllegalArgumentException: URI is not absolute`. `SQLite.defaultDatabaseDirectory` (`expo-sqlite`) rend un CHEMIN de système de fichiers brut, sans schéma — la classe `File` de la nouvelle API `expo-file-system` (distincte de l'ancienne API `/legacy`, voir plus haut) exige elle une véritable URI (`file://…`). Corrigé en préfixant `file://` avant construction. **Deuxième piège du même module en moins de deux semaines** (voir l'entrée du 26/08 ci-dessus sur `/legacy`) : `expo-file-system` a changé plusieurs fois de surface d'API sur des versions de SDK récentes, et aucune des deux erreurs n'était détectable par `tsc` — les deux n'apparaissent qu'à l'exécution, sur appareil. Règle : **tester tout usage nouveau d'`expo-file-system` sur appareil avant de le considérer acquis**, ne jamais faire confiance à un exemple de documentation sans vérification locale.

### `Pastille.discipline` attend le jeton FRANÇAIS, jamais la discipline anglaise brute — ajouté le 09/09

Constaté sur `CoachScreen.tsx` et `StatsScreen.tsx`, tous deux reconstruits
le 09/09 : `<Pastille discipline={row.discipline} .../>` où `row.discipline`
est une `ActualDiscipline`/`PlannedDiscipline` anglaise (`RUN`, `BIKE`...)
plante au rendu (`tokens.pictos['RUN'] is undefined`), parce que
`Pastille.tsx` (`PICTO_BY_DISCIPLINE`) attend le vocabulaire FRANÇAIS de
`theme/tokens.ts` — `course`/`velo`/`natation`/`renforcement`/`brick`/
`autre`. La conversion passe systématiquement par `disciplineToken()`
(`ui/discipline.ts`) : `<Pastille discipline={disciplineToken(row.discipline)} .../>`.
Le code déjà en place dans `screens/HomeScreen.tsx` (antérieur à cette
session) suivait déjà cette règle correctement partout — c'est en le
relisant, une fois les deux écrans cassés, que la vraie cause a été
trouvée ; deux hypothèses de correction distinctes avaient été tentées
avant. **Vérifier systématiquement tout nouvel appel à `Pastille`
contre ce piège avant de le considérer acquis.**

### Un écran peut être ouvert en dehors du système de route — ajouté le 09/09

Constaté sur l'ancien `screens/PhasesScreen.tsx` (T3.3.a) : jamais présent
dans `navigation/routes.ts`/`AppNavigator.tsx`, il était ouvert par un
`Modal` React Native codé en dur DANS `CalendarScreen.tsx`, l'écran
appelant lui-même gérant son propre état de visibilité
(`phasesOpen`/`setPhasesOpen`). Ce mode d'ouverture n'était documenté nulle
part dans ce fichier ni dans ETAT.md avant cette découverte, et n'avait
provoqué aucun conflit `tsc` puisqu'il ne touche jamais l'union
`DetailRoute`. **Conséquence pratique** : « cet écran n'a plus d'appelant »
ne peut être conclu qu'après avoir cherché aussi les `Modal` locaux dans
les écrans susceptibles d'en avoir été l'hôte, pas seulement les appels à
`openDetail`/les entrées de `routes.ts`.

### `tsc --noEmit` est disponible dans l'environnement d'exécution de Claude, et fait référence pour tout contrôle de grammaire — ajouté le 09/09

Un comptage naïf d'accolades peut rater une vraie erreur de structure si
le total global reste juste par pure coïncidence — constaté sur
`CoachScreen.tsx` (09/09) : une insertion de code a supprimé par erreur la
ligne `function PreviewSection(...) {` juste avant son corps, laissant ce
corps orphelin après la fermeture de la fonction précédente ; le compte
global d'accolades du fichier restait pourtant équilibré, `Metro`/Babel a
seul révélé l'erreur réelle (`'return' outside of function`) au moment du
bundling. `tsc` est installé globalement dans le bac à sable où Claude
exécute son code — aucune installation nécessaire. Contrôle adopté comme
méthode standard à partir de cette session :

```
tsc --noEmit --jsx react-jsx --target es2020 --module esnext \
    --moduleResolution bundler --skipLibCheck --noImplicitAny false \
    --noResolve chemin/du/fichier.tsx
```

Filtrer la sortie aux erreurs `TS1xxx` (grammaire pure) et ignorer le
reste (`Cannot find module`, espace de noms `React` absent, retour
manquant dans un switch exhaustif sur un type résolu en `any` faute de
résolution des imports) — artefacts de la compilation hors projet, sans
rapport avec une vraie erreur. Une sortie vide sur ce filtre est la seule
garantie fiable qu'un fichier est syntaxiquement correct ; le compte
d'accolades ne l'est pas.

---

## 16. Rattachement automatique prévu ↔ réalisé — ajouté le 28/08 (T4)

**Construit dans `planning/sessionLinks.ts`.** Alimente enfin `session_link` (§3).

### Un lien automatique est un cache, un lien manuel est une donnée

`rebuildAutoLinks(from, to)` efface donc tous les liens `auto` de sa fenêtre avant de les réécrire.

### Le calcul est glouton, avec un garde-fou d'ambiguïté

Le score d'un appariement combine deux signaux : le jour et la discipline valent une base fixe (0,6) ; l'accord des durées peut ajouter jusqu'à 0,4.

**Si le meilleur appariement d'un créneau ne dépasse pas son meilleur concurrent de plus de 0,08 (`AMBIGUITY_MARGIN`), rien n'est écrit pour LES DEUX.**

### Le rattachement MANUEL, lui, cherche plus large

`listLinkCandidates` propose les séances prévues à ± trois jours.

### Câblé dans le cycle d'ingestion

`runIngestion` (§4) appelle `rebuildAutoLinks` en dernière étape.

### Affichage du rattachement — vue JOUR et vue SEMAINE corrigées le 29/08

`CalendarScreen.reload()` lit `readPlannedIdsWithActual` et transmet l'ensemble à `DayList` ET `WeekRow`.

### `brick_pair` — une relation À CÔTÉ du rattachement, jamais dedans — ajouté le 06/09 (T6.5)

Un enchaînement RÉALISÉ sans avoir jamais été planifié comme BRICK ne peut pas passer par ce mécanisme, pour une raison structurelle découverte par un test réel sur appareil, pas anticipée à la conception : **`session_link` n'autorise qu'un rattachement par séance réalisée** (`readLinkForActual` ne rend jamais qu'une ligne). Deux séances déjà individuellement rattachées à leur propre prévu (un RUN, un SWIM, chacun honoré) ne peuvent pas être EN PLUS rattachées à un troisième prévu BRICK synthétique sans perdre leur rattachement d'origine.

`brick_pair` (§3) contourne ça en ne touchant PAS au rattachement du tout : elle porte deux `actual_session_id` et un `status`, rien d'autre. `planning/sessionLinks.ts::findBrickSibling` ne consulte donc jamais `readLinkForActual` pour décider si une proposition doit apparaître — seulement si l'une des deux séances appartient déjà à une `brick_pair` (confirmée ou refusée). Les deux mécanismes — rattachement individuel et regroupement BRICK — sont orthogonaux : une séance peut porter les deux en même temps, ou seulement l'un des deux, ou aucun.

**Précédent à retenir** : la première conception (un prévu BRICK synthétique rattaché via `session_link`) semblait la plus « propre » — réutiliser un mécanisme existant plutôt qu'en ajouter un nouveau, principe habituellement juste dans ce projet. Elle s'est révélée fausse ici parce qu'elle supposait implicitement que les deux séances candidates n'auraient JAMAIS de rattachement préalable — une hypothèse jamais vérifiée avant le test sur appareil qui l'a contredite. **Une contrainte d'exclusivité déjà en place ailleurs dans le schéma (« un réalisé n'appartient qu'à un seul prévu ») doit être vérifiée explicitement avant de réutiliser ce mécanisme pour un nouveau besoin, pas supposée compatible par défaut.**

---

## 17. Bilan de séance, verdict et alertes — ajouté le 28/08 (T4)

**Construit dans `metrics/sessionReview.ts`, exposé par `screens/SessionReviewScreen.tsx`.**

### Une seule fonction de verdict, deux bases possibles

`verdictFor` (pure, sans base) est LA seule fonction qui tranche entre écart au plan et habitudes de la discipline.

### L'axe de comparaison est choisi, pas supposé

`chooseAxis` retient la durée dès qu'elle est `exact`, sinon la distance, sinon la durée en mode `partial`, sinon rien.

### La dérive cardiaque n'est affichée que quand elle veut dire quelque chose

`readDrift` rend la valeur SYSTÉMATIQUEMENT, mais la marque interprétable seulement si l'effort a duré au moins vingt minutes ET que le plan rattaché ne contient AUCUN `SET`.

### Alertes de séance et alertes de période, deux fichiers

**`LOAD_RAMP` est déclarée mais n'est produite par personne.**

### Le ressenti s'écrit sans validation intermédiaire

`planning/sessionFeedback.ts` alimente enfin `feedback`.

---

## 17 bis. Saisie manuelle d'une séance réalisée — ajouté le 29/08 (T4)

**Construit dans `health/manualEntry.ts`, exposé par `screens/ManualActualSessionScreen.tsx`.**

### Deux modes, une seule fonction d'écriture

Une séance à la fois, ou plusieurs collées d'un coup.

### Identifiant synthétique déterministe

`garmin_activity_id` est UNIQUE (§3). Un identifiant `manual:<hachage>` est fabriqué à partir des champs saisis.

### Le jour civil est celui tapé, rien d'autre

`startAt` est fabriqué à midi UTC.

### La charge est calculée pour de vrai, jusqu'à la courbe — corrigé le 29/08

`runMorningSync(false)` rejoue exactement la chaîne SANS reprendre Health Connect.

### Point d'entrée provisoire

Un lien sur l'accueil, sous la semaine en pastilles.

---

## 17 ter. Import groupé de séances planifiées — ajouté le 30/08

**Construit dans `planning/manualPlannedImport.ts`.**

### Écrit via `saveDraft`, pas via un format JSON deviné

L'import Coach sait déjà créer des séances planifiées en lot, mais son enveloppe JSON exacte n'a jamais été vue.

### Un seul bloc par séance, mesuré en durée

### Aucun identifiant de déduplication

### Le format de collage groupé du §17 bis gagne un sixième champ

### Utilisé pour le rattrapage réel d'août 2026

---

## 17 quater. Suppression d'une séance réalisée — ajouté le 30/08

**Construite dans `health/manualEntry.ts::deleteActualSession`.**

### S'applique à toute séance, sans distinction d'origine

### Nettoyage explicite, pas de cascade supposée

### Referme la boucle jusqu'à la courbe

---

## 18. Écran Profil — T6.1, ajouté le 31 août 2026

**Construit dans `planning/profile.ts`, exposé par `screens/ProfileScreen.tsx`.** Remplace `db/bootstrap.ts` comme point d'écriture pour tout ce qu'il couvre — voir la note sur `bootstrap.ts` en fin de section.

### Écran unique, deux foyers d'écriture

Décision de Mathieu (31/08) : un seul écran en sections (Course, Profil,
Disponibilités, Matériel, Blessures, Zones), pas d'écrans séparés — SPECS-
TECH §10 le scopait déjà ainsi (« Écran Profil (indicateurs de performance,
zones, disponibilités, matériel) »). Deux boutons « Enregistrer » seulement :
un pour Course (table `race`), un pour Profil + Disponibilités + Matériel +
Blessures ensemble (table `athlete`, une seule ligne). Un bouton par carte
aurait risqué qu'une sauvegarde écrase silencieusement une modification
faite dans une carte voisine pas encore enregistrée.

Chaque relevé de zone (table `zone`) s'écrit indépendamment : la table est
historisée, un relevé est un événement discret, pas un brouillon.

### Vocabulaire de zone posé dans `schema.ts`

`ZONE_KINDS = ['vma', 'ftp', 'css', 'hr_max']` et
`ZONE_SOURCES = ['test', 'estimation', 'manual']`, déclarés à côté de
`DISCIPLINES` — même traitement que le reste du vocabulaire porté par une
colonne texte sans `CHECK` (§13). **Aucune migration** : `zone.kind` et
`zone.source` sont des colonnes `text` depuis `0000`, jamais typées avant
ce jour. Le commentaire de `schema.ts` mentionne un cinquième membre
possible (`hr_rest`) pour `kind`, délibérément exclu de `ZONE_KINDS` — la
FC de repos est déjà couverte par la table `resting_hr` et Health Connect ;
un ajout resterait à faire si un besoin réel de baseline manuelle se
présente.

### Source obligatoire, sans défaut, à chaque saisie de zone

Décision de Mathieu (31/08). Le sélecteur Test / Estimation / Manuel
(`ui/OptionChip.tsx`) n'a AUCUNE valeur pré-sélectionnée : l'enregistrement
est bloqué (`profile.zones.sourceRequired`) tant qu'aucune des trois n'est
choisie. Cohérent avec le principe déjà posé au §5 : une valeur sans
méthode explicite ne serait qu'une estimation déguisée en mesure. Une fois
enregistrée, la source détermine le socle affiché exactement comme pour
les indicateurs de Statistiques (`test` → mesuré, `manual` → saisi, sinon
estimé) — même correspondance, dupliquée en petit dans `ProfileScreen.tsx`
faute d'export partagé pour ces dix lignes (voir « dettes assumées »
ci-dessous).

### Conversion SI ↔ affichage consolidée

`referenceNumeric` vivait en privé dans `StatsScreen.tsx` depuis T3.4.
Sortie dans `metrics/disciplineStats.ts`, étendue au quatrième membre
(`hr_max`, absent des trois disciplines de référence RUN/BIKE/SWIM), et
complétée par son inverse `referenceSiFromDisplay` (affichage → SI, pour
l'écriture) et `zoneUnit` (unité SI stockée par type). `ReferenceKind`
devient `Exclude<ZoneKind, 'hr_max'>` — dérivé de `ZoneKind`, plus une
union redéclarée à la main. `StatsScreen.tsx` importe désormais
`referenceNumeric` au lieu de le redéclarer ; aucun comportement visible
n'a changé. Ferme la dette signalée à la conception de T6.1 : le Profil
devait faire exactement la même conversion pour SAISIR une valeur, pas
seulement l'afficher (§12, §14 bis).

### Structures JSON fixées par Claude

`athlete.availability`, `.equipment`, `.injuries` sont des colonnes texte
sans forme déclarée nulle part — le commentaire « structure fixée en T3 »
dans `schema.ts` ne renvoyait à aucun fichier reçu. Fixées dans
`planning/profile.ts` :

| Colonne | Structure |
|---|---|
| `availability` | `Weekday[]` — codes de jour (`'mon'`…`'sun'`), disponibilité générale, PAS par discipline |
| `equipment` | `string[]` — tags libres |
| `injuries` | `InjuryEntry[]` — `{ id, label, date, notes, resolved }`, historique simple |

Non contestées à l'usage à ce jour. À traiter avec la prudence du
vocabulaire de blocs (§12) le jour où un format d'échange (Coach) devra
les porter — pour l'instant, aucun ne le fait.

### Journal des zones — ajouté en cours de tranche, retour d'usage

`zone` est historisée (§3, §14 bis) mais rien ne permettait de lire au-delà
de la dernière valeur ni de corriger une entrée mal saisie. `readZoneHistory
(kind)` rend tout l'historique, du plus récent au plus ancien ;
`deleteZoneReading(id)` supprime une ligne précise, sans toucher aux
autres. Chargé À LA DEMANDE (pas dans l'instantané principal de l'écran) :
quatre requêtes supplémentaires à chaque ouverture pour un besoin consulté
rarement n'aurait rien apporté. Confirmation par `Alert` avant suppression
— même traitement que la suppression d'une séance (§17 quater).

### Le chrono cible n'est pas édité ici

`race.target_total_seconds` fait partie du type `RaceProfile` que le
module manipule (la table le porte), mais aucune fonction ne l'expose à
l'édition : `saveRaceProfile` REÇOIT sa valeur en entrée et la réécrit
telle quelle, sans jamais la modifier. `ProfileScreen.tsx` lui repasse
systématiquement la valeur déjà en base à chaque sauvegarde de la Course.
Décision de scope, pas oubli : le §10 réserve la décomposition du chrono à
T6.2, qui devra aussi décider si son édition brute vit sur cet écran ou
sur celui du Profil.

### Points d'entrée, restylés après retour d'usage

Deux points d'entrée, tous deux provisoires :

- **Accueil** : carte pressable (icône + libellé + chevron), sous le
  compte à rebours. Premier jet en simple lien texte souligné, jugé
  « horrible » par Mathieu et remplacé le jour même — même grammaire
  visuelle que les autres cartes de l'écran.
- **Statistiques** : bouton rond « + » **permanent**, à côté du nom de
  l'indicateur de référence (VMA/FTP/CSS), qu'une valeur existe déjà ou
  non. Le texte cliquable de l'état vide (`stats.reference.none`) reste en
  plus, pour sa découvrabilité propre à ce cas précis — c'était, avant ce
  retour, le SEUL moyen d'atteindre le Profil depuis Statistiques, et il
  disparaissait dès la première valeur saisie.

### `bootstrap.ts` non retiré à cette date

`db/bootstrap.ts` continue de tourner à la livraison de T6.1. Il reste
inoffensif : idempotent, il n'écrase jamais une valeur déjà présente, et
l'écran Profil écrit dans les mêmes tables sans jamais entrer en conflit
avec lui. Le fichier qui l'appelle (`App.tsx`) n'avait pas encore été reçu
à ce moment — **retiré depuis, en T6.3, voir §20.**

### Dettes assumées à la livraison

- `zoneStatus`/`zoneStatusKey`/`sourceLabelKey` dans `ProfileScreen.tsx`
  dupliquent en petit (une dizaine de lignes) le pattern
  `referenceStatus`/`statusKey`/`sourceKey` privé de `StatsScreen.tsx`.
  Duplication jugée trop mineure pour justifier de toucher un fichier tiers
  pour ce seul gain — contrairement à `referenceNumeric`, qui portait un
  vrai risque de divergence de calcul.
- `ui/OptionChip.tsx`, pensé pour un choix unique parmi plusieurs
  (`accessibilityRole="radio"`), est réutilisé pour les jours de
  disponibilité — un choix MULTIPLE. Sémantique d'accessibilité imparfaite
  pour ce cas précis, signalée en commentaire dans `ProfileScreen.tsx`, pas
  corrigée : un composant dédié coûterait plus que le gain pour un seul
  écran de ce genre.

---

## 19. Écran Objectif — T6.2, ajouté le 31 août 2026

**Construit dans `metrics/raceTargetReview.ts` et `planning/profile.ts`
(fonctions ajoutées), exposé par `screens/ObjectiveScreen.tsx`.**

### Décomposition manuelle, jamais un pourcentage type

Décision de Mathieu (31/08) : quatre champs — natation, vélo, course,
transitions (un seul champ, pas T1/T2 séparés) — saisis en HEURES +
MINUTES, pas en secondes ni en minutes+secondes comme les blocs de séance
(§12) : à l'échelle de l'heure, une précision à la seconde serait une
fausse précision. Un gabarit de répartition automatique aurait inventé une
règle non demandée par l'athlète — même refus de principe que le bloc
« ajustement proposé » du Coach (PRD §6).

### Le chrono cible n'est PAS la somme des quatre parts

`race.target_total_seconds` reste un champ saisi INDÉPENDAMMENT de sa
décomposition. Il a existé comme ambition déclarée (5h45, PRD §2) avant
que VMA/FTP/CSS ne soient mesurables ; le forcer à n'être que la somme des
parts l'aurait fait disparaître tant que la décomposition serait
incomplète. L'écran affiche un écart informatif — alloué vs objectif — et
ne corrige jamais l'un à partir de l'autre.

### Deux fonctions d'écriture sur `race`, jamais les mêmes colonnes

`saveRaceProfile` (Profil, T6.1) et `saveRaceTarget` (Objectif, T6.2,
nouvelle) écrivent sur la même ligne `race` mais jamais sur les mêmes
colonnes : la première ne reçoit plus `target*` en entrée DU TOUT depuis
T6.2 (elle ne pouvait de toute façon rien y écrire d'utile), la seconde ne
touche jamais nom/date/distances. Aucun risque qu'une sauvegarde écrase le
travail de l'autre écran.

### `target_revised_at` : détection automatique, pas de case à cocher

`saveRaceTarget` compare le nouveau `target_total_seconds` à la valeur en
base avant d'écrire : s'il diffère (y compris `null` → valeur), la
révision est horodatée ; sinon `target_revised_at` reste intact, même si
la décomposition seule a changé. Une case « marquer comme révision » à
cocher à part aurait pu être oubliée ; une comparaison de valeur ne
s'oublie pas.

### Migration `0004`

Quatre colonnes nullable ajoutées à `race` : `target_swim_seconds`,
`target_bike_seconds`, `target_run_seconds`, `target_transition_seconds`.
Simple ajout de colonnes (pas de refonte de table, SQLite le permet
directement par `ALTER TABLE ADD COLUMN`). Nom de fichier exact non
confirmé, voir §3.

### Confrontation — `readReference` exportée, aucun verdict

`referenceNumeric` (T6.1) donnait déjà la conversion SI → affichage pour
UNE valeur ; l'écran Objectif avait besoin de la DERNIÈRE VALEUR CONNUE
elle-même, jusque-là privée dans `disciplineStats.ts::readReference`,
appelée seulement par `loadDisciplineStats`. Exportée le 31/08 pour éviter
qu'une deuxième requête sur `zone` réécrite à la main dans
`raceTargetReview.ts` ne finisse par diverger (§15). Aucun changement de
comportement pour `StatsScreen.tsx`.

`metrics/raceTargetReview.ts` (nouveau) calcule l'allure ou la vitesse
requise par discipline et la juxtapose à cette référence — **sans jamais
rendre de verdict**. Pour RUN, `referenceNumeric('vma', …)` rend une
VITESSE (km/h, comme l'affiche Statistiques) ; convertie en allure par
l'identité déjà documentée en §14 bis (« 3600 / allure »), pas une
deuxième règle de conversion SI. Pour SWIM, `referenceNumeric('css', …)`
rend déjà une allure /100 m, directement comparable.

**BIKE ne se confronte pas.** La FTP (watts) est une puissance, la vitesse
requise (km/h, dérivée du temps alloué et de la distance) une vitesse :
les relier exigerait un modèle poids/aérodynamique que l'app ne porte pas
(§2 — puissance vélo à RESONDER en octobre 2026, pas à modéliser).
`comparable: false` systématiquement pour BIKE dans le type `RequiredPace` ;
la vitesse requise et la FTP restent affichées côte à côte, sans lien
calculé entre les deux, avec une note explicite à l'écran.

### Dette assumée

`referenceStatus`/`referenceStatusKey`/`sourceLabelKey` dans
`ObjectiveScreen.tsx` dupliquent, une troisième fois, le petit pattern déjà
dupliqué entre `StatsScreen.tsx` et `ProfileScreen.tsx` (§18). Même
jugement : trop mineur pour justifier de toucher un fichier tiers.

---

## 20. Interruptions — T6.3, ouvert le 31 août 2026, techniquement complète le même jour

**Construit dans `planning/interruptions.ts`, exposé par
`screens/InterruptionsScreen.tsx`.** Techniquement complète après réception
de `metrics/dailyLoad.ts`, `metrics/pipeline.ts`, `metrics/banister.ts`,
`screens/CalendarScreen.tsx` et `db/bootstrap.ts` — **pas encore close** :
comme toutes les tranches précédentes, la clôture attend le test sur
appareil de Mathieu. La mention `Version`/`Statut` en tête de document
reflète cet état intermédiaire.

### Correction : la charge forfaitaire ne passe PAS par `manual_override`

**Erreur de conception initiale, corrigée à réception des fichiers.** La
première version de `planning/interruptions.ts`, écrite sans avoir vu
`metrics/dailyLoad.ts` ni `metrics/pipeline.ts`, écrivait la charge
forfaitaire d'une interruption dans `manual_override`
(`target_table='daily_load'`, `target_key='load'`) — en s'appuyant sur le
commentaire de `db/schema.ts` (« toute lecture d'une métrique consulte
cette table en premier ») sans pouvoir vérifier si c'était réellement le
mécanisme employé pour CE cas précis. Signalé comme hypothèse non
confirmée dans la version précédente de cette section (§15 : aucun export
nommé — ici, aucune LECTURE supposée — ne doit être présumé sans avoir vu
le fichier).

`dailyLoad.ts::rebuildDailyLoad` révèle le mécanisme réel, différent :
il lit la table `interruption` DIRECTEMENT (`db.select().from(interruption)`),
et pour chaque jour de la série où la somme des charges de séance est
nulle, comble le trou avec le `dailyLoadOverride` de l'interruption qui le
couvre — jamais en s'ajoutant à une charge de séance réelle. `manual_override`
existe et EST consultée, mais ailleurs : `readDailyLoadRange` l'applique en
LECTURE, comme correctif manuel générique sur n'importe quelle colonne de
`daily_load` déjà calculée (PRD §5, « la saisie fait foi ») — un mécanisme
sincère, mais orthogonal à la charge forfaitaire d'interruption.

**Le bug qu'aurait produit la version initiale, si elle avait été
livrée telle quelle** : `readDailyLoadRange` applique un override de
`manual_override` INCONDITIONNELLEMENT, sans la logique « seulement si la
journée est vide » que `rebuildDailyLoad` applique correctement au calcul.
Un jour de GR20 où la montre capte malgré tout une activité réelle aurait
vu sa charge réelle — correctement calculée par `rebuildDailyLoad` — silencieusement
écrasée en lecture par le forfait complet. Deux mécanismes indépendants,
en désaccord silencieux sur un cas réel et prévisible.

`planning/interruptions.ts` ne touche donc plus `manual_override` : écrire
et relire `interruption` suffit, `rebuildDailyLoad` s'en charge.

### Chaque écriture rejoue `runMorningSync(false)`

`daily_load` est un cache reconstruit intégralement à chaque appel de
`rebuildDailyLoad`, jamais de façon incrémentale (commentaire de
`dailyLoad.ts` : « il n'y a rien à optimiser »). `saveInterruption` et
`deleteInterruption` rejouent donc `runMorningSync(false)` après écriture —
même principe déjà en place pour le RPE (`sessionFeedback.ts`, T4).
Aucune diffusion manuelle « ancienne plage vs nouvelle plage » n'est
nécessaire : la reconstruction complète absorbe tout changement de
`interruption` par construction, ce qui a permis de SIMPLIFIER le module
par rapport à sa première version (qui devait, à tort, gérer ce diff pour
`manual_override`).

### Non-chevauchement strict : confirmé nécessaire, pas seulement prudent

Choisi avant d'avoir vu `dailyLoad.ts`, sur le même principe que la
périodisation (§14). `dailyLoad.ts::rebuildDailyLoad` confirme que la
prudence était justifiée pour une raison différente de celle imaginée :
il résout le jour couvert par `interruptions.find(...)` — le PREMIER
résultat dans l'ordre de la base, sans tri explicite. Deux interruptions
qui se chevaucheraient, toutes deux avec une charge forfaitaire sur un
même jour, verraient l'une gagner arbitrairement et silencieusement.
`validateInterruption` rend des codes (`LABEL_REQUIRED`, `INVALID_RANGE`,
`OVERLAP`), jamais des phrases — même traitement que
`planning/trainingPhases.ts`. La règle n'est pas portée par la base.

### Vocabulaire posé, aucune migration

`INTERRUPTION_REASONS = ['injury', 'travel', 'external_load', 'other']`,
déclaré à côté de `interruption` dans `schema.ts` — même traitement que
`ZONE_KINDS` (T6.1, §18) : vocabulaire TypeScript sur une colonne texte
sans `CHECK`, colonne existant depuis `0000`. Contrairement à `zone.kind`,
`interruption.reason` catégorise sans conséquence sur un calcul ou un
statut affiché — pas de parallèle avec l'obligation de source de zone.

### `activeInterruption`, fonction pure partagée

`planning/interruptions.ts` exporte `activeInterruption(interruptions, day)`,
qui rend l'interruption couvrant `day` (`null` sinon) sur une liste déjà
chargée — pas de requête. Le non-chevauchement garantit qu'il y en a au
plus une. `screens/CalendarScreen.tsx` l'utilise pour le bandeau (voir
plus bas) ; les Notifications (T6.4) la réutiliseront pour
`suspendsReminders` sans redéfinir la règle à leur façon.

### Arithmétique de jour, locale au fichier

`lib/dates.ts` expose `daysBetween`/`addDays`/`today` — confirmés par leur
usage dans `dailyLoad.ts`, mais le fichier lui-même toujours pas reçu.
`enumerateDays`, dans `planning/interruptions.ts`, reste donc une petite
fonction UTC pure locale (§15), utilisée uniquement pour l'affichage
(nombre de jours d'une période sur l'écran) — plus du tout pour la charge
forfaitaire depuis la correction ci-dessus.

### `db/bootstrap.ts` retiré

Reçu à la demande de clôture de T6.3. Écrivait `athlete`/`race` en dur,
provisoire depuis l'origine du projet, en attendant les écrans Profil et
Objectif — tous deux construits et validés. `App.tsx` ne l'appelle plus :
la porte d'amorçage disparaît, `Shell()` monte `AppNavigator` directement
après `DatabaseProvider`. **`src/db/bootstrap.ts` peut être supprimé du
projet.** Point de vigilance à la validation sur appareil, non vérifiable
sans le fichier : si `metrics/dailyForm.ts` (non reçu) utilise
`athlete.birthDate`/`.sex` sans les protéger contre `null`, une base
fraîchement installée sans passage par le Profil pourrait s'en trouver
affectée — sans conséquence sur l'appareil de Mathieu, où ces colonnes
sont déjà réellement renseignées.

### Bandeau calendrier — intégration volontairement minimale

`screens/CalendarScreen.tsx` affiche un texte (« En interruption : … »)
dans l'en-tête si `activeInterruption` couvre le jour courant, visible en
vue semaine comme en vue jour. Aucune modification de `WeekRow.tsx` ni de
`DayList.tsx` — ni l'un ni l'autre n'a été reçu, et `CalendarScreen.tsx`
est déjà documenté comme fragile dans ce même fichier (`PanResponder`,
pagineur à trois pages avec verrou anti-double-décalage, garde de retour
pour la vue jour) : y risquer une extension de props sans en connaître le
rendu interne aurait été exactement le genre d'hypothèse que §15 interdit.
Un jour interrompu n'est donc PAS marqué sur les pastilles de semaine ou
de jour — amélioration possible plus tard, avec ces deux fichiers.

### « Replanification autour » (PRD §7 point 10) — interprétation non recontrôlée

§8 est explicite et antérieur à cette tranche : « Aucune replanification
automatique. Aucune séance générée par l'app. » `planning/interruptions.ts`
ne touche donc jamais `planned_session`. Interprétation de Claude, jamais
recontrôlée avec Mathieu — à confirmer si un besoin concret s'en écarte.

### Entrée depuis le Profil, pas depuis l'accueil

PRD §7 ne place pas les interruptions dans la hiérarchie de l'accueil.
Lien ajouté dans la carte Disponibilités du Profil : disponibilité
hebdomadaire récurrente et indisponibilité ponctuelle datée sont le même
sujet sous deux formes.

### Un seul formulaire, pas une carte par interruption

Contrairement à `ZoneCard` (T6.1, une carte-formulaire par type de zone) :
une interruption n'a jamais besoin d'édition parallèle, le non-
chevauchement l'interdit par construction. Un seul formulaire, réutilisé
pour créer ou modifier (`editingId`).

### Non traité, restant après cette passe

- **Interruption non marquée sur les pastilles du calendrier** — voir
  ci-dessus, dépend de `WeekRow.tsx`/`DayList.tsx`.
- **Suspension effective des relances** : `suspendsReminders` est stocké
  et lisible (`activeInterruption`), consommé par personne — T6.4 n'existe
  pas encore. Attendu, cohérent avec l'ordre des sous-tranches (§10).

---

## 21. Notifications locales — T6.4, construite le 1er septembre 2026

**Construit dans `notifications/schedule.ts` et `notifications/handler.ts`,
branché dans `metrics/pipeline.ts` et `App.tsx`.** Module natif confirmé
sur appareil (permission demandée et accordée) — **les quatre
comportements eux-mêmes n'ont pas encore été observés se déclencher**,
question de calendrier (dates futures) et non de doute sur le code.

### Aucune tâche de fond, tout recalculé à chaque `runMorningSync`

Même raisonnement que l'ingestion (§4) : pas de JS en arrière-plan pour
décider au bon moment. Les notifications locales le permettent par
construction — programmées à l'avance, elles se déclenchent même app
fermée, portées par l'OS. `scheduleNotifications` ANNULE tout ce qui était
programmé (`cancelAllScheduledNotificationsAsync`) puis reprogramme à neuf
à chaque appel — même philosophie que `daily_load`, reconstruit en entier.
Câblé comme une étape de plus dans `runMorningSync`, déclenchée que
`withIngestion` soit vrai ou faux : une interruption ou un import coach
doivent se répercuter immédiatement (via les points d'appel existants de
`interruptions.ts`/`sessionFeedback.ts`), pas seulement à l'ouverture de
l'app. Aucun de ces fichiers n'a eu besoin d'être modifié pour ça.

`cancelAllScheduledNotificationsAsync` est sans risque ICI PRÉCISÉMENT
parce qu'Iron App est la seule application qui programme des notifications
locales sur cet appareil. Couplage assumé, à revoir si un jour une autre
source de notifications locales apparaît.

**Limite assumée** : app non rouverte pendant plusieurs semaines → une
seule occurrence de chaque relance aura été programmée (la plus proche
connue au dernier lancement), pas une série. Même famille de compromis que
l'historique Health Connect à 7 jours.

### Horaire : heure locale de l'appareil, pas arithmétique UTC

§15 impose l'UTC pour dériver un JOUR CIVIL de façon stable. Programmer une
notification vise un instant d'horloge murale sur CET appareil (« 7h, quelle
que soit l'heure ailleurs ») — un cas différent, qui utilise à dessein les
accesseurs locaux de `Date` (`setFullYear`/`setHours`). `todayLocal` reste
l'idiome UTC déjà vu ailleurs (`dailyLoad.ts`, `trainingAlerts.ts`,
`homeData.ts`) pour ce qui est bien un jour civil.

### `coach_exchange` porte déjà tout ce qu'il faut

`direction`, `status`, `occurred_at`, `plan_valid_until` — confirmés à
réception de `coachExport.ts`/`coachImport.ts` : `beginImportExchange` pose
`direction: 'import'` et `plan_valid_until` dès l'ouverture de l'échange.
Aucune colonne à ajouter, une seule requête triée par `occurred_at`
suffit. Un plan jamais importé (aucune ligne `direction='import'`) est
traité comme équivalent à un plan échu depuis l'origine — pas de silence
indéfini faute de premier import.

### Ajustement trouvé par `tsc --noEmit` sur appareil — même famille que les autres

`Notifications.setNotificationHandler` attend, dans la version installée
le 01/09, `shouldShowBanner`/`shouldShowList` plutôt que l'ancien
`shouldShowAlert` unique (`NotificationBehavior` a changé de forme entre
versions d'`expo-notifications`). Corrigé dans `notifications/handler.ts`.
Signalé par avance dans le commentaire du fichier avant même la
compilation — la même prudence que pour le `trigger` de programmation
(`SchedulableTriggerInputTypes.TIME_INTERVAL`), qui lui est passé sans
ajustement.

### Aucun nouvel écran

PRD §7 ne prévoit pas de réglage de notifications avant Paramètres (T6.5).
Rien d'ajouté à la navigation pour cette tranche.

### Non traité, restant après cette passe

- **Les quatre comportements n'ont pas encore été observés se déclencher**
  sur appareil — nature du sujet (dates futures), à confirmer dans les
  prochains jours d'usage réel, pas dans une seule séance de test.
- **Aucun outil de diagnostic** pour lister les notifications réellement
  programmées (`Notifications.getAllScheduledNotificationsAsync()`) sans
  attendre qu'elles se déclenchent — pourrait accélérer la confirmation,
  pas construit faute d'avoir été demandé.
- **Réglage de l'heure des notifications** (fixée à 7h partout) — candidat
  naturel pour Paramètres (T6.5), pas construit ici.

---

## 22. Retours d'usage réel — traités le 6 septembre 2026

**Quatre points remontés après plusieurs jours d'usage avec le build
`preview`, tous corrigés et validés sur appareil.**

### OTHER exclu du total de Statistiques, portée volontairement étroite

`metrics/disciplineStats.ts::loadStatsOverview` filtre désormais
`ne(actualSession.discipline, 'OTHER')`. Décision explicitement bornée à
cette seule fonction : `dailyLoad.ts`/`pipeline.ts` continuent d'inclure
la charge physiologique d'une séance OTHER dans la forme du jour — une
randonnée fatigue réellement l'organisme, qu'elle ait ou non un total qui
lui est propre dans Statistiques. **Ne pas généraliser ce filtre ailleurs
sans une décision explicite** : le principe qui a mené à l'exclusion du
total (« OTHER n'a pas d'onglet, donc pas de total ») ne s'applique pas au
calcul de charge, qui répond à une question différente.

### Splash et icône, générés sans actif graphique fourni

Aucune image n'a été fournie par Mathieu — décision explicite : Claude
conçoit un visuel à partir de `tokens.ts`, plutôt que d'attendre un actif
externe. Rendu par script Python/PIL (aucun réseau requis dans le
bac à sable d'exécution), supersampling 4× puis réduction pour un
anti-aliasing propre — y compris sur le canal alpha de l'icône adaptive,
qui doit rester transparente hors du glyphe. Le glyphe choisi est celui
de la discipline BRICK (`tokens.icon`) : seul pictogramme du système déjà
pensé comme symbole d'enchaînement entre deux disciplines, cohérent avec
l'identité d'une app de triathlon. `app.json` étendu : `icon`,
`android.adaptiveIcon.foregroundImage`/`backgroundColor`, plugin
`expo-splash-screen` avec variantes `dark`/claire distinctes.

**Le splash fonctionne, l'icône du lanceur non — point ouvert, voir
ETAT.md.** Aucune cause identifiée avec certitude à ce jour ; deux
hypothèses non vérifiées, à traiter en priorité dans la prochaine
conversation : un build EAS installé antérieur à l'ajout de la
configuration, ou un cache de prebuild non vidé par `eas build`
(`--clear-cache` jamais essayé).

### BRICK spontané — voir §16 pour le détail architectural

Résumé : détection dans `planning/sessionLinks.ts::findBrickSibling`
(même jour civil, disciplines RUN/BIKE/SWIM différentes, aucune paire
`brick_pair` préexistante touchant l'une des deux séances). Proposition
affichée depuis une carte dédiée de `screens/SessionReviewScreen.tsx`,
INDÉPENDANTE du bloc de rattachement classique — elle peut apparaître même
si la séance a déjà un prévu individuel rattaché, contrairement à la
première architecture envisagée (voir §16). Confirmation : `confirmBrickPair`
écrit une ligne `brick_pair` (`status: 'confirmed'`). Refus :
`declineBrickPair` écrit `status: 'declined'` — `findBrickSibling` exclut
ensuite systématiquement toute séance déjà présente dans `brick_pair`,
peu importe le statut, pour ne jamais reproposer une paire déjà tranchée.

`metrics/disciplineStats.ts::loadBrickStats` lit `brick_pair`
(`status='confirmed'`) et agrège les réalisés trouvés comme les quatre
autres disciplines, à deux exceptions assumées : **aucune allure moyenne
ni meilleure allure globale** (un BRICK mélange des disciplines aux unités
incompatibles — secondes/km pour la course, secondes/100m pour la nage —
une seule valeur agrégée mentirait) ; et **chaque ligne du journal porte
sa propre discipline** (`LogEntry.entryDiscipline`, optionnel, renseigné
uniquement pour cette vue), puisque `discipline` du sélecteur ('BRICK')
ne suffit plus à savoir quelle pastille ni quelle convention d'allure
afficher — `StatsScreen.tsx::LogRow` calcule `rowDiscipline =
entry.entryDiscipline ?? discipline` pour ne rien changer aux quatre
autres vues.

---

## 23. Paramètres — T6.5, construite et validée le 6 septembre 2026

**Quatre blocs indépendants sur un seul écran de détail
(`DetailRoute.kind: 'settings'`), pas un onglet** — il hérite du chevron
de retour et du titre du chrome commun de `AppNavigator.tsx`, comme
`SessionReviewScreen`/`ProfileScreen`/`ObjectiveScreen`.

### Stockage du thème : aucune nouvelle table

`athlete.themePreference` (`'system'|'light'|'dark'`) est déclarée depuis
la migration `0000`, jamais lue ni écrite jusqu'à cette tranche. La
proposition initiale (une table `app_settings` à une ligne) aurait
dupliqué exactement ce que cette colonne offre déjà — le même schéma
« une seule ligne, mono-utilisateur » que `athlete` porte depuis
l'origine. `planning/profile.ts` (foyer d'écriture déjà établi pour
`athlete`, §18) gagne deux fonctions dédiées, `readThemePreference`/
`writeThemePreference` — séparées de `saveAthleteProfile` : l'écran
Paramètres n'a aucune raison de charger, ni de risquer de réécrire, le
nom, la date de naissance ou les disponibilités pour changer un thème.

### Bootstrap de la préférence au démarrage — contrainte d'ordre de montage

`ThemeProvider` est monté AU-DESSUS de `DatabaseProvider` (il fournit le
thème que `DatabaseProvider` utilise pour ses propres écrans d'attente et
d'échec de migration) — il ne peut donc pas lire `athlete.themePreference`
lui-même, la base n'étant garantie prête qu'après la fin des migrations.
`DatabaseProvider` est le premier point du rendu qui connaît À LA FOIS le
thème (via `useTheme`) et l'état des migrations : c'est là, dans un
`useEffect` déclenché une fois quand `success` passe à vrai, que la
préférence persistée est chargée et appliquée via `setPreference` — déjà
exposée par `ThemeProvider`, aucun changement nécessaire dans ce fichier.
Conséquence acceptée : l'écran de migration (généralement instantané)
s'affiche toujours en thème SYSTÈME, avant que la préférence enregistrée
ne prenne le relais.

### Health Connect : rien de nouveau, `health/client.ts` suffisait déjà

Statut (`ensureInitialized`, `readPermissionState`), relance
(`requestAllPermissions`), lien vers les réglages système
(`openSettings`) — les quatre fonctions existaient déjà, écrites pour
l'ingestion (§4). Paramètres les consomme telles quelles.

### Export et suppression : `settings/appData.ts`, nouveau

Manipule directement le FICHIER SQLite, pas des lignes — sans rapport
avec `planning/profile.ts`. Export : voir §15 pour le piège d'URI
rencontré et corrigé. Suppression : séquence stricte, `sqliteDatabase.
closeAsync()` (ferme ET force un checkpoint WAL, qui fait disparaître les
fichiers annexes `-wal`/`-shm` de lui-même) PUIS `SQLite.
deleteDatabaseAsync(DATABASE_NAME)` — jamais l'inverse, supprimer le
fichier sous une connexion encore ouverte étant le genre d'ordre
d'opérations qui « marche parfois » et corrompt le répertoire WAL les
autres fois. Aucune bibliothèque de relance programmatique n'est
installée (`expo-updates` absent de `package.json`) : après un appel
réussi, l'écran affiche un message invitant à fermer et rouvrir
l'application manuellement, et cesse toute interaction — plus rien dans
la session JS courante ne peut lire ou écrire la base une fois la
connexion fermée.

### Entrée dans l'app : Accueil, pas Statistiques — révisé en cours de tranche

Première implémentation : icône dans `ui/ScreenShell.tsx` (nouveau prop
`action`, bouton rond en coin haut-droit du titre), branchée sur
Statistiques ET Accueil selon la proposition initiale. **Retirée de
Statistiques sur demande explicite de Mathieu** : Paramètres n'a rien à y
faire. `ScreenShell.tsx` est revenu à sa forme d'origine (le prop `action`
n'est plus utilisé nulle part, retiré plutôt que laissé mort).
`screens/HomeScreen.tsx` n'utilise pas `ScreenShell` — l'accueil n'a
jamais eu de ligne de titre, sa première ligne étant le compte à rebours.
L'entrée y est donc un bouton flottant, posé au-dessus du `ScrollView`
plutôt que dans une ligne de titre qui n'existe pas, pour rester visible
pendant le défilement.

### Confirmation de suppression : deux `Alert` au texte différent

PRD §7 demande une « confirmation forte ». Deux `Alert.alert` successifs,
la seconde reformulée plutôt que répétée mot pour mot — répéter la même
question deux fois ne la rend pas plus sérieuse aux yeux de qui la lit
vite, juste plus longue.

---

## 24. Refonte visuelle quasi intégrale — 9 septembre 2026

**Une seule très longue conversation, sur la maquette Claude Design
(`Iron_App__Refonte_dc.html`) et sa spécification d'accompagnement
(`HANDOFF.md`).** Tout écran refondu ou créé utilise les composants v2
déjà posés avant cette session (`ui/Nombre.tsx`, `ui/Picto.tsx`,
`ui/Pastille.tsx`, `theme/tokens.ts`) plutôt que les compat v1
(`ui/DataValue.tsx`, `ui/Icon.tsx`, `ui/SessionChip.tsx`).

**Reconstruction complète** (fichier neuf redonné à chaque fois, jamais un
diff — règle du 30/08 toujours tenue) pour Coach, Statistiques,
Paramètres : les trois avaient une structure trop éloignée de la maquette
pour qu'un patch chirurgical converge sans complexifier le fichier.
**Patch chirurgical** pour tout le reste : `HomeScreen.tsx`,
`CalendarScreen.tsx`, `AppNavigator.tsx`, `SessionReviewScreen.tsx`,
`planning/plannedSessions.ts`, `health/manualEntry.ts`,
`ui/DayFocusView.tsx`, `ui/LoadChart.tsx`, `screens/BlockSheet.tsx`,
`screens/PlannedSessionEditorScreen.tsx`.

### `Pastille.discipline` attend le jeton français, pas la discipline anglaise brute

Voir §15 pour la règle générale et le mécanisme exact du bug
(`tokens.pictos['RUN'] is undefined`). Trouvé sur `CoachScreen.tsx` et
`StatsScreen.tsx`, corrigé partout via `disciplineToken()`
(`ui/discipline.ts`), vérifié depuis sur tous les écrans de cette session.

### Coach — le sélecteur de séances quitte sa feuille séparée

`ui/SessionPickerSheet.tsx` n'est plus utilisé sur cet écran : la liste
des séances à exporter est directement sur l'écran principal, filtrée par
des pastilles de période (1/2/4/8 semaines — 1 semaine et « Tout
sélectionner » sont des ajouts de Mathieu en cours de route, absents de
la maquette). L'aperçu d'import devient une feuille remontante
(`Modal` transparent, grabber) avec des badges de compte par type de
changement. **Limite assumée** : `PreviewItem.label`
(`planning/coachExport.ts`) est déjà un résumé texte complet (discipline
et date pour une séance), pas des champs structurés séparés — chaque
ligne de l'aperçu affiche donc ce label tel quel, sans pastille de
discipline ni colonne de date dédiée.

### Statistiques — l'aperçu global quitte l'en-tête commun, puis y revient partiellement

Suivant la maquette, le bandeau global (« depuis le X · N séances · N
heures », commun aux cinq disciplines) est retiré : chaque discipline
affiche désormais ses propres totaux. **Contradiction découverte avec
Paramètres** : la suppression des données (§23) demande de recopier « le
nombre affiché sur Statistiques », qui n'existe plus sous cette forme
précise. Corrigé a minima par une ligne de total global
(`stats.overview.total`, `loadStatsOverview()`) réintroduite sous le
titre — suffisante pour que le calcul de Paramètres reste juste, mais pas
le traitement visible que Mathieu demande maintenant (voir ETAT.md,
message de lancement, point 2).

### Paramètres — la suppression change de mécanisme, pas seulement d'habillage

Les deux `Alert.alert` successifs du 06/09 (§23) sont remplacés par un
flux ENTIÈREMENT DANS L'ÉCRAN, en deux étapes : l'étape 1 demande de
recopier le nombre total de séances (`loadStatsOverview().sessions`)
avant de pouvoir continuer — un nombre faux, pas une case à cocher, seule
action qui confirme une vraie conscience de ce qui va disparaître. L'étape
2 redemande une confirmation différente (principe déjà en place au 06/09 :
répéter la même question ne la rend pas plus sérieuse). `settings/
appData.ts` (export, suppression) est inchangée — seul l'écran change.
« Dernière lecture » ajoutée sous le statut Health Connect, à partir de
`health/ingest.ts::readSyncState().syncedUntil` — jamais `lastRunAt`, qui
avance à chaque tentative d'ingestion même refusée, alors que `syncedUntil`
n'avance que sur un succès réel (§2, §15).

### Health Connect · état refusé — écran neuf

Explique concrètement ce qui change quand les permissions ne sont pas
accordées : toute séance passe par la saisie manuelle (assise `saisie`),
la forme du jour n'est plus calculée et n'est PAS remplacée par une
valeur de secours, charge/fond/fatigue continuent de se calculer sur les
séances saisies en assise estimée. Relié depuis Paramètres, visible
seulement quand Health Connect n'est pas pleinement accordé — même
fonctions que Paramètres (`ensureInitialized`, `readPermissionState`,
`readSyncState`), aucune nouvelle fonction de lecture.

### Périodisation — écran neuf, découverte d'un ancien écran hors du système de route

Voir §15 pour la règle générale. `screens/PhasesScreen.tsx` (T3.3.a)
était ouvert par un `Modal` local dans `CalendarScreen.tsx`
(`phasesOpen`/`setPhasesOpen`), jamais par `navigation/routes.ts` — ce qui
explique qu'aucun conflit `tsc` n'ait jamais signalé son existence
pendant toute la session, avant que Mathieu ne signale un écran inconnu
ouvert par le glyphe de blocs du Calendrier.

`screens/PeriodizationScreen.tsx` (nouveau) + `screens/PhaseSheet.tsx`
(nouveau, feuille de création/édition) reprennent `planning/
trainingPhases.ts` (`listPhases`/`phaseForDay`/`validatePhase`/
`savePhase`/`deletePhase`, tous inchangés) sous une vraie route
(`{ kind: 'periodization' }`). `CalendarScreen.tsx` pousse désormais cette
route au lieu d'ouvrir l'ancien `Modal`. **`PhasesScreen.tsx` n'a donc plus
aucun appelant — supprimable du projet.** `ui/WeekRow.tsx` et
`ui/DayList.tsx` également, confirmé par une note dans l'en-tête de
`CalendarScreen.tsx` lui-même.

Rendu de la liste, par état du bloc : passé → 50 % d'opacité ; courant →
encadré (`trait.pastille`) sur `fond.surface`, avec sa semaine en cours
(« semaine N sur M ») ; à venir → couleur fixe `#A9A292`, hors palette de
discipline habituelle ; course → `discipline.course`, un seul jour. Le
bloc course est identifié par comparaison de date
(`phase.endDate === race.raceDate`) : `Phase` (le type lu par
`listPhases()`) ne porte pas `raceId`, bien que la colonne existe dans le
schéma de `training_phase`.

L'édition (créer/modifier un bloc) est CONSERVÉE dans le nouvel écran —
`fr.ts` portait déjà tout un jeu de clés `phase.*` pour un formulaire
complet, vestige de l'ancien écran, et rien n'indiquait que Mathieu ait
voulu la retirer plutôt que la capture fournie ne montre simplement l'état
liste. **Non confirmé explicitement.**

### Édition d'une séance réalisée — feuille neuve, `health/manualEntry.ts::updateActualSession`

HANDOFF (fenêtres dérivables) : feuille sur le Bilan, champs de Saisie
manuelle préremplis, éditer une valeur mesurée bascule son assise en
`saisie`. **Un vrai `UPDATE`, jamais un supprimer-puis-recréer** :
`deleteActualSession` (§17 quater, 30/08) nettoie explicitement `feedback`
et `session_link` avant de supprimer la ligne — un supprimer-puis-recréer
aurait donc effacé le RPE et tout rattachement existant à chaque édition,
alors que corriger une durée mal saisie ne doit toucher ni l'un ni
l'autre. `updateActualSession` pose `rawExerciseType: 'manual'` à chaque
appel — c'est ce même champ, posé par `insertOne` pour une saisie
manuelle classique, qui fait qu'une séance porte l'assise `saisie`
ailleurs dans l'app ; l'écrire à chaque édition, y compris sur une séance
venue de Health Connect à l'origine, matérialise le principe pour de bon,
sans retour en arrière possible autrement qu'en resupprimant la séance et
en laissant Health Connect la réingérer.

`garmin_activity_id` (UNIQUE, §3) est recalculé à chaque édition,
puisqu'il dépend des champs modifiés (`synthId`) — contrairement à
`insertOne`, un `UPDATE` ne peut pas s'appuyer sur `onConflictDoNothing`
(réservé à l'insertion). Un conflit avec une AUTRE séance déjà en base est
rendu comme un échec `DUPLICATE` explicite plutôt que de laisser
l'exception SQLite brute remonter jusqu'à l'écran.

### Calendrier — deux bugs corrigés dans `ui/DayFocusView.tsx`

1. **Impossible d'ajouter une deuxième séance le même jour.** Le bouton
   d'ajout (Prévu comme Réalisé) n'apparaissait QUE quand la liste était
   vide (`planned.length === 0 ? <Ajouter> : <Liste>`, jamais les deux).
   Rien dans le domaine ne borne un jour à une séance — c'était un défaut
   de ce fichier, pas une règle. Corrigé : le bouton reste visible sous la
   liste, vide ou non.
2. **Carte Prévu enrichie au niveau du bloc.** Ce fichier notait dans son
   propre en-tête ne jamais avoir reçu `planning/plannedSessions.ts`/
   `planning/blockText.ts`, et ne montrait donc qu'un résumé (titre,
   nombre de blocs, durée) — pas les blocs eux-mêmes, contrairement à
   HANDOFF §8.3. Les deux fichiers étant désormais en main
   (`blockSummary()`), la carte descend au niveau du bloc — rôle en
   chasse fixe à gauche (`ROLE_KEY`, dupliqué depuis
   `PlannedSessionEditorScreen.tsx`), contenu à droite. Blocs de premier
   niveau seulement : un SET se résume à sa propre ligne, ses enfants
   restent le détail de l'éditeur.

Le glyphe de blocs de l'en-tête du Calendrier pointe désormais vers
`periodization` (voir plus haut) au lieu de l'ancien `Modal`.

### Bug de fond corrigé — flash de l'onglet au changement d'écran

`AppNavigator.tsx` redéclenchait l'animation de fondu (`opacity` remise à
0 puis ranimée par `useEffect`) à CHAQUE changement de `detail`, y compris
en se déplaçant DANS une pile déjà ouverte (Profil → Identité), pas
seulement à l'ouverture depuis la racine d'un onglet — l'effet dépendait
de `detail` lui-même, un objet qui change de référence à chaque
navigation dans la pile. Un repaint d'un cadre laissait voir l'onglet
actif en dessous. Corrigé en liant le fondu à `detail !== null` (un
booléen dérivé), jamais à `detail` lui-même : le fondu ne joue plus qu'à
la transition « aucun détail ↔ un détail ».

### Calcul croisé durée ↔ distance — `planning/plannedSessions.ts::estimateDuration`/`estimateDistance`

Signalé par Mathieu sur appareil : une séance planifiée en distance +
allure affichait « 0 min » de durée totale ; une séance en durée + allure
affichait une distance à « — ». Les deux fonctions ignoraient purement et
simplement un bloc dont la mesure ne correspondait pas à ce qu'elles
cherchaient (`estimateDuration` ne comptait qu'un `measure: 'TIME'`,
`estimateDistance` qu'un `measure: 'DISTANCE'`) — un bloc en distance
avec une allure cible ne contribuait JAMAIS à la durée, et réciproquement,
alors que l'allure suffit à déduire l'une de l'autre.

Corrigé par deux fonctions de dérivation partagées
(`absoluteSpeedMs`/`deriveDurationFromPace`/`deriveDistanceFromPace`), qui
ramènent une allure (temps par unité) et une vitesse au même socle — une
vitesse en m/s — avant de dériver la grandeur manquante. **Seulement pour
une cible ABSOLUE** (`relativeTo === null`) : un pourcentage de VMA/CSS/
FTP n'est jamais résolu ici, ça demanderait de lire les zones de
l'athlète depuis une couche de données qui n'a pas à le faire — le bloc
reste alors « non chronométré », comme avant cette session. Signature des
deux fonctions étendue d'un second paramètre optionnel `discipline` (pour
la convention allure/100 m de la natation), rétrocompatible : les deux
call sites connus (`PlannedSessionEditorScreen.tsx`, `metrics/
sessionReview.ts::compareToPlan`) le fournissent désormais, tout autre
appel non modifié continuerait de fonctionner sans cette précision.

### Cible relative affichée en allure calculée — `PlannedSessionEditorScreen.tsx`

Sur demande de Mathieu : une cible en % VMA/CSS/FTP/FCmax affiche
désormais l'allure/puissance/FC équivalente (dernier relevé de zone connu,
`readProfileSnapshot().zones`) plutôt que le pourcentage brut, sur la
ligne de bloc de l'éditeur. **Convention posée cette session, sans
précédent à vérifier dans le code existant** — confirmé en lisant
`planning/blockText.ts` (reçu en cours de session) : `targetDigits`
affiche déjà le pourcentage brut pour toute cible relative, sans jamais
tenter de conversion. La fonctionnalité est donc entièrement nouvelle, pas
la correction d'une formule existante.

Convention retenue : `X %` est toujours lu comme `X %` de la VITESSE (ou
de la puissance, ou de la FC max), jamais du TEMPS — y compris pour la
CSS. La CSS est un pas de temps (secondes par 100 m), mais traitée comme
l'inverse d'une vitesse pour rester cohérente avec la VMA : `90 %` doit
vouloir dire « plus lent » quel que soit le socle choisi, jamais l'inverse
selon qu'on parte d'une vitesse ou d'un temps. `ONE_RM` n'a pas de socle
dans `zone` (pas de 1RM historisé) — une cible relative à `ONE_RM` reste
affichée en pourcentage, faute de valeur à convertir. **À valider sur
l'appareil.**

### Accueil — quatre corrections

- **VMA/CSS, vraie cause enfin trouvée.** Le code testait
  `reading.unit === 'm/s'` pour déclencher la conversion — l'unité
  réellement stockée est `m_s`. La condition ne se déclenchait donc
  jamais, produisant l'affichage brut vu sur appareil. Corrigé avec
  `referenceNumeric()` (`metrics/disciplineStats.ts`), qui convertit par
  nature du socle et non par comparaison de chaîne d'unité — robuste
  quelle que soit l'orthographe exacte de l'unité stockée.
- **Objectif en format `XhXX`** (« 345 min » → « 5h45 ») — un formateur
  dédié à ce seul usage, distinct de celui qui reste en minutes pour la
  séance du jour (une durée courte se lit mieux en minutes).
- **Barème « Forme du jour » colorié en escalier** : tous les crans
  jusqu'au cran courant inclus sont colorés, chacun de sa propre teinte —
  pas seulement le cran courant seul.
- **Légende du graphe de charge** accordée aux nouvelles couleurs de
  `LoadChart.tsx` (voir ci-dessous).

### `LoadChart.tsx` — deuxième exception au principe du budget couleur

§15 : « la couleur est un budget, et un seul élément par écran le
dépense » — Statistiques déjà notée comme exception délibérée. Sur
demande explicite de Mathieu, `ui/LoadChart.tsx` (fond/fatigue en
courbes, fraîcheur en barres divergentes) reçoit une seconde exception :
Fond en `theme.form.steady`, Fatigue en `theme.form.strained`, Fraîcheur
en `theme.form.fresh`/`depleted` selon le signe de chaque barre — la
distinction trait plein/tireté entre fond et fatigue est conservée en
plus de la couleur, deux signaux jamais un seul. Choix fait pour limiter
l'écart : réutilisation de la palette déjà dépensée pour la Forme du jour
de l'Accueil, plutôt qu'ouverture d'une troisième palette isolée.

### Icône de l'application — reconçue à partir de deux SVG fournis par Mathieu

Le pictogramme BRICK généré par Claude le 06/09 (§22) est abandonné.
`icone-app-foreground.svg`/`icone-app-monochrome.svg` (fournis par
Mathieu cette session — jamais reçus avant malgré une mention dans une
passation antérieure) : deux traits, l'un plein l'autre tireté, motif déjà
présent dans l'app pour mesuré/estimé. Rastérisés en PNG 1024×1024 via
`sharp` (déjà disponible dans l'environnement d'exécution de Claude,
aucune installation nécessaire) : premier plan transparent, monochrome,
et une version composée à plat (premier plan sur fond `#E9E3D6`) pour
l'icône de secours. `app.json` modifié directement par Claude cette
session (le fichier a été fourni) : `icon`,
`android.adaptiveIcon.foregroundImage`/`.monochromeImage`/
`.backgroundColor`.

**Aucun des trois PNG n'a été placé dans le projet ni buildé à ce jour** —
seul point technique restant pour la dernière conversation du projet, voir
ETAT.md.

---


## 25. Iron App 2 : web + APK Capacitor (12 octobre 2026)

Cette architecture remplace §1 « Plateforme / Stack / Stockage /
Fabrication / Backend » **pour la nouvelle application seulement**
(`iron-app-web`). L'ancienne app React Native reste décrite par les sections
précédentes.

| Sujet | Iron App 2 |
|---|---|
| Plateformes | Web (PWA) sur PC, iPhone et Android ; APK Android pour la lecture de la montre |
| Stack | TypeScript, React 19, esbuild (même outillage que PEAnalyze), CSS à jetons (`tokens.css`, mêmes noms que PEAnalyze, couleurs Iron App) |
| Stockage | IndexedDB (`ironapp`, store `records` : clé `collection/id`) |
| Synchronisation | Firebase Spark, projet dédié « ironapp ». Chemin Firestore : `users/{uid}/iron_{collection}/{id}`, document `{ data: JSON, updatedAt, deleted }`. La version la plus récente gagne et une suppression laisse une pierre tombale. Règles : `firestore.rules` |
| Calculs | Jamais stockés : `derive(data)` recalcule charges, forme, rattachements et alertes sur chaque appareil (`src/domain/engine.ts`) |
| Rattachement prévu ↔ réalisé | Calculé, non stocké. Seul le choix manuel est enregistré (`ActualSession.manualPlannedId`) |
| APK | Capacitor 7 ; `server.url` pointe vers le site GitHub Pages ; identifiant `com.mathieu.ironapp.v2` ; minSdk 26 ; clé de debug versionnée (`android-shell/keystore`) |
| Health Connect | Module Kotlin `IronHealth` (`androidx.health.connect:connect-client:1.1.0-alpha10`), en lecture seule : `availability`, `permissions`, `requestAccess`, `openSettings`, `readSessions`, `readSleep`, `readResting` |
| Connexion Google dans l'APK | Le WebView est refusé par Google. L'APK ouvre `auth.html` dans un onglet du navigateur, qui renvoie `ironapp://auth#id_token=…`, puis l'app appelle `signInWithCredential` |
| Publication | GitHub Actions : tests, `tsc`, build, Pages, puis APK dans la release `apk` |
| Identifiants | Chaînes numériques croissantes (`newId`) ; ceux de l'ancienne base SQLite sont conservés à la reprise |
| Format coach | `ironapp/1` inchangé ; ajout non bloquant `loadSummary.srpeFactor` |
| Reprise | Lecteur SQLite en TypeScript (`src/domain/sqlite.ts`, sans WAL) et correspondance des tables Drizzle (`src/domain/legacy.ts`) |

Analyse détaillée des calculs : `iron-app-web/docs/ANALYSE.md`.

