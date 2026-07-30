import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Pastille.
 *
 * Chaque variante est une paire (encre, fond) mesurée dans LES DEUX thèmes
 * (>= 5,1:1). Les variantes `success` / `warning` portent un état : la couleur
 * ne suffit jamais, on leur passe une icône (`<Check/>`, `<TriangleAlert/>`)
 * pour que l'état reste lisible en noir et blanc.
 *
 * Une pastille cliquable (`<a>` / `<button>`) passe automatiquement à 44 px de
 * haut : une cible de 20 px n'est pas une cible (I2).
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit min-h-6 shrink-0 items-center justify-center gap-1",
    "rounded-full border border-transparent px-3 py-1",
    "text-xs font-bold whitespace-nowrap",
    "transition-[color,background-color,border-color,box-shadow] dur-chip ease-carnet",
    "[a&]:min-h-11 [a&]:px-4 [button&]:min-h-11 [button&]:px-4",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-accent",
        soft: "bg-muted text-muted-foreground [a&]:hover:text-foreground",
        success: "bg-success-bg text-success",
        warning: "bg-warning-bg text-warning",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive-hover",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
