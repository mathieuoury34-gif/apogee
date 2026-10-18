# PRD — Apogée

**Version** 2.0 (réécriture complète)
**Date** 16 octobre 2026
**Porteur produit** Mathieu (il décide et valide ; Claude écrit le code)
**Statut** Produit livré et en usage quotidien. Ce document décrit l'application **telle qu'elle est** et conserve
toutes les décisions de produit prises depuis le début, y compris celles de l'ancienne version React Native
(archivée dans `HISTORIQUE-RN.md`). Il est écrit pour qu'on puisse **refaire l'application de zéro** sans rien
perdre : lire d'abord ce PRD, puis `SPECS-TECH.md` (comment c'est construit), `GUIDE-REPRISE.md` (par où
recommencer, comptes, étapes) et `ETAT.md` (où en est le projet).

> **Ce qui change par rapport au PRD 1.4 (septembre 2026).** L'application s'appelait *Iron App* (React Native,
> Android seulement, 100 % locale), puis *Quadra*, et s'appelle désormais **Apogée**. Mathieu a demandé le
> 12/10/2026 une reconstruction sur le modèle de PEAnalyze : **une application web installable (PC, iPhone,
> Android) synchronisée par compte Google, plus un APK Android** qui lit la montre Garmin via Health Connect.
> Trois contraintes verrouillées du PRD 1.4 sont donc **levées à la demande explicite de Mathieu** (§3).

---

## 1. Contexte

Mathieu prépare un **half Ironman (Ironman 70.3 d'Aix-en-Provence, 23 mai 2027)** : 1,9 km de natation,
90 km de vélo, 21,1 km de course. Il cherchait un outil pour programmer, suivre et analyser son entraînement
multi-disciplines. Garmin Connect enregistre bien les performances mais ne permet ni de programmer un plan de
façon ergonomique ni de bénéficier de plans adaptables. Les solutions concurrentes (Humango, Athletica, TriDot,
TrainingPeaks, iDO) sont payantes ou incomplètes. Le choix : construire un outil **personnel, gratuit et taillé au
besoin**.

**Objectif du projet** : avoir l'application *et* la construire soi-même, de façon qu'elle reste maintenable et
refaisable. L'app n'est plus décrite comme « triathlon » mais **« multisport »** (décision du 16/10/2026).

## 2. Utilisateur

Un seul utilisateur : Mathieu (partage éventuel à quelques amis plus tard, sans que ce soit un objectif).

### Profil sportif (état connu au 21/08/2026, à relire dans l'app pour les valeurs actuelles)

| Discipline | Volume |
|---|---|
| Natation | 2 séances / semaine, 1700–1800 m, ~45 min |
| Course | 3 sorties / semaine dont 1 fractionné et 1 sortie longue |
| Renforcement | 3 séances / semaine (push / pull / legs) |
| Vélo | Démarrage en octobre 2026 ; puissance à re-sonder en octobre 2026 |

- Objectif chrono annoncé **5h45** (≈ 38 min natation / 3h05 vélo à 29 km/h / 1h50 course, transitions
  comprises) : **ambitieux, à traiter comme une hypothèse révisable**, jamais comme un fait.
- Montre : **Garmin Fenix 7S Pro Sapphire Solar** (capteur optique, HRV, séances structurées).
- Vie instable : déménagement, GR20 (10 jours de bivouac), stage à la TUM (sud de Munich).
- Arbitrage de charge à expliquer par le coach : 8 séances/semaine aujourd'hui, 10–11 avec le vélo, intenable ;
  le renforcement descend à 2 puis 1 séance en entretien. **Le coach doit expliquer ce compromis plutôt que
  supprimer des séances en silence.**

## 3. Contraintes structurantes

| Contrainte | Décision actuelle | Historique |
|---|---|---|
| Plateformes | **Web installable (PC Chrome/Edge, iPhone Safari « Sur l'écran d'accueil », Android) + APK Android** | PRD 1.4 : Android seulement. **Levé le 12/10/2026 à la demande de Mathieu** (PWA = pas de licence Apple, 0 €) |
| Stack | **TypeScript, React 19, esbuild**, PWA ; coque **Capacitor 7** + module Kotlin pour l'APK | PRD 1.4 : React Native / Expo. **Levé le 12/10/2026** |
| Données | **Local d'abord** (IndexedDB) + **synchronisation Firebase gratuite** (Firestore, connexion Google), fonctionne 100 % hors synchronisation tant que Firebase n'est pas configuré | PRD 1.4 : « aucun backend, 100 % local ». **Levé le 12/10/2026** |
| Coût | **0 €/mois**, sans exception (GitHub Pages, GitHub Actions, Firebase Spark sans carte bancaire) | inchangé |
| Maintenance | 0 h/semaine une fois rodé | inchangé |
| Langues | **Français + anglais** (Paramètres › Langue) | PRD 1.4 : français seul. **Anglais ajouté le 12/10/2026 à la demande de Mathieu** |
| Données antérieures | Aucune mise à jour ne doit détruire de données : sauvegardes versionnées, anciens noms de formats toujours acceptés, migrations sans perte des clés de stockage | inchangé |
| Lecture de la montre | **Android seulement** (Health Connect). Sur PC et iPhone, les séances arrivent par la synchronisation depuis le téléphone Android | inchangé |

Ajouts hors périmètre MVP d'origine, **demandés explicitement par Mathieu et acceptés** : application web + iPhone +
PC, synchronisation Firebase, anglais, écran Aide (mode d'emploi), sous-sports de « Autre » (50 pictogrammes),
titres libres de séances réalisées, export Excel, écran de démarrage animé, nouveau nom et logo.

## 4. Acquisition des données

**L'API Garmin Connect est inaccessible** (réservée aux entités légales ; agrégateurs payants dès 499 $/mois).
**Chemin retenu : Health Connect** (Android), alimenté par Garmin Connect : séances, courbe de fréquence
cardiaque, vitesse, distance, calories, dénivelé, sommeil, FC de repos. Gratuit, libre-service. Hypothèse
vérifiée par une sonde en août 2026 (verdict GO NOMINAL).

Ce qui n'est **pas** possible et ne sera pas reproduit : Body Battery, Training Readiness, Training Load, Recovery
Time (enfermés chez Garmin) ; export automatique des séances vers la montre (API Training bloquée : l'utilisateur
resaisit la séance dans Garmin Connect). Piste à explorer plus tard, hors MVP : génération de fichiers `.FIT`.

**Saisie manuelle permanente** (une séance, ou un lot collé, côté réalisé comme côté prévu) pour l'historique
antérieur à Health Connect et les séances sans montre. **La valeur saisie fait foi** : tout champ d'une séance de la
montre peut être corrigé à la main (il est alors marqué « saisi », souligné, et la lecture suivante ne l'écrase pas).

Risque connu : si l'APK n'est pas ouvert pendant longtemps, Health Connect garde l'historique côté Android
(400 jours relus à la première lecture avec l'autorisation « historique »), mais un trou long peut manquer.
Une lecture recouvre toujours les 48 dernières heures (Garmin dépose parfois en retard).

## 5. Métriques calculées (toutes explicables, jamais cachées)

Principe : **rien de calculé n'est stocké** ; chaque appareil recalcule à l'identique à partir des mêmes données.
Aucun nombre sans sa méthode : les valeurs estimées sont **soulignées en pointillés** avec la raison.

| Métrique | Approche | Fiabilité affichée |
|---|---|---|
| Charge par séance | TRIMP de Banister sur la courbe cardio ; à défaut TRIMP sur FC moyenne ; à défaut ressenti × durée recalé sur l'échelle du TRIMP ; à défaut charge provisoire | mesurée / estimée / saisie |
| Forme de fond, fatigue, fraîcheur | Modèle impulsion-réponse de Banister (constantes de temps 42 j et 7 j) | solide |
| Rapport aigu/chronique (ACWR) | charge des 7 derniers jours ÷ moyenne hebdomadaire des 28 jours ; calculé seulement après 28 jours d'historique ; alerte au-delà de 1,5 | repère, jamais un verdict |
| Forme du jour | composite sommeil / FC de repos / fraîcheur au réveil / RPE de la veille, 5 paliers (Épuisé, Entamé, Correct, Disponible, Frais) | approximatif mais transparent (chaque composante, son poids, sa valeur habituelle) |
| Dérive cardiaque | écart de FC moyenne entre 2ᵉ et 1ʳᵉ moitié ; interprétée seulement si l'effort est continu | conditionnelle |
| Verdict de séance | écart au plan (±10 %) sinon rapport aux habitudes (médiane 8 semaines, même discipline) | factuel |

Les valeurs n'ont pas la même échelle que Garmin. Valeurs exactes des constantes : `SPECS-TECH.md` §7.

**Zones physiologiques (VMA, FTP, CSS, FC max)** : historisées (une ligne par mesure, jamais écrasée), chaque saisie
porte **obligatoirement** sa source (test / estimation / manuel), sans défaut. Une FC max déclarée l'emporte
toujours sur la formule de Tanaka ; un pic soutenu observé ne la relève qu'au-delà de 2 bpm.

## 6. Le coach

**Pas d'IA embarquée.** Le coach est Claude, dans un projet dédié, hors de l'app. Aller-retour **par fichier** :

```
[Apogée] --- Exporter ---> dossier-athlète (.json, schemaVersion "apogee/1")
                                  |
                       [Projet Claude de coaching]
                       discussion, négociation du plan
                                  |
[Apogée] <--- Importer --- plan (.json) → aperçu des changements → confirmation
```

- Format **`apogee/1`** (anciens noms `quadra/1` et `ironapp/1` toujours acceptés). Contrat complet :
  `docs/coach-context-apogee-1.md`, aussi embarqué dans le dossier exporté (`responseContract.instructions`).
- Le dossier porte : profil, course, zones, phases de périodisation, constat de charge (`loadSummary`),
  séances prévues sur 8 semaines (avec statut faite/manquée pour les jours passés et marque
  `editedByAthleteAt` si Mathieu les a modifiées), séances réalisées **choisies** (cases à cocher, raccourcis
  1/2/4/8 semaines) avec RPE, commentaire, titre, rattachement (`matchConfidence`).
- Chaque élément exporté porte une clé `refKey` (`session:<n>` / `phase:<n>`) que le coach reprend pour modifier
  ou supprimer. Les clés des anciennes séances restent valides.
- **L'import n'écrit jamais en aveugle** : validation de schéma, aperçu (créées / modifiées / supprimées /
  rejetées / sans effet), confirmation ou annulation. **Une opération invalide n'invalide pas tout le fichier.**
  Un plan déjà importé est signalé (empreinte) mais peut être réappliqué (recrée les séances supprimées depuis).
  Les chevauchements de blocs de périodisation sont vérifiés **après** import, dans l'ordre du fichier.
- Le vocabulaire de blocs est **figé** (`SPECS-TECH.md` §5). Le bloc « ajustement proposé » est **définitivement
  écarté** (impossible à fiabiliser). Le coach est un module remplaçable (un futur mode conversationnel avec clé API
  doit pouvoir s'ajouter sans réarchitecture).
- Analyse automatique (sans IA) : écart prévu/réalisé, dérive cardiaque, évolution de charge, alertes de période.
- Rappels (APK) : voir §7 point 11.

## 7. Périmètre MVP (livré)

### Disciplines
Quatre disciplines de fond : **RUN, BIKE, SWIM, STRENGTH** (le CrossFit vit dans STRENGTH).
**BRICK** (enchaînement) n'existe qu'au **prévu** ; **OTHER** n'existe qu'au **réalisé** (randonnée, marche, kayak,
yoga… avec un sous-sport purement visuel parmi 50 pictogrammes, sans effet sur les calculs).
Un enchaînement réalisé sans avoir été planifié comme BRICK peut être détecté (deux séances RUN/BIKE/SWIM le même
jour) et proposé depuis le bilan ; le refus est mémorisé.

### Écrans et fonctionnalités
Navigation : 5 onglets (Accueil, Calendrier, Séances, Progression, Coach) ; barre latérale sur ordinateur.
Thèmes clair et sombre. Annuler proposé après toute suppression, modification ou reprise.

1. **Accueil** — compte à rebours de la course ; forme du jour (indicateur unique) ; séance du jour actionnable ;
   semaine en pastilles ; courbe de charge ; dernière séance et son verdict ; carte d'alertes ; carte de bienvenue
   (connexion Google, reprise de l'ancienne base). *Principe : le matin, deux réponses — suis-je frais ? je fais quoi ?*
2. **Calendrier** — semaine et mois (balayage gauche/droite, la période consultée reste dans l'adresse) ;
   séance prévue (détail au niveau du bloc) ; **éditeur de blocs** (glisser-déposer entre séries, duplication
   d'un bloc/série, couleurs par type, nom du bloc, intensité) ; **appui long** sur une séance (dupliquer vers un
   autre jour, déplacer, modifier, supprimer ; titre, bilan, dupliquer le prévu lié pour une séance réalisée) ;
   **réutilisation** : copier une semaine vers une autre, semaines types et **séances favorites** (collection
   `templates`, écran Séances types), « Ajouter aux favoris » depuis l'appui long ; **export .FIT** d'une séance
   prévue pour la montre (voir 13) ;
   **périodisation** (blocs datés : passés / courant / à venir / course ; création et édition ; jamais de
   chevauchement) ; bandeau d'interruption.
3. **Séances** — journal ; **bilan de séance** (prévu vs réalisé, verdict, dérive, courbe cardio, ressenti RPE 1–10
   + commentaire, titre, rattachement manuel ±3 jours ou « n'était pas prévue », « revenir à l'automatique »,
   proposition BRICK) ; **saisie** unique ou en lot (fait / prévu) ; **édition** d'une séance réalisée ; suppression ;
   **statistiques par discipline** (volumes, allures, tendance de la référence VMA/CSS/FTP, bilan global en carte
   héro, bouton « Inclure Autre » éteint par défaut) ; **recherche** (titre, commentaire, discipline) et **période**
   (4 semaines, 3 mois, 1 an, tout) dans le journal.
4. **Progression** — charge (trois graphiques légendés : forme de fond + fatigue / charge du jour / fraîcheur ;
   lecture du jour touché ; 1 sem. / 2 sem. …) ; ACWR détaillé (aiguë, chronique, jour dominant) ; forme du jour
   détaillée ; **objectif** (décomposition manuelle du chrono cible par discipline, confrontée à VMA/CSS/FTP,
   **aucun verdict de faisabilité**, vélo non comparable à la FTP et dit en toutes lettres) ; **zones** et journal
   des relevés ; **prévisionnel de charge** (forme, fatigue, fraîcheur, ACWR projetés si tout le plan est fait) ;
   **estimations suggérées** de VMA, CSS, FTP (jamais appliquées sans « Adopter ») ; onglet **Analyse** (voir 13).
5. **Coach** — export (sélection de séances), import avec aperçu, journal des échanges.
6. **Paramètres** (ordre) — Compte et synchronisation, Montre (Health Connect : état, autorisations, diagnostic,
   lecture), Thème, Langue, Athlète (profil, indicateurs, course objectif, périodisation, interruptions), Données (export Excel,
   sauvegarde `.json`, restauration/complément `.json`), À propos (suppression des données en deux étapes : recopier le
   nombre de séances, puis confirmer), Aide,
   Calculs (charge provisoire, heure des rappels). La reprise de l'ancienne base `.db` se fait depuis la
   carte de bienvenue de l'Accueil (affichée tant qu'aucune séance n'existe).
7. **Aide** (Paramètres › Aide) — mode d'emploi complet FR/EN avec recherche, 18 rubriques, lien de téléchargement
   de l'APK. Les chiffres du texte doivent rester alignés sur `src/domain` (à relire à chaque changement de calcul).
8. **Interruptions** — période d'indisponibilité (blessure, voyage, charge externe, autre) avec charge forfaitaire
   optionnelle et suspension optionnelle des rappels. Jamais deux interruptions qui se chevauchent. **Aucune séance
   planifiée n'est modifiée** par une interruption (interprétation étroite de « replanification autour »,
   jamais recontrôlée avec Mathieu).
9. **Exports** — Excel (6 onglets : Tableau de bord, Séances, Plan, Charge, Zones, Périodisation, avec formules et
   graphiques) ; sauvegarde JSON complète ; dossier coach.
10. **Reprise** — import de la base SQLite de l'ancienne application (identifiants conservés) et du dossier coach
    de l'ancienne app (complète sans doublon).
11. **Rappels (APK)** — quatre comportements, à 7 h locale par défaut (réglable) : rappel de séance (3 jours
    glissants), plan bientôt à échéance (3 jours avant), plan échu (relance hebdomadaire après 7 jours),
    suspension pendant une interruption. Ton neutre, jamais culpabilisant. **Jamais observés en conditions
    réelles à ce jour.**
12. **Démarrage** — écran de lancement animé (trois lunes), minimum 1,7 s, identique PC / téléphone, écran natif
    de l'APK maintenu jusqu'au premier dessin de la page.
13. **Analyse** (Progression › Analyse, ajout du 17/10/2026 sur sélection de Mathieu) — bilan de semaine (sans bouton de
    copie : le coach s'en charge) ; respect du plan (3 dernières semaines et 3 derniers mois, colorés ; temps réalisé / prévu) ; temps par zone de FC et répartition
    facile / soutenue / intense (repère 80/20) ; forme de fond par discipline ; tendance d'efficacité (course et vélo, dès 2 séances
    comparables) ; records de course, vélo, natation ; **poids** (moyenne 7 jours, saisie manuelle ;
    Health Connect seulement si une balance connectée l'y dépose) ;
    **sommeil** (durée réellement endormie avec l'APK à jour, heure de coucher, régularité) ; enchaînements vélo → course.
14. **Retiré le 17/10/2026 (décision de Mathieu)** — puissance vélo (records, FTP suggérée, W/kg, efficacité en W/bpm),
    variabilité cardiaque dans la forme du jour et tracé GPS / altitude : la liste « Data and access » de Garmin Connect
    dans Health Connect ne contient ni puissance, ni variabilité, ni poids, et l'app a constaté qu'aucun tracé n'y était
    déposé pour la séance testée. Ces fonctions n'avaient donc rien à lire et ont été supprimées. Restent : le poids
    (saisie à la main) et le sommeil (lecture).

### Écartés (définitivement, ne pas reproposer)
Import de fichiers `.FIT` / `.GPX` d'une sortie (puissance, tracé GPS) — refusé le 17/10/2026 ; Écran de connexion au premier lancement (retiré : la connexion Google se fait depuis Paramètres › Compte ou la
carte de bienvenue) ; écran de premier lancement ; détail d'un bloc pour une séance réalisée (elle n'a pas de
structure de blocs) ; bloc « ajustement proposé » du Coach ; verdict de faisabilité de l'objectif ;
pourcentage type pour répartir le chrono cible ; vue MOIS du calendrier **croisé** de l'ancienne app (le mois
existe aujourd'hui dans le Calendrier d'Apogée, c'est une autre construction).

## 8. Hors périmètre (à ne pas construire sans le signaler)

Réseau social façon Strava ; multi-utilisateur ; application iOS native ; envoi **automatique** vers la montre
(l'export `.FIT` existe depuis le 17/10, mais le fichier se copie à la main) ; carte avec fond de plan (aucun service
de cartographie) ; coach conversationnel embarqué ; nutrition, hydratation, plan de pacing du jour J ;
résolution de `ONE_RM` en kilos (aucun 1RM stocké) ; lecture de la montre sur iPhone.

## 9. Marque et design

- **Nom : Apogée** (définitif, décision de Mathieu du 16/10/2026). Chronologie : Iron App → Quadra (16/10 matin)
  → Apogée (16/10 soir).
- **Logo : trois lunes qui montent en diagonale** (croissant, demi-lune, pleine lune ambrée), issu de Claude Design
  (projet « design logo »). Fond encre `#16181B`, lunes `#ECE8E0`, pleine lune `#F0A61E` (version claire de la
  pleine lune : `#9A6B12`). Logotype en serif (Cormorant Garamond 600) dans le menu latéral. Brief de départ :
  `docs/brief-design-nom-logo.md`.
- **Système de design** repris de PEAnalyze (même typographie Montserrat + Open Sans, mêmes icônes, fenêtres,
  navigation, rayons, ombres, espacements) avec **les couleurs d'Apogée** : papier chaud `#FBFAF7`, encre presque
  noire comme couleur d'action, couleurs de discipline (RUN rouille, BIKE ocre, SWIM bleu-vert, STRENGTH violet,
  BRICK prune, OTHER gris) et rampe de forme du jour. Tout passe par `src/styles/tokens.css` (coût de changement
  faible).
- **La couleur est un budget** : un seul élément par écran la « dépense » (exceptions assumées : Statistiques, les
  trois graphiques de charge).

## 10. Décisions de produit (journal condensé)

**Calcul**
- Sélection de la FC max : déclarée > pic soutenu (≥ +2 bpm, plafond 210) > Tanaka (12/10).
- Charge provisoire pour une séance sans cardio ni RPE (désactivable) — jamais pour « Autre », jamais sous un forfait
  d'interruption (12/10).
- Forme du jour : fraîcheur **au réveil**, référence sur les 14 jours **précédents** (12/10).
- Une seule règle de verdict (plan sinon habitudes) ; dérive uniquement pour un effort continu.
- OTHER exclu du total de Statistiques (toggle « Inclure Autre ») mais sa charge compte dans la forme (06/09).
- Rattachement prévu ↔ réalisé **recalculé**, jamais stocké ; seul le choix manuel est enregistré (12/10).
- Renforcement : ni distance ni allure affichées (artefacts de la montre) (12/10).
- Un `X %` de cible relative est un % de la **vitesse** (ou puissance, ou FC max), jamais du temps, CSS comprise (09/09).

**Produit**
- Chrono cible : édité uniquement sur l'écran Objectif ; décomposition manuelle ; pas de verdict (31/08).
- Zones : source obligatoire sans défaut (31/08).
- BRICK spontané : détection et proposition depuis le bilan, refus mémorisé (06/09).
- Pas d'écran de connexion au premier lancement (12/10). Profil accessible par Paramètres › Athlète (12/10).
- Sous-sports d'« Autre » visuels uniquement ; titres libres sans effet de calcul ; l'ancien choix de sport pour
  « Autre » est remplacé par le champ titre (16/10).
- Appui long = menu contextuel d'une séance (16/10).
- Écran de démarrage : fond encre visible au moins pendant l'animation (16/10).

**17/10/2026 — sélection de Mathieu (19 améliorations, livrées en cinq lots)**
- Cache de l'analyse cardiaque par série (recalcul ≈ 5× plus rapide) ; textes corrigés ; recherche et période dans le journal.
- Analyse : respect du plan, zones de FC (80/20), forme par discipline, records, efficacité, bilan de semaine,
  enchaînements vélo → course, prévisionnel de charge, estimations VMA / CSS, alerte blessure.
- Réutilisation : copier une semaine, semaines types, séances favorites.
- APK : poids (saisie à la main) et sommeil (lecture). Puissance vélo, variabilité cardiaque et tracé GPS livrés puis **retirés** le jour même (Garmin ne les envoie pas à Health Connect).
- Export `.FIT` des séances prévues (entraînement structuré, copie manuelle par USB).
- Écarté pour l'instant : fond de carte (aucun service externe), envoi automatique vers la montre.

**Plateforme**
- Web + APK, Firebase Spark, anglais, Aide (12/10) ; nouveau projet Firebase `apogee-d171c` (16/10).

## 11. Risques et points ouverts

| Sujet | État au 16/10/2026 |
|---|---|
| Atténuation du rapport aigu/chronique pour les très longues séances (GR20 : charge jusqu'à ~1 200/jour) | **Non décidée.** Cause probable de l'écart avec Garmin (0,26 vs 2,1) : très longues sorties qui gonflent la chronique + échelle de charge différente de l'EPOC. Piste : rendements décroissants du ressenti sur les très longues séances |
| Quatre rappels (APK) jamais vus se déclencher | À observer en usage réel |
| Interruptions (ancienne T6.3) jamais formellement confirmées sur appareil | Technique complète, testée côté web |
| Puissance vélo, variabilité cardiaque, tracé GPS | **Retirés le 17/10** : Garmin Connect ne les transmet pas à Health Connect. Un import de fichier `.FIT` / `.GPX` les rendrait possibles ; Mathieu a refusé de l'ajouter (17/10) : ne pas reproposer |
| Fichiers `.FIT` | Structure vérifiée par un lecteur indépendant (CRC, en-têtes, étapes) ; **jamais ouverts sur la Fenix 7S Pro** : à tester avec une séance simple |
| APK sans mode hors ligne (il charge le site à distance) | Limite connue. Option : embarquer l'app dans l'APK (non faite ; imposerait de réinstaller à chaque mise à jour) |
| Ancien projet Firebase `ironapp-99f99` | À supprimer vers le 23/10/2026 après vérification |
| Objectif 5h45 | Outil de confrontation livré ; la révision reste à la discrétion de Mathieu |
| Indisponibilité du développeur | Découpage en tranches courtes ; documentation complète (ce dossier) |
| Appui long / glisser / balayage dans l'éditeur | Vérifiés par captures et types ; pas de confirmation explicite sur téléphone |
