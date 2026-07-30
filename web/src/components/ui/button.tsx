import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Bouton du carnet.
 *
 * Cinq états sont dessinés, pas trois : repos, survol, pression, focus clavier,
 * désactivé — plus un état `loading` qui garde la place du libellé.
 *
 * · Cible tactile : TOUTES les tailles font au moins 44 px de haut (I2). Les
 *   variantes « petites » le sont visuellement (texte, icône, chasse), pas au
 *   toucher : un bouton de 32 px est un bouton qu'on rate.
 * · Survol : on FONCE le fond (`--primary-hover`), on ne le rend pas
 *   translucide — un `bg-primary/90` sur du papier crème délave la couleur et
 *   fait chuter le contraste.
 * · Désactivé : surface `muted` + encre `muted-foreground`, mesuré à 5,1:1.
 *   Un `opacity-50` fait passer le libellé sous 4,5:1 en silence.
 * · Focus : pas de `outline-none` — le halo global de `index.css` s'applique.
 * · Pression : `scale(.97)` en 120 ms, la seule chose qui bouge.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2",
    "font-bold whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] dur-fast ease-carnet",
    "active:scale-[0.97] active:dur-press",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive-hover",
        outline:
          "border border-input bg-card text-foreground shadow-card hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground disabled:bg-transparent",
        link: "text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary disabled:bg-transparent",
      },
      size: {
        // La hauteur est toujours >= 44 px ; seules la chasse et la taille du
        // texte distinguent les crans. `gap-1.5` (6 px) est un demi-pas assumé :
        // c'est l'écart optique icône <-> libellé, pas un pas de mise en page.
        default: "h-11 rounded-xl px-5 text-ui has-[>svg]:px-4",
        lg: "h-12 rounded-xl px-6 text-body",
        sm: "h-11 gap-1.5 rounded-xl px-3 text-meta",
        xs: "h-11 gap-1.5 rounded-xl px-3 text-meta [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-11 rounded-full",
        "icon-xs":
          "size-11 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-11 rounded-full",
        "icon-lg": "size-12 rounded-full [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Action en cours : bouton inerte, libellé conservé, roue en tête. */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
