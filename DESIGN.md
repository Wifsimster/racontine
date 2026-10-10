---
name: Racontine — « Le carnet, en vrai »
source: web/src/index.css
mode: light + dark (.dark/.light class wins, else prefers-color-scheme)
color-format: "sRGB rgb(); OKLCH spec kept in a comment next to each value"
colors:
  light:
    background: "rgb(249 247 242)"
    card: "rgb(254 253 250)"
    popover: "rgb(254 253 250)"
    foreground: "rgb(36 40 70)"
    card-foreground: "rgb(36 40 70)"
    popover-foreground: "rgb(36 40 70)"
    muted-foreground: "rgb(94 98 118)"
    primary: "rgb(184 40 77)"
    primary-foreground: "rgb(253 252 247)"
    primary-hover: "rgb(164 8 60)"
    primary-soft: "rgb(255 235 236)"
    secondary: "rgb(235 236 242)"
    secondary-foreground: "rgb(46 51 79)"
    muted: "rgb(235 236 242)"
    accent: "rgb(240 237 228)"
    accent-foreground: "rgb(36 40 70)"
    border: "rgb(219 221 232)"
    input: "rgb(206 208 220)"
    ring: "rgb(184 40 77)"
    destructive: "rgb(179 36 31)"
    destructive-foreground: "rgb(253 252 247)"
    destructive-hover: "rgb(158 0 8)"
    destructive-soft: "rgb(255 232 228)"
    warning: "rgb(124 86 0)"
    warning-bg: "rgb(250 238 201)"
    success: "rgb(14 101 63)"
    success-bg: "rgb(217 245 227)"
    rule: "rgb(219 222 241)"
    rule-margin: "rgb(184 40 77 / 0.4)"
    seam: "rgb(0 0 0 / 0.07)"
    overlay: "rgb(36 40 70 / 0.28)"
    overlay-strong: "rgb(36 40 70 / 0.55)"
    scrim: "rgb(24 16 9 / 0.58)"
    skeleton: "rgb(232 233 240)"
    surface-bar: "rgb(249 247 242 / 0.88)"
    meal: "rgb(125 74 30)"
    meal-bg: "rgb(253 233 212)"
    nap: "rgb(63 78 151)"
    nap-bg: "rgb(231 236 255)"
    activity: "rgb(14 101 63)"
    activity-bg: "rgb(217 245 227)"
    anecdote: "rgb(124 59 139)"
    anecdote-bg: "rgb(248 232 251)"
    health: "rgb(165 43 30)"
    health-bg: "rgb(255 231 224)"
  dark:
    background: "rgb(16 18 29)"
    card: "rgb(29 32 44)"
    popover: "rgb(36 39 53)"
    foreground: "rgb(235 232 223)"
    card-foreground: "rgb(235 232 223)"
    popover-foreground: "rgb(235 232 223)"
    muted-foreground: "rgb(159 160 174)"
    primary: "rgb(238 125 141)"
    primary-foreground: "rgb(16 18 29)"
    primary-hover: "rgb(254 147 161)"
    primary-soft: "rgb(65 36 40)"
    secondary: "rgb(42 45 58)"
    secondary-foreground: "rgb(235 232 223)"
    muted: "rgb(42 45 58)"
    accent: "rgb(44 48 62)"
    accent-foreground: "rgb(235 232 223)"
    border: "rgb(255 255 255 / 0.16)"
    input: "rgb(255 255 255 / 0.2)"
    ring: "rgb(238 125 141)"
    destructive: "rgb(244 124 110)"
    destructive-foreground: "rgb(16 18 29)"
    destructive-hover: "rgb(255 146 132)"
    destructive-soft: "rgb(66 34 31)"
    warning: "rgb(226 192 109)"
    warning-bg: "rgb(58 47 20)"
    success: "rgb(129 206 162)"
    success-bg: "rgb(25 49 36)"
    rule: "rgb(51 55 72)"
    rule-margin: "rgb(238 125 141 / 0.45)"
    seam: "rgb(255 255 255 / 0.11)"
    overlay: "rgb(6 9 18 / 0.6)"
    overlay-strong: "rgb(4 6 13 / 0.76)"
    scrim: "rgb(11 4 1 / 0.62)"
    skeleton: "rgb(44 48 62)"
    surface-bar: "rgb(16 18 29 / 0.9)"
    meal: "rgb(227 180 125)"
    meal-bg: "rgb(59 42 27)"
    nap: "rgb(166 179 241)"
    nap-bg: "rgb(37 42 61)"
    activity: "rgb(129 206 162)"
    activity-bg: "rgb(25 49 36)"
    anecdote: "rgb(215 166 227)"
    anecdote-bg: "rgb(54 40 57)"
    health: "rgb(245 157 139)"
    health-bg: "rgb(64 38 33)"
typography:
  sans: "\"Nunito\", ui-sans-serif, system-ui, sans-serif (400, 700)"
  serif: "\"Fraunces\", Georgia, serif (600)"
  scale:
    overline: { size: 0.6875rem, line-height: 1rem, tracking: 0.14em, weight: 700 }
    meta: { size: 0.8125rem, line-height: 1.25rem }
    ui: { size: 0.9375rem, line-height: 1.25rem }
    body: { size: 1.0625rem, line-height: 1.75rem }
    title: { size: 1.375rem, line-height: 1.75rem, tracking: -0.012em }
    display: { size: 1.875rem, line-height: 2.25rem, tracking: -0.018em }
rounded:
  base: 1rem
  sm: "calc(var(--radius) - 8px)"
  md: "calc(var(--radius) - 4px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  2xl: "calc(var(--radius) + 8px)"
  3xl: "calc(var(--radius) + 16px)"
elevation:
  card: "var(--elev-1)"
  lift: "var(--elev-2)"
spacing:
  scale: tailwind-default (4px)
  rule-pitch: 1.75rem
  header-h: 3.5rem
  shell-max: "32rem → 36rem (48rem) → 39rem (64rem)"
  measure: 34rem
  action-max: 32rem
  control-h: 44px (h-11)
motion:
  ease-carnet: "cubic-bezier(0.2, 0.7, 0.3, 1)"
  ease-page: "cubic-bezier(0.32, 0.72, 0, 1)"
  default-duration: 180ms
components:
  style: new-york
  primitives: radix (radix-ui)
  icons: lucide-react
---

# Racontine — DESIGN.md

Ce fichier décrit le design system **tel qu'il existe dans le code**. Il ne
propose rien. Chaque valeur vient de `web/src/index.css` sauf mention
contraire ; en cas d'écart, le code fait foi et l'écart va dans
[Known Gaps](#known-gaps).

Référence voisine : `docs/identite.md` (où vit chaque décision : marque,
couleurs, surfaces hors app). Le sens de chaque teinte vit dans
`web/src/lib/ui.ts` (`ITEM_CHIP`, `ITEM_INK`, `ITEM_DOT`, `SOURCE_BADGE`,
`STATUS_BADGE`).

## Overview

Carnet de liaison de la crèche ou de la nounou, photographié puis mis au
propre. Le langage est **« le carnet, en vrai »** : papier crème réglé, encre
bleu-nuit, un trait de marge groseille, et des **feutres** — une couleur par
type de moment. Trois règles tiennent tout (commentaire de tête de
`index.css`) :

1. **Une couleur = un sens.** Chaque teinte est une paire encre / fond, mesurée dans les deux thèmes. Le groseille ne dit qu'une chose : l'action.
2. **Six crans typographiques**, interlignes multiples de 4 px.
3. **La structure vient des filets, pas des ombres.** La nuit est dessinée, pas inversée.

Teintes pensées en OKLCH, **écrites en sRGB** pour que tout outil de mesure
de contraste lise des `rgb()` ; la spécification OKLCH est en commentaire à
côté de chaque valeur.

## Colors

Mode sombre : `@variant dark` dans `:root` (l. 259–329). Le variant `dark:`
répond à `.dark` / `.light` posé à la main, sinon à `prefers-color-scheme`
(`@custom-variant dark`, l. 11–20).

### Surfaces, encres, action

| Token | Clair | Sombre | Rôle |
| --- | --- | --- | --- |
| `--background` | `rgb(249 247 242)` | `rgb(16 18 29)` | Le papier (porté par `html`) |
| `--card` | `rgb(254 253 250)` | `rgb(29 32 44)` | La feuille |
| `--popover` | `rgb(254 253 250)` | `rgb(36 39 53)` | Couches flottantes |
| `--foreground` | `rgb(36 40 70)` | `rgb(235 232 223)` | Encre bleu-nuit / blanc chaud |
| `--muted-foreground` | `rgb(94 98 118)` | `rgb(159 160 174)` | Encre pâlie |
| `--primary` | `rgb(184 40 77)` | `rgb(238 125 141)` | Groseille : l'action |
| `--primary-foreground` | `rgb(253 252 247)` | `rgb(16 18 29)` | Texte sur primary |
| `--primary-hover` | `rgb(164 8 60)` | `rgb(254 147 161)` | Survol : fonce le jour, éclaire la nuit |
| `--primary-soft` | `rgb(255 235 236)` | `rgb(65 36 40)` | Fond groseille pâle, `::selection` |
| `--secondary` / `--muted` | `rgb(235 236 242)` | `rgb(42 45 58)` | Neutres d'interface |
| `--secondary-foreground` | `rgb(46 51 79)` | `rgb(235 232 223)` | |
| `--accent` | `rgb(240 237 228)` | `rgb(44 48 62)` | Survol : le papier qui s'assombrit |
| `--border` | `rgb(219 221 232)` | `rgb(255 255 255 / 0.16)` | Le filet |
| `--input` | `rgb(206 208 220)` | `rgb(255 255 255 / 0.2)` | Bord de champ |
| `--ring` | `rgb(184 40 77)` | `rgb(238 125 141)` | Focus |

### États

| Token | Clair | Sombre |
| --- | --- | --- |
| `--destructive` / `-foreground` | `rgb(179 36 31)` / `rgb(253 252 247)` | `rgb(244 124 110)` / `rgb(16 18 29)` |
| `--destructive-hover` | `rgb(158 0 8)` | `rgb(255 146 132)` |
| `--destructive-soft` | `rgb(255 232 228)` | `rgb(66 34 31)` |
| `--warning` / `-bg` | `rgb(124 86 0)` / `rgb(250 238 201)` | `rgb(226 192 109)` / `rgb(58 47 20)` |
| `--success` / `-bg` | `rgb(14 101 63)` / `rgb(217 245 227)` | `rgb(129 206 162)` / `rgb(25 49 36)` |

### Feutres (un par type de moment)

| Token | Sens | Clair (encre / fond) | Sombre (encre / fond) |
| --- | --- | --- | --- |
| `--meal` | Repas, or brûlé | `rgb(125 74 30)` / `rgb(253 233 212)` | `rgb(227 180 125)` / `rgb(59 42 27)` |
| `--nap` | Sieste, indigo | `rgb(63 78 151)` / `rgb(231 236 255)` | `rgb(166 179 241)` / `rgb(37 42 61)` |
| `--activity` | Activité, vert | `rgb(14 101 63)` / `rgb(217 245 227)` | `rgb(129 206 162)` / `rgb(25 49 36)` |
| `--anecdote` | Anecdote, prune | `rgb(124 59 139)` / `rgb(248 232 251)` | `rgb(215 166 227)` / `rgb(54 40 57)` |
| `--health` | Santé, rouge | `rgb(165 43 30)` / `rgb(255 231 224)` | `rgb(245 157 139)` / `rgb(64 38 33)` |

### Réglure, voiles, barres

| Token | Clair | Sombre |
| --- | --- | --- |
| `--rule` | `rgb(219 222 241)` | `rgb(51 55 72)` |
| `--rule-margin` | `rgb(184 40 77 / 0.4)` | `rgb(238 125 141 / 0.45)` |
| `--seam` (liseré 1 px des images) | `rgb(0 0 0 / 0.07)` | `rgb(255 255 255 / 0.11)` |
| `--overlay` / `--overlay-strong` | `rgb(36 40 70 / 0.28)` / `/ 0.55` | `rgb(6 9 18 / 0.6)` / `rgb(4 6 13 / 0.76)` |
| `--scrim` (texte sur photo) | `rgb(24 16 9 / 0.58)` | `rgb(11 4 1 / 0.62)` |
| `--skeleton` | `rgb(232 233 240)` | `rgb(44 48 62)` |
| `--surface-bar` (barres collantes) | `rgb(249 247 242 / 0.88)` | `rgb(16 18 29 / 0.9)` |

## Typography

Polices auto-hébergées dans `web/public/fonts/` (hors ligne, cohérentes avec
le futur export livre), `font-display: swap` : **Nunito** 400 et 700,
**Fraunces** 600. Le sérif ne sert qu'aux deux crans du haut.

| Cran | Utilitaire | Taille / interligne | Extra |
| --- | --- | --- | --- |
| Surtitre | `text-overline` (classe `.surtitre`) | 11 / 16 | `0.14em`, 700 |
| Méta | `text-meta` | 13 / 20 | |
| Interface | `text-ui` (défaut du `body`) | 15 / 20 | |
| Récit | `text-body` (`.carnet-story`) | 17 / 28 | interligne = `--rule-pitch` |
| Titre | `text-title` | 22 / 28 | `-0.012em`, Fraunces 600 |
| Bandeau | `text-display` | 30 / 36 | `-0.018em`, Fraunces 600 |

Les crans Tailwind historiques sont réécrits pour retomber dans ces six :
`text-xs` → 11/16, `sm` → 13/20, `base` → 15/20, `lg` → 17/28, `xl` et `2xl`
→ 22/28, `3xl`–`5xl` → 30/36. Interlignes absolus : `leading-tight` 20 px,
`snug` 24, `normal` et `relaxed` 28, `loose` 36. `h1–h4` en `text-wrap:
balance`, `p` en `pretty`, `time` et `[data-tabular]` en chiffres tabulaires.

## Layout

| Token | Valeur | Rôle |
| --- | --- | --- |
| `--rule-pitch` | `1.75rem` | Une ligne du cahier = l'interligne du récit |
| `--header-h` | `3.5rem` | Chrome haut |
| `--shell-max` | `32rem`, `36rem` dès `48rem`, `39rem` dès `64rem` | Colonne de lecture (`shell-width`) |
| `--measure` | `34rem` | Mesure du récit (`.measure`) |
| `--action-max` | `32rem` | Largeur max d'une barre d'action |
| `--safe-t/r/b/l` | `env(safe-area-inset-*, 0px)` | Zones sûres PWA |

Espacement Tailwind par défaut (4 px). Cible tactile 44 px : toutes les
tailles de Button sont `h-11` (sauf `lg` `h-12`).

## Elevation

| Token | Clair | Sombre |
| --- | --- | --- |
| `--elev-1` → `shadow-card` | `0 1px 2px -1px rgb(36 40 70 / 0.1), 0 10px 28px -18px rgb(36 40 70 / 0.22)` | `inset 0 1px 0 0 rgb(255 255 255 / 0.05), 0 8px 24px -16px rgb(0 0 0 / 0.7)` |
| `--elev-2` → `shadow-lift` | `0 2px 6px -2px rgb(36 40 70 / 0.12), 0 22px 48px -24px rgb(36 40 70 / 0.28)` | `inset 0 1px 0 0 rgb(255 255 255 / 0.08), 0 24px 48px -24px rgb(0 0 0 / 0.85)` |

Deux couches maximum en clair ; en sombre, un liseré haut remplace l'ombre.
Usages : `shadow-card` ×58, `shadow-lift` ×11.

## Shapes

`--radius: 1rem`, pas de 4 px (`@theme inline` l. 351–358) :

| Classe | Valeur | Commentaire du code |
| --- | --- | --- |
| `rounded-sm` | 8 px | Puce, pastille |
| `rounded-md` | 12 px | Tuile d'icône |
| `rounded-lg` | 16 px | Encart |
| `rounded-xl` | 20 px | Bouton, champ, image, carte compacte |
| `rounded-2xl` | 24 px | La feuille (Card) |
| `rounded-3xl` | 32 px | Vignette d'état vide |

Composants : Card `rounded-2xl`, Button et Input `rounded-xl`, Button
`icon` `rounded-full`.

## Motion

`@theme` (l. 466–479) : `--ease-carnet` `cubic-bezier(0.2, 0.7, 0.3, 1)`,
`--ease-page` `cubic-bezier(0.32, 0.72, 0, 1)`, durée par défaut 180 ms.
Budget : pression 120 ms (`scale(.97)`), survol 140 ms, pastille 160 ms,
défaut 180 ms, page / panneau 220 ms (`ease-page`). Rien hors 120–260 ms sauf
deux boucles : squelette 1 200 ms, scanner 1 800 ms. Classes : `.page-enter`,
`.panel-down`, `.rise-enter`, `.animate-scan-sweep`, `.animate-scan-fade`,
`.animate-login-drift`.

## Components

shadcn `new-york`, `radix-ui`, `lucide-react` (45 imports). Installés :
`alert-dialog`, `badge`, `button`, `card`, `input`, `label`, `select`,
`textarea`, `toggle`.

| Composant | Conventions | Source |
| --- | --- | --- |
| `Button` | `default` / `destructive` : fond plein + `shadow-card`, survol `*-hover` (on fonce, jamais de transparence) ; `outline` sur `bg-card` ; `secondary` bordé ; `link` souligné `decoration-primary/40` ; tailles toutes à 44 px | `ui/button.tsx` |
| `Card` | `rounded-2xl border bg-card py-5 shadow-card`, média `seam` + `rounded-t-2xl` | `ui/card.tsx` |
| `Input` | `rounded-xl border-input bg-card text-body shadow-card` | `ui/input.tsx` |
| `Label` | Pas de `leading-none` | `ui/label.tsx` |
| Couche `components` | `.paper-ruled` (+ `--plain`), `.carnet-story`, `.measure`, `.surtitre`, `.seam`, `.scrim`, `.skeleton` | `index.css` l. 547+ |

Focus : `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px
}` sur tout élément.

## Do's and Don'ts

**À faire**
- Une teinte de feutre = un type de moment, toujours en paire encre / fond.
- Le groseille pour l'action, et pour rien d'autre.
- Les jetons `*-soft`, `*-bg`, `--surface-bar` pour un fond teinté ou translucide.
- Rester dans les six crans ; laisser les crans porter leur interligne.

**À éviter**
- Les modificateurs d'opacité sur un fond (`bg-primary/10`, `bg-background/95`) : ils compilent en `color-mix()` et cassent la mesure de contraste.
- `leading-none`.
- Une couleur par enfant (la provenance n'a pas de teinte, `docs/identite.md` §4).
- Une ombre comme structure : la structure, c'est le filet.
- Le sérif hors des crans titre et bandeau.

## Responsive

Mobile d'abord (mesures faites en 390 × 844). La colonne s'ouvre par paliers
en `rem` (`48rem`, `64rem`), jamais en continu. Fond porté par `html`,
`body` transparent ; pas d'`overflow-x: hidden` (un débordement est un bug).

## Known Gaps

Aucun écart ouvert. Corrigés le 2026-10-10 :

1. **Seuil de contraste annoncé** — les deux chiffres étaient vrais, sur deux
   périmètres différents. Mesuré (WCAG 2.x, valeurs sRGB d'`index.css`) :
   plancher de toutes les paires 5,11:1 (`muted-foreground` sur `muted`,
   clair) ; feutres seuls ≥ 5,99:1 (`health`, clair). `index.css` et
   `docs/identite.md` nomment désormais chacun son périmètre, et `index.css`
   ne renvoie plus vers `gauntlet/probe/contrast.js`, absent du dépôt. Aucune
   teinte modifiée.
2. **Rayons des contrôles** — le code fait foi : `Button` et `Input` sont en
   `rounded-xl` (20 px) depuis #36. C'est le commentaire de l'échelle qui a
   été corrigé (20 px = bouton, champ, image, carte compacte). Aucun rendu
   modifié.
3. **`ChildMark` hors échelle** — `text-[11px]` → `text-overline`,
   `text-[21px]` → `text-title` (22 px, +1 px), `rounded-[6px]` →
   `rounded-sm` (8 px). `tracking-normal` annule l'espacement du surtitre,
   qui décentrerait l'initiale.
