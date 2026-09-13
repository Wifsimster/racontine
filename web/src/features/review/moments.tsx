import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import {
  Check,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { glanceOf, type DraftItem } from "./draft";
import { itemKind } from "@/lib/items";

/* Les moments de la journée, en LECTURE : la liste de coup d'œil, et la zone
   de texte qui grandit avec ce qu'on y écrit. */

/**
 * Zone de texte qui grandit avec son contenu, PAR PAS DE 28 px — l'interligne
 * du cahier. Deux raisons, pas une :
 *   · on relit tout ce qu'on va publier. Un récit coupé à la septième ligne
 *     dans une zone qui défile est un récit publié sans avoir été relu, et
 *     c'est le seul écran dont c'est le métier.
 *   · la hauteur reste un multiple de la réglure, donc les lignes du cahier ne
 *     dérivent pas d'un demi-pas quand le texte s'allonge.
 */
export function GrowingTextarea({
  value,
  minLines,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & { minLines: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const pad =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 24;
    const pitch = parseFloat(style.lineHeight) || 28;
    // `height: 0` et non `auto` : une `<textarea>` en hauteur automatique
    // retombe sur son attribut `rows` (2 par défaut), donc `scrollHeight`
    // mesurait deux lignes même pour un titre d'une seule — et le champ gardait
    // une ligne vide sous le texte.
    el.style.height = "0px";
    const lines = Math.max(
      minLines,
      Math.round((el.scrollHeight - pad) / pitch),
    );
    el.style.height = `${lines * pitch + pad}px`;
  }, [minLines]);

  useEffect(() => {
    fit();
  }, [fit, value]);
  useEffect(() => {
    // La largeur change (rotation, fenêtre) : le texte se rebrise, la hauteur
    // doit suivre.
    window.addEventListener("resize", fit);
    // Et surtout : on remesure quand les polices arrivent. Mesurée avec la
    // police de repli (plus large), « La journée des bulles de savon » tenait
    // sur deux lignes ; Fraunces chargé, elle en tient une — le champ restait
    // haut d'une ligne vide.
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
    };
  }, [fit]);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onInput={fit}
      className={cn("min-h-0 resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

/* ------------------- La journée en un coup d'œil (lecture) ---------------- */

/**
 * Les moments de la journée, en clair, au-dessus du bouton.
 *
 * C'est la réparation du défaut de fond de l'écran : on ne publie pas ce qu'on
 * n'a pas vu. Une ligne par moment — 56 px, 76 quand la valeur demande deux
 * lignes — tuile d'icône (grise : la couleur de cet écran est la confiance, pas
 * la catégorie), libellé et état sur la première ligne, la valeur sur la
 * seconde. Rien n'est modifiable ici : ce qui se corrige est juste en dessous,
 * dans « Corriger les moments ».
 */
export function MomentsGlance({
  items,
  flagged,
}: {
  items: DraftItem[];
  flagged: RegExp[];
}) {
  return (
    <section aria-labelledby="rv-glance" className="flex flex-col gap-2">
      <h2 id="rv-glance" className="surtitre text-muted-foreground">
        La journée
      </h2>
      {items.length === 0 ? (
        /* Le vide dit ce qui manque ET ce qu'on peut faire quand même : une
           page de carnet sans tableau reste publiable, c'est le récit qui
           compte. */
        <p className="rounded-xl border border-dashed px-4 py-3 text-meta text-muted-foreground">
          Aucun repas, aucune sieste n'a été relevé sur cette page. Vous pouvez
          en ajouter juste en dessous — ou publier le récit seul.
        </p>
      ) : (
      <ul className="rounded-2xl border bg-card px-4 shadow-card">
        {items.map((it, i) => {
          const { label, value } = glanceOf(it);
          const Icon = itemKind(it.type).Icon;
          const haystack = `${label} ${value}`;
          const flag = flagged.some((re) => re.test(haystack));
          return (
            /* Deux lignes, trois colonnes : la tuile tient la hauteur, le
               libellé et l'état partagent la première ligne, la VALEUR prend
               toute la largeur en dessous. Avec la pastille posée à côté de la
               valeur, celle-ci n'avait plus que 198 px et « Gratin de
               courgettes, yaourt nature » se coupait au tiers ; là, elle en a
               298 et se lit. */
            <li
              key={i}
              className="grid min-h-14 grid-cols-[28px_1fr_auto] items-center gap-x-3 border-b py-2 last:border-b-0"
            >
              <span className="row-span-2 grid size-7 place-items-center self-center rounded-[9px] bg-muted">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="surtitre min-w-0 truncate text-muted-foreground">
                {label}
              </span>
              {flag ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-warning-bg px-2 text-xs font-bold text-warning">
                  <TriangleAlert aria-hidden="true" className="size-3" />
                  à vérifier
                </span>
              ) : (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-bg px-2 text-xs font-bold text-success">
                  <Check aria-hidden="true" className="size-3" />
                  confirmé
                </span>
              )}
              {/* `line-clamp-2` et non `truncate` : « Haricots verts, purée de
                  pommes de terre, poisson blanc » fait 538 px pour 284 px de
                  colonne — coupé à la moitié, ce n'est plus un aperçu de la
                  journée, c'est une devinette. Deux lignes suffisent à tout ce
                  qu'un carnet écrit, la ligne passe alors de 56 à 76 px, et
                  aucun texte n'est rogné horizontalement. */}
              <span className="col-span-2 min-w-0 text-ui text-foreground line-clamp-2">
                {value || "—"}
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

