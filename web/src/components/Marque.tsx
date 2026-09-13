import { MARQUE } from "@/components/marque.generated";
import { cn } from "@/lib/utils";

/* ===========================================================================
   LA MARQUE, DANS L'APP.

   Ce composant existe pour refermer un écart précis : l'en-tête et l'écran de
   démarrage portaient `BookOpenText`, une icône du catalogue Lucide — et cette
   même icône était AUSSI celle de l'entrée « Le journal » du menu, deux rangs
   plus bas. Le produit et l'une de ses cinq destinations avaient le même
   glyphe, pendant que l'onglet et l'écran d'accueil en portaient un troisième.

   L'en-tête porte désormais EXACTEMENT ce que porte l'écran d'accueil : la
   tuile, à 26 px, trait de marge compris. Rien à accorder, rien à dessiner de
   nouveau — et `BookOpenText` redevient libre d'être l'icône du journal, et de
   rien d'autre.

   Toute la géométrie vient de `marque.generated.ts`, qui sort de
   `web/brand/mark.mjs` : les mêmes nombres produisent la favicon, les icônes
   PWA, la pastille de notification et la carte de lien. Voir docs/identite.md.
   =========================================================================== */

/**
 * LA TUILE — la marque telle qu'elle est posée sur un écran d'accueil.
 *
 * Dimensionnée par la classe (`size-*`) et non par un attribut : elle se
 * mesure comme une icône Lucide, et suit les mêmes crans.
 */
export function Marque({ className }: { className?: string }) {
  const { page, glyphR, tile, ink, radius } = MARQUE;
  const r = radius * 512;
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-[26px] shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* L'identifiant de détourage est propre au composant : la tuile peut
          être posée deux fois sur un même écran (en-tête + pied de page) sans
          que le second détourage écrase le premier. */}
      <clipPath id="marque-tuile">
        <rect width="512" height="512" rx={r} ry={r} />
      </clipPath>
      <g clipPath="url(#marque-tuile)">
        <rect width="512" height="512" fill={tile} />
        {page.rules.map((rule) => (
          <rect
            key={rule.y}
            x="0"
            y={rule.y}
            width={rule.w}
            height={rule.h}
            fill={ink}
            opacity={rule.opacity}
          />
        ))}
        <rect
          x={page.margin.x}
          y="0"
          width={page.margin.w}
          height="512"
          fill={ink}
          opacity={page.margin.opacity}
        />
        <path
          transform={`translate(${page.letter.x} ${page.letter.baseline}) scale(${page.letter.scale} ${-page.letter.scale})`}
          fill={ink}
          d={glyphR}
        />
      </g>
    </svg>
  );
}

/**
 * LA SILHOUETTE — la même page, sans tuile, en une couleur.
 *
 * Les réglures prennent l'encre du texte qui l'entoure (`currentColor`) ; seul
 * le trait de marge garde le groseille, parce que c'est lui qui dit « carnet »
 * et qu'il est le seul élément de la silhouette qui puisse porter une teinte
 * sans se confondre avec du texte.
 *
 * Boîte de 24 : celle de Lucide. Posée à côté d'une icône de l'app, elle fait
 * exactement la même taille, au pixel près.
 */
export function MarqueSilhouette({ className }: { className?: string }) {
  const { silhouette } = MARQUE;
  const box = silhouette.viewBox;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      className={cn("size-4 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {silhouette.rules.map((rule) => (
        <rect
          key={rule.y}
          x={rule.x}
          y={rule.y}
          width={rule.w}
          height={rule.h}
          rx={rule.h / 2}
          fill="currentColor"
        />
      ))}
      <rect
        x={silhouette.margin.x}
        y={silhouette.margin.y}
        width={silhouette.margin.w}
        height={silhouette.margin.h}
        rx={silhouette.margin.w / 2}
        fill="var(--primary)"
      />
    </svg>
  );
}

/**
 * LA SIGNATURE — « Propulsé par Racontine ».
 *
 * Le nom affiché partout ailleurs dans l'app est `appName`, un réglage
 * d'instance : un foyer qui appelle son carnet « Le carnet de Léo » ne voyait
 * plus jamais le nom du produit, nulle part. Pour un logiciel auto-hébergé,
 * c'est la bonne fonctionnalité — mais alors il faut UN endroit, un seul, où
 * la marque ne dépende de rien.
 *
 * C'est celui-ci, et c'est la seule ligne de l'app qui ne lit pas `appName`.
 * Elle est au pied des portes (connexion, invitation), là où l'on décide de
 * faire confiance, et jamais dans la coquille : elle ne concurrence pas le nom
 * du carnet, elle dit de quoi il est fait.
 */
export function MarqueSignature({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <MarqueSilhouette />
      <span className="surtitre">Propulsé par Racontine</span>
    </p>
  );
}
