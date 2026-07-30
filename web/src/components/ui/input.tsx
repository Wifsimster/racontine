import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Base commune aux champs (`Input`, `Textarea`, `Select`) : un même objet, une
 * même hauteur, un même halo, pour qu'un formulaire ne soit pas une collection
 * de bricoles.
 *
 * Trois signaux au focus, dont un seul est une couleur :
 *   1. le halo global de 2 px (`:focus-visible` dans index.css) ;
 *   2. le bord qui passe au groseille ;
 *   3. la surface qui se teinte très légèrement (`primary-soft`) — plus le
 *      caret natif, qui reste visible.
 *
 * Taille du texte : 17 px. En dessous de 16 px, iOS zoome sur le champ à la
 * mise au point et l'utilisateur perd sa page.
 */
export const fieldBase = [
  // Pas de `w-full` ici : un `<select>` natif se dimensionne sur son option la
  // plus longue et vit très bien au milieu d'une ligne. Ce sont `Input` et
  // `Textarea` qui prennent toute la largeur.
  "min-w-0 rounded-xl border border-input bg-card text-body text-foreground shadow-card",
  "placeholder:text-muted-foreground",
  "transition-[color,background-color,border-color,box-shadow] dur-chip ease-carnet",
  "focus-visible:border-ring focus-visible:bg-primary-soft",
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
  "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]",
].join(" ");

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        "flex h-11 w-full px-4 py-2",
        "file:mr-3 file:inline-flex file:border-0 file:bg-transparent file:text-ui file:font-bold file:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
