// Contenu de l'écran Aide (Paramètres › Aide). Chaque texte existe en français et en anglais : [fr, en].
// Les chiffres cités (seuils, coefficients, fenêtres) sont ceux du code de src/domain — à garder alignés.
export type Pair = [string, string];
export type Block =
  | { t: 'p'; v: Pair }
  | { t: 'ul'; v: Pair[] }
  | { t: 'f'; v: Pair }
  | { t: 'link'; href: string; v: Pair };
export interface HelpSection { id: string; icon: string; title: Pair; blocks: Block[] }

const p = (fr: string, en: string): Block => ({ t: 'p', v: [fr, en] });
const ul = (...v: Pair[]): Block => ({ t: 'ul', v });
const f = (fr: string, en = fr): Block => ({ t: 'f', v: [fr, en] });
const link = (href: string, fr: string, en: string): Block => ({ t: 'link', href, v: [fr, en] });

export const REPO = 'https://github.com/mathieuoury34-gif/apogee';
export const APK_PAGE = REPO + '/releases/tag/apk';
export const APK_FILE = REPO + '/releases/download/apk/apogee.apk';
export const SITE = 'https://mathieuoury34-gif.github.io/apogee/';

export const HELP: HelpSection[] = [
  {
    id: 'start', icon: 'sparkle', title: ['Démarrer et installer', 'Getting started and installing'],
    blocks: [
      p('Apogée est un suivi d’entraînement multisport (triathlon, trail, randonnée…) : course, vélo, natation et renforcement. Elle compare ce qui était prévu à ce que tu as fait, calcule ta charge d’entraînement et ta forme, et prépare l’échange avec ton coach IA. Rien n’est jamais envoyé à un tiers : les données restent sur ton appareil et, si tu te connectes, dans ton espace privé Firebase.',
        'Apogée is a multisport training log (triathlon, trail, hiking…): run, bike, swim and strength. It compares what was planned with what you did, calculates your training load and form, and prepares the exchange with your AI coach. Nothing is ever sent to a third party: your data stays on your device and, if you sign in, in your own private Firebase space.'),
      p('Où l’installer :', 'Where to install it:'),
      ul(
        ['**Android (téléphone qui lit ta montre)** : installe l’APK. Il est seul à pouvoir lire Health Connect, donc tes séances Garmin, ton sommeil et ta FC de repos.', '**Android (phone that reads your watch)**: install the APK. It is the only version that can read Health Connect, so your Garmin sessions, sleep and resting HR.'],
        ['**PC** (Chrome ou Edge) : ouvre le site, puis clique sur « Installer » dans la barre d’adresse.', '**PC** (Chrome or Edge): open the website, then click “Install” in the address bar.'],
        ['**iPhone** : ouvre le site dans Safari, puis Partager › « Sur l’écran d’accueil ». Il n’y a pas de Health Connect sur iPhone : les séances arrivent par la synchronisation depuis l’Android, et l’iPhone ne reçoit pas de rappels.', '**iPhone**: open the website in Safari, then Share › “Add to Home Screen”. There is no Health Connect on iPhone: sessions arrive through sync from the Android phone, and the iPhone gets no reminders.'],
      ),
      link(APK_PAGE, 'Page de téléchargement de l’APK (GitHub › Releases)', 'APK download page (GitHub › Releases)'),
      link(APK_FILE, 'Télécharger directement apogee.apk', 'Download apogee.apk directly'),
      p('Au téléchargement, Android demande d’autoriser l’installation depuis le navigateur : accepte. L’APK affiche le site publié, donc chaque mise à jour du site met l’application à jour sans réinstaller. Il ne faut réinstaller l’APK que si le module natif change.',
        'When downloading, Android asks you to allow installation from the browser: accept. The APK displays the published website, so every site update updates the app without reinstalling. You only need to reinstall the APK if the native module changes.'),
      p('Premiers pas conseillés :', 'Suggested first steps:'),
      ul(
        ['Paramètres › Compte : « Continuer avec Google », pour retrouver les mêmes données sur tous tes appareils.', 'Settings › Account: “Continue with Google”, to get the same data on all your devices.'],
        ['Paramètres › Athlète › Profil : date de naissance, sexe, disponibilités. Ils servent à estimer ta FC max et à calibrer la charge.', 'Settings › Athlete › Profile: date of birth, sex, availability. They are used to estimate your max HR and calibrate the load.'],
        ['Paramètres › Montre : autorise Health Connect en cochant « Historique », puis lance une lecture.', 'Settings › Watch: allow Health Connect and tick “History”, then run a read.'],
        ['Paramètres › Athlète › Indicateurs : saisis ta VMA, ta FTP, ta CSS et ta FC max si tu les connais.', 'Settings › Athlete › Metrics: enter your MAS, FTP, CSS and max HR if you know them.'],
        ['Paramètres › Athlète › Course objectif : date, distances et chrono visé.', 'Settings › Athlete › Target race: date, distances and target time.'],
      ),
    ],
  },
  {
    id: 'tabs', icon: 'accueil', title: ['Les cinq onglets', 'The five tabs'],
    blocks: [
      ul(
        ['**Accueil** : le résumé du jour. Forme du jour, séance prévue, semaine en cours, courbe de charge, dernière séance, alertes, état du plan coach et de la montre.', '**Home**: the summary of the day. Daily readiness, planned session, current week, load curve, last session, alerts, status of the coach plan and of the watch.'],
        ['**Calendrier** : tes séances prévues et réalisées, en vue semaine ou mois, avec les blocs de périodisation.', '**Calendar**: your planned and completed sessions, in week or month view, with the periodisation blocks.'],
        ['**Séances** : le journal de tout ce que tu as fait, le bilan de chaque séance, la saisie à la main et les statistiques.', '**Sessions**: the log of everything you did, the review of each session, manual entry and statistics.'],
        ['**Progression** : charge d’entraînement, forme du jour détaillée, objectif de course et zones (VMA, FTP, CSS, FC max).', '**Progress**: training load, detailed daily readiness, race goal and zones (MAS, FTP, CSS, max HR).'],
        ['**Coach** : exporter ton dossier vers ton coach IA et importer le plan qu’il te renvoie.', '**Coach**: export your dossier to your AI coach and import the plan it sends back.'],
      ),
      p('La roue crantée en haut à droite ouvre les Paramètres. Le bouton + (en bas à droite) ouvre le menu d’ajout : planifier une séance, saisir une séance faite, coller un lot de séances, déclarer une interruption, importer un plan. Presque toute action propose « Annuler » dans le bandeau qui apparaît en bas de l’écran.',
        'The cog at the top right opens Settings. The + button (bottom right) opens the add menu: plan a session, enter a completed session, paste a batch of sessions, report an interruption, import a plan. Almost every action offers “Undo” in the banner shown at the bottom of the screen.'),
      p('Sur ordinateur, la barre d’onglets devient une barre latérale. Si tu laisses l’app en arrière-plan plus de 15 minutes, elle revient à l’Accueil à la réouverture.',
        'On a computer, the tab bar becomes a sidebar. If you leave the app in the background for more than 15 minutes, it returns to Home when reopened.'),
    ],
  },
  {
    id: 'home', icon: 'accueil', title: ['Accueil', 'Home'],
    blocks: [
      ul(
        ['**Carte de la course** (en haut) : nombre de jours avant ta course objectif, et le bloc de préparation en cours (semaine X sur Y).', '**Race card** (top): days left before your target race, and the current training block (week X of Y).'],
        ['**Forme du jour** : un score de 0 à 100 calculé chaque matin, avec un libellé (Épuisé, Entamé, Correct, Disponible, Frais), puis ta forme de fond, ta fatigue et ta fraîcheur. Voir « Forme du jour » plus bas pour le calcul.', '**Daily readiness**: a score from 0 to 100 calculated every morning, with a label (Exhausted, Worn, OK, Ready, Fresh), then your fitness, fatigue and freshness. See “Daily readiness” below for the calculation.'],
        ['**Séance du jour** : ce qui est prévu aujourd’hui, avec sa durée et sa distance estimées.', '**Today’s session**: what is planned today, with its estimated duration and distance.'],
        ['**Cette semaine** : une pastille par jour. Plein = séance réalisée, contour = prévue, rouge = non réalisée, point gris = rien. Le total compare le temps fait au temps prévu.', '**This week**: one dot per day. Filled = session done, outline = planned, red = missed, grey dot = nothing. The total compares time done with time planned.'],
        ['**Charge — 4 semaines** : la courbe de ta charge quotidienne (barres), de ta forme de fond (trait plein), de ta fatigue (pointillés) et de ta fraîcheur (barres du bas). Touche le graphique pour lire un jour.', '**Load — 4 weeks**: the curve of your daily load (bars), fitness (solid line), fatigue (dashed) and freshness (bottom bars). Tap the chart to read a day.'],
        ['**Dernière séance** : son verdict (conforme au prévu, plus chargée que d’habitude…) et un bouton « Noter mon ressenti » tant que le RPE manque.', '**Last session**: its verdict (as planned, harder than usual…) and a “Rate my effort” button while the RPE is missing.'],
        ['**À signaler** : les alertes (séances manquées, RPE élevés à répétition, hausse de charge, séances en attente de ressenti). Voir « Alertes ».', '**Worth flagging**: alerts (missed sessions, repeated high RPE, load increase, sessions waiting for an RPE). See “Alerts”.'],
        ['**Montre** : tant que Health Connect n’est pas relié ou que la dernière lecture a échoué, une carte l’explique et propose la bonne action.', '**Watch**: as long as Health Connect is not linked or the last read failed, a card explains it and offers the right action.'],
      ),
    ],
  },
  {
    id: 'calendar', icon: 'calendrier', title: ['Calendrier et séances prévues', 'Calendar and planned sessions'],
    blocks: [
      p('Le calendrier montre chaque jour les séances prévues (par toi ou par le coach) et réalisées. Trois mesures en haut : séances (faites sur prévues), volume (temps) et charge de la période.',
        'The calendar shows each day’s planned (by you or by the coach) and completed sessions. Three figures at the top: sessions (done out of planned), volume (time) and load for the period.'),
      ul(
        ['**Semaine / Mois** : bascule en haut. Les flèches changent de période, « Revenir à cette semaine » te ramène à aujourd’hui.', '**Week / Month**: toggle at the top. Arrows change the period, “Back to this week” takes you back to today.'],
        ['**Balayage** : glisse vers la gauche ou la droite pour passer à la semaine ou au mois suivant ou précédent. Même geste dans le sélecteur de date.', '**Swiping**: slide left or right to go to the next or previous week or month. Same gesture in the date picker.'],
        ['**Appui long sur une séance** (calendrier, accueil, liste des séances) : une feuille propose de la dupliquer vers un autre jour, de la déplacer, de la modifier ou de la supprimer (séance prévue), ou de lui donner un titre (séance réalisée). Pour une séance « Autre », la même feuille propose aussi un pictogramme parmi une cinquantaine d’activités (voile, kitesurf, parkour, escalade, danse, boxe…).', '**Long press on a session** (calendar, home, session list): a sheet offers to duplicate it to another day, move it, edit it or delete it (planned session), or to give it a title (completed session). For an “Other” session, the same sheet also offers an icon from about fifty activities (sailing, kitesurfing, parkour, climbing, dance, boxing…).'],
        ['**Statut d’une séance prévue** : Réalisée (une séance faite lui est rattachée), Non réalisée (le jour est passé sans séance rattachée), À venir.', '**Status of a planned session**: Done (a completed session is linked), Missed (the day passed with no linked session), Upcoming.'],
        ['**Détail d’une séance prévue** : ses blocs, sa durée et sa distance estimées, ses totaux et, si elle est faite, un lien vers le bilan. Tu peux la modifier, la déplacer, la dupliquer ou la supprimer.', '**Planned session detail**: its blocks, estimated duration and distance, totals and, if done, a link to the review. You can edit, move, duplicate or delete it.'],
        ['**Planifier une séance** : choisis la discipline et la date, pars d’un modèle ou ajoute les blocs un par un. Un message liste ce qui reste à corriger avant d’enregistrer.', '**Planning a session**: choose the discipline and date, start from a template or add blocks one by one. A message lists what still needs fixing before saving.'],
        ['**Coller un lot de séances prévues** : une ligne par séance, « AAAA-MM-JJ;DISCIPLINE;durée_min;titre ». Disciplines : RUN, BIKE, SWIM, STRENGTH, BRICK (ou Course, Vélo, Natation, Renfo).', '**Pasting a batch of planned sessions**: one line per session, “YYYY-MM-DD;DISCIPLINE;duration_min;title”. Disciplines: RUN, BIKE, SWIM, STRENGTH, BRICK (or Course, Vélo, Natation, Renfo).'],
      ),
      p('Les blocs d’une séance :', 'The blocks of a session:'),
      ul(
        ['**Types** : Échauffement, Effort, Récupération active, Repos, Retour au calme, Transition et Série (un groupe de blocs répétés).', '**Types**: Warm-up, Work, Active recovery, Rest, Cool-down, Transition and Set (a group of repeated blocks).'],
        ['**Mesure** : un temps, une distance, un nombre de répétitions, ou libre.', '**Measure**: a time, a distance, a number of repetitions, or open.'],
        ['**Série** : 8 × (50 m + repos) répète ses blocs enfants. Trois modes : répétitions, AMRAP (un maximum de tours dans une fenêtre de temps) et « départ toutes les X » (EMOM : la récupération est le reliquat).', '**Set**: 8 × (50 m + rest) repeats its child blocks. Three modes: repetitions, AMRAP (as many rounds as possible within a time window) and “start every X” (EMOM: recovery is whatever is left).'],
        ['**Cible** : zone (1 à 5), allure, vitesse, puissance, FC, charge (kg) ou RPE. Une cible peut être absolue (« 4:30 /km ») ou relative (« 90 % de la VMA », de la FTP, de la CSS, de la FC max ou du 1RM), avec une valeur ou une fourchette.', '**Target**: zone (1 to 5), pace, speed, power, HR, load (kg) or RPE. A target can be absolute (“4:30 /km”) or relative (“90 % of MAS”, of FTP, CSS, max HR or 1RM), with a value or a range.'],
        ['**Enchaînement (BRICK)** : une séance qui mélange deux disciplines. Chaque bloc porte alors sa discipline (par exemple 1 h de vélo puis 20 min de course).', '**Brick**: a session mixing two disciplines. Each block then carries its discipline (for example 1 h bike then 20 min run).'],
        ['**Modifier les blocs** : le nom se saisit juste après le type ; en quittant le détail d’un bloc, tu reviens à la séance, toujours en édition. Chaque bloc a un bouton pour le dupliquer (un exercice ou une série entière). Un bloc se déplace avec les flèches, ou en appui long puis glissé : un trait bleu montre où il va tomber, dans la même série, dans une autre série ou hors série (glisse vers la droite pour entrer dans une série). Une série entière se déplace et se duplique de la même façon.', '**Editing blocks**: the name is entered right after the type; leaving a block’s detail brings you back to the session, still in edit mode. Each block has a button to duplicate it (an exercise or a whole set). A block moves with the arrows, or with a long press then a drag: a blue line shows where it will land, in the same set, in another set or outside any set (drag to the right to enter a set). A whole set moves and duplicates the same way.'],
        ['**Couleurs** : chaque type de bloc a sa couleur (échauffement et retour au calme en vert, effort en rouille, récupération en bleu, repos en gris, transition en prune, série en violet).', '**Colours**: each block type has its own colour (warm-up and cool-down green, work rust, recovery blue, rest grey, transition plum, set violet).'],
        ['**Série** : une série n’a pas d’intensité propre ; l’intensité se règle sur les blocs qu’elle contient.', '**Set**: a set has no intensity of its own; intensity is set on the blocks it contains.'],
      ),
      p('Durée et distance estimées : elles se calculent toujours à partir des blocs. Un bloc chronométré donne sa durée. Un bloc en distance avec une allure donne sa durée, et un bloc en durée avec une allure donne sa distance. Une fourchette compte pour son milieu. Une cible en % de la VMA ou de la CSS utilise ta dernière valeur. Un bloc sans cible est estimé à ton allure d’endurance (70 % de la VMA, 90 % de la CSS). Toute valeur estimée est soulignée en pointillés, avec la raison affichée dans le détail.',
        'Estimated duration and distance: always calculated from the blocks. A timed block gives its duration. A distance block with a pace gives its duration, and a duration block with a pace gives its distance. A range counts for its midpoint. A target in % of MAS or CSS uses your latest value. A block without a target is estimated at your endurance pace (70 % of MAS, 90 % of CSS). Any estimated value is underlined with dots, with the reason shown in the detail.'),
      p('Réutiliser des séances : « Actions de la semaine » (sous les trois chiffres) copie la semaine affichée vers une autre (les séances déjà présentes sont conservées, rien n’est écrasé), l’enregistre comme semaine type, ou applique une semaine type enregistrée. Un appui long sur une séance prévue propose « Ajouter aux favoris » ; le bouton + d’un jour offre « Mes séances favorites » pour la replacer en un geste. Les copies sont des séances « manuelles » indépendantes de celles du coach, et chaque ajout se défait avec « Annuler ». Les favoris et semaines types sont synchronisés avec ton compte.',
        'Reusing sessions: “Week actions” (under the three figures) copies the displayed week to another one (sessions already there are kept, nothing is overwritten), saves it as a template week, or applies a saved template week. Long-pressing a planned session offers “Add to favourites”; a day’s + button offers “My favourite sessions” to place it again in one tap. Copies are independent “manual” sessions, separate from the coach’s, and every addition can be undone. Favourites and template weeks sync with your account.'),
      p('Périodisation : les blocs de préparation (Foncier, Développement, Spécifique, Affûtage, Récupération, Course, Transition) découpent ta saison. Ouvre le bandeau « Périodisation » en haut du calendrier : une frise montre les blocs et les jours sans bloc. Deux blocs ne peuvent pas se chevaucher, et la date de fin ne peut pas précéder celle de début.',
        'Periodisation: the training blocks (Base, Build, Specific, Taper, Recovery, Race, Transition) divide your season. Open the “Periodisation” banner at the top of the calendar: a timeline shows the blocks and the days without a block. Two blocks cannot overlap, and the end date cannot be before the start date.'),
      p('Sur la montre : le détail d’une séance prévue propose « Exporter pour la montre (.FIT) ». Le fichier décrit les étapes (durée ou distance), les cibles d’allure, de puissance ou de FC (en valeur ou en % de ta VMA, CSS, FTP, FC max) et les répétitions. Copie-le dans le dossier GARMIN/Workouts de la montre branchée en USB. Une cible sans référence connue, une zone, une charge ou un ressenti restent des étapes ouvertes (l’app te prévient) ; un enchaînement donne un fichier par discipline ; les montres acceptent environ 50 étapes. Format écrit selon la spécification FIT : si ta montre refuse un fichier, dis-le, c’est à corriger.',
        'On the watch: the detail of a planned session offers “Export for the watch (.FIT)”. The file describes the steps (duration or distance), pace, power or HR targets (as values or as % of your MAS, CSS, FTP, max HR) and repeats. Copy it into the GARMIN/Workouts folder of the watch plugged in by USB. A target with no known reference, a zone, a load or an RPE stay open steps (the app warns you); a brick gives one file per discipline; watches accept about 50 steps. The format is written to the FIT specification: if your watch rejects a file, tell me, it needs fixing.'),
    ],
  },
  {
    id: 'sessions', icon: 'seances', title: ['Séances, bilan et saisie', 'Sessions, review and entry'],
    blocks: [
      p('Le journal liste tes séances réalisées, mois par mois, avec le volume du mois. Le filtre « Ressenti à noter » ne garde que celles qui attendent un RPE. Une séance de la montre porte l’heure et la distance mesurées ; une séance saisie à la main est toujours marquée comme telle.',
        'The log lists your completed sessions month by month, with the month’s volume. The “RPE to enter” filter keeps only those waiting for an RPE. A watch session carries the measured time and distance; a hand-entered session is always marked as such.'),
      p('Le bilan d’une séance contient :', 'A session review contains:'),
      ul(
        ['**Les mesures** : durée, distance, vitesse ou allure, FC moyenne, dénivelé, calories. Les valeurs que tu as corrigées à la main sont soulignées.', '**Measurements**: duration, distance, speed or pace, average HR, elevation, calories. Values you corrected by hand are underlined.'],
        ['**La charge** et sa méthode (voir « Calculs »).', '**The load** and its method (see “Calculations”).'],
        ['**Le verdict** : comparé au prévu si une séance prévue est rattachée, sinon comparé à tes séances habituelles.', '**The verdict**: compared with the plan if a planned session is linked, otherwise with your usual sessions.'],
        ['**La dérive cardiaque**, quand elle a un sens.', '**Cardiac drift**, when it is meaningful.'],
        ['**La courbe de fréquence cardiaque**, quand la montre l’a fournie.', '**The heart-rate curve**, when the watch provided it.'],
        ['**Le ressenti (RPE) de 1 à 10** et un commentaire libre. Touche à nouveau la valeur choisie pour la retirer. Dès que tu enregistres le RPE, la charge est recalculée.', '**The perceived effort (RPE) from 1 to 10** and a free comment. Tap the chosen value again to remove it. As soon as you save the RPE, the load is recalculated.'],
      ),
      p('Rattachement prévu ↔ réalisé : l’app associe chaque séance faite à la séance prévue correspondante. Elle regarde d’abord le même jour (même discipline, durée proche). Si rien ne correspond, elle cherche la veille et le lendemain, avec une confiance plus faible. Tu peux changer ce choix (« Changer », dans un rayon de 3 jours), dire « Ce n’était pas prévu », ou « Revenir à l’automatique ». Seul un choix manuel est enregistré.',
        'Planned ↔ completed linking: the app matches each completed session with the corresponding planned session. It looks at the same day first (same discipline, similar duration). If nothing matches, it looks at the day before and after, with lower confidence. You can change this choice (“Change”, within 3 days), say “It wasn’t planned”, or “Back to automatic”. Only a manual choice is saved.'),
      p('Enchaînement : si deux séances du même jour (par exemple vélo puis course) forment un enchaînement, le bilan propose de les regrouper en BRICK. Un refus n’est jamais reproposé. Elles gardent chacune leur propre rattachement.',
        'Brick: if two sessions on the same day (for example bike then run) form a brick, the review offers to group them as a BRICK. A refusal is never suggested again. Each keeps its own link.'),
      p('Ajouter une séance à la main (bouton + › Séance faite) :', 'Adding a session by hand (+ button › Session done):'),
      ul(
        ['**Une séance** : discipline, date, durée, distance, FC moyenne et RPE. Sans FC ni RPE, la charge reste provisoire.', '**One session**: discipline, date, duration, distance, average HR and RPE. Without HR or RPE, the load stays provisional.'],
        ['**Lot fait** : une ligne par séance, « AAAA-MM-JJ;DISCIPLINE;durée_min;distance_km;FC_moyenne;RPE ». Les trois derniers champs sont facultatifs. Coller deux fois la même ligne ne crée pas de doublon.', '**Batch done**: one line per session, “YYYY-MM-DD;DISCIPLINE;duration_min;distance_km;avg_HR;RPE”. The last three fields are optional. Pasting the same line twice does not create a duplicate.'],
      ),
      p('Corriger une séance de la montre : modifie ses valeurs depuis le bilan. Elle garde son identifiant Garmin (aucun doublon à la lecture suivante) et la valeur corrigée devient « saisie » pour de bon.',
        'Correcting a watch session: edit its values from the review. It keeps its Garmin identifier (no duplicate at the next read) and the corrected value becomes “entered” for good.'),
      p('Statistiques : un bilan global (heures, séances par semaine, répartition du temps), puis, par discipline, la vitesse ou l’allure moyenne et la meilleure (sur les séances d’au moins 20 minutes), la séance la plus longue, le dénivelé cumulé, le volume par semaine sur 12 semaines et ton indicateur de référence (VMA, FTP ou CSS). La charge hebdomadaire est aussi résumée. « Autre » est exclu du total. Le renforcement n’affiche ni distance ni allure.',
        'Statistics: an overall summary (hours, sessions per week, time split), then, per discipline, average and best speed or pace (on sessions of at least 20 minutes), the longest session, total elevation, weekly volume over 12 weeks and your reference metric (MAS, FTP or CSS). Weekly load is also summarised. “Other” is excluded from the total. Strength shows no distance or pace.'),
      p('Journal : filtre par discipline, par période (30 jours, 90 jours, 1 an) et recherche libre dans le titre, le commentaire, le sport et la date. Le bilan d’une séance avec courbe cardiaque affiche aussi le temps passé par zone de FC.',
        'Journal: filter by discipline, by period (30 days, 90 days, 1 year) and free search in the title, comment, sport and date. The review of a session with a heart-rate curve also shows time spent in each HR zone.'),
      p('Le bouton « Inclure Autre » (éteint par défaut) du camembert et des barres de volume ajoute ou retire les séances « Autre » (randonnée, kayak…) pour qu’elles n’écrasent pas les autres disciplines. Une séance « Autre » peut porter un sport précis (randonnée, marche, kayak, escalade, ski, aviron, yoga, raquette, sport collectif) : c’est purement visuel, le calcul de la charge ne change pas.',
        'The “Include Other” toggle (off by default) on the pie chart and volume bars adds or removes “Other” sessions (hiking, kayaking…) so they do not crush the other disciplines. An “Other” session can carry a specific sport (hiking, walking, kayaking, climbing, skiing, rowing, yoga, racket, team sport): this is purely visual, the load calculation does not change.'),
    ],
  },
  {
    id: 'progress', icon: 'progression', title: ['Progression', 'Progress'],
    blocks: [
      p('Trois sections :', 'Three sections:'),
      ul(
        ['**Charge** : ta forme de fond, ta fatigue, ta fraîcheur et la rampe sur 7 jours ; le rapport charge aiguë / chronique avec sa jauge et les deux valeurs qui le composent (aiguë = 7 derniers jours, chronique = moyenne hebdomadaire sur 28 jours ; une très longue sortie récente dans les 28 jours abaisse le rapport) ; la courbe de charge (1 ou 2 semaines, 1, 3, 6 mois ou 1 an ; 1 semaine par défaut) en trois panneaux à échelles séparées (charge du jour, forme de fond et fatigue, fraîcheur) ou de la forme du jour ; le détail de la forme du jour avec le poids de chaque composante ; le volume par semaine sur 12 semaines ; et une explication de la méthode de charge avec ta FC max retenue.', '**Load**: your fitness, fatigue, freshness and the 7-day ramp; the acute/chronic load ratio with its gauge and the two values behind it (acute = last 7 days, chronic = weekly average over 28 days; a very long recent outing within the 28 days lowers the ratio); the load curve (1 or 2 weeks, 1, 3, 6 months or 1 year; 1 week by default) in three panels with separate scales (daily load, fitness and fatigue, freshness) or the daily-readiness curve; the detail of daily readiness with the weight of each component; weekly volume over 12 weeks; and an explanation of the load method with your retained max HR.'],
        ['**Objectif** : ta course (date, distances, chrono visé), la décomposition du chrono en natation, vélo, course et transitions, et les allures requises face à tes indicateurs.', '**Goal**: your race (date, distances, target time), the breakdown of the time into swim, bike, run and transitions, and the required paces against your metrics.'],
        ['**Zones** : tes indicateurs de référence, avec l’historique complet de chacun.', '**Zones**: your reference metrics, with the full history of each.'],
      ),
      p('Objectif de course : tu alloues toi-même le chrono visé entre les disciplines. L’écran affiche l’écart entre la somme des parties et le chrono visé, puis, pour chaque discipline, l’allure requise : en s/km pour la course, en s/100 m pour la natation, en km/h pour le vélo. Pour la course et la natation, elle est aussi exprimée en % de ta VMA ou de ta CSS. L’app juxtapose, sans jamais juger si c’est réaliste : c’est le rôle de ton coach. Pour le vélo, la FTP est une puissance et la vitesse requise n’est pas directement comparable : l’écran ne les confronte pas.',
        'Race goal: you allocate the target time between disciplines yourself. The screen shows the gap between the sum of the parts and the target time, then, for each discipline, the required pace: in s/km for the run, s/100 m for the swim, km/h for the bike. For the run and swim, it is also expressed as a % of your MAS or CSS. The app places them side by side and never judges whether it is realistic: that is your coach’s role. For the bike, FTP is a power and the required speed is not directly comparable: the screen does not compare them.'),
      p('Indicateurs et zones : la VMA (vitesse maximale aérobie, en km/h), la FTP (puissance seuil, en watts), la CSS (vitesse critique de nage, en mm:ss aux 100 m) et la FC max. Chaque valeur est historisée, jamais écrasée, avec sa source (Test, Estimation ou Saisie). La plus récente sert aux cibles relatives des séances (% VMA, % FTP, % CSS) et aux calculs de charge. Tu peux ajouter une valeur avec le bouton + ou supprimer un relevé erroné.',
        'Metrics and zones: MAS (maximal aerobic speed, in km/h), FTP (functional threshold power, in watts), CSS (critical swim speed, as mm:ss per 100 m) and max HR. Each value is kept in history, never overwritten, with its source (Test, Estimate or Entered). The most recent one is used for relative session targets (% MAS, % FTP, % CSS) and load calculations. You can add a value with the + button or delete an erroneous reading.'),
    ],
  },
  {
    id: 'analysis', icon: 'trend', title: ['Analyse et prévisionnel', 'Analysis and forecast'],
    blocks: [
      p('Progression › Analyse regroupe des lectures dérivées de tes séances et de ton plan. Rien n’est stocké : tout est recalculé à chaque changement, et chaque carte rappelle sa méthode.',
        'Progression › Analysis gathers readings derived from your sessions and plan. Nothing is stored: everything is recalculated on every change, and each card states its method.'),
      ul(
        ['**Bilan de semaine** : séances et durées réalisées / prévues par discipline, charge, forme de fond, fraîcheur et rapport aigu/chronique de la semaine en cours ou de la dernière. Le bouton copie un texte à coller dans la conversation avec ton coach.', '**Week summary**: sessions and durations done / planned by discipline, load, fitness, freshness and acute/chronic ratio for the current or last week. The button copies a text to paste into your coach conversation.'],
        ['**Respect du plan** : part des séances prévues échues qui ont une séance réalisée rattachée, par semaine et par mois, et temps réalisé / prévu. Les jours d’interruption ne comptent pas comme manqués.', '**Plan adherence**: share of due planned sessions with a completed session linked, per week and month, and time done / planned. Interruption days do not count as missed.'],
        ['**Temps par zone de FC** : zones en % de la FC max retenue (Z1 < 60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 %). Répartition « facile » (< 80 %), « soutenue » (80–90 %), « intense » (≥ 90 %). Course, vélo, natation ; le renforcement est exclu ; « Autre » en option. Le repère 80/20 est générique, pas ton seuil personnel.', '**Time in HR zones**: zones as % of the retained max HR (Z1 < 60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 ≥ 90%). Split into “easy” (< 80%), “sustained” (80–90%), “intense” (≥ 90%). Run, bike, swim; strength is excluded; “Other” is optional. The 80/20 guide is generic, not your personal threshold.'],
        ['**Forme de fond par discipline** : le calcul de la forme de fond (42 jours) appliqué à chaque discipline ; la somme redonne la forme totale.', '**Fitness by discipline**: the fitness calculation (42 days) applied to each discipline; the sum gives back total fitness.'],
        ['**Tendance d’efficacité** : mètres par battement (vitesse ÷ FC moyenne), médiane par semaine, sur des séances comparables (FC moyenne entre 65 et 85 % de la FC max, 20 min minimum, dénivelé < 2 %). Variation = 4 dernières semaines contre 4 précédentes.', '**Efficiency trend**: metres per heartbeat (speed ÷ average HR), weekly median, over comparable sessions (average HR between 65 and 85% of max HR, 20 min minimum, climb < 2%). Change = last 4 weeks vs the 4 before.'],
        ['**Poids** : moyenne sur 7 jours et évolution sur 4 semaines. Pesées lues dans Health Connect ou saisies à la main (la saisie n’est jamais écrasée). Simple suivi : le poids ne modifie aucune charge.', '**Weight**: 7-day average and 4-week change. Weigh-ins read from Health Connect or entered by hand (your entry is never overwritten). Simple tracking: weight does not change any load.'],
        ['**Sommeil** : durée moyenne des 7 dernières nuits contre les 3 semaines précédentes, heure de coucher habituelle et régularité (écart-type sur 14 nuits). Pas d’objectif imposé.', '**Sleep**: average length of the last 7 nights vs the previous 3 weeks, usual bedtime and regularity (standard deviation over 14 nights). No imposed target.'],
        ['**Records** : meilleur segment continu (1, 5, 10, 21,1 km ; 20, 40, 90 km ; 400, 1 000, 1 900 m) lu dans la courbe de vitesse ; à défaut, séance entière si sa distance est à 3 % près.', '**Records**: best continuous segment (1, 5, 10, 21.1 km; 20, 40, 90 km; 400, 1,000, 1,900 m) read from the speed curve; otherwise the whole session if its distance is within 3%.'],
        ['**Enchaînements vélo → course** : durée de transition (≤ 45 min) et allure de course comparée à la médiane de tes autres courses de 10 min ou plus sur 90 jours.', '**Bike → run bricks**: transition time (≤ 45 min) and run pace compared with the median of your other runs of 10 min or more over 90 days.'],
      ),
      p('Prévisionnel de charge (Progression › Charge) : projette forme de fond, fatigue, fraîcheur et rapport aigu/chronique si tu réalises tout le plan. La charge d’une séance prévue = durée estimée de ses blocs × ta charge par minute habituelle dans la discipline (médiane des 90 derniers jours). L’intensité prévue n’est pas modélisée : c’est un outil pour comparer des semaines, pas une prédiction de forme.',
        'Load forecast (Progression › Load): projects fitness, fatigue, freshness and acute/chronic ratio if you do the whole plan. The load of a planned session = estimated duration of its blocks × your usual load per minute in that discipline (median of the last 90 days). Planned intensity is not modelled: it is a tool to compare weeks, not a form prediction.'),
      p('Estimations suggérées (Progression › Zones) : une VMA (meilleur effort de 6 minutes sur 90 jours, proposée seulement si elle dépasse ta valeur) ou une CSS (meilleurs 200 m et 400 m d’une même séance). Rien n’est appliqué sans que tu adoptes l’estimation ; elle est enregistrée avec la source « estimation ».',
        'Suggested estimates (Progression › Zones): a VMA (best 6-minute effort over 90 days, only suggested if it exceeds your value) or a CSS (best 200 m and 400 m from the same session). Nothing is applied until you adopt the estimate; it is saved with the source “estimation”.'),
    ],
  },
  {
    id: 'calc-load', icon: 'gauge', title: ['Calcul de la charge d’une séance', 'How a session’s load is calculated'],
    blocks: [
      p('La charge mesure l’effort physiologique d’une séance, sur une échelle unique pour toutes les disciplines. Chaque séance reçoit la méthode la plus fiable disponible, de la meilleure à la moins bonne :',
        'Load measures the physiological effort of a session, on a single scale for all disciplines. Each session gets the most reliable method available, from best to least good:'),
      ul(
        ['**1. Mesurée sur la fréquence cardiaque** (TRIMP de Banister) : calculée échantillon par échantillon sur la courbe de la montre. Il faut au moins 10 mesures et une réserve cardiaque d’au moins 20 bpm.', '**1. Measured from heart rate** (Banister TRIMP): calculated sample by sample on the watch curve. At least 10 readings and a heart-rate reserve of at least 20 bpm are needed.'],
        ['**2. Estimée sur la FC moyenne** : la même formule appliquée à la FC moyenne et à la durée, pour une séance saisie à la main avec une FC moyenne.', '**2. Estimated from average HR**: the same formula applied to average HR and duration, for a hand-entered session with an average HR.'],
        ['**3. Estimée depuis ton ressenti** : RPE × minutes, ramené à l’échelle du TRIMP par un coefficient (voir plus bas).', '**3. Estimated from your RPE**: RPE × minutes, brought to the TRIMP scale by a coefficient (see below).'],
        ['**4. Provisoire** : sans FC ni RPE, ta charge habituelle par minute × la durée. Elle est marquée « estimée » et remplacée dès que tu notes ton ressenti.', '**4. Provisional**: with no HR or RPE, your usual load per minute × the duration. It is marked “estimated” and replaced as soon as you rate your effort.'],
        ['**5. En attente** : aucune charge n’est possible (par exemple pas encore d’historique) ; la séance attend ton RPE.', '**5. Pending**: no load is possible (for example no history yet); the session waits for your RPE.'],
      ),
      p('Le TRIMP de Banister :', 'The Banister TRIMP:'),
      f('TRIMP = durée (min) × HRr × a × e^(b × HRr)\nHRr = (FC − FC repos) ÷ (FC max − FC repos), entre 0 et 1\nHomme : a = 0,64 ; b = 1,92 · Femme : a = 0,86 ; b = 1,64',
        'TRIMP = duration (min) × HRr × a × e^(b × HRr)\nHRr = (HR − resting HR) ÷ (max HR − resting HR), between 0 and 1\nMale: a = 0.64; b = 1.92 · Female: a = 0.86; b = 1.64'),
      p('Plus l’intensité est élevée, plus chaque minute pèse (c’est exponentiel) : 60 minutes en endurance donnent environ 80 à 110, une heure de seuil bien davantage. Dans une courbe cardiaque, un trou de plus de 33 secondes n’est pas facturé. Le sexe indiqué dans ton profil choisit les coefficients (homme par défaut).',
        'The higher the intensity, the more each minute weighs (it is exponential): 60 minutes of endurance gives about 80 to 110, an hour at threshold far more. In a heart-rate curve, a gap longer than 33 seconds is not counted. The sex in your profile selects the coefficients (male by default).'),
      p('La FC max retenue :', 'The max HR used:'),
      ul(
        ['Une valeur que tu as déclarée (test ou saisie) l’emporte toujours.', 'A value you declared (test or entry) always wins.'],
        ['Un pic observé ne la relève que s’il la dépasse d’au moins 2 bpm. C’est un pic soutenu (médiane glissante sur 60 s), en course ou en vélo uniquement, plafonné à 210 bpm.', 'An observed peak only raises it if it exceeds it by at least 2 bpm. It is a sustained peak (60-second rolling median), in run or bike only, capped at 210 bpm.'],
        ['Sans valeur déclarée, l’app prend le plus haut entre le pic observé et la formule de Tanaka : 208 − 0,7 × âge.', 'With no declared value, the app takes the higher of the observed peak and the Tanaka formula: 208 − 0.7 × age.'],
        ['Progression › Charge › « Comment la charge est calculée » indique d’où vient la valeur retenue.', 'Progress › Load › “How load is calculated” shows where the retained value comes from.'],
      ),
      p('La FC de repos de référence est la médiane des 14 derniers jours de FC de repos de la montre.',
        'The reference resting HR is the median of the last 14 days of resting HR from the watch.'),
      p('Le coefficient ressenti → charge : le RPE × minutes de Foster n’est pas sur la même échelle que le TRIMP (60 min à RPE 6 donnent 360, contre environ 80 à 110 pour un footing mesuré). L’app apprend donc ton coefficient : c’est la médiane du rapport TRIMP ÷ (RPE × minutes) sur tes séances qui ont à la fois une courbe cardiaque et un RPE, à partir de 5 séances, borné entre 0,12 et 0,6. Avant 5 séances, il vaut 0,3. Il est affiché dans Progression et transmis au coach.',
        'The RPE → load coefficient: Foster’s RPE × minutes is not on the same scale as the TRIMP (60 min at RPE 6 gives 360, against about 80 to 110 for a measured easy run). The app therefore learns your coefficient: it is the median of the ratio TRIMP ÷ (RPE × minutes) over your sessions that have both a heart-rate curve and an RPE, from 5 sessions, bounded between 0.12 and 0.6. Before 5 sessions, it is 0.3. It is shown in Progress and sent to the coach.'),
      p('La charge provisoire prend la médiane de ta charge par minute sur 90 jours, dans la même discipline (sinon toutes disciplines, jamais pour « Autre »). Elle n’est pas appliquée un jour couvert par une interruption à charge forfaitaire. Tu peux la désactiver dans Paramètres › Calculs.',
        'Provisional load takes the median of your load per minute over 90 days, in the same discipline (otherwise all disciplines, never for “Other”). It is not applied on a day covered by an interruption with a flat load. You can turn it off in Settings › Calculations.'),
    ],
  },
  {
    id: 'calc-form', icon: 'trend', title: ['Forme de fond, fatigue, fraîcheur', 'Fitness, fatigue, freshness'],
    blocks: [
      p('Ces trois courbes viennent du modèle de Banister. On additionne la charge de chaque jour, puis on la lisse :',
        'These three curves come from the Banister model. The load of each day is added up, then smoothed:'),
      ul(
        ['**Forme de fond** (fitness) : moyenne exponentielle de ta charge sur environ 42 jours. Elle monte lentement quand tu t’entraînes et redescend lentement quand tu arrêtes.', '**Fitness**: exponential average of your load over about 42 days. It rises slowly when you train and falls slowly when you stop.'],
        ['**Fatigue** : la même moyenne sur environ 7 jours. Elle réagit vite à une grosse semaine.', '**Fatigue**: the same average over about 7 days. It reacts quickly to a big week.'],
        ['**Fraîcheur** = forme de fond − fatigue. Positive, tu es reposé ; négative, tu es chargé.', '**Freshness** = fitness − fatigue. Positive, you are rested; negative, you are loaded.'],
      ),
      f('forme[j] = forme[j−1] × e^(−1/42) + charge[j] × (1 − e^(−1/42))\nfatigue[j] = fatigue[j−1] × e^(−1/7) + charge[j] × (1 − e^(−1/7))',
        'fitness[d] = fitness[d−1] × e^(−1/42) + load[d] × (1 − e^(−1/42))\nfatigue[d] = fatigue[d−1] × e^(−1/7) + load[d] × (1 − e^(−1/7))'),
      p('Les courbes sont amorcées sur ta charge moyenne des 14 premiers jours, pour ne pas partir de zéro. Pendant les 42 premiers jours de l’historique, elles se stabilisent encore : la date à laquelle elles deviennent fiables est indiquée dans Progression. Un jour sans séance compte pour 0, sauf si une interruption à charge forfaitaire le couvre.',
        'The curves are seeded with your average load of the first 14 days, so as not to start from zero. During the first 42 days of history, they are still settling: the date from which they become reliable is shown in Progress. A day without a session counts as 0, unless an interruption with a flat load covers it.'),
      p('La rampe est la variation de la forme de fond sur 7 jours.', 'The ramp is the change in fitness over 7 days.'),
      p('Dans Progression › Charge, la courbe est découpée en trois graphiques, chacun avec sa phrase d’explication : forme de fond et fatigue, charge du jour, fraîcheur. Touche un jour : le bandeau du dessus donne ses valeurs exactes (il sert aussi de légende).', 'In Progress › Load, the curve is split into three charts, each with its own explanatory sentence: fitness and fatigue, daily load, freshness. Touch a day: the strip above gives its exact values (it also serves as the legend).'),
      p('Le rapport charge aiguë / chronique compare ta semaine à ton rythme des quatre dernières semaines :',
        'The acute/chronic load ratio compares your week with your pace over the last four weeks:'),
      f('rapport = charge des 7 derniers jours ÷ (charge des 28 derniers jours ÷ 4)',
        'ratio = load of the last 7 days ÷ (load of the last 28 days ÷ 4)'),
      ul(
        ['Il n’est calculé qu’après 28 jours d’historique.', 'It is only calculated after 28 days of history.'],
        ['Autour de 1 : semaine habituelle. Sous 0,8 : semaine nettement plus légère (récupération ou baisse de régime). De 1,3 à 1,5 : hausse marquée, à surveiller. Au-delà de 1,5 : hausse brutale, le risque de blessure augmente et une alerte apparaît.', 'Around 1: a usual week. Below 0.8: a clearly lighter week (recovery or a dip). From 1.3 to 1.5: marked increase, keep an eye on it. Above 1.5: sharp increase, injury risk goes up and an alert appears.'],
      ),
    ],
  },
  {
    id: 'calc-readiness', icon: 'heart', title: ['Forme du jour', 'Daily readiness'],
    blocks: [
      p('Un score de 0 à 100, calculé chaque matin à partir de ta nuit, de ta FC de repos, de ta fraîcheur au réveil et du ressenti de la veille, comparés à TES 14 jours précédents (pas à une norme). Il ne change plus une fois calculé.',
        'A score from 0 to 100, calculated every morning from your night, your resting HR, your freshness on waking and yesterday’s RPE, compared with YOUR previous 14 days (not with a norm). It no longer changes once calculated.'),
      ul(
        ['**Sommeil** (poids 24 %) : la durée de la nuit. Plus long que d’habitude est mieux. Si une même nuit a plusieurs périodes de sommeil, la plus longue est retenue.', '**Sleep** (weight 24 %): the length of the night. Longer than usual is better. If a night has several sleep periods, the longest is kept.'],
        ['**FC de repos** (20 %) : plus basse que d’habitude est mieux.', '**Resting HR** (20 %): lower than usual is better.'],
        ['**Variabilité cardiaque** (20 %) : le RMSSD du jour, en ms. Plus haute que d’habitude est mieux. Cette ligne n’existe que si ta montre en envoie ; sans elle, les autres poids se répartissent comme avant (30 / 25 / 30 / 15 %).', '**Heart-rate variability** (20 %): today’s RMSSD, in ms. Higher than usual is better. This line only exists if your watch sends it; without it, the other weights are shared out as before (30 / 25 / 30 / 15%).'],
        ['**Fraîcheur** (24 %) : celle de la fin de la veille (au réveil), pas celle d’aujourd’hui, qui bouge avec la séance du matin. Positive est mieux.', '**Freshness** (24 %): the one at the end of the previous day (on waking), not today’s, which moves with the morning session. Positive is better.'],
        ['**RPE de la veille** (12 %) : le plus haut RPE de la veille. Plus bas est mieux.', '**Yesterday’s RPE** (12 %): the highest RPE of the previous day. Lower is better.'],
      ),
      f('score de chaque composante = 50 + 25 × z, borné entre 0 et 100\nz = (valeur du jour − médiane des 14 jours précédents) ÷ dispersion, borné entre −2 et +2\nscore du jour = moyenne des composantes, pondérée par leurs poids',
        'score of each component = 50 + 25 × z, bounded between 0 and 100\nz = (today’s value − median of the previous 14 days) ÷ spread, bounded between −2 and +2\ndaily score = average of the components, weighted by their weights'),
      p('Une composante n’est utilisée que s’il y a au moins 3 jours de référence. Quand une composante manque (par exemple la nuit n’est pas encore remontée de la montre), son poids est réparti sur les autres, et l’écran l’indique. Si les composantes disponibles pèsent moins de 50 % au total, le score n’est pas calculé (« Pas encore calculable »). Avec une montre lue par Health Connect, il apparaît en quelques jours.',
        'A component is only used if there are at least 3 reference days. When a component is missing (for example the night has not yet come through from the watch), its weight is spread over the others, and the screen says so. If the available components weigh less than 50 % in total, the score is not calculated (“Not computable yet”). With a watch read through Health Connect, it shows up within a few days.'),
      p('Les libellés :', 'The labels:'),
      ul(
        ['Épuisé : moins de 25 · Entamé : 25 à 44 · Correct : 45 à 64 · Disponible : 65 à 82 · Frais : 83 et plus.', 'Exhausted: under 25 · Worn: 25 to 44 · OK: 45 to 64 · Ready: 65 to 82 · Fresh: 83 and above.'],
      ),
      p('C’est un indicateur, pas un diagnostic : il compare ton état du jour à tes habitudes, et ne remplace pas ton ressenti.',
        'It is an indicator, not a diagnosis: it compares your state today with your habits, and does not replace how you feel.'),
    ],
  },
  {
    id: 'calc-review', icon: 'target', title: ['Verdict, dérive cardiaque et alertes', 'Verdict, cardiac drift and alerts'],
    blocks: [
      p('Le verdict d’une séance :', 'A session’s verdict:'),
      ul(
        ['**Avec une séance prévue rattachée** : on compare la durée (ou la distance) réalisée à celle qui était prévue. Entre −10 % et +10 % : « Conforme à ce qui était prévu ». En dessous : « Plus courte ». Au-dessus : « Plus longue ». Pour un enchaînement, chaque séance n’est comparée qu’à sa partie.', '**With a linked planned session**: the completed duration (or distance) is compared with the planned one. Within −10 % and +10 %: “As planned”. Below: “Shorter”. Above: “Longer”. For a brick, each session is only compared with its part.'],
        ['**Sans séance prévue** : on compare sa charge à la médiane de tes séances des 8 dernières semaines dans la même discipline (sans les charges provisoires). Plus de 115 % : « Plus chargée que d’habitude ». Moins de 85 % : « Plus légère ». Entre les deux : « Conforme ».', '**With no planned session**: its load is compared with the median of your sessions over the last 8 weeks in the same discipline (without provisional loads). Above 115 %: “Harder than usual”. Below 85 %: “Lighter”. In between: “In line”.'],
        ['**Sans RPE ni FC** : « Charge en attente de ton ressenti ».', '**With no RPE or HR**: “Load waiting for your RPE”.'],
      ),
      p('La dérive cardiaque est l’écart relatif entre la FC moyenne de la 2ᵉ moitié et celle de la 1ʳᵉ moitié de la séance. Elle ne dit quelque chose que pour un effort continu : elle n’est interprétée que si la séance dure au moins 20 minutes et que son plan rattaché ne contient pas de série (un fractionné fait varier la FC par construction). Au-delà de 8 %, un avertissement s’affiche. Sans plan rattaché, l’app ne peut pas savoir si l’effort était continu et ne l’interprète pas.',
        'Cardiac drift is the relative difference between the average HR of the 2nd half and that of the 1st half of the session. It only means something for a steady effort: it is only interpreted if the session lasts at least 20 minutes and its linked plan contains no set (intervals make HR vary by design). Above 8 %, a warning is shown. With no linked plan, the app cannot know whether the effort was steady and does not interpret it.'),
      p('Les alertes de l’Accueil :', 'Home alerts:'),
      ul(
        ['**Séances prévues non réalisées** sur les 7 derniers jours (hors jours d’une interruption qui suspend les alertes).', '**Planned sessions not done** over the last 7 days (excluding days of an interruption that suspends alerts).'],
        ['**RPE élevés à répétition** : tes 3 dernières séances notées sont toutes à RPE 8 ou plus.', '**Repeated high RPE**: your last 3 rated sessions are all at RPE 8 or more.'],
        ['**Hausse de charge rapide** : rapport aigu/chronique supérieur à 1,5.', '**Fast load increase**: acute/chronic ratio above 1.5.'],
        ['**Blessure active et charge qui monte** : une blessure non résolue dans ton profil, pendant que le rapport aigu/chronique atteint 1,3 ou que la charge des 7 derniers jours dépasse de 25 % celle des 7 jours précédents.', '**Active injury and rising load**: an unresolved injury in your profile while the acute/chronic ratio reaches 1.3 or the last 7 days’ load exceeds the previous 7 days’ by 25%.'],
        ['**Séances en attente de ressenti**, dans les 14 derniers jours : leur charge n’est pas fiable tant que tu n’as pas noté ton RPE.', '**Sessions waiting for an RPE**, within the last 14 days: their load is not reliable until you rate your RPE.'],
      ),
    ],
  },
  {
    id: 'watch', icon: 'phone', title: ['Montre et Health Connect', 'Watch and Health Connect'],
    blocks: [
      p('Chemin des données : ta montre Garmin → Garmin Connect → Health Connect (Android) → l’APK Apogée → synchronisation → tes autres appareils. Il faut que Garmin Connect soit relié à Health Connect (Garmin Connect › Paramètres › Health Connect), et que l’application Health Connect soit installée sur le téléphone.',
        'Data path: your Garmin watch → Garmin Connect → Health Connect (Android) → the Apogée APK → sync → your other devices. Garmin Connect must be linked to Health Connect (Garmin Connect › Settings › Health Connect), and the Health Connect app must be installed on the phone.'),
      p('Ce que l’app lit, en lecture seule : les séances (type, durée, distance, FC, vitesse, calories, dénivelé), le sommeil, la FC de repos et le poids (si une balance connectée l’y dépose ; Garmin ne l’envoie pas). Elle n’écrit jamais dans Health Connect. Après une mise à jour de l’APK qui ajoute des données, rouvre « Autoriser Health Connect » pour accorder les nouvelles autorisations.',
        'What the app reads, read-only: sessions (type, duration, distance, HR, speed, calories, elevation), sleep, resting HR and weight (if a connected scale puts it there; Garmin does not send it). It never writes to Health Connect. After an APK update that adds data, reopen “Allow Health Connect” to grant the new permissions.'),
      p('Paramètres › Montre (Health Connect) affiche l’état de la liaison :', 'Settings › Watch (Health Connect) shows the link status:'),
      ul(
        ['**Montre reliée** : la dernière lecture et son résultat (séances vues, nouvelles, complétées, nuits, FC de repos).', '**Watch linked**: the last read and its result (sessions seen, new, completed, nights, resting HR).'],
        ['**Montre pas encore reliée** : appuie sur « Autoriser Health Connect » et coche tout, y compris « Historique » pour reprendre tes séances passées.', '**Watch not linked yet**: tap “Allow Health Connect” and tick everything, including “History” to bring in your past sessions.'],
        ['**Autorisations accordées, montre jamais lue** : lance « Lire la montre ».', '**Permissions granted, watch never read**: tap “Read the watch”.'],
        ['**Health Connect non relié : tu n’es pas dans l’APK** : tu as ouvert la version web (navigateur ou app installée depuis Chrome). Installe et ouvre l’APK.', '**Health Connect not linked: you’re not in the APK**: you opened the web version (browser or app installed from Chrome). Install and open the APK.'],
        ['**Module natif non chargé** : ferme complètement l’app (balaye-la des apps récentes) et rouvre-la.', '**Native module didn’t load**: close the app completely (swipe it away from recent apps) and reopen it.'],
        ['**Indisponible / mise à jour requise** : installe ou mets à jour « Health Connect » depuis le Play Store.', '**Unavailable / update required**: install or update “Health Connect” from the Play Store.'],
      ),
      p('Quand l’app lit :', 'When the app reads:'),
      ul(
        ['À chaque ouverture, au plus toutes les 10 minutes, et avec le bouton ↻ de l’en-tête.', 'Every time it opens, at most every 10 minutes, and with the ↻ button in the header.'],
        ['La première lecture remonte jusqu’à 400 jours si l’historique est autorisé (30 jours sinon). Ensuite chaque lecture reprend depuis la précédente, avec 48 heures de recouvrement, pour récupérer ce que Garmin envoie en retard.', 'The first read goes back up to 400 days if history is allowed (30 days otherwise). After that, each read resumes from the previous one, with a 48-hour overlap, to pick up what Garmin sends late.'],
        ['Une séance déjà connue n’est jamais dupliquée : l’identifiant Garmin sert de clé. Elle est complétée si la montre apporte nettement plus de mesures cardiaques (au moins 5 de plus), sauf si tu l’as corrigée à la main.', 'An already-known session is never duplicated: the Garmin identifier is the key. It is completed if the watch brings clearly more heart-rate readings (at least 5 more), unless you corrected it by hand.'],
      ),
    ],
  },
  {
    id: 'coach', icon: 'coach', title: ['Coach IA : dossier et plan', 'AI coach: dossier and plan'],
    blocks: [
      p('L’échange avec ton coach IA se fait par fichiers, dans un format versionné (« apogee/1 »). L’app ne parle jamais à une IA directement : c’est toi qui transmets.',
        'The exchange with your AI coach goes through files, in a versioned format (“apogee/1”). The app never talks to an AI directly: you pass things along.'),
      p('1. Envoyer le dossier (onglet Coach) :', '1. Send the dossier (Coach tab):'),
      ul(
        ['Le dossier reprend l’état réel au moment de l’export : si tu as modifié une séance prévue par le coach, c’est la version modifiée qui part, marquée « modifiée par l’athlète ». Les séances prévues des jours passés y figurent avec leur statut (faite ou manquée).', 'The dossier reflects the real state at export time: if you edited a session the coach planned, the edited version is sent, marked “edited by the athlete”. Planned sessions of past days are included with their status (done or missed).'],
        ['Choisis la période des séances jointes (1, 2, 4 ou 8 semaines) et coche celles à inclure.', 'Choose the period of attached sessions (1, 2, 4 or 8 weeks) and tick those to include.'],
        ['Le dossier contient ton profil, ta course, tes indicateurs, ta périodisation, ta charge, les séances prévues des 8 prochaines semaines, les séances cochées, et la consigne de réponse au format apogee/1.', 'The dossier contains your profile, race, metrics, periodisation, load, the planned sessions for the next 8 weeks, the ticked sessions, and the reply instructions in apogee/1 format.'],
        ['« Exporter le fichier » crée un fichier JSON ; « Copier » le met dans le presse-papiers. Donne-le à ton coach IA (dans une conversation ou un projet).', '“Export the file” creates a JSON file; “Copy” puts it on the clipboard. Give it to your AI coach (in a conversation or a project).'],
        ['Le texte de consigne et le fichier restent en français quelle que soit la langue de l’app, pour que n’importe quel modèle les suive de la même façon.', 'The instruction text and the file stay in French whatever the app language, so that any model follows them the same way.'],
      ),
      p('2. Importer le plan (« Importer un plan ») :', '2. Import the plan (“Import a plan”):'),
      ul(
        ['Colle la réponse du coach (un seul bloc JSON) ou ouvre le fichier qu’il a produit, puis « Analyser ».', 'Paste the coach’s reply (a single JSON block) or open the file it produced, then “Analyse”.'],
        ['Un aperçu liste les séances et blocs créés, modifiés, supprimés ou rejetés (avec la raison). Rien n’est modifié avant que tu appuies sur « Appliquer ».', 'A preview lists the sessions and blocks created, updated, deleted or rejected (with the reason). Nothing changes until you tap “Apply”.'],
        ['Les opérations rejetées (date invalide, séance sans bloc, blocs de périodisation qui se chevauchent…) sont signalées une à une ; les autres sont appliquées.', 'Rejected operations (invalid date, session without blocks, overlapping periodisation blocks…) are reported one by one; the others are applied.'],
        ['Un plan déjà importé est signalé. Tu peux malgré tout le réappliquer : les séances que tu aurais supprimées depuis sont recréées, et les autres reviennent à la version du coach.', 'An already-imported plan is flagged. You can still apply it again: sessions you may have deleted since are recreated, and the others go back to the coach’s version.'],
        ['L’app te propose aussi un lien d’aide quand le fichier collé est en réalité un dossier-athlète (celui qu’on envoie au coach) : elle propose alors d’en reprendre les séances.', 'The app also helps when the pasted file is actually an athlete dossier (the one sent to the coach): it then offers to take its sessions.'],
      ),
      p('Le journal des échanges garde l’historique des dossiers envoyés et des plans importés. La validité du plan (« valable jusqu’au ») sert aux rappels : voir « Rappels ».',
        'The exchange log keeps the history of dossiers sent and plans imported. The plan’s validity (“valid until”) drives the reminders: see “Reminders”.'),
    ],
  },
  {
    id: 'settings', icon: 'settings', title: ['Paramètres', 'Settings'],
    blocks: [
      ul(
        ['**Compte & synchronisation** : connexion Google, « Synchroniser maintenant », déconnexion.', '**Account & sync**: Google sign-in, “Sync now”, sign out.'],
        ['**Montre (Health Connect)** : voir « Montre et Health Connect ».', '**Watch (Health Connect)**: see “Watch and Health Connect”.'],
        ['**Athlète › Profil** : prénom, date de naissance (sert à estimer la FC max), sexe (choisit les coefficients du TRIMP), jours disponibles, matériel, blessures et points de vigilance. Tout cela est transmis au coach.', '**Athlete › Profile**: first name, date of birth (used to estimate max HR), sex (selects the TRIMP coefficients), available days, equipment, injuries and points to watch. All of it is sent to the coach.'],
        ['**Athlète › Indicateurs** : VMA, FTP, CSS, FC max, avec leur historique.', '**Athlete › Metrics**: MAS, FTP, CSS, max HR, with their history.'],
        ['**Athlète › Course objectif**, **Périodisation**, **Interruptions** : voir leurs rubriques.', '**Athlete › Target race**, **Periodisation**, **Interruptions**: see their topics.'],
        ['**Calculs › Charge provisoire** : active ou non la charge provisoire pour les séances sans FC ni RPE.', '**Calculations › Provisional load**: turns the provisional load on or off for sessions without HR or RPE.'],
        ['**Calculs › Heure des rappels** : l’heure à laquelle arrivent les rappels de séance.', '**Calculations › Reminder time**: the time at which session reminders arrive.'],
        ['**Thème** : clair, sombre, ou « Système » qui suit le réglage de ton appareil.', '**Theme**: light, dark, or “System” which follows your device setting.'],
        ['**Langue** : Français ou English. L’app redémarre dans la langue choisie.', '**Language**: Français or English. The app restarts in the chosen language.'],
        ['**Données** : exporter, restaurer une sauvegarde. Voir « Données, export et sauvegarde ».', '**Data**: export, restore a backup. See “Data, export and backup”.'],
      ),
      p('Interruptions : une blessure, un déplacement, un bivouac ou un effort non mesuré (déménagement) se déclarent comme une période. Elle peut suspendre les rappels et les alertes de séances manquées. Une charge forfaitaire par jour peut remplacer la charge mesurée des jours sans séance : 0 pour un arrêt complet, une valeur pour un effort réel mais non mesuré. La forme de fond reflète alors la réalité plutôt qu’un arrêt fictif. Deux interruptions ne peuvent pas se chevaucher.',
        'Interruptions: an injury, a trip, a bivouac or an unmeasured effort (moving house) is declared as a period. It can suspend reminders and missed-session alerts. A flat daily load can replace the measured load of days without a session: 0 for a complete stop, a value for a real but unmeasured effort. Fitness then reflects reality rather than a fictional stop. Two interruptions cannot overlap.'),
    ],
  },
  {
    id: 'data', icon: 'database', title: ['Données, export et sauvegarde', 'Data, export and backup'],
    blocks: [
      p('Où sont tes données :', 'Where your data is:'),
      ul(
        ['Sur ton appareil, dans le stockage de l’app. L’app fonctionne sans connexion.', 'On your device, in the app’s storage. The app works offline.'],
        ['Si tu te connectes avec Google, une copie dans ton espace Firebase privé (règles : seul ton compte y accède). Chaque enregistrement se synchronise séparément ; en cas de modification des deux côtés, la plus récente gagne. Une suppression se propage aux autres appareils.', 'If you sign in with Google, a copy in your private Firebase space (rules: only your account can access it). Each record syncs separately; if both sides changed, the most recent wins. A deletion propagates to the other devices.'],
        ['Rien de calculé n’est stocké : charges, forme et rattachements se recalculent sur chaque appareil à partir des mêmes données, donc téléphone, PC et iPhone affichent les mêmes chiffres.', 'Nothing calculated is stored: loads, form and links are recalculated on each device from the same data, so phone, PC and iPhone show the same figures.'],
      ),
      p('Exports et reprises (Paramètres › Données) :', 'Exports and imports (Settings › Data):'),
      ul(
        ['**Exporter en Excel** : un classeur de 6 onglets (tableau de bord, séances, plan, charge, zones, périodisation) avec formules et graphiques recalculés à l’ouverture. Il reste en français.', '**Export to Excel**: a 6-sheet workbook (dashboard, sessions, plan, load, zones, periodisation) with formulas and charts recalculated on opening. It stays in French.'],
        ['**Exporter une sauvegarde (.json)** : toutes tes données, relisibles par l’app.', '**Export a backup (.json)**: all your data, readable by the app.'],
        ['**Restaurer ou compléter (.json)** : une sauvegarde Apogée remplace tes données (avec « Annuler »). Un dossier coach de l’ancienne app ajoute seulement les séances et séances prévues qui manquent, sans doublon, et complète les ressentis absents.', '**Restore or complete (.json)**: an Apogée backup replaces your data (with “Undo”). A coach dossier from the old app only adds missing sessions and planned sessions, without duplicates, and fills in missing RPEs.'],
      ),
      p('Dans l’APK, chaque export ouvre le menu de partage d’Android. Sur PC et iPhone, le fichier est téléchargé.',
        'In the APK, each export opens Android’s share menu. On PC and iPhone, the file is downloaded.'),
      p('Effacer toutes mes données : il faut recopier le nombre de séances enregistrées, puis confirmer. Ça efface tout sur l’appareil, et aussi dans le compte si tu es connecté. Exporte d’abord une sauvegarde si tu veux pouvoir revenir en arrière. « Supprimer seulement la copie en ligne » garde les données de l’appareil.',
        'Erase all my data: you must retype the number of recorded sessions, then confirm. It erases everything on the device, and also in the account if you are signed in. Export a backup first if you want to be able to go back. “Delete only the online copy” keeps the device data.'),
    ],
  },
  {
    id: 'reminders', icon: 'bell', title: ['Rappels (notifications)', 'Reminders (notifications)'],
    blocks: [
      p('Les rappels n’existent que dans l’APK Android (pas sur iPhone ni sur PC). Ils sont locaux : calculés sur le téléphone, sans serveur.',
        'Reminders only exist in the Android APK (not on iPhone or PC). They are local: calculated on the phone, without a server.'),
      ul(
        ['**Séance du jour** : le matin d’une séance prévue qui n’est pas encore rattachée à une séance faite, pour les 3 prochains jours, à l’heure choisie dans Paramètres (7 h par défaut).', '**Today’s session**: the morning of a planned session that is not yet linked to a completed one, for the next 3 days, at the time chosen in Settings (7:00 by default).'],
        ['**Plan bientôt à échéance** : 3 jours avant la date « valable jusqu’au » du dernier plan importé.', '**Plan ending soon**: 3 days before the “valid until” date of the last imported plan.'],
        ['**Plan à renouveler** : 7 jours après cette date, puis tous les 7 jours. Sans plan importé, le rappel se déclenche tout de suite.', '**Plan to renew**: 7 days after that date, then every 7 days. With no imported plan, the reminder triggers right away.'],
      ),
      p('Aucun rappel n’est envoyé les jours couverts par une interruption qui suspend les rappels. Autorise les notifications quand Android le demande.',
        'No reminder is sent on days covered by an interruption that suspends reminders. Allow notifications when Android asks.'),
    ],
  },
  {
    id: 'glossary', icon: 'list', title: ['Glossaire', 'Glossary'],
    blocks: [
      ul(
        ['**RPE** (ressenti de l’effort) : ton effort perçu de 1 (très facile) à 10 (maximal).', '**RPE** (rate of perceived exertion): your perceived effort from 1 (very easy) to 10 (maximal).'],
        ['**TRIMP** : « impulsion d’entraînement », une charge calculée à partir de la FC et de la durée (méthode de Banister).', '**TRIMP**: “training impulse”, a load calculated from HR and duration (Banister’s method).'],
        ['**Charge** : l’effort total d’une séance, sur l’échelle du TRIMP.', '**Load**: the total effort of a session, on the TRIMP scale.'],
        ['**Forme de fond / fitness**, **fatigue**, **fraîcheur** : voir « Forme de fond, fatigue, fraîcheur ».', '**Fitness**, **fatigue**, **freshness**: see “Fitness, fatigue, freshness”.'],
        ['**Rapport aigu / chronique** : la charge des 7 derniers jours rapportée à la moyenne hebdomadaire des 28 derniers jours.', '**Acute/chronic ratio**: the load of the last 7 days relative to the weekly average of the last 28 days.'],
        ['**FC max / FC de repos** : fréquence cardiaque maximale et au repos, en battements par minute (bpm).', '**Max HR / resting HR**: maximum and resting heart rate, in beats per minute (bpm).'],
        ['**VMA** (en anglais MAS) : vitesse maximale aérobie, la vitesse de course qu’on tient environ 6 minutes. En km/h.', '**MAS** (in French VMA): maximal aerobic speed, the running speed you can hold for about 6 minutes. In km/h.'],
        ['**FTP** : puissance au seuil fonctionnel, en watts, pour le vélo (environ ce que tu tiens une heure).', '**FTP**: functional threshold power, in watts, for cycling (roughly what you can hold for an hour).'],
        ['**CSS** : vitesse critique de nage, en temps aux 100 m.', '**CSS**: critical swim speed, as time per 100 m.'],
        ['**1RM** : la charge maximale que tu peux soulever une seule fois.', '**1RM**: the maximum load you can lift once.'],
        ['**BRICK** : un enchaînement de deux disciplines (typiquement vélo puis course).', '**BRICK**: a back-to-back combination of two disciplines (typically bike then run).'],
        ['**AMRAP** : « as many rounds as possible », un maximum de tours dans un temps donné. **EMOM** : un départ toutes les minutes (ou toutes les X).', '**AMRAP**: “as many rounds as possible” within a given time. **EMOM**: a start every minute (or every X).'],
        ['**Dérive cardiaque** : la hausse de FC pendant un effort continu à intensité égale.', '**Cardiac drift**: the rise in HR during a steady effort at equal intensity.'],
        ['**Charge provisoire / estimée** : une charge qui n’est pas mesurée, soulignée en pointillés et remplacée dès qu’une meilleure information arrive.', '**Provisional / estimated load**: a load that is not measured, underlined with dots and replaced as soon as better information arrives.'],
        ['**Health Connect** : le service d’Android où Garmin Connect dépose tes données de santé.', '**Health Connect**: the Android service where Garmin Connect puts your health data.'],
        ['**apogee/1** : le format du fichier d’échange avec le coach IA.', '**apogee/1**: the format of the exchange file with the AI coach.'],
      ),
    ],
  },
  {
    id: 'faq', icon: 'info', title: ['Questions fréquentes et dépannage', 'FAQ and troubleshooting'],
    blocks: [
      p('Je ne trouve pas où télécharger l’APK.', 'I can’t find where to download the APK.'),
      ul(['Utilise le lien de la rubrique « Démarrer et installer » (page Releases du dépôt `mathieuoury34-gif/apogee`, fichier apogee.apk).', 'Use the link in the “Getting started and installing” topic (Releases page of the `mathieuoury34-gif/apogee` repository, file apogee.apk).']),
      p('Ma charge ou ma forme est à 0 ou « Pas encore calculable ».', 'My load or form is 0 or “Not computable yet”.'),
      ul(
        ['La charge a besoin d’au moins une séance enregistrée, et d’une FC max et d’une FC de repos pour le TRIMP. Renseigne ta date de naissance (ou ta FC max) et laisse la montre remonter ta FC de repos.', 'Load needs at least one recorded session, and a max HR and a resting HR for the TRIMP. Enter your date of birth (or max HR) and let the watch bring in your resting HR.'],
        ['La forme du jour demande quelques nuits et quelques jours de FC de repos (ou de charge) pour comparer à tes propres habitudes.', 'Daily readiness needs a few nights and a few days of resting HR (or load) to compare with your own habits.'],
      ),
      p('Une séance apparaît « en attente de ressenti ».', 'A session shows “waiting for your RPE”.'),
      ul(['Ouvre-la et note ton RPE de 1 à 10. La charge est alors recalculée. Sans RPE ni FC, la charge est seulement provisoire.', 'Open it and enter your RPE from 1 to 10. The load is then recalculated. With no RPE or HR, the load is only provisional.']),
      p('Une séance est en double.', 'A session appears twice.'),
      ul(['La montre ne duplique jamais une séance connue (clé = identifiant Garmin). Un doublon vient d’une saisie manuelle de la même séance : ouvre l’une des deux et supprime-la (« Annuler » reste disponible).', 'The watch never duplicates a known session (key = Garmin identifier). A duplicate comes from a manual entry of the same session: open one of the two and delete it (“Undo” remains available).']),
      p('Une séance prévue reste « non réalisée » alors que je l’ai faite.', 'A planned session stays “missed” although I did it.'),
      ul(['Ouvre le bilan de la séance faite : « Changer » te permet de la rattacher à la séance prévue (jusqu’à 3 jours d’écart).', 'Open the completed session’s review: “Change” lets you link it to the planned session (up to 3 days apart).']),
      p('L’import d’un plan est refusé.', 'The plan import is refused.'),
      ul(
        ['Vérifie que la réponse du coach est un seul bloc JSON, de schéma « apogee/1 ». Le message explique le motif. Les balises ```json que certains modèles ajoutent sont tolérées.', 'Check that the coach’s reply is a single JSON block with schema “apogee/1”. The message explains the reason. The ```json fences some models add are tolerated.'],
        ['Un fichier qui est en fait un dossier-athlète n’est pas un plan : l’app propose d’en reprendre les séances.', 'A file that is actually an athlete dossier is not a plan: the app offers to take its sessions.'],
      ),
      p('Je veux changer de téléphone ou utiliser un autre appareil.', 'I want to change phone or use another device.'),
      ul(['Connecte-toi avec le même compte Google : tes données se resynchronisent. Pour garder une copie de précaution, exporte une sauvegarde (.json).', 'Sign in with the same Google account: your data syncs back. To keep a safety copy, export a backup (.json).']),
      p('L’app est en français ou en anglais alors que je veux l’autre.', 'The app is in French or English but I want the other.'),
      ul(['Paramètres › Langue.', 'Settings › Language.']),
      p('Mes séances Garmin n’arrivent pas.', 'My Garmin sessions don’t arrive.'),
      ul(
        ['Vérifie Paramètres › Montre : la carte dit précisément ce qui manque. Ouvre Garmin Connect, vérifie que la synchronisation avec Health Connect est active et que la séance y est bien arrivée, puis relance « Lire la montre ».', 'Check Settings › Watch: the card says exactly what is missing. Open Garmin Connect, check that the sync with Health Connect is active and that the session actually arrived there, then run “Read the watch” again.'],
        ['Rappel : seule l’APK Android lit Health Connect.', 'Reminder: only the Android APK reads Health Connect.'],
      ),
    ],
  },
];
