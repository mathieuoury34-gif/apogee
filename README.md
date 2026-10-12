# Iron App 2 — web, Android, iPhone, PC

Suivi personnel d'entraînement triathlon (natation, vélo, course, renforcement), reconstruit sur le modèle de
PEAnalyze : même typographie, mêmes icônes, mêmes fenêtres et même navigation, aux couleurs d'Iron App.
**Une seule application web**, installable sur PC, iPhone et Android, synchronisée par un compte Google,
plus **un APK Android** qui lit la montre Garmin via Health Connect.

L'ancienne application (dossier `iron-app`, React Native) n'est pas modifiée : les deux peuvent cohabiter
sur le téléphone (identifiant Android distinct, `com.mathieu.ironapp.v2`) le temps de valider la nouvelle.

## Structure

| Dossier | Contenu |
|---|---|
| `src/domain/` | Calculs, sans interface : TRIMP, charge, forme de fond/fatigue/fraîcheur, forme du jour, rattachement prévu ↔ réalisé, bilans, statistiques, objectif, format coach `ironapp/1`, lecture de l'ancienne base SQLite |
| `src/data/` | Stockage sur l'appareil (IndexedDB), synchronisation Firebase, actions (avec « Annuler »), export Excel et sauvegarde JSON |
| `src/native/` | Pont vers l'APK : Health Connect, fichiers, notifications |
| `src/ui/` | Composants (repris de PEAnalyze), graphiques SVG, icônes, navigation |
| `src/screens/` | Accueil, Calendrier (semaine, mois, séance prévue, éditeur, périodisation), Séances (journal, bilan, saisie, statistiques), Progression (charge, objectif, zones), Coach, Paramètres |
| `src/styles/` | `tokens.css` (mêmes noms de jetons que PEAnalyze, couleurs Iron App) et `app.css` |
| `public/` | Icônes, manifeste, `auth.html` (connexion Google depuis l'APK) |
| `android-shell/` | Coque Android Capacitor : module natif Health Connect (Kotlin), script d'adaptation, icônes, clé de signature |
| `tests/` | Tests des calculs (`npm test`) |
| `tools/` | Données de démonstration et captures d'écran (jamais publiées) |
| `docs/` | Analyse des calculs, contrat coach `ironapp/1` mis à jour |

## Commandes

- `npm install`, puis `npm test` (tests des calculs) et `npm run typecheck` (vérification des types)
- `npm run build` construit l'app dans `dist/`
- `npm run dev` lance un serveur local sur http://127.0.0.1:5173

## Mise en ligne (gratuite)

### 1. Dépôt GitHub et GitHub Pages

1. Le dépôt **public** est `mathieuoury34-gif/ironapp` (site : https://mathieuoury34-gif.github.io/ironapp/).
2. Envoie le contenu de ce dossier sur la branche `main`. Le fichier `.github/workflows/publier.yml` doit être
   présent. Si tu passes par l'interface web, qui ignore les dossiers commençant par un point : crée le fichier
   `.github/workflows/publier.yml` à la main et colles-y le contenu de `github-workflows/publier.yml`.
3. Dans **Settings › Pages**, choisis **Source : GitHub Actions**.
4. À chaque envoi, l'onglet **Actions** teste, construit et publie l'app sur
   `https://mathieuoury34-gif.github.io/ironapp/`, puis construit l'APK.

### 2. Projet Firebase « ironapp » (synchronisation, offre Spark sans carte bancaire)

**Fait le 12/10/2026** : projet `ironapp-99f99`, connexion Google activée, domaine
`mathieuoury34-gif.github.io` autorisé, Firestore créé en `eur3 (Europe)`, règles de `firestore.rules` saisies, application
Web « Iron App » déclarée et `src/data/firebase-config.ts` rempli. Les étapes ci-dessous ne servent qu'à
refaire la configuration ailleurs.

1. Va sur https://console.firebase.google.com › **Ajouter un projet** › nom `ironapp`. Google Analytics n'est
   pas utile.
2. **Build › Authentication › Commencer › Google** : active-le et choisis ton adresse comme adresse d'assistance.
3. **Authentication › Settings › Domaines autorisés** : ajoute `<ton-compte>.github.io`.
4. **Build › Firestore Database › Créer une base de données** : emplacement `eur3 (Europe)`, mode production.
5. Dans l'onglet **Règles**, colle le contenu de `firestore.rules`, puis clique **Publier**.
6. **Paramètres du projet (roue dentée) › Vos applications › Web (`</>`)** : nom `Iron App`, sans Hosting.
   Copie les six valeurs de `firebaseConfig` dans `src/data/firebase-config.ts`.
7. Envoie la modification sur GitHub. Le site republié propose alors « Continuer avec Google ».

Tant que `firebase-config.ts` reste vide, l'app fonctionne entièrement en local, comme PEAnalyze avant sa
configuration.

### 3. Installer l'app

- **PC** (Chrome ou Edge) : ouvre l'adresse du site, puis clique sur l'icône « Installer » dans la barre d'adresse.
- **iPhone** : dans Safari, Partager › **Sur l'écran d'accueil**. Health Connect n'existe pas sur iPhone : les
  séances y arrivent par la synchronisation depuis le téléphone Android.
- **Android** : installe l'**APK**, qui lit la montre. Sur GitHub, ouvre **Releases › Iron App — APK Android ›
  iron-app.apk**, puis autorise l'installation depuis le navigateur. L'APK affiche le site publié : chaque
  mise à jour du site met donc l'app à jour sans réinstallation. Il ne faut réinstaller l'APK que si le module
  natif change. Toutes les versions de l'APK sont signées avec la même clé (`android-shell/keystore`), si bien
  qu'une nouvelle version s'installe par-dessus l'ancienne.

## Reprendre les données de l'ancienne application

1. Dans l'ancienne Iron App : **Paramètres › Export › Partager le fichier**. Enregistre le fichier `.db` (dans
   Drive, par exemple).
2. Dans la nouvelle app, ouvre **Paramètres › Données › Reprendre l'ancienne base (.db)** et choisis ce
   fichier. Au premier lancement, la carte de bienvenue propose aussi ce bouton.
3. Le message affiche le nombre de séances reprises et la date de la dernière. L'ancienne app enregistre
   d'abord les dernières modifications dans un fichier annexe que le partage n'emporte pas. Si une saisie très
   récente (un ressenti, un commentaire) manque, refais-la dans la nouvelle app.
   Si des séances récentes manquent, ouvre *Paramètres › Données › Restaurer ou compléter (.json)* et choisis le
   dossier coach exporté depuis l'ancienne app (écran Coach) : les séances jointes et les séances prévues qui
   manquent sont ajoutées, sans doublon. Quand la montre remonte ensuite ces mêmes séances, elles sont
   complétées (courbe cardio), pas dupliquées.
4. Dans l'APK, **Paramètres › Montre › Accorder les autorisations** avec « Historique » coché : la première
   lecture remonte 400 jours de Health Connect. Elle complète les séances sans doublon, car l'identifiant Garmin
   sert de clé.

La reprise garde les identifiants de l'ancienne base, si bien que les clés `session:<n>` / `phase:<n>` déjà
connues du coach restent valables.

## Exports

- **Paramètres › Exporter en Excel** : classeur à 6 onglets (Tableau de bord, Séances, Plan, Charge, Zones,
  Périodisation), avec formules et graphiques recalculés à l'ouverture.
- **Paramètres › Exporter une sauvegarde** : fichier JSON complet, à réimporter avec « Restaurer ou compléter (.json) ».
- **Coach › Exporter le fichier / Copier** : dossier-athlète au format `ironapp/1` (format inchangé).

Dans l'APK, chaque export ouvre le menu de partage d'Android. Sur PC et iPhone, le fichier est téléchargé.
