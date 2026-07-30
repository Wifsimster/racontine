# Gauntlet Loop — run record

Une exécution de [`GAUNTLET-LOOP.md`](../GAUNTLET-LOOP.md) sur le visuel et le parcours de Racontine.

## La barre

À l'aveugle, côte à côte, en 390×844 : une capture Playwright réelle de chaque écran contre l'écran
correspondant des meilleures apps de la catégorie (Day One, Tinybeans / FamilyAlbum, Linear / Things 3),
doublée de dix invariants mesurés sur le DOM réel (contraste, cibles ≥ 44 px, grille de 4 px, échelle typo,
débordement à 320 px, parité sombre, états dessinés, focus, budget d'animation, coût du parcours en gestes).

**Réserve honnête** : la sortie réseau de l'environnement est sur liste blanche, donc les captures réelles
des apps concurrentes ne sont pas récupérables. La moitié « pixels » est une **reconstruction** haute-fidélité
(HTML rendu en PNG), pas les captures d'origine. C'est pourquoi elle est doublée de la moitié « invariants »,
qui se mesure et ne se discute pas.

## Résultats de l'A/B aveugle

| Pièce | Verdict | Score | Plus gros écart restant |
|---|---|---|---|
| Fondation | **perdu** | 26 | Titre de journée en 22/20 sur une réglure de 28 px : les lignes du cahier traversent les lettres |
| Connexion | **gagné** | 33,5 | Bordure de champ à 1,51:1 (requis 3:1) — le champ n'a pas de limite visible |
| Journal | **perdu** | 34 | Composition du pli : 209 px de chrome + une carte de 803 px = 1 journée sur 5 visible |
| Capture | **gagné** | 35 | `--primary` et `--destructive` à 1,08:1 — « le chemin » et « échoué » sont la même couleur |
| Relecture | **perdu** | 27 | L'écran ne montre jamais ce qu'il s'apprête à publier : repas et siestes repliés à y=1792 |
| Parcours | **gagné** | 35 (38 non plafonné) | L'attente de publication est une roue muette, sans progression ni annulation |

**Trois pièces sur six perdent encore leur A/B aveugle.** Les scores sont plafonnés à 35 dès qu'un invariant
reste ouvert, quelles que soient les notes par axe — c'est le cas du parcours (38 non plafonné).

## Ce que la boucle a réellement corrigé

- **Journal** — bandeau de mois, chips scannables (`2 repas · sieste 2 h 05 · santé`), récit ramené à
  3 lignes de réglure avec césure explicite, dépliant « 6 moments », en-tête ramené de 6 icônes à 2.
- **Parcours C** — corriger une lecture publiée était *impossible* depuis l'écran où l'on repère l'erreur :
  il fallait passer par la cloche de notifications et espérer que l'entrée y soit encore. Chaque carte porte
  désormais sa sortie.
- **Régression attrapée dans la boucle** — la sortie de correction a d'abord été posée sur toutes les cartes
  sans regarder le rôle : un **lecteur** (mamie, le parrain — la moitié des comptes d'un carnet partagé)
  ouvrait l'éditeur, choisissait une suggestion, voyait le texte changer, tapait « Republier » et recevait
  « accès refusé ». Le critique du parcours l'a mesuré (2 taps perdus, cul-de-sac déterministe, 100 % des
  lecteurs, toutes les cartes) ; la ronde suivante a ajouté [`web/src/lib/access.ts`](../web/src/lib/access.ts),
  seule définition côté client du droit d'écrire, volontairement **plus stricte que le serveur** (rôle inconnu
  → lecteur), câblée sur le journal, la capture et la relecture.

## Ce qui reste ouvert

- Le CTA fixe « Photographier le carnet » occulte encore le bas de la carte du journal (~120 px).
- Contraste : les modificateurs d'opacité sur du **texte** (`text-warning/70`, `/80`) tombent à 3,12:1 et 3,76:1.
- Cibles tactiles : 9 éléments sous 44 px (interrupteur des réglages 44×24, champ d'incertitude 192×28,
  « retirer » d'une page 22×22).
- 320 px : les réglages se chevauchent — le champ est dessiné par-dessus son propre libellé.
- États : sept écrans ont encore un « Chargement… » nu ; la fondation a livré une classe CSS `.skeleton`
  là où il fallait des primitives `<Loading>` / `<EmptyState>` / `<ErrorState>`.
- Parcours A : 6 gestes contre 5 pour la référence. Un des deux est **imposé par la plateforme** — un
  `input[type=file][capture]` ne peut pas s'ouvrir après un changement de route sans un nouveau geste
  utilisateur — donc l'écart réel est d'un geste, nommable.

## Note de méthode

Deux critiques ont attrapé leur propre **sonde** en défaut avant de juger : l'audit de contraste extrayait
trois nombres d'une chaîne de couleur par expression régulière, donc `oklab(… / 0.7)` était lu comme
`rgb(0.48, 0.02, 0.10)`, quasi-noir. Tout `color-mix()` / `oklab()` — c'est-à-dire tout modificateur `/NN` —
était donc **non mesurable**, et l'invariant I1 a été rapporté propre alors qu'il échouait. Corrigé en
résolvant les couleurs par un aller-retour `canvas.fillStyle`.

Un verdict rédigé après la révélation ne compte pas : les deux images sont mélangées en `a.png` / `b.png`,
la correspondance est écrite dans un fichier, le critique rédige, et ne lit la correspondance qu'ensuite.

## Exécution

21 agents prévus, 19 terminés. Le premier lancement a perdu 11 agents sur `API Error: 529 Overloaded` ;
la reprise a rejoué la barre et le harnais depuis le cache. Les deux agents non terminés sont la passe de
vérification finale et la page de suivi HTML — `typecheck` et `build` ont donc été vérifiés à la main
(les deux passent), et ce fichier remplace la page HTML.
