import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type AttachmentRef,
} from "@/lib/types";
import {
  dayMonth,
  fullDate,
} from "@/lib/format";
import { deName } from "@/lib/child";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageStrip({
  pages,
  dateText,
  onOpen,
}: {
  pages: AttachmentRef[];
  dateText: string;
  onOpen: (index: number, from: HTMLElement) => void;
}) {
  const shown = pages.slice(0, pages.length > 3 ? 2 : 3);
  const rest = pages.length - shown.length;
  const single = pages.length === 1;

  return (
    <ul
      className={cn(
        "grid gap-2",
        single
          ? "grid-cols-1"
          : pages.length === 2
            ? "grid-cols-2"
            : "grid-cols-3",
      )}
    >
      {shown.map((a, i) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={(e) => onOpen(i, e.currentTarget)}
            className={cn(
              "seam block w-full overflow-hidden rounded-xl transition-transform dur-press ease-carnet active:scale-[0.98]",
              single ? "aspect-[3/2]" : "aspect-square",
            )}
          >
            <img
              src={a.thumbUrl}
              alt={`Page ${i + 1} du carnet du ${dateText}`}
              className="size-full object-cover"
              loading="lazy"
            />
          </button>
        </li>
      ))}
      {rest > 0 && (
        <li>
          <button
            type="button"
            onClick={(e) => onOpen(shown.length, e.currentTarget)}
            aria-label={`Voir les ${pages.length} pages du carnet`}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted text-foreground transition-colors dur-fast hover:bg-accent"
          >
            <Images className="size-5" aria-hidden="true" />
            <span className="text-meta font-bold" data-tabular>
              +{rest}
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

export type ViewerKind = "carnet" | "souvenir";

function viewerWords(kind: ViewerKind, childName: string | undefined) {
  if (kind === "souvenir")
    return {
      noun: "photo",
      dialog: (date: string) =>
        childName
          ? `Photos ${deName(childName)} du ${date}`
          : `Photos du ${date}`,
      alt: (_: number, date: string) => souvenirAlt(childName, date),
      zoomIn: "Agrandir la photo",
      zoomOut: "Ajuster la photo à l’écran",
      close: "Fermer la photo",
      hint: "Touchez la photo pour l’agrandir",
    };
  return {
    noun: "page",
    dialog: (date: string) => `Pages du carnet du ${date}`,
    alt: (i: number, date: string) => `Page ${i + 1} du carnet du ${date}`,
    zoomIn: "Agrandir la page du carnet",
    zoomOut: "Ajuster la page à l’écran",
    close: "Fermer la page du carnet",
    hint: "Touchez la page pour l’agrandir",
  };
}

export function souvenirAlt(childName: string | undefined, date: string) {
  return childName
    ? `Photo ${deName(childName)} le ${date}`
    : `Photo du ${date}`;
}

export function PageViewer({
  pages,
  index,
  date,
  onIndex,
  onClose,
  kind = "carnet",
  childName,
}: {
  pages: AttachmentRef[];
  index: number;
  date: string;
  onIndex: (i: number) => void;
  onClose: () => void;
  kind?: ViewerKind;
  childName?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const count = pages.length;
  const dateText = fullDate(date);
  const shortDate = dayMonth(date);
  const words = viewerWords(kind, childName);

  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [index]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.scrollLeft = zoom ? (box.scrollWidth - box.clientWidth) / 2 : 0;
    box.scrollTop = 0;
  }, [zoom, index]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && rootRef.current) {
        const f = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>("button"),
        );
        if (f.length > 0) {
          const first = f[0];
          const last = f[f.length - 1];
          const here = document.activeElement;
          if (
            e.shiftKey &&
            (here === first || !rootRef.current.contains(here))
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && here === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      if (count < 2) return;
      if (e.key === "ArrowRight") onIndex((index + 1) % count);
      if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, count, onIndex, onClose]);

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={words.dialog(dateText)}
      className="page-enter fixed inset-0 z-60 flex flex-col bg-background px-safe"
    >
      <div className="flex h-header shrink-0 items-center justify-between gap-2 border-b px-2 pt-safe">
        <p className="surtitre px-2 text-muted-foreground" data-tabular>
          {shortDate} · {words.noun} {index + 1} / {count}
        </p>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={zoom ? words.zoomOut : words.zoomIn}
            aria-pressed={zoom}
            onClick={() => setZoom((v) => !v)}
          >
            {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
          </Button>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            aria-label={words.close}
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      <div
        ref={boxRef}
        className={cn(
          "min-h-0 flex-1 p-4",
          zoom ? "overflow-auto" : "flex items-center justify-center overflow-hidden",
        )}
      >
        <button
          type="button"
          onClick={() => setZoom((v) => !v)}
          aria-label={zoom ? words.zoomOut : words.zoomIn}
          aria-pressed={zoom}
          className={cn(
            "flex items-center justify-center rounded-xl",
            zoom
              ? "h-full cursor-zoom-out"
              : "size-full flex-col gap-3 cursor-zoom-in",
          )}
        >
          <img
            src={pages[index]?.url}
            alt={words.alt(index, dateText)}
            className={cn(
              "seam block rounded-xl",
              kind === "carnet" && "border border-input",
              zoom
                ? "h-full w-auto max-w-none"
                : "min-h-0 max-h-full max-w-full object-contain",
            )}
          />
          {!zoom && (
            <span className="shrink-0 text-meta text-muted-foreground">
              {words.hint}
            </span>
          )}
        </button>
      </div>

      {count > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 pt-3 pb-safe-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIndex((index - 1 + count) % count)}
          >
            <ChevronLeft aria-hidden="true" />
            Précédente
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIndex((index + 1) % count)}
          >
            Suivante
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
