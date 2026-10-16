# Nom et logo d'Apogée — résultat retenu et brief d'origine

## Résultat retenu (décision de Mathieu, 16 octobre 2026)

- **Nom : Apogée.** Chronologie : Iron App → Quadra (provisoire, le matin du 16/10) → Apogée (le soir du 16/10).
  Le nom ne cite ni le triathlon ni l'Ironman : l'app se décrit comme **multisport**.
- **Logo : trois lunes qui montent en diagonale** — un croissant, une demi-lune, une pleine lune ambrée (le sommet,
  l'« apogée »). Issu de Claude Design (projet « design logo »).
- **Couleurs du logo** : fond encre `#16181B` ; lunes `#ECE8E0` ; pleine lune `#F0A61E` (sur fond clair : `#9A6B12`) ;
  fond d'icône sur papier `#E9E3D6`.
- **Logotype** : serif, Cormorant Garamond 600 (menu latéral). Le reste de l'interface reste en Montserrat (titres,
  chiffres) et Open Sans (texte), inchangé.
- **Icônes** : générées par `tools/icons.py` (rendu Chromium/Playwright) → `public/icons/` (favicon 32, apple-touch 180,
  192/512, maskable 192/512) et `android-shell/res/` (lanceur, rond, premier plan adaptatif à 52 %, icône de
  notification monochrome `ic_stat_apogee`). Le trait des contours s'épaissit quand l'icône rapetisse (1,8 → 5,5).
- **Écran de démarrage** : mêmes trois lunes en SVG séparés, qui apparaissent l'une après l'autre (délais 0,1 / 0,35 /
  0,6 s, 0,7 s chacune), lueur ambrée autour de la pleine lune ; 1,7 s minimum ; fond encre. Code : `index.html`.
- **Ancien logo** (anneau de quatre arcs, une couleur par discipline) : abandonné.
- Les couleurs de discipline de l'interface sont celles du tableau ci-dessous (colonne « Clair » / « Sombre »).

Le brief d'origine, conservé tel quel ci-dessous, parle encore de « Quadra » et de l'anneau de quatre arcs.

---

# Brief d'origine (archive)

> Archive : ce brief a servi à choisir le nom et le logo (résultat : Apogée, trois lunes qui montent). Il parle encore de « Quadra », le nom provisoire d’alors.

> Mode d'emploi : copie tout ce qui suit la ligne « ===== DÉBUT DU BRIEF ===== » dans Claude Design.
> Joins si possible 2 ou 3 captures de l'app (accueil, éditeur de séance, courbes de charge).

===== DÉBUT DU BRIEF =====

## Ce que je te demande

Je construis une application personnelle de suivi d'entraînement d'endurance. Je n'ai besoin que de deux choses :
un **nom** et un **logo**. Le nom provisoire est « Quadra » et je ne suis pas sûr de moi.

**Hors périmètre : ne retouche ni les couleurs de l'interface, ni la typographie, ni la mise en page.** Elles sont
décidées et validées. Elles figurent plus bas uniquement pour que le logo s'y accorde.

À rendre :
1. **Trois directions** distinctes. Chacune comprend le nom, le logo (symbole), le logotype (le nom écrit), l'icône
   d'application (carrée et arrondie) et une phrase d'intention.
2. Pour la direction que tu recommandes : l'icône à 48 px, 96 px et 512 px, le logo sur fond clair et sur fond sombre,
   et une version monochrome (silhouette blanche sur fond transparent, pour la notification Android).
3. Une courte critique honnête du nom « Quadra » (sens, prononciation en français et en anglais, risque de ressembler à
   une marque existante) et **cinq autres noms** si tu en vois de meilleurs.

## Le concept de l'application

- **Quoi** : un carnet d'entraînement qui compare ce qui était **prévu** à ce qui a été **fait**, calcule la **charge**
  d'entraînement et la **forme**, et prépare l'échange avec un **coach IA** (par fichiers, pas de chat intégré).
- **Pour qui** : un sportif d'endurance qui prépare une course longue (aujourd'hui un Ironman 70.3, en mai 2027) mais qui
  pratique aussi la randonnée, le trail et la rando-itinérance. Ce n'est donc **pas une app réservée au triathlon** : le
  nom et le logo ne doivent enfermer ni dans l'Ironman ni dans les trois sports du triathlon.
- **Quatre disciplines principales**, chacune avec sa couleur : **natation, vélo, course à pied, renforcement**. S'y
  ajoutent « Enchaînement » (vélo puis course) et « Autre » (randonnée, marche, kayak, escalade, ski, aviron, yoga,
  raquette, sport collectif).
- **Fonctions clés** : calendrier semaine et mois, séances construites en blocs, lecture automatique des séances de ma
  montre Garmin, courbes de forme de fond, de fatigue et de fraîcheur, « forme du jour » sur 100, rapport charge aiguë /
  chronique, objectif de course, synchronisation entre téléphone et ordinateur, fonctionnement hors ligne, français et
  anglais, thème clair et sombre.
- **Plateformes** : application Android (APK) et application web installable (PC, iPhone).

## Ton et personnalité à faire passer

Sobre, précis, calme. Un **instrument de mesure** plutôt qu'un jeu : pas de gamification, pas de mascotte, pas de ton
motivationnel, pas de flammes ni d'éclairs. Chaleureux sans être mignon : fond papier chaud, encre presque noire, couleurs
terreuses et profondes. Pense carnet de terrain, altimètre, planche de cartographe.

Mots justes : rigoureux, endurant, lisible, tranquille, outdoor, multi-sport.
Mots à éviter : agressif, fitness-bro, néon, futuriste, « performance à tout prix ».

## Le nom

- Il doit évoquer le multisport, la mesure, l'endurance ou la régularité, sans citer le triathlon ni l'Ironman.
- Court (8 lettres environ), facile à prononcer et à épeler en français et en anglais, agréable à dire à voix haute.
- Il doit pouvoir servir de nom de dépôt, d'application Android et de domaine : évite les noms déjà très utilisés par
  une application de sport connue.
- « Quadra » vient de l'idée de quatre disciplines. Si tu gardes cette piste, dis-moi si c'est un bon choix. Sinon,
  propose mieux.

## Le logo

### Logo actuel (point de départ, pas une obligation)
Un **anneau de quatre arcs** aux bouts arrondis, un par discipline, posé sur un fond papier à coins arrondis. Un petit
vide sépare les arcs. Le logotype est le mot écrit en Montserrat 700. Je le trouve correct mais générique, et je ne suis
pas sûr qu'il porte vraiment le nom.

### Contraintes techniques de l'icône
- lisible à **32 px** (favicon) et à **48 px** (icône d'application) ;
- icône **adaptative Android** : le motif reste dans le cercle central (zone de sécurité d'environ 66 %) ;
- **icône de notification** : silhouette monochrome blanche sur fond transparent ;
- doit fonctionner sur fond clair **et** sombre ;
- pas de pictogramme triathlon (nageur, vélo, coureur) : trop restrictif ;
- pas de texte dans l'icône d'application.

### Couleurs à utiliser avec le logo (à ne pas modifier)
Le logo peut utiliser tout ou partie des couleurs de discipline, ou rester en une seule couleur d'encre.

| Rôle | Clair | Sombre |
|---|---|---|
| Fond papier | `#FBFAF7` | `#0E1215` |
| Teinte de marque (fond d'icône actuel) | `#E9E3D6` | — |
| Encre | `#16181B` | texte `#ECE8E0` |
| Natation | `#1D6E80` | `#5CB6C9` |
| Vélo | `#9A6B12` | `#D9A83F` |
| Course à pied | `#B4432A` | `#E88663` |
| Renforcement | `#4B4499` | `#8E88E0` |

Dans l'icône actuelle, les mêmes disciplines sont un peu plus vives : natation `#1E9DB8`, vélo `#F0A61E`, course
`#E2552E`, renforcement `#6A5BD6`. Garde ces ordres de couleurs : natation bleu-vert, vélo ambre, course rouge-orange,
renforcement violet.

### Typographie existante (pour le logotype)
Titres et chiffres : **Montserrat** 500, 600, 700. Texte courant : **Open Sans**. Le logotype peut partir de Montserrat,
ou proposer une autre police disponible sur Google Fonts si elle apporte vraiment quelque chose au nom.

## Interdits

- Aucune référence à Ironman, au M-Dot ou à une marque existante ; ne copie aucun logo connu.
- Pas de mascotte, pas de personnage, pas de dégradé criard.
- Contraste suffisant en clair comme en sombre.

===== FIN DU BRIEF =====
