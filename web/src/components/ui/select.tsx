import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/input";

/**
 * Menu déroulant natif, aligné sur le champ `Input` (même hauteur, bordure,
 * ombre et halo de focus) pour que selects et champs texte s'accordent dans un
 * même formulaire. On garde le `<select>` natif — léger, accessible, traduit
 * par le système et sans dépendance — plutôt qu'un composant Radix Select.
 *
 * `pr-10` laisse la place au chevron dessiné par le système ; on ne le
 * remplace pas par une icône à nous, qui serait moins fiable sur iOS.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldBase,
        "h-11 cursor-pointer py-2 pl-4 pr-10",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
