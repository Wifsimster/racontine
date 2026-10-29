import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ScanLine,
  PenLine,
  Smile,
  Star,
  TriangleAlert,
} from "lucide-react";
import {
  type Entry,
  SOURCE_LABELS,
} from "@/lib/types";
import {
  dayLabel,
  fr,
  fullDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, ItemLine, glanceOf, pickGlance } from "./glance";
import { PageStrip } from "./pages";

export function pendingCount(entry: Entry): number {
  if (!Array.isArray(entry.uncertainties)) return 0;
  return entry.uncertainties.filter((u) =>
    typeof u === "string" ? true : !u.resolved,
  ).length;
}

export function StatusBadge({
  entry,
  canEdit,
}: {
  entry: Entry;
  canEdit: boolean;
}) {
  if (entry.status === "draft")
    return (
      <Badge variant="warning">
        <PenLine aria-hidden="true" />À relire
      </Badge>
    );
  if (entry.status === "processing")
    return (
      <Badge variant="soft">
        <ScanLine aria-hidden="true" />
        Lecture en cours
      </Badge>
    );
  if (entry.status === "failed")
    return (
      <Badge variant="destructive">
        <TriangleAlert aria-hidden="true" />
        Échec
      </Badge>
    );
  if (entry.status === "published" && canEdit) {
    const n = pendingCount(entry);
    if (n > 0)
      return (
        <Badge variant="warning">
          <TriangleAlert aria-hidden="true" />
          {n} à vérifier
        </Badge>
      );
  }
  return null;
}

export function EntryCard({
  entry,
  canEdit,
  onOpenPages,
}: {
  entry: Entry;
  canEdit: boolean;
  onOpenPages: (entry: Entry, index: number, from: HTMLElement) => void;
}) {
  const dateText = fullDate(entry.date);
  const label = dayLabel(entry.date);
  const hasStory = Boolean(entry.story);
  const pending = pendingCount(entry);
  const action = !canEdit
    ? null
    : entry.status === "failed"
      ? { label: "Reprendre cette journée", quiet: false }
      : entry.status === "draft"
        ? { label: "Relire et publier", quiet: false }
        : entry.status === "published"
          ? pending > 0
            ? { label: "Corriger la lecture", quiet: false }
            : { label: "Corriger la journée", quiet: true }
          : null;
  const shown = pickGlance(glanceOf(entry));

  const [open, setOpen] = useState(false);
  const storyRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = storyRef.current;
    if (!el || open) return;
    let alive = true;
    const measure = () => {
      if (alive) setClipped(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [entry.story, open]);

  const storyId = `recit-${entry.id}`;
  const detailId = `jour-${entry.id}`;

  return (
    <article
      id={`carte-${entry.id}`}
      className="relative scroll-mt-28 overflow-hidden rounded-2xl border bg-card shadow-card"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]"
      />

      <div className="relative flex flex-col gap-4 py-4 pr-5 pl-7">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="surtitre flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              {entry.child && (
                <>
                  <ChildMark name={entry.child.name} />
                  <span className="text-foreground">{entry.child.name}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                </>
              )}
              <time dateTime={entry.date} className="text-muted-foreground">
                {label}
              </time>
            </p>
            <p className="surtitre shrink-0 text-muted-foreground">
              {SOURCE_LABELS[entry.source]}
            </p>
          </div>
          <StatusBadge entry={entry} canEdit={canEdit} />
        </div>

        {entry.title && (
          <h3 className="font-serif text-title font-semibold text-balance">
            {fr(entry.title)}
          </h3>
        )}

        <GlanceStrip stats={shown} />

        {entry.story && (
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 pr-5 pl-7">
            <p
              id={storyId}
              ref={storyRef}
              className={cn(
                "carnet-story measure hyphens-auto text-pretty",
                !open && "line-clamp-3",
              )}
            >
              {fr(entry.story)}
            </p>
          </div>
        )}

        {entry.status === "processing" && (
          <div>
            <p role="status" className="text-ui text-muted-foreground">
              Racontine relit la page et écrit la journée. Cette carte se
              remplira toute seule — vous pouvez fermer l’app.
            </p>
            <div aria-hidden="true" className="mt-3">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton mt-4 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-2/3" />
            </div>
          </div>
        )}

        {entry.highlight && (
          <div className="rounded-lg border-l-2 border-l-[var(--rule-margin)] bg-accent px-4 py-3">
            <p className="surtitre flex items-center gap-1.5 text-muted-foreground">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Le temps fort
            </p>
            <p className="mt-1 text-body text-pretty">{fr(entry.highlight)}</p>
          </div>
        )}

        {entry.status === "failed" && entry.failureReason && (
          <div className="flex items-start gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="text-ui">{fr(entry.failureReason)}</p>
          </div>
        )}

        {hasStory ? (
          <details
            className="border-t"
            onToggle={(e) => setOpen(e.currentTarget.open)}
          >
            <summary
              aria-controls={
                entry.items.length > 0 ? `${storyId} ${detailId}` : storyId
              }
              className="flex min-h-11 cursor-pointer list-none items-center gap-3 pt-1 text-ui text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <span className="flex-1">
                {open
                  ? "Replier"
                  : clipped
                    ? "Toute la journée"
                    : "Le détail du jour"}
              </span>
              {entry.items.length > 0 && (
                <span className="surtitre" data-tabular>
                  {entry.items.length} moment{entry.items.length > 1 ? "s" : ""}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform dur-base ease-carnet",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </summary>
            {entry.items.length > 0 ? (
              <ul id={detailId} className="flex flex-col gap-3 pt-1 pb-2">
                {entry.items.map((it) => (
                  <ItemLine key={it.id} item={it} />
                ))}
                {entry.mood && <MoodLine mood={entry.mood} />}
              </ul>
            ) : (
              <p className="pt-1 pb-2 text-meta text-muted-foreground">
                Rien d’autre n’a été noté ce jour-là : la page ne portait que ce
                récit.
              </p>
            )}
          </details>
        ) : (
          entry.items.length > 0 && (
            <ul className="flex flex-col gap-3 border-t pt-4">
              {entry.items.map((it) => (
                <ItemLine key={it.id} item={it} />
              ))}
              {entry.mood && <MoodLine mood={entry.mood} />}
            </ul>
          )
        )}
        {entry.attachments.length > 0 && (
          <PageStrip
            pages={entry.attachments}
            dateText={dateText}
            onOpen={(i, from) => onOpenPages(entry, i, from)}
          />
        )}
      </div>

      {action && (
        <div className="border-t px-5 py-3 pl-7">
          <Button
            asChild
            variant={action.quiet ? "ghost" : "secondary"}
            className={cn(
              "w-full",
              action.quiet && "justify-between text-muted-foreground",
            )}
          >
            <Link to={`/entries/${entry.id}`}>
              {action.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

export function MoodLine({ mood }: { mood: string }) {
  return (
    <li className="flex items-start gap-3 text-ui">
      <span
        aria-hidden="true"
        className="-mt-1 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
      >
        <Smile className="size-4" />
      </span>
      <span>
        <span className="font-bold">Humeur</span> — {fr(mood)}
      </span>
    </li>
  );
}
