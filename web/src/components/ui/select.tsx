import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Menu déroulant natif, aligné sur le champ `Input` (même hauteur, bordure,
 * ombre et halo de focus) pour que selects et champs texte s'accordent dans un
 * même formulaire. On garde le `<select>` natif — léger, accessible et sans
 * dépendance — plutôt qu'un composant Radix Select.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
