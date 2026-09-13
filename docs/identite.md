# L'identité de Racontine

> À quoi reconnaît-on Racontine, et où cette réponse est-elle écrite.

Ce document ne remplace aucun fichier : il dit **où vit chaque décision**, et
pourquoi elle a été prise. Quand ce texte et le code se contredisent, le code a
raison — et ce texte est à corriger.

Les décisions étaient bonnes ; elles étaient seulement illisibles d'un seul
tenant, dispersées en commentaires de tête dans `index.css`, `ui.ts`,
`Door.tsx`, `LoginBackground.tsx`, `DayStepper.tsx`. Un contributeur — ou un
agent — ne pouvait pas voir le système en entier.

---

## 1. La marque

**Source unique : [`web/brand/mark.mjs`](../web/brand/mark.mjs).** Tout ce qui
porte la marque en sort, par une seule commande :

```bash
pnpm brand            # icônes, favicon, pastille, carte de lien, géométrie React
pnpm brand:lettering  # le lettrage vectorisé (rare : si une police change)
```

### Elle grandit avec sa taille

Deux états, et le seuil est celui de la lisibilité — à 16 px, un R de 6 px n'est
plus une lettre, c'est une tache.

| État | Taille | Dessin | Où |
|---|---|---|---|
| **Compact** | < 64 px | le R seul, capitale à 300/512 | `favicon.svg` (l'onglet) |
| **Page** | ≥ 64 px | le R **posé** : trait de marge sur toute la hauteur, le R écrit juste à sa droite, deux réglures dessous — la seconde s'arrêtant court | icônes PWA, Apple, en-tête de l'app, carte de lien |
| **Silhouette** | une couleur | la même page, sans tuile | pastille de notification Android, signature en pied de porte |

L'état *page* n'est pas une figure de style : la réglure et le trait de marge
sont **déjà** la signature du produit (`.paper-ruled`, `--rule-margin`), employés
sur chaque écran. La marque cesse d'être une lettre dans une boîte — que
n'importe quel produit en R pourrait porter — pour devenir la seule chose que
Racontine dessine partout ailleurs.

### Ce que chaque rendu produit, et pourquoi il diffère

| Fichier | Rendu | Raison de la différence |
|---|---|---|
| `public/favicon.svg` | compact, vectoriel | le seul vu à 16 px |
| `public/pwa-192.png`, `pwa-512.png` | page, coins arrondis | la tuile est posée telle quelle |
| `public/pwa-maskable-512.png` | page, **plein bord**, contracté à 72 % | la plateforme pose SON masque ; tout ce qui compte doit tenir dans le cercle de 80 % (rayon 204,8 px) |
| `public/apple-touch-icon.png` | page, plein bord, 180 px | iOS redessine son squircle, et de vieux iOS composent les coins transparents sur du **noir** |
| `public/badge-96.png` | silhouette blanche sur transparent | Android ne garde que l'**alpha** d'un badge : une tuile pleine y devient un carré gris |
| `public/og.png` | la carte de lien, 1200 × 630 | voir §3 |
| `src/components/marque.generated.ts` | la géométrie, en TypeScript | pour que `<Marque />` ne soit pas une seconde définition de la marque |

### Le verrou, et la signature

- **`<Marque />`** ([`src/components/Marque.tsx`](../web/src/components/Marque.tsx))
  porte la tuile à 26 px dans l'en-tête et sur l'écran de démarrage. C'est
  *exactement* ce que porte l'écran d'accueil.
- **`BookOpenText` n'est plus la marque.** Cette icône Lucide servait de logo
  dans l'en-tête *et* d'icône pour l'entrée « Le journal » du menu : le produit
  et l'une de ses cinq destinations avaient le même glyphe. Elle ne sert plus
  qu'au menu.
- **`<MarqueSignature />` — « Propulsé par Racontine ».** Le nom affiché partout
  ailleurs est `appName`, un réglage d'instance : un foyer qui appelle son
  carnet « Le carnet de Léo » ne voyait plus jamais le nom du produit. Pour un
  logiciel auto-hébergé c'est la bonne fonctionnalité, mais il faut alors **un**
  endroit où la marque ne dépende de rien. C'est cette ligne, au pied des deux
  portes (connexion, invitation) — et c'est la seule de l'app qui ne lit pas
  `appName`.

### Le logotype

[`web/brand/logotype.svg`](../web/brand/logotype.svg) : « Racontine » en Fraunces
SemiBold, **vectorisé** depuis le woff2 de l'app, à l'approche du cran 30/36
(−0,018 em). Sa boîte de vue a pour hauteur la hauteur de **capitale** : poser le
logotype, c'est choisir sa capitale, pas deviner une taille de police.

Il sert partout où aucune webfont ne charge — la carte de lien aujourd'hui, un
export imprimé demain. Dans l'app, le nom reste du **texte** en Fraunces : il est
sélectionnable, il se cherche, il se lit à la synthèse vocale.

---

## 2. Les couleurs et la typographie

**Source unique : [`web/src/index.css`](../web/src/index.css)** (les jetons) et
**[`web/src/lib/ui.ts`](../web/src/lib/ui.ts)** (ce que chaque teinte veut dire).
Rien n'est répété ici — seulement les trois règles qui tiennent l'ensemble :

1. **Une couleur = un sens.** Cinq feutres (repas, sieste, activité, anecdote,
   santé), livrés en paires encre/fond, tous ≥ 5,9:1 dans les **deux** thèmes.
   Le groseille ne dit qu'une chose : l'action. La provenance n'a volontairement
   aucune teinte. *Corollaire : un enfant ne peut pas avoir sa couleur* (voir §4).
2. **Six crans typographiques** — 11 · 13 · 15 · 17 · 22 · 30 — tous les
   interlignes multiples de 4 px, la réglure du papier calée sur le cran du
   récit (17/28). Le sérif ne sert qu'aux deux crans du haut.
3. **La structure vient des filets, pas des ombres**, et la nuit est **dessinée**,
   pas inversée.

Et une règle de travail : **pas de modificateur d'opacité sur un fond**
(`bg-primary/10`). Ils compilent en `color-mix()`, que `getComputedStyle` rend en
`oklab()` — plus aucun outil ne sait alors mesurer le contraste du texte posé
dessus. Les jetons `*-soft`, `*-bg` et `--surface-bar` portent l'alpha déjà
composé, en sRGB.

---

## 3. Les surfaces qui sortent de l'app

Ce sont celles qu'on oublie, et ce sont les seules que voient les gens qui n'ont
pas encore de compte.

### L'e-mail — [`server/src/notifications.ts`](../server/src/notifications.ts)

Une mamie lectrice ne verra peut-être jamais l'app : elle reçoit un e-mail le
soir et clique. Il porte le carnet — papier, feuille bordée de son trait de
marge, encre bleu-nuit, bouton groseille, signature en pied — et surtout la
**bande de feutres de la journée** (« 2 repas · sieste 2 h 05 · joyeuse »), avec
les mêmes mots et les mêmes teintes que le journal — l'humeur y reste neutre,
comme à l'écran, parce qu'elle n'est pas un type de moment. Un proche qui lit ça
dans sa boîte a déjà reçu quelque chose, même s'il ne clique pas ce soir-là.

Trois contraintes propres à l'e-mail expliquent l'écriture du gabarit :

- **aucune webfont ne charge** → le titre est en Georgia, qui est déjà le repli
  déclaré de `--font-serif` ;
- **pas de `<style>`** (Gmail le retire) → tout en style en ligne, mise en page
  par tableaux ;
- **le mode sombre n'est pas pilotable** d'un client à l'autre → on reste en
  clair, avec des couleurs **explicites partout**, un fond implicite étant ce qui
  produit du texte noir sur noir chez les clients qui inversent.

La marque y est dessinée **en tableau**, pas en image : un PNG distant est bloqué
par défaut chez les gens les plus prudents, et la marque y disparaîtrait.

### La carte de lien — `web/index.html` + `public/og.png`

Le lien d'invitation (`/invite/<token>`) se colle dans un SMS ou un fil WhatsApp.
Sans balises sociales il s'y affichait en **URL nue**, sans titre ni vignette, au
moment précis où l'on demande à quelqu'un de confier la journée de son
petit-enfant. C'est le seul chemin par lequel le produit se propage.

La carte est **statique**, et c'est une décision : un aperçu portant le prénom de
l'enfant serait mis en cache par les serveurs de WhatsApp, de Slack et de Google.
**Elle dit le produit, jamais la famille.**

### La notification push — `web/public/push-sw.js`

`icon` est la tuile en couleur ; `badge` est la **silhouette**. Android ne garde
que l'alpha du badge et le repeint en monochrome.

### Une seule promesse

La même phrase — *« Votre carnet de liaison, dématérialisé sans rien demander à
la nounou. »* — dans le manifeste PWA, dans `og:description` et dans le README.
Elle ne doit pas avoir trois formulations.

---

## 4. L'enfant

**Source : [`src/lib/child.ts`](../web/src/lib/child.ts) et
[`src/components/ChildMark.tsx`](../web/src/components/ChildMark.tsx).**

Deux signes, et pas un de plus :

- **La pastille d'initiale, achromatique.** La tentation évidente serait une
  couleur par enfant ; elle est interdite par la règle 1 du §2. L'initiale se
  pose en Fraunces sur `--muted`. Le seul état coloré, `current`, passe en
  groseille pâle pour dire « c'est ce carnet-ci que vous regardez » — la couleur
  de l'action, employée à désigner.
- **L'âge en clair.** `birthdate` était dans le modèle depuis le début et n'était
  lu nulle part. Dans six ans, on relira « 2 ans et 4 mois » plus souvent que
  « 8 septembre ».

Sur la carte du journal, la pastille fait 20 px — la hauteur de l'interligne du
surtitre — et **n'ajoute pas un pixel** à la carte, dont la composition au pli
est mesurée.

---

## 5. Ce qui reste ouvert

- **Le gabarit d'export livre** (couverture, folio, colophon). Le choix des
  polices a été fait pour lui dès le départ, et le logotype vectorisé l'attend —
  mais il n'y a pas encore de fonction d'export à laquelle l'accrocher. À faire
  le jour où elle existe, pas avant.
- **Les crans de Fraunces.** Une seule graisse est chargée (600), pour deux crans
  sur six. C'est suffisant tant que le sérif ne sert qu'aux titres.
- Les écarts encore ouverts du visuel et du parcours sont suivis dans
  [`gauntlet.md`](./gauntlet.md), qui relève d'un autre exercice.
