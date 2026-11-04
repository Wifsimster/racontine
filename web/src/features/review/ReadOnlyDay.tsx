import { Link } from "react-router-dom";
import { ArrowLeft, Check, Smile, Star } from "lucide-react";
import { type Entry, SOURCE_LABELS } from "@/lib/types";
import { capitalize, longDate } from "@/lib/format";
import { itemKind } from "@/lib/items";
import { ITEM_INK } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { glanceOf, toDraftItems } from "./draft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
          <h1 className="mt-1 font-serif text-title font-semibold text-balance">
            {entry.title || "La journée"}
          </h1>
        </div>
        {showPublished && (
          <Badge variant="success" className="mt-0.5">
            <Check aria-hidden="true" />
            Publiée
          </Badge>
        )}
      </header>

      <article className="flex flex-col gap-5">
        {entry.story ? (
          <div className="paper-ruled pl-10">
            <p className="carnet-story m-0 whitespace-pre-line text-foreground">
              {entry.story}
            </p>
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">
            Cette journée n’a pas de récit : seules les pages du carnet ont été
            gardées.
          </p>
        )}
        {entry.highlight && (
          <p className="flex items-start gap-2 font-serif text-body italic text-foreground">
            <Star
              aria-hidden="true"
              className="mt-1.5 size-3.5 shrink-0 text-primary"
            />
            <span>
              <span className="sr-only">Le temps fort : </span>
              {entry.highlight}
            </span>
          </p>
        )}
      </article>

      {(entry.items.length > 0 || entry.mood) && (
        <ul aria-label="Les moments de la journée" className="mt-6 divide-y border-y">
          {toDraftItems(entry.items).map((it, i) => {
            const { label, value } = glanceOf(it);
            const Icon = itemKind(it.type).Icon;
            return (
              <li key={i} className="flex min-h-14 items-center gap-3 py-2">
                <Icon
                  className={cn("size-5 shrink-0", ITEM_INK[it.type])}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-meta font-bold text-muted-foreground">
                    {label}
                  </span>
                  <span className="block text-ui text-pretty">{value}</span>
                </span>
              </li>
            );
          })}
          {entry.mood && (
            <li className="flex min-h-14 items-center gap-3 py-2">
              <Smile
                className="size-5 shrink-0 text-foreground"
                aria-hidden="true"
              />
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
          <div className="grid grid-cols-2 gap-2">
            {entry.attachments.map((a, i) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir la page ${i + 1} en grand`}
                className="seam block overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={a.thumbUrl}
                  alt={`Page ${i + 1} du carnet`}
                  className="block aspect-square w-full object-cover object-top"
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

      <Button asChild variant="outline" className="mt-4 min-h-12 w-full">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Revenir au journal
        </Link>
      </Button>
    </div>
  );
}
