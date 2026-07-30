import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * La feuille : une page du carnet posée sur le papier.
 *
 * · Gouttière 20 px, rythme vertical en pas de 4, rayon 24 px.
 * · La structure vient du filet 1 px ; l'ombre (`shadow-card`) est presque
 *   invisible en clair et devient un liseré haut en sombre — voir `--elev-1`.
 * · `CardMedia` en premier enfant colle la photo à trois bords de la feuille
 *   et lui donne son liseré (`seam`) : une image pâle garde son bord, et elle
 *   ne porte JAMAIS d'ombre — c'est la carte qui en porte une.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card py-5 text-card-foreground shadow-card",
        "has-[>[data-slot=card-media]:first-child]:pt-0",
        className,
      )}
      {...props}
    />
  );
}

/** Photo (ou page de carnet) collée au bord haut de la feuille. */
function CardMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-media"
      className={cn(
        "seam relative isolate overflow-hidden rounded-t-2xl bg-muted",
        "[&_img]:size-full [&_img]:object-cover [&_video]:size-full [&_video]:object-cover",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-serif text-title font-semibold text-balance",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-meta text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-5 [.border-t]:pt-4", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardMedia,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
