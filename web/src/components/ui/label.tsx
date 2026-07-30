import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Libellé de champ : cran « interface » (15/20).
 *
 * Pas de `leading-none` — un interligne de 15 px casserait la grille de 4 px
 * et coupe les jambages des accents français (É, Ç, à).
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-ui font-bold text-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
