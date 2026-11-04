import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenText, Check, Smile } from "lucide-react";
import { type Entry, SOURCE_LABELS } from "@/lib/types";
import { capitalize, longDate } from "@/lib/format";
import { itemKind } from "@/lib/items";
import { ITEM_CHIP, ITEM_INK } from "@/lib/ui";
import { TitreCarnet } from "@/components/TitreCarnet";
import { Highlight } from "@/features/journal/EntryCard";
import { cn } from "@/lib/utils";
import { glanceOf, toDraftItems } from "./draft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SouvenirGallery } from "@/features/journal/souvenirs";

export function ReadOnlyDay({
  entry,
  reader = true,
}: {
  entry: Entry;
  reader?: boolean;
}) {
  const showPublished = !reader && entry.status === "published";
  return (
    <div className="read-width p-4 pb-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta text-muted-foreground">
            {[entry.child?.name, capitalize(longDate(entry.date)), SOURCE_LABELS[entry.source]]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <TitreCarnet
            title={entry.title || "La journée"}
            tone="nap"
            spark={false}
            className="mt-1"
          />
        </div>
        {showPublished && (
          <Badge variant="success" className="mt-0.5">
            <Check aria-hidden="true" />
            Publiée
          </Badge>
        )}
      </header>

      <article className="flex flex-col gap-5">
        {(entry.souvenirs?.length ?? 0) > 0 && (
          <SouvenirGallery
            souvenirs={entry.souvenirs ?? []}
            childName={entry.child?.name}
            date={entry.date}
          />
        )}
        {entry.story ? (
          <div className="tape tape-blue mt-2 rounded-2xl border bg-card py-4 shadow-card">
            <div className="paper-ruled pr-5 pl-12">
              <p className="carnet-story m-0 whitespace-pre-line text-foreground">
                {entry.story}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">
            Cette journée n’a pas de récit : seules les pages du carnet ont été
            gardées.
          </p>
        )}
        {entry.highlight && (
          <Highlight text={entry.highlight} className="-mt-2 ml-auto w-[88%]" />
        )}
      </article>

      {(entry.items.length > 0 || entry.mood) && (
        <ul aria-label="Les moments de la journée" className="mt-6 flex flex-col gap-2">
          {toDraftItems(entry.items).map((it, i) => {
            const { label, value } = glanceOf(it);
            const Icon = itemKind(it.type).Icon;
            return (
              <li key={i} className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 shadow-card">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl",
                    ITEM_CHIP[it.type],
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-meta font-extrabold", ITEM_INK[it.type])}>
                    {label}
                  </span>
                  <span className="block text-ui text-pretty">{value}</span>
                </span>
              </li>
            );
          })}
          {entry.mood && (
            <li className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 shadow-card">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 -rotate-6 place-items-center rounded-xl bg-postit text-postit-ink"
              >
                <Smile className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-meta font-bold text-muted-foreground">
                  Humeur
                </span>
                <span className="block text-ui text-pretty">{entry.mood}</span>
              </span>
            </li>
          )}
        </ul>
      )}

      {entry.attachments.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <p className="surtitre text-muted-foreground">
            La page du carnet
            {entry.attachments.length > 1 ? ` · ${entry.attachments.length}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-4 pt-3">
            {entry.attachments.map((a, i) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir la page ${i + 1} en grand`}
                className={cn("tape polaroid block", i % 2 ? "tilt-r tape-blue" : "tilt-l tape-green")}
              >
                <img
                  src={a.thumbUrl}
                  alt={`Page ${i + 1} du carnet`}
                  className="seam block aspect-square w-full rounded-[0.25rem] bg-muted object-cover object-top"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {reader && (
        <p className="mt-6 text-meta text-muted-foreground">
          Vous suivez ce carnet en lecture : les corrections reviennent à la
          famille qui le tient.
        </p>
      )}

      {(entry.prevId || entry.nextId) && (
        <nav
          aria-label="Journées voisines"
          className="mt-6 grid grid-cols-2 gap-2 border-t pt-4"
        >
          {entry.prevId ? (
            <Button
              asChild
              variant="ghost"
              className="h-auto min-h-12 justify-start px-3 text-left whitespace-normal has-[>svg]:px-3"
            >
              <Link to={`/entries/${entry.prevId}`} rel="prev" aria-label="Journée précédente">
                <ArrowLeft aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-meta font-normal text-muted-foreground">
                    Journée
                  </span>
                  <span>précédente</span>
                </span>
              </Link>
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          {entry.nextId && (
            <Button
              asChild
              variant="ghost"
              className="col-start-2 h-auto min-h-12 justify-end px-3 text-right whitespace-normal has-[>svg]:px-3"
            >
              <Link to={`/entries/${entry.nextId}`} rel="next" aria-label="Journée suivante">
                <span className="flex flex-col">
                  <span className="text-meta font-normal text-muted-foreground">
                    Journée
                  </span>
                  <span>suivante</span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </nav>
      )}

      <Button asChild variant="outline" className="mt-4 min-h-12 w-full">
        <Link to="/">
          <BookOpenText aria-hidden="true" />
          Revenir au journal
        </Link>
      </Button>
    </div>
  );
}
