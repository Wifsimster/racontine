/**
 * Le papier de l'écran d'ouverture.
 *
 * Ce n'est pas un décor derrière un formulaire : c'est la PAGE DE CARNET sur
 * laquelle l'écran est écrit. Trois couches, dans l'ordre de lecture :
 *
 *  1. la RÉGLURE (`paper-ruled`, pas de 28 px) — qui ne commence
 *     qu'AU-DESSOUS du bandeau, comme l'en-tête imprimé d'un vrai carnet de
 *     liaison. Sans ce masque, les lignes du cahier traverseraient les
 *     letterformes du nom de l'instance (30/36) : c'est exactement le défaut
 *     relevé sur le titre de journée de la timeline, et il ne se répétera pas
 *     ici. Sous le masque, la première ligne visible tombe pile sous la ligne
 *     de base de la phrase-promesse, qui est réglée en 17/28 : le texte est
 *     POSÉ sur le papier, il ne flotte pas au-dessus.
 *  2. le TRAIT DE MARGE groseille, lui, court sur toute la hauteur : c'est
 *     l'axe sur lequel tout le contenu est aligné à gauche. Il suit la colonne
 *     de lecture (`ruleLeft`) au lieu de rester collé au bord de la fenêtre :
 *     sur un écran large, la marge d'un carnet reste à 16 px du texte.
 *  3. un HALO groseille très pâle (`--primary-soft`) derrière le bandeau : la
 *     seule chose chaude de l'écran, et elle désigne le nom de l'instance.
 *
 * AUCUNE boucle d'animation, et c'est un choix. La version précédente faisait
 * dériver cinq taches floues aux cinq couleurs des feutres pendant 19 à 28 s :
 * (a) de la couleur décorative — le prune veut dire « anecdote » et l'or
 * « repas », pas « fond d'écran » —, (b) deux boucles hors du budget mouvement
 * publié, (c) en thème sombre, cinq flaques boueuses illisibles. La page est
 * immobile ; seule son ENTRÉE est animée (`rise-enter`, 220 ms), et elle
 * disparaît sous `prefers-reduced-motion`.
 *
 * Tous les tons viennent des jetons existants (`--rule`, `--rule-margin`,
 * `--primary-soft`) : aucune couleur inventée pour cet écran.
 */
export function LoginBackground({
  /** Ligne (px, depuis le haut de la zone sûre) de la PREMIÈRE réglure pleine.
   *  Doit valoir la ligne de base de la phrase-promesse : 189 = 21 + 6 x 28. */
  rulesFrom = 189,
  /** Abscisse du trait de marge — la même expression que le retrait gauche de
   *  la colonne, pour que marge et texte restent liés à toutes les largeurs. */
  ruleLeft = "max(1.5rem, calc(50% - 13rem + 1.5rem))",
}: {
  rulesFrom?: number;
  ruleLeft?: string;
}) {
  // Le voile de la réglure, en trois temps :
  //   · rien au-dessus du bandeau (la ligne du cahier ne barre pas le nom) ;
  //   · pleine force sur la BANDE ÉCRITE, celle de la phrase-promesse ;
  //   · puis extinction lente vers le bas de l'écran. Ce n'est pas une
  //     coquetterie : sous la feuille, le pied de page est réglé en 15/20 et
  //     13/20 — des interlignes qui ne retombent pas sur le pas de 28 px. Une
  //     réglure à pleine force y traverserait tôt ou tard une lettre, ce qui
  //     est exactement le défaut relevé ailleurs dans l'app. On éteint le
  //     papier là où le texte ne peut plus s'y poser.
  // `--safe-t` est ajouté partout pour que, sous une encoche, la grille des
  // lignes descende du même nombre de pixels que le contenu — sinon le texte
  // quitterait les lignes sur un iPhone installé en PWA.
  const veil =
    `linear-gradient(to bottom,` +
    ` transparent calc(var(--safe-t) + ${rulesFrom - 37}px),` +
    ` #000 calc(var(--safe-t) + ${rulesFrom}px),` +
    ` #000 58%, transparent 92%)`;

  // Et le même raisonnement HORIZONTALEMENT, pour une raison de composition :
  // une page de carnet a une largeur. Sur un écran large, la réglure courait
  // d'un bord à l'autre de 1280 px avec le trait de marge planté au milieu et
  // 456 px de papier vide à sa gauche : ça ne se lisait pas comme un carnet,
  // ça se lisait comme un bug de mise en page. La réglure est donc bornée à la
  // COLONNE DE LECTURE (26 rem, la même que le contenu) et s'éteint sur 4 rem
  // de part et d'autre. Aucune requête de média : les arrêts sont exprimés en
  // `50% ± rem`, donc sous ~34 rem de large ils tombent hors de l'écran et rien
  // ne change sur mobile (à 390 px, le premier arrêt vaut -77 px).
  const page =
    `linear-gradient(to right,` +
    ` transparent calc(50% - 17rem), #000 calc(50% - 13rem),` +
    ` #000 calc(50% + 13rem), transparent calc(50% + 17rem))`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* 3 — le halo. Une ellipse basse et large centrée sur le NOM, et rien
          de plus : la première version faisait 34 rem de diamètre et noyait de
          rose les deux tiers de l'écran (en sombre, un nuage brun). Le contraste
          y reste mesuré : encre pâlie sur `--primary-soft` = 5,26:1 en clair et
          5,38:1 en sombre, au-dessus du seuil de 4,5. */}
      {/* `dark:opacity-75` : la nuit, `--primary-soft` (65 36 40) étalé sur
          14 rem lisait comme un frottis brun — un artefact plutôt qu'une
          intention. Le halo reste (c'est lui qui désigne le nom, et c'est la
          seule chose chaude de l'écran) mais il est baissé d'un quart. Le
          contraste du surtitre posé dessus ne peut qu'AUGMENTER : on s'éloigne
          de la teinte, on se rapproche du fond mesuré. */}
      <div
        data-login-halo
        className="absolute left-1/2 h-56 w-[26rem] -translate-x-1/2 dark:h-44 dark:opacity-75"
        style={{
          top: "calc(var(--safe-t) + 0.5rem)",
          background:
            "radial-gradient(closest-side, var(--primary-soft), transparent)",
        }}
      />

      {/* 1 — la réglure, masquée au-dessus de la phrase-promesse (voile
          vertical) et bornée à la colonne de lecture (voile horizontal). Deux
          éléments imbriqués plutôt qu'un `mask-composite: intersect` : deux
          masques simples se mesurent et se déboguent, une composition non. */}
      <div
        className="absolute inset-0"
        style={{ maskImage: page, WebkitMaskImage: page }}
      >
        <div
          data-login-rules
          className="paper-ruled paper-ruled--plain absolute inset-0"
          style={{
            backgroundPosition:
              "0 calc(var(--safe-t) + var(--rule-pitch) - 0.4375rem)",
            maskImage: veil,
            WebkitMaskImage: veil,
          }}
        />
      </div>

      {/* 2 — le trait de marge, sur toute la hauteur. */}
      <div
        data-login-margin
        className="absolute inset-y-0 w-[1.5px]"
        style={{ left: ruleLeft, background: "var(--rule-margin)" }}
      />
    </div>
  );
}
