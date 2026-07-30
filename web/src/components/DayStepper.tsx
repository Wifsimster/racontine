import { Check, ScanLine, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchEntrySummary, EntryStatus } from "@/lib/types";

/* ===========================================================================
   LE LOT — quand un même envoi de photos couvre plusieurs journées.

   Une puce par journée détectée : on sait combien il en reste, laquelle on
   relit, et lesquelles sont déjà parties. C'est la seule pièce de l'app qui
   raconte une file d'attente, et elle doit rester lisible SANS couleur :

     publiée   coche          (fond feuille, filet d'encre)
     courante  son numéro     (fond d'encre plein, halo, légèrement agrandie)
     échouée   triangle       (fond destructive-soft, filet rouge)
     en cours  ligne de scan  (fond neutre)
     à relire  son numéro     (fond feuille, filet de champ)

   LE RAIL EST TRACÉ À L'ENCRE, PAS EN GROSEILLE. Groseille (--primary) et rouge
   (--destructive) partagent la même clarté OKLCH : 1,08:1 entre elles en clair,
   1,00:1 en sombre. Un lot dont une journée avait échoué se lisait donc comme un
   lot ENTIÈREMENT groseille — la puce en échec ne se détachait plus des puces
   franchies. Depuis : le chemin est à l'encre du carnet, groseille reste
   réservé à l'action (les boutons), et la seule teinte saturée du rail est
   l'échec. Le compteur et la barre du lot passent au VERT, la teinte que le
   produit donne déjà à « acquis » (« 2 pages gardées sur l'appareil ») — une
   journée publiée est exactement cela. Une dimension colorée, quatre valeurs,
   quatre teintes réellement distinctes.

   Deux corrections de fond par rapport à la version précédente :

   · PLUS AUCUN MODIFICATEUR D'OPACITÉ. `bg-primary/10`, `border-primary/50`,
     `ring-primary/20` compilaient en `color-mix(in oklab, …)` : le contraste du
     texte posé dessus devient littéralement immesurable (`getComputedStyle`
     rend un `oklab()` qu'aucun auditeur ne sait lire). Les jetons `*-soft` /
     `*-bg` portent l'alpha DÉJÀ composé en sRGB, et se mesurent.
   · L'ÉCHEC ET LA LECTURE EN COURS ONT ENFIN UN VISAGE. Une journée `failed` et
     une journée `draft` se dessinaient exactement pareil : le lot mentait sur
     son propre état. Chaque état a désormais son glyphe.

   Le filet de liaison est posé en ABSOLU d'un centre de puce à l'autre et passe
   SOUS les puces (`z-10`, fonds opaques) : tant qu'il était en flux avec une
   marge haute, il tombait 3 px au-dessus du centre des ronds.
   =========================================================================== */

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function shortDay(iso: string): {
  weekday: string;
  day: string;
  month: string;
} {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d
      .toLocaleDateString("fr-FR", { weekday: "short" })
      .replace(/\.$/, ""),
    day: d.toLocaleDateString("fr-FR", { day: "numeric" }),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(/\.$/, ""),
  };
}

/** Ce que l'état dit à voix haute — la teinte ne porte jamais seule le sens. */
const STATUS_TEXT: Record<EntryStatus, string> = {
  published: "publiée",
  draft: "à relire",
  processing: "lecture en cours",
  failed: "échec de lecture",
};

export function DayStepper({
  days,
  currentId,
  onSelect,
}: {
  days: BatchEntrySummary[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const doneCount = days.filter((d) => d.status === "published").length;
  const currentIndex = Math.max(
    0,
    days.findIndex((d) => d.id === currentId),
  );

  return (
    <div>
      {/* LE LOT COÛTE 110 px, PLUS 192. Quatre choses ont été retirées parce
          qu'elles étaient déjà écrites ailleurs sur le même écran :
          · la carte elle-même — bordure, ombre et 24 px de rembourrage pour
            une file de puces qui se lit très bien à même le papier, et qui
            n'entrait plus en concurrence avec la carte ambre juste en dessous ;
          · la date en clair (l'en-tête de la relecture imprime « Louise ·
            jeudi 12 mars · Nounou » 20 px plus bas — c'était la troisième fois
            que la même date était écrite) ;
          · la barre de progression du lot, qui ne disait rien que la file de
            puces ne dise déjà (deux coches sur trois) — et une deuxième barre
            de progression sur l'écran, c'était une deuxième grammaire.
          Les 82 px récupérés servent à faire tenir les moments de la journée
          au-dessus de la ligne de flottaison, ce qui est le sujet de l'écran.

          `md:justify-start` : la file étant rangée à gauche à partir de `md`, un
          compteur poussé au fer à droite d'une colonne de 992 px flottait à
          1 700 px de son titre. Il redevient sa légende. */}
      <div className="mb-2 flex items-start justify-between gap-3 md:justify-start md:gap-4">
        {/* 22/28 : le pas de la réglure du carnet, jamais 22/20.
            `text-balance` : à 320 px, « Journée 3 sur 3 » se cassait en
            laissant un « 3 » seul sur la deuxième ligne (orphelin de un
            caractère). Équilibré, la dernière ligne porte « sur 3 ». */}
        <span className="font-serif text-title font-semibold text-balance">
          Journée {currentIndex + 1} sur {days.length}
        </span>
        <span className="shrink-0 rounded-full bg-success-bg px-3 py-1 text-meta font-bold text-success">
          {doneCount}/{days.length} publiées
        </span>
      </div>

      {/* py : `overflow-x-auto` seul force `overflow-y` à « auto » (au lieu de
          « visible »), ce qui rognerait sinon le halo (ring) du pas courant en
          haut/bas tout en le laissant intact à gauche/droite.
          `mx-auto w-fit` plutôt que `justify-center` : au-delà de quatre
          journées la file dépasse, et `justify-center` rend alors le DÉBUT
          inatteignable au défilement (le débordement part du mauvais côté). */}
      <div className="overflow-x-auto py-2 -my-2">
        {/* `md:mx-0` : à 1 280 px, une file centrée dans une colonne de 992 px
            flottait au milieu de deux vides. Elle se range sous son titre. */}
        <ol className="mx-auto flex w-fit md:mx-0">
          {days.map((d, i) => {
            const isCurrent = d.id === currentId;
            const done = d.status === "published";
            const failed = d.status === "failed";
            const reading = d.status === "processing";
            const { weekday, day, month } = shortDay(d.date);
            return (
              <li
                key={d.id}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex w-20 shrink-0 flex-col items-center"
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    /* top-[17px] : centrage OPTIQUE du filet de 2 px sur la
                       puce de 36 px (18 - 1). Ce n'est ni une marge ni un
                       espacement de mise en page. */
                    className={cn(
                      "absolute top-[17px] right-1/2 h-0.5 w-full rounded-full transition-colors dur-slow ease-carnet",
                      days[i - 1].status === "published"
                        ? "bg-foreground"
                        : "bg-border",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(d.id)}
                  title={d.title ?? undefined}
                  aria-label={`Journée ${i + 1} sur ${days.length}, ${longDate(d.date)}, ${STATUS_TEXT[d.status]}`}
                  className="group flex w-full flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      // `z-10` : le filet du pas suivant passe SOUS la puce.
                      "relative z-10 flex size-9 items-center justify-center rounded-full border-2 text-ui font-bold transition-all dur-base ease-carnet",
                      isCurrent &&
                        "scale-110 border-foreground bg-foreground text-background ring-4 ring-muted",
                      !isCurrent &&
                        done &&
                        "border-foreground bg-card text-foreground group-hover:bg-foreground group-hover:text-background",
                      !isCurrent &&
                        failed &&
                        "border-destructive bg-destructive-soft text-destructive",
                      !isCurrent &&
                        reading &&
                        "border-input bg-muted text-muted-foreground",
                      !isCurrent &&
                        !done &&
                        !failed &&
                        !reading &&
                        "border-input bg-card text-muted-foreground group-hover:border-foreground group-hover:text-foreground",
                    )}
                  >
                    {!isCurrent && done && <Check className="size-4" />}
                    {!isCurrent && failed && (
                      <TriangleAlert className="size-4" />
                    )}
                    {!isCurrent && reading && <ScanLine className="size-4" />}
                    {(isCurrent || (!done && !failed && !reading)) && i + 1}
                  </span>
                  {/* Deux crans de l'échelle (11/16 et 13/20) au lieu de
                      `text-[10px] leading-none` : l'interligne reste un multiple
                      de 4 px et les accents des jours (mercredi, août) ne sont
                      plus rognés. */}
                  <span
                    className={cn(
                      "flex flex-col items-center",
                      isCurrent ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="text-xs font-bold capitalize">
                      {weekday}
                    </span>
                    <span className="text-xs">
                      {day} {month}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
