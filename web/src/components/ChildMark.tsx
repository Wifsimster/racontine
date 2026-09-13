import { initialOf } from "@/lib/child";
import { cn } from "@/lib/utils";

/* ===========================================================================
   LA PASTILLE DE L'ENFANT — son initiale, en Fraunces, sur un fond neutre.

   Elle ne porte PAS de couleur, et c'est la décision de fond : les cinq
   feutres du carnet disent déjà repas, sieste, activité, anecdote et santé, et
   le groseille dit l'action. Une teinte par enfant en ferait dire deux choses
   à une couleur, ce que le système refuse explicitement (voir lib/ui.ts).

   Un seul état coloré existe, et il est vrai : `current` passe la pastille en
   groseille pâle pour dire « c'est ce carnet-ci que vous regardez » — la
   couleur de l'action, employée à désigner, pas à décorer.
   =========================================================================== */

const SIZE = {
  /** Sur une ligne de surtitre (11/16) : la pastille tient dans l'interligne. */
  sm: "size-5 rounded-[6px] text-[11px]",
  /** En tête d'une carte d'enfant : la taille d'une tuile d'icône. */
  md: "size-11 rounded-md text-[21px]",
} as const;

export function ChildMark({
  name,
  size = "sm",
  current = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  current?: boolean;
  className?: string;
}) {
  return (
    <span
      // `aria-hidden` : l'initiale est un signe, pas une information. Le prénom
      // est toujours écrit juste à côté — le lire deux fois n'aide personne.
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center font-serif font-semibold",
        current ? "bg-primary-soft text-primary" : "bg-muted text-foreground",
        SIZE[size],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
