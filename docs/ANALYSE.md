# Apogée — analyse des processus et des calculs

J'ai relu chaque calcul et chaque processus de l'ancienne application (React Native, `iron-app/src`) avant de
les transposer. Ce document liste ce qui a été corrigé ou amélioré, avec la raison et l'effet visible. Tout
ce qui n'y figure pas a été repris à l'identique, en particulier le format coach `apogee/1`, le vocabulaire
des blocs et les seuils validés dans ETAT.md. Les principales corrections sont couvertes par les tests de
`tests/domain.test.ts` (18 tests, lancés à chaque publication).

## A. Charge d'entraînement

**1. Ressenti × durée et TRIMP n'étaient pas sur la même échelle.**
Une séance sans cardio comptait « RPE × minutes » (une séance de 60 min à RPE 6 vaut 360), alors qu'une séance
mesurée vaut un TRIMP de Banister (60 min en endurance donne environ 80 à 110). Les séances saisies à la main
pesaient donc 3 à 5 fois trop lourd dans la forme de fond et la fatigue.
→ Le coefficient qui passe du ressenti au TRIMP est **appris sur tes propres séances** : c'est la médiane du
rapport TRIMP ÷ (RPE × min) sur les séances qui ont les deux, à partir de 5 séances, borné entre 0,12 et 0,6.
Avant ces 5 séances, le coefficient vaut 0,3. Il est affiché dans Progression et transmis au coach (`srpeFactor`).

**2. Une séance saisie avec une FC moyenne n'avait aucun TRIMP.**
→ Un TRIMP est calculé à partir de la FC moyenne (méthode `trimp_avg`), plus fiable que le ressenti.

**3. Une séance en attente de ressenti comptait zéro.**
Après une sortie sans cardio, la fatigue baissait jusqu'à ce que le RPE soit saisi, puis remontait d'un coup.
→ La séance reçoit une **charge provisoire** : ta charge médiane par minute sur 90 jours, multipliée par sa
durée. Elle est marquée « estimée » (soulignée en pointillés) et remplacée dès que le ressenti est saisi.
Un réglage permet de la désactiver (Paramètres › Calculs).

**4. La FC max retenue pouvait être fausse dans les deux sens.**
La formule de Tanaka pouvait passer devant une valeur testée. Le « pic observé » reposait sur le 99ᵉ centile
brut, qu'un seul artefact de ceinture suffisait à gonfler.
→ Une valeur déclarée (test ou saisie) l'emporte toujours. Le pic observé est un pic **soutenu** : la médiane
glissante sur 60 s, en course et en vélo seulement. Il ne relève la FC max déclarée que s'il la dépasse d'au
moins 2 bpm, avec un plafond de 210 bpm. L'écran Zones indique d'où vient la valeur retenue.

**5. Le rapport charge aiguë / chronique ne déclenchait jamais d'alerte.**
L'alerte de hausse brutale de la charge (LOAD_RAMP) était spécifiée, mais rien ne la produisait.
→ L'alerte est produite au-delà de 1,5, et le rapport n'est calculé qu'après 28 jours d'historique. Progression
affiche une jauge 0,5 → 2,0 avec les zones habituelles.

## B. Forme du jour

**6. La forme du jour bougeait au cours de la journée.**
Elle utilisait la fraîcheur du jour même : une séance faite le matin faisait baisser la forme… du matin.
→ La forme du jour utilise la **fraîcheur au réveil**, c'est-à-dire celle de la fin de la veille. Elle ne
change plus une fois calculée.

**7. La référence personnelle incluait le jour évalué.**
Le jour évalué entrait dans la médiane et la dispersion des 14 jours, si bien qu'un écart atténuait sa propre
mesure.
→ La référence porte sur les 14 jours **précédents**. Progression › Forme du jour montre chaque composante, son
poids et ta valeur habituelle.

**8. Plusieurs sommeils pour une même nuit (sieste ou réveil nocturne) : le premier lu l'emportait.**
→ La plus longue période de sommeil l'emporte.

## C. Montre (Health Connect)

**9. Corriger une séance de la montre fabriquait un doublon.**
L'édition créait un nouvel identifiant `manual:…`, et la séance d'origine revenait à la lecture suivante.
L'heure réelle de la séance était aussi perdue.
→ La séance garde son identifiant Garmin. Les champs corrigés sont marqués « saisis » (soulignés), et la
lecture suivante ne les écrase pas.

**10. Une séance déjà lue n'était jamais complétée.**
Quand Garmin envoyait la courbe cardio quelques minutes après la séance, celle-ci restait sans charge mesurée.
→ Une séance déjà connue est **mise à jour** si la montre fournit nettement plus de mesures cardio (au moins
5 de plus), sauf si tu l'as corrigée à la main. Chaque lecture recouvre aussi les 48 dernières heures.

**11. L'historique de Health Connect ne remontait que 30 jours.**
→ Avec l'autorisation « historique », la première lecture remonte 400 jours.

## D. Plan et séances prévues

**12. La durée prévue affichée à l'accueil venait d'une colonne jamais remplie.**
→ La durée et la distance prévues se calculent toujours à partir des blocs.

**13. Les fourchettes d'allure étaient comptées à leur borne basse, et les cibles en % jamais résolues.**
Pour « 5:00–5:20 /km », la durée était estimée à 5:00. Pour « 90 % VMA », aucune durée n'était calculée.
→ Une fourchette compte pour son milieu. Les cibles en % de la VMA ou de la CSS utilisent ta dernière valeur.
Un bloc sans cible (« 400 m crawl ») est estimé à ton allure d'endurance (70 % de la VMA, 90 % de la CSS).
Une valeur estimée est soulignée en pointillés, avec la raison affichée.

**14. Le rattachement prévu ↔ réalisé ne regardait que le jour même.**
Une séance décalée d'un jour restait « non réalisée » et sa jumelle « non prévue ».
→ Une deuxième passe rattache à J−1 ou J+1, avec une confiance plus faible, quand il n'y a aucun candidat le
jour même. Le rattachement n'est plus enregistré : il se recalcule à chaque modification, de la même façon sur
chaque appareil. Seul un choix manuel est enregistré, et il reste réversible (« Revenir à l'automatique »). Le
coach reçoit `matchConfidence: "linked"` pour ces rattachements.

**15. Dans un enchaînement, la course était comparée à la durée totale vélo + course.**
Résultat : chaque course d'enchaînement était jugée « plus courte que prévu ».
→ Chaque séance réalisée n'est comparée qu'à la partie de l'enchaînement de sa discipline. Deux séances
rattachées au même enchaînement prévu comptent comme un enchaînement dans les statistiques, sans proposition
de regroupement à confirmer.

**16. Les habitudes servant de comparaison mélangeaient tout l'historique et toutes les méthodes de charge.**
→ La comparaison se fait sur la médiane des 8 dernières semaines, même discipline, sans les charges provisoires.

## E. Échange avec le coach

**17. L'import d'un plan vérifiait les chevauchements de blocs de périodisation contre l'état AVANT import.**
Un plan qui raccourcissait un bloc pour en insérer un autre était donc rejeté.
→ La vérification porte sur l'état APRÈS import, dans l'ordre du fichier. L'aperçu nomme le bloc en conflit.

**18. Petits défauts de lecture du plan.**
Les balises ```json qu'un modèle ajoute parfois sont maintenant tolérées. Un même plan importé deux fois est
signalé, grâce à son empreinte.

## F. Données et synchronisation

- **Une source de vérité, rien de calculé n'est stocké.** Charges, forme et rattachements se recalculent sur
  chaque appareil à partir des mêmes données, si bien que téléphone, PC et iPhone affichent les mêmes chiffres.
- **Synchronisation enregistrement par enregistrement** (Firestore, `users/{uid}/iron_<collection>/<id>`).
  La version la plus récente gagne. Une suppression laisse une trace qui se propage aux autres appareils. On ne
  bute jamais sur la taille maximale d'un document, même avec les courbes cardio de toute une saison.
- **Annuler** sur toute suppression, modification ou reprise (bandeau en bas de l'écran, comme dans PEAnalyze).

## G. Évolutions du 17/10/2026 (sélection de Mathieu)

- **Recalcul plus rapide.** L'analyse cardiaque d'une séance (nettoyage, pic soutenu, dérive) est mise en cache par
  série : un recalcul complet passe d'environ 80 ms à environ 16 ms. Les résultats sont identiques (testé).
- **Forme du jour avec variabilité cardiaque.** Si la montre envoie la variabilité (RMSSD), elle compte pour 0,20. Sans
  elle, les autres poids se renormalisent exactement comme avant : aucune forme du jour déjà calculée ne change tant
  que la variabilité est absente.
- **Textes corrigés** dans l'aide et les paramètres (rappels, description « multisport »).
- **Rien d'ajouté à la charge.** La puissance, le poids, le sommeil et le tracé GPS sont des lectures à côté : ils ne
  modifient aucune charge, forme de fond ni ACWR. Le TSS affiché est indicatif et distinct de la charge d'Apogée.
- **Estimations proposées, jamais imposées.** VMA (meilleur 6 min), CSS (200/400 m), FTP (95 % du meilleur 20 min) sont
  enregistrées avec la source « estimation » seulement quand tu les adoptes.

## Limites connues

- **Fichier `.db` de l'ancienne app.** Le partage n'emporte pas le fichier annexe où SQLite garde les
  modifications les plus récentes. Après la reprise, vérifie la date de la dernière séance affichée, puis
  laisse la lecture Health Connect compléter les séances.
- **iPhone.** Health Connect n'existe pas sur iOS : les séances arrivent par la synchronisation depuis
  l'Android, et l'iPhone ne reçoit pas de rappels.
- **Données de démonstration.** Les captures d'écran de validation utilisent un jeu fictif (`tools/demo.ts`),
  jamais publié.
