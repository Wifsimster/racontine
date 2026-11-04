import { type RefObject, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookCheck,
  BookOpen,
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
import { capitalize, dayLabel, fr, fullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, ItemLine, glanceOf, pickGlance } from "./glance";
import { PageStrip } from "./pages";
import { SouvenirCover } from "./souvenirs";

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
      <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
        <ScanLine className="size-4" aria-hidden="true" />
        Lecture en cours
      </span>
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

export function isUnread(entry: Entry): boolean {
  return entry.status === "published" && entry.read === false;
}

export function UnreadDot({ className }: { className?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-2 shrink-0 rounded-full bg-primary align-middle",
          className,
        )}
      />
      <span className="sr-only">Nouveau</span>
    </>
  );
}

const DWELL_MS = 2500;

function useReadOnDwell(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDwell: () => void,
) {
  const onDwellRef = useRef(onDwell);
  useEffect(() => {
    onDwellRef.current = onDwell;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        const viewport = e.rootBounds?.height ?? window.innerHeight;
        const seen =
          e.intersectionRatio >= 0.6 ||
          e.intersectionRect.height >= viewport * 0.5;
        if (seen && !timer && !document.hidden) {
          timer = setTimeout(() => onDwellRef.current(), DWELL_MS);
        } else if (!seen && timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref, active]);
}

export function EntryCard({
  entry,
  canEdit,
  onOpenPages,
  onOpenSouvenirs,
  onRead,
  showChild = false,
}: {
  entry: Entry;
  canEdit: boolean;
  onOpenPages: (entry: Entry, index: number, from: HTMLElement) => void;
  onOpenSouvenirs?: (entry: Entry, index: number, from: HTMLElement) => void;
  onRead?: (entry: Entry, read: boolean) => void;
  showChild?: boolean;
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

  const cardRef = useRef<HTMLElement>(null);
  const [manuel, setManuel] = useState(false);
  const unread = isUnread(entry);
  const trackable = Boolean(onRead) && entry.status === "published";
  useReadOnDwell(cardRef, trackable && unread && !manuel, () =>
    onRead?.(entry, true),
  );

  function basculerLu() {
    setManuel(true);
    onRead?.(entry, unread);
  }

  const storyId = `recit-${entry.id}`;
  const detailId = `jour-${entry.id}`;

  const nouveau = unread && trackable;
  const moments = entry.items.length;
  const bascule = !action && trackable && (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 text-muted-foreground"
      aria-pressed={!unread}
      onClick={basculerLu}
    >
      {unread ? (
        <>
          <BookCheck aria-hidden="true" />
          Marquer comme lu
        </>
      ) : (
        <>
          <BookOpen aria-hidden="true" />
          Marquer comme non lu
        </>
      )}
    </Button>
  );

  const souvenirs = entry.souvenirs ?? [];
  const rangeeBasse = hasStory || Boolean(bascule) || Boolean(action);

  return (
    <article
      ref={cardRef}
      id={`carte-${entry.id}`}
      data-unread={unread || undefined}
      className="scroll-mt-28 rounded-xl border bg-card"
    >
      {souvenirs.length > 0 && (
        <SouvenirCover
          souvenirs={souvenirs}
          childName={entry.child?.name}
          date={entry.date}
          onOpen={(i, from) =>
            (onOpenSouvenirs ?? onOpenPages)(entry, i, from)
          }
        />
      )}
      <div
        className={cn(
          "flex flex-col gap-3 px-5 pt-4",
          rangeeBasse ? "pb-1" : "pb-4",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
            {!entry.title && nouveau && <UnreadDot className="mr-0.5" />}
            {showChild && entry.child && (
              <>
                <ChildMark name={entry.child.name} />
                <span className="font-bold text-foreground">
                  {entry.child.name}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <time dateTime={entry.date}>{capitalize(label)}</time>
            <span aria-hidden="true">·</span>
            <span>{SOURCE_LABELS[entry.source]}</span>
          </p>
          <StatusBadge entry={entry} canEdit={canEdit} />
        </div>

        {entry.title && (
          <h3 className="font-serif text-title font-semibold text-balance">
            {nouveau && <UnreadDot className="mr-2 -mt-1" />}
            {fr(entry.title)}
          </h3>
        )}

        <GlanceStrip stats={shown} />

        {entry.story && (
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
          <p className="flex items-start gap-2 font-serif text-body text-pretty italic">
            <Star
              className="mt-1.5 size-3.5 shrink-0 fill-current text-primary"
              aria-hidden="true"
            />
            <span>
              <span className="sr-only">Le temps fort : </span>
              {fr(entry.highlight)}
            </span>
          </p>
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

        {!hasStory && moments > 0 && (
          <ul className="flex flex-col gap-3 pt-1">
            {entry.items.map((it) => (
              <ItemLine key={it.id} item={it} />
            ))}
            {entry.mood && <MoodLine mood={entry.mood} />}
          </ul>
        )}

        {entry.attachments.length > 0 && (
          <PageStrip
            pages={entry.attachments}
            dateText={dateText}
            onOpen={(i, from) => onOpenPages(entry, i, from)}
          />
        )}
      </div>

      {hasStory ? (
        <div className="relative px-5 pb-2">
          <details
            onToggle={(e) => {
              const ouvert = e.currentTarget.open;
              setOpen(ouvert);
              if (ouvert && unread && !manuel) onRead?.(entry, true);
            }}
          >
            <summary
              aria-controls={moments > 0 ? `${storyId} ${detailId}` : storyId}
              className="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-meta text-muted-foreground transition-colors dur-fast outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
            >
              <span data-tabular>
                {open
                  ? "Replier"
                  : moments > 0
                    ? `${moments} moment${moments > 1 ? "s" : ""}`
                    : clipped
                      ? "Toute la journée"
                      : "Le détail du jour"}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform dur-base ease-carnet",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </summary>
            {moments > 0 ? (
              <ul id={detailId} className="flex flex-col gap-3 pt-2 pb-3">
                {entry.items.map((it) => (
                  <ItemLine key={it.id} item={it} />
                ))}
                {entry.mood && <MoodLine mood={entry.mood} />}
              </ul>
            ) : (
              <p className="pt-1 pb-3 text-meta text-muted-foreground">
                Rien d’autre n’a été noté ce jour-là : la page ne portait que ce
                récit.
              </p>
            )}
          </details>
          {bascule && <div className="absolute top-0 right-3">{bascule}</div>}
        </div>
      ) : (
        bascule && <div className="flex justify-end px-3 pb-2">{bascule}</div>
      )}

      {action && (
        <div className="px-5 pt-1 pb-4">
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
      <Smile
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span>
        <span className="font-bold">Humeur</span> — {fr(mood)}
      </span>
    </li>
  );
}
