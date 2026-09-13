import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Entry } from "@/lib/types";
import { capitalize, dayMonthShort, fr } from "@/lib/format";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, glanceOf, pickGlance } from "./glance";
import { StatusBadge } from "./EntryCard";

/* ===========================================================================
   LA LIGNE D'UNE JOURNÉE — le mode « parcourir ».

   La carte du journal est faite pour être LUE : 488 px, 1,7 par écran, et
   c'est le bon prix pour la journée d'hier. Ce n'est pas le bon prix quand on
   cherche « la journée de la piscine » quelque part en juillet : dérouler un
   mois coûtait alors une quinzaine d'écrans.

   La ligne garde exactement ce qui sert à RECONNAÎTRE une journée sans la
   lire — le jour, l'enfant, le titre, la bande de feutres, l'état — et rien
   d'autre : ni récit, ni temps fort, ni pages. Onze journées par écran au lieu
   d'une et demie.

   C'est un LIEN, pas une carte dépliante : la journée entière est déjà un
   écran de l'app (`/entries/:id`), qui sait se montrer en lecture seule à un
   proche comme en relecture à un parent. Parcourir mène à lire ; ça ne
   réinvente pas la lecture.
   =========================================================================== */

export function EntryRow({ entry }: { entry: Entry }) {
  /* DEUX feutres, pas trois. Mesuré : à côté de la colonne de date et du
     chevron, il reste 270 px sur un téléphone — trois pastilles nommées en
     demandent 330 et passent à la ligne, ce qui fait une ligne de 108 px au
     lieu de 76 et coûte trois journées par écran. Le choix des deux suit le
     classement par importance déjà en place (la santé d'abord) ; le reste est
     dans la journée, à un tap. */
  /* Une journée qui n'est pas publiée porte une pastille d'état, et cet état
     compte plus qu'un second feutre : la ligne lui cède la place plutôt que de
     passer à trois rangs. */
  const aBadge = entry.status !== "published";
  const shown = pickGlance(glanceOf(entry)).slice(0, aBadge ? 1 : 2);
  return (
    <Link
      to={`/entries/${entry.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card transition-colors dur-fast hover:bg-accent"
    >
      {/* La date en tête : c'est par elle qu'on cherche dans un journal, et sa
          colonne est de largeur fixe pour que les lignes s'alignent. */}
      <time
        dateTime={entry.date}
        className="w-16 shrink-0 text-meta font-bold whitespace-nowrap text-muted-foreground"
        data-tabular
      >
        {capitalize(dayMonthShort(entry.date))}
      </time>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {entry.child && <ChildMark name={entry.child.name} />}
          {/* Le titre porte la ligne ; sans titre (journée en lecture, échec),
              c'est l'état qui la porte, et il est déjà sous les yeux. */}
          <span className="min-w-0 flex-1 truncate text-ui font-bold">
            {entry.title ? fr(entry.title) : "Journée sans titre"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <GlanceStrip stats={shown} />
          {/* `canEdit={false}` : la ligne n'ouvre aucune correction, elle mène
              à la journée. La pastille « à vérifier », qui ne s'adresse qu'à
              qui peut trancher, n'a donc rien à faire ici — les états qui se
              lisent (à relire, en lecture, échec) restent, eux. */}
          <StatusBadge entry={entry} canEdit={false} />
        </span>
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
