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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* Les pages photographiées : la bande de vignettes d'une carte, et la
   visionneuse plein écran qui s'ouvre au clic. */

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
              // Ratios DÉCLARÉS : 3/2 pour une page seule (une bande, comme un
              // scan), carré dès qu’il y en a plusieurs — une page de carnet
              // est presque carrée, un cadre 4/3 lui coupait l’en-tête.
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
          {/* Le « +N » est une tuile PLEINE, pas un voile posé sur une photo :
              du blanc sur une image inconnue n’est jamais un contraste mesuré. */}
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

/**
 * Le lecteur de pages : plein écran, sur le papier (pas un voile translucide —
 * un texte blanc sur une photo pâle voilée n’atteint pas 4,5:1 et on ne peut
 * pas le mesurer). Échap ferme, les flèches feuillettent, le focus revient sur
 * la vignette d’où l’on vient.
 *
 * Il est monté en PORTAIL sur `<body>`, et ce n’est pas un détail : la page est
 * rendue dans un `<main>` qui porte une animation d’opacité (`page-enter`), donc
 * un contexte d’empilement. Un `z-60` posé à l’intérieur de `main` reste sous
 * l’en-tête `z-50` de la coquille, qui en est le frère — le lecteur s’ouvrait
 * DERRIÈRE la barre du haut, sa propre barre (« Page 1 / 2 », le bouton
 * Fermer) invisible dessous.
 */
export function PageViewer({
  pages,
  index,
  date,
  onIndex,
  onClose,
}: {
  pages: AttachmentRef[];
  index: number;
  /** La date ISO de la journée : le titre long pour l’annonce, court à l’écran. */
  date: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const count = pages.length;
  const dateText = fullDate(date);
  const shortDate = dayMonth(date);

  /* ── L’agrandissement, la fonction qui manquait ───────────────────────────
     C’est la seule image du produit qu’il FAUT pouvoir agrandir : une page
     manuscrite servie sur 358 px de large, dont on veut relire un mot que la
     transcription a peut-être manqué. À l’échelle « ajustée » la page tient
     dans l’écran (la largeur est limitante, 313 px de hauteur restent vides) ;
     agrandie, elle prend TOUTE la hauteur — ×1,7, soit 609 px de large sur un
     viewport de 390 — et l’on défile sur un seul axe : rien n’est coupé en haut
     ni en bas, ce qui compte quand on cherche une ligne précise. Le geste est disponible deux fois — la page elle-même est un
     bouton, et la barre porte le même contrôle nommé — parce qu’au doigt on
     touche l’image et au clavier on tabule jusqu’au bouton. */
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [index]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // On agrandit depuis le CENTRE de la page, pas depuis son coin gauche.
    box.scrollLeft = zoom ? (box.scrollWidth - box.clientWidth) / 2 : 0;
    box.scrollTop = 0;
  }, [zoom, index]);

  useEffect(() => {
    closeRef.current?.focus();
    // Le carnet dessous ne défile pas pendant qu’on lit une page.
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
      // `aria-modal` promet que le reste de la page est hors d’atteinte : on
      // tient la promesse au clavier aussi, en bouclant la tabulation dans le
      // lecteur au lieu de laisser le focus filer derrière le voile.
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
      aria-label={`Pages du carnet du ${dateText}`}
      className="page-enter fixed inset-0 z-60 flex flex-col bg-background px-safe"
    >
      <div className="flex h-header shrink-0 items-center justify-between gap-2 border-b px-2 pt-safe">
        <p className="surtitre px-2 text-muted-foreground" data-tabular>
          {shortDate} · page {index + 1} / {count}
        </p>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              zoom ? "Ajuster la page à l’écran" : "Agrandir la page du carnet"
            }
            aria-pressed={zoom}
            onClick={() => setZoom((v) => !v)}
          >
            {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
          </Button>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            aria-label="Fermer la page du carnet"
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
          aria-label={
            zoom ? "Ajuster la page à l’écran" : "Agrandir la page du carnet"
          }
          aria-pressed={zoom}
          className={cn(
            "flex items-center justify-center rounded-xl",
            zoom
              ? "h-full cursor-zoom-out"
              : "size-full flex-col gap-3 cursor-zoom-in",
          )}
        >
          {/* Le liseré : sur du papier crème, une page crème posée sur le fond
              clair perdait son bord (mesuré à 1,1:1 — la couture seule ne suffit
              pas en clair, alors qu’en sombre la page se détache toute seule).
              Le filet de champ est le trait le plus affirmé du système, et il
              est re-choisi dans les deux thèmes. */}
          <img
            src={pages[index]?.url}
            alt={`Page ${index + 1} du carnet du ${dateText}`}
            className={cn(
              "seam block rounded-xl border border-input",
              zoom
                ? "h-full w-auto max-w-none"
                : "min-h-0 max-h-full max-w-full object-contain",
            )}
          />
          {/* Le geste est écrit, juste sous la page : à l’état ajusté c’est la
              LARGEUR qui limite, il reste donc de la hauteur, et elle sert à
              dire comment lire de plus près plutôt qu’à rester vide. */}
          {!zoom && (
            <span className="shrink-0 text-meta text-muted-foreground">
              Touchez la page pour l’agrandir
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
