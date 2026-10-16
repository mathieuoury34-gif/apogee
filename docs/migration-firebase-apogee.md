# Migrer vers un nouveau projet Firebase « Apogée »

L'identifiant d'un projet Firebase (`ironapp-99f99`) ne peut pas être changé : pour que le nom « Apogée » apparaisse
partout (écran de connexion Google, console), on crée un **nouveau projet** et on y recopie tes données.
Compte une vingtaine de minutes. L'ancien projet reste intact tant que tu ne le supprimes pas : rien n'est perdu.

## Avant de commencer : une sauvegarde de sécurité

1. Dans l'app actuelle : **Paramètres › Données › Exporter une sauvegarde (.json)** et garde le fichier `.json`.
   (Apogée lit aussi les sauvegardes faites sous les noms Quadra et Iron App.)
2. Vérifie sur ton téléphone et sur ton ordinateur que les deux affichent les mêmes séances. C'est ce qui
   sera envoyé dans le nouveau projet.

## A. Créer le projet (console Firebase)

1. https://console.firebase.google.com › **Ajouter un projet** › nom **apogee** (l'identifiant deviendra
   `apogee-xxxxx`, c'est normal). Google Analytics : non.
2. **Build › Authentication › Commencer › Google** : active-le, adresse d'assistance = la tienne.
3. **Authentication › Settings › Domaines autorisés** : ajoute `mathieuoury34-gif.github.io`.
4. **Build › Firestore Database › Créer une base de données** : emplacement **eur3 (Europe)**, mode production.
5. Onglet **Règles** : colle le contenu de `firestore.rules` (à la racine du dépôt), puis **Publier**.
6. **Paramètres du projet (roue dentée) › Vos applications › Web `</>`** : surnom **Apogée**, sans Hosting.
   Tu obtiens un bloc `firebaseConfig` avec six valeurs : `apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`.

## B. Brancher l'app

Envoie les six valeurs à Claude dans la conversation (elles ne sont pas secrètes : ce sont les règles Firestore
qui protègent les données). Claude remplace `src/data/firebase-config.ts`, envoie sur GitHub, et le site se
republie tout seul en une ou deux minutes.

## C. Recopier tes données

1. Ouvre le site republié sur le **téléphone** (ou l'ordinateur) qui a les données les plus complètes.
2. **Paramètres › Compte & synchronisation › Continuer avec Google**, avec le même compte Google que d'habitude.
3. Le nouveau projet est vide : l'app y envoie tout ce qu'elle a en local (séances, plans, ressentis, objectif…).
4. Fais de même sur l'autre appareil : les données se fusionnent, rien n'est écrasé.
5. Contrôle : mêmes séances et mêmes courbes de charge sur les deux appareils.

## D. Nettoyer (une semaine plus tard, quand tout va bien)

- Console Firebase › ancien projet `ironapp-99f99` › Paramètres › **Supprimer le projet**.
- Désinstalle l'ancienne application Android « Quadra » : l'identifiant de l'app a changé
  (`com.mathieu.apogee`), la nouvelle s'installe à côté, elle ne la remplace pas. Pense à faire la
  sauvegarde `.json` avant, ou à te connecter à Google dans la nouvelle d'abord.

## En cas de souci

- « Domaine non autorisé » à la connexion : l'étape A3 manque.
- « Missing or insufficient permissions » : les règles de l'étape A5 ne sont pas publiées.
- Les données n'arrivent pas : restaure le fichier `.json` de sauvegarde (Paramètres › Données › Restaurer ou compléter),
  puis reconnecte-toi.
