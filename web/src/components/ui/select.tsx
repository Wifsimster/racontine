import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/input";

/**
 * Menu déroulant natif, aligné sur le champ `Input` (même hauteur, bordure,
 * ombre et halo de focus) pour que selects et champs texte s'accordent dans un
 * même formulaire. On garde le `<select>` natif — léger, accessible, traduit
 * par le système et sans dépendance — plutôt qu'un composant Radix Select.
 *
 * Le chevron est le NÔTRE (`appearance-none` + icône posée par-dessus) : celui
 * du système se collait au bord droit, dans l'arrondi du `rounded-xl`, quel
 * que soit le `padding-right`. L'icône ignore le pointeur, le clic traverse
 * jusqu'au `<select>` natif, dont la liste d'options reste celle du système.
 *
 * `className` s'applique à l'ENVELOPPE : les appelants n'y passent que de la
 * mise en page (largeur, `flex-1`), le `<select>` la remplit.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        data-slot="select"
        className={cn(
          fieldBase,
          "peer h-11 w-full cursor-pointer appearance-none py-2 pl-4 pr-11",
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </span>
  );
}

export { Select };
