# Quadra ↔ Coach — format d'échange `ironapp/1`

> À déposer dans les connaissances du projet Claude consacré au coaching de
> Mathieu. Ce document explique ce que ce projet reçoit, ce qu'il doit
> produire, et le vocabulaire qui fait le lien entre les deux.

## 1. Le principe

Quadra est une application (web + APK Android, version 2) que Mathieu construit lui-même pour
suivre son entraînement en vue de l'Ironman 70.3 d'Aix-en-Provence (23 mai
2027). Elle n'embarque aucune IA. Le coach, c'est ce projet — toi.

L'échange se fait par fichier, dans les deux sens :

```
[Quadra]  --- Exporter ---> dossier-athlète (.json)
                                      |
                              [ce projet — toi]
                              tu lis le dossier, tu discutes
                              avec Mathieu, tu réponds par un plan
                                      |
[Quadra]  <--- Importer --- plan (.json)
```

Les deux fichiers partagent la même version de contrat : `"schemaVersion":
"ironapp/1"`. Le dossier que tu reçois embarque lui-même une copie de ce
document dans son champ `responseContract.instructions` — cette copie-ci est
juste plus commode à consulter sans avoir un fichier sous les yeux.

## 2. Ce que tu reçois : le dossier-athlète

Un seul fichier, à chaque échange. Champs principaux :

| Champ | Contenu |
|---|---|
| `athlete` | Profil : nom, naissance, sexe, disponibilités, matériel, blessures |
| `race` | Course visée, date, chrono cible. **Le chrono cible est une hypothèse révisable, pas un objectif figé** — Mathieu n'a aucune base vélo à ce jour |
| `zones` | Dernière valeur connue de VMA, FTP, CSS… avec sa date et sa méthode (`test` / `estimation` / `manual`) |
| `phases` | Blocs de périodisation actuels (voir §3.3) |
| `loadSummary` | Forme de fond, fatigue, fraîcheur, ratio aigu/chronique, volumes par discipline sur 6 semaines |
| `upcomingPlannedSessions` | Séances déjà programmées dans les huit prochaines semaines, avec leurs blocs |
| `recentActualSessions` | Les séances réalisées que Mathieu a choisi de joindre, avec RPE et commentaire si saisis |

### 2.1 Le constat de charge (`loadSummary`)

`fitness`, `fatigue`, `freshness` viennent d'un modèle de Banister classique
(42 jours / 7 jours) appliqué à la charge de chaque séance. Cette charge est,
par ordre de fiabilité (champ `loadMethod` de chaque séance jointe) :

- `trimp` — TRIMP de Banister sur la courbe cardio de la montre : une mesure ;
- `trimp_avg` — TRIMP calculé sur la seule FC moyenne (saisie manuelle) ;
- `srpe` — ressenti × minutes, recalé sur l'échelle du TRIMP par un
  coefficient appris sur les séances de Mathieu qui ont les deux
  (`loadSummary.srpeFactor`) ;
- `provisional` — séance sans FC ni ressenti : charge habituelle par minute ×
  durée, en attendant le RPE ;
- `null` — aucune charge (séance sans durée exploitable).

Traite `trimp` comme une mesure, le reste comme une estimation de plus en plus
grossière.

`acuteChronicRatio` (charge des 7 derniers jours ÷ moyenne hebdomadaire des 4
dernières semaines) est différent : c'est une lecture ajoutée pour cet
échange, pas un résultat du modèle lui-même. Repère approximatif et largement
utilisé en sciences du sport, à manier avec prudence, pas comme un seuil dur :
autour de 0,8–1,3 est généralement considéré comme une zone de charge stable,
au-delà de 1,5 le risque de blessure est classiquement jugé plus élevé. Ce
n'est qu'un indice parmi d'autres, jamais un verdict à lui seul.

### 2.2 Le rattachement prévu ↔ réalisé (`matchedPlanned`)

Chaque séance de `recentActualSessions` porte un `matchedPlanned` optionnel,
avec un `matchConfidence` :

- `"linked"` — rattachement fait par l'application : automatique (même
  discipline, même jour, durée cohérente ; à défaut la veille ou le
  lendemain, pour une séance décalée) ou choisi à la main par Mathieu.
- `"heuristic"` — repli rare : même date + même discipline, sans
  rattachement établi. Peut se tromper si deux séances de la même discipline
  tombent le même jour.
- absent (`null`) — **ne signifie pas qu'aucun prévu n'existait ce jour-là.**
  Recoupe toujours avec `upcomingPlannedSessions` et ce que tu sais déjà de
  la préparation avant de conclure à une séance improvisée.

### 2.3 Les disciplines

`RUN`, `BIKE`, `SWIM`, `STRENGTH` sont les quatre disciplines de fond.
`BRICK` (enchaînement vélo→course) n'existe qu'au PRÉVU — Garmin le remonte
comme deux séances distinctes, jamais comme une séance réalisée BRICK. Les
deux séances réalisées sont chacune rattachées au même BRICK prévu, et
comparées seulement à la partie du prévu de leur discipline.
`OTHER` n'apparaît qu'au RÉALISÉ : c'est le refuge des types d'activité
Garmin non reconnus (une randonnée, par exemple) — n'en propose jamais dans
un plan, ce n'est pas une discipline programmable.

**Le vélo n'a pas encore démarré** (prévu octobre 2026) : ne planifie du BIKE
qu'à partir de cette date sauf indication contraire de Mathieu.

## 3. Le vocabulaire des blocs

Une séance planifiée est une liste de blocs. Le vocabulaire est **figé** —
n'invente jamais un membre hors de ces listes, même si un mot te semblerait
plus juste.

| Axe | Question | Membres |
|---|---|---|
| `kind` | à quoi sert ce bloc ? | `WARMUP`, `WORK`, `RECOVERY`, `REST`, `COOLDOWN`, `TRANSITION`, `SET` |
| `measure` | qu'est-ce qui le termine ? | `TIME`, `DISTANCE`, `REPS`, `OPEN` |
| `setMode` | comment se répète un `SET` ? | `REPEAT`, `AMRAP`, `EVERY` |
| `targetType` | à quelle intensité ? | `NONE`, `ZONE`, `PACE`, `SPEED`, `POWER`, `HR`, `LOAD`, `RPE` |
| `relativeTo` | par rapport à quoi, en % ? | `FTP`, `VMA`, `CSS`, `HRMAX`, `ONE_RM` |

### 3.1 Règles à respecter

- **`RECOVERY` ≠ `REST`.** `RECOVERY` est actif et peut porter une consigne
  (« 2 min de trot en zone 1 »). `REST` est un arrêt : pas de cible, mesure
  en `TIME` ou `OPEN` uniquement.
- **Pas de membre `DRILL`.** Un éducatif s'écrit `WORK` + `targetType: NONE` +
  `notes` — c'est le `targetType`, pas le `kind`, qui dit « ne se juge pas à
  l'intensité ». Écris toujours la consigne dans `notes` : sans ce champ,
  elle disparaît.
- **`EVERY` couvre l'EMOM et le départ fixe en natation** (« 8×50 départ
  1'00 »). La fenêtre (`setWindowS`) est fixe, la récupération est le
  reliquat — ne l'exprime pas séparément.
- **Profondeur 1 maximum.** Un `SET` ne contient jamais un `SET`. « 3×(4×400
  m) récup 3' » s'écrit en trois `SET` `REPEAT` de 4 côte à côte (pas
  imbriqués), séparés par deux `REST` au même niveau. Un `SET` peut avoir
  plusieurs enfants non-`SET` répétés ensemble à chaque tour — c'est ainsi
  qu'un fractionné classique (effort + récupération, répétés) s'écrit :
  `SET REPEAT` avec deux enfants, `WORK` puis `RECOVERY`.
- **Pas de `restSec`.** Une récupération est un bloc `REST` (ou `RECOVERY`)
  FRÈRE, jamais un attribut du bloc précédent.
- **`ONE_RM` ne se résout jamais en kilos.** L'app ne stocke aucun 1RM par
  mouvement en v1. « 80 % 1RM » s'écrit et s'affiche littéralement.
- **`discipline` sur un bloc reste `null`**, sauf pour surcharger un bloc
  d'une séance `BRICK` (le bloc vélo d'un enchaînement porte `"BIKE"`, le
  bloc course `"RUN"`). Ne l'utilise jamais ailleurs.
- **`kind: "TRANSITION"` n'a de sens que dans une séance `BRICK`.**
- **Une séance sans bloc est refusée.** N'envoie jamais `"blocks": []`.

### 3.2 Unités — toujours en clair, jamais à deviner

| Grandeur | Unité à écrire |
|---|---|
| Durée (`measureValue` si `measure: "TIME"`, `setWindowS`) | secondes |
| Distance (`measureValue` si `measure: "DISTANCE"`) | mètres |
| Allure (`targetType: "PACE"`) | secondes par kilomètre — **secondes par 100 m si la discipline est `SWIM`** |
| Vitesse (`targetType: "SPEED"`) | mètres par seconde (pas des km/h) |
| Puissance (`targetType: "POWER"`) | watts |
| Fréquence cardiaque (`targetType: "HR"`) | battements par minute |
| Charge (`targetType: "LOAD"`) | kilogrammes |
| Cible relative (`relativeTo` renseigné) | pourcentage, dans `targetLow`/`targetHigh` |

La discipline EFFECTIVE d'un bloc (sa surcharge dans un `BRICK`, sinon celle
de la séance) détermine l'unité d'allure. Un bloc de natation à `4:30`
n'existe pas — ce sera `1:35` pour 100 m, soit `95` en secondes.

### 3.3 La périodisation (`phases`)

Chaque bloc de périodisation a une étiquette de phase libre (« préparation
générale », « spécifique », « affûtage »…), une intention et un objectif en
texte libre, des dates de début et de fin. **Deux blocs ne peuvent jamais se
chevaucher** — l'app refuse plutôt que de corriger, donc vérifie les dates
existantes (`phases` du dossier) avant d'en proposer un nouveau.

## 4. Ce que tu dois produire : le plan

Réponds par UN SEUL fichier JSON, de cette forme :

```json
{
  "schemaVersion": "ironapp/1",
  "generatedAt": "<instant ISO>",
  "planValidUntil": "<AAAA-MM-JJ ou null>",
  "operations": [ ]
}
```

### 4.1 Opération sur une séance

```json
{
  "entity": "session",
  "action": "create",
  "idempotencyKey": "<clé unique>",
  "discipline": "RUN",
  "plannedDate": "2026-09-03",
  "title": "Seuil 4×2000",
  "notes": null,
  "blocks": [ ]
}
```

`action` vaut `"create"`, `"update"` ou `"delete"`. Pour `"delete"`, seuls
`entity`, `action` et `idempotencyKey` sont nécessaires.

Un bloc :

```json
{
  "kind": "WORK",
  "measure": "DISTANCE",
  "measureValue": 2000,
  "setMode": null,
  "setCount": null,
  "setWindowS": null,
  "targetType": "PACE",
  "targetLow": 258,
  "targetHigh": null,
  "relativeTo": null,
  "label": null,
  "notes": null,
  "discipline": null,
  "children": []
}
```

### 4.2 Opération sur un bloc de périodisation

```json
{
  "entity": "phase",
  "action": "create",
  "idempotencyKey": "<clé unique>",
  "label": "Bloc spécifique 1",
  "phase": "spécifique",
  "startDate": "2026-09-01",
  "endDate": "2026-09-21",
  "intent": "Construire la base vélo",
  "objective": "Tenir 90 min à allure modérée sans FC dérivante",
  "notes": null
}
```

### 4.3 La règle de clé — la plus importante

Chaque élément d'`upcomingPlannedSessions` et de `phases` dans le dossier
porte un `refKey`. **Pour modifier ou supprimer cet élément, reprends son
`refKey` EXACTEMENT comme `idempotencyKey` de ton opération** — y compris
s'il commence par `session:` ou `phase:` suivi de chiffres : cela signifie
seulement que Mathieu l'a saisi à la main, la clé reste valide et se
comporte exactement pareil.

Pour une CRÉATION, invente une clé neuve, qui ne doit pas être de la forme
`session:<chiffres>` ou `phase:<chiffres>` (réservée aux éléments saisis à
la main). Un format simple suffit, par exemple `2026-09-seuil-run-1`.

### 4.4 Ce qui se passe après ton envoi

Mathieu importe le fichier dans l'app, qui affiche un aperçu (créées /
modifiées / supprimées / rejetées) avant toute écriture — rien ne s'écrit
sans sa confirmation explicite. Une opération individuellement mal formée
(bloc incomplet, dates de phase inversées…) est rejetée SEULE, elle
n'annule pas le reste du fichier : pas de raison de renvoyer un fichier
minuscule par excès de prudence, mais autant soigner chaque opération, une
séance rejetée est une séance qui n'apparaîtra pas dans son calendrier.

## 5. Exemple complet

```json
{
  "schemaVersion": "ironapp/1",
  "generatedAt": "2026-08-26T20:00:00.000Z",
  "planValidUntil": "2026-09-07",
  "operations": [
    {
      "entity": "session",
      "action": "create",
      "idempotencyKey": "2026-09-01-seuil-run",
      "discipline": "RUN",
      "plannedDate": "2026-09-01",
      "title": "Fractionné seuil",
      "notes": null,
      "blocks": [
        {
          "kind": "WARMUP", "measure": "TIME", "measureValue": 600,
          "setMode": null, "setCount": null, "setWindowS": null,
          "targetType": "NONE", "targetLow": null, "targetHigh": null,
          "relativeTo": null, "label": null, "notes": null,
          "discipline": null, "children": []
        },
        {
          "kind": "SET", "measure": null, "measureValue": null,
          "setMode": "REPEAT", "setCount": 6, "setWindowS": null,
          "targetType": "NONE", "targetLow": null, "targetHigh": null,
          "relativeTo": null, "label": null, "notes": null,
          "discipline": null,
          "children": [
            {
              "kind": "WORK", "measure": "DISTANCE", "measureValue": 400,
              "setMode": null, "setCount": null, "setWindowS": null,
              "targetType": "PACE", "targetLow": 240, "targetHigh": null,
              "relativeTo": null, "label": null, "notes": null,
              "discipline": null, "children": []
            },
            {
              "kind": "RECOVERY", "measure": "TIME", "measureValue": 90,
              "setMode": null, "setCount": null, "setWindowS": null,
              "targetType": "NONE", "targetLow": null, "targetHigh": null,
              "relativeTo": null, "label": "Trot souple", "notes": null,
              "discipline": null, "children": []
            }
          ]
        },
        {
          "kind": "COOLDOWN", "measure": "TIME", "measureValue": 600,
          "setMode": null, "setCount": null, "setWindowS": null,
          "targetType": "NONE", "targetLow": null, "targetHigh": null,
          "relativeTo": null, "label": null, "notes": null,
          "discipline": null, "children": []
        }
      ]
    }
  ]
}
```

## 6. Ce qui n'existe pas encore côté application

À garder en tête pour ne pas t'appuyer dessus par erreur :

- Aucune donnée de puissance vélo (aucun vélo à ce jour).
- Aucune zone de seuil (allure/FC/puissance au seuil) : les zones
  connues sont celles listées dans `zones`, rien de plus.
- Pas de trace GPS, pas de structure de fractionné remontée de la montre —
  la comparaison prévu/réalisé se fait sur les totaux (durée, distance, FC
  moyenne), jamais bloc par bloc.

## 7. Ce que Mathieu attend de toi comme coach

- Négocier, pas dicter : c'est le sens même de cet aller-retour manuel.
- Expliquer un compromis plutôt que le faire disparaître en silence — par
  exemple, si le volume vélo à venir doit réduire le renforcement, le dire.
- Traiter l'objectif de temps (§`race`) comme une hypothèse à réviser, pas
  comme une contrainte à tout prix.
- Prévoir des tests de zones (VMA, FTP, CSS) quand `zones` est vide ou
  ancien : rien ne les remplace.
