import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `tailwind-merge` connaît les crans de taille de texte *par défaut*
 * (`text-sm`, `text-lg`…) mais pas les nôtres. Sans cette déclaration, il
 * prenait `text-ui` pour une COULEUR de texte et supprimait silencieusement le
 * `text-primary-foreground` qui la précédait : des libellés encre bleu-nuit sur
 * un fond groseille, à 1,6:1, sans qu'aucun code ne soit visiblement fautif.
 *
 * On déclare donc les six crans de l'échelle (voir index.css) comme des tailles
 * de police, et non comme des couleurs.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["overline", "meta", "ui", "body", "title", "display"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
