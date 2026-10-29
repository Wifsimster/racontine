import { useEffect, useState } from "react";
import type React from "react";
import { Images, RotateCw, X } from "lucide-react";
import { type AttachmentRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";


export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border bg-card px-1.5 font-sans text-overline font-bold leading-5 tracking-normal text-foreground">
      {children}
    </kbd>
  );
}

export function SourcePage({
  attachment,
  index,
  total,
  quarter,
  onRotate,
  rotating,
  removing,
  onRemove,
}: {
  attachment: AttachmentRef;
  index: number;
  total: number;
  quarter: number;
  onRotate: (() => void) | null;
  rotating: boolean;
  removing: boolean;
  onRemove: (() => void) | null;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    attachment.width && attachment.height
      ? { w: attachment.width, h: attachment.height }
      : null,
  );
  useEffect(() => {
    if (attachment.width && attachment.height)
      setNatural({ w: attachment.width, h: attachment.height });
  }, [attachment.width, attachment.height]);
  const known = natural !== null;
  const q = known ? ((quarter % 4) + 4) % 4 : 0;
  const quart = q % 2 === 1;
  const w = natural?.w ?? 1;
  const h = natural?.h ?? 1;

  return (
    <figure className="relative">
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Ouvrir la page ${index + 1} en grand`}
        className="seam relative block w-full overflow-hidden rounded-xl bg-muted"
        style={
          known
            ? { aspectRatio: quart ? `${h} / ${w}` : `${w} / ${h}` }
            : undefined
        }
      >
        <img
          src={attachment.url}
          alt={`Page ${index + 1} du carnet`}
          onLoad={(e) => {
            if (known) return;
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight)
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className={cn(
            "block max-w-none",
            known
              ? "absolute top-1/2 left-1/2 origin-center transition-transform dur-base ease-carnet"
              : "w-full",
          )}
          style={
            known
              ? {
                  width: quart ? `${(w / h) * 100}%` : "100%",
                  transform: `translate(-50%, -50%) rotate(${q * 90}deg)`,
                }
              : undefined
          }
        />
      </a>
      <figcaption className="surtitre mt-2 text-muted-foreground">
        Page {index + 1} sur {total}
      </figcaption>
      {onRotate && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute bottom-9 left-2 rounded-full"
          disabled={!known || rotating}
          loading={rotating}
          onClick={onRotate}
          title="Tourner la page (la photo est enregistrée dans ce sens)"
          aria-label={`Tourner la page ${index + 1} d'un quart de tour`}
        >
          {rotating ? null : <RotateCw aria-hidden="true" />}
        </Button>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute right-2 bottom-9 rounded-full"
          loading={removing}
          onClick={onRemove}
          aria-label={`Retirer la page ${index + 1}`}
        >
          {removing ? null : <X aria-hidden="true" />}
        </Button>
      )}
    </figure>
  );
}

export function SourceTab({
  id,
  panel,
  selected,
  onSelect,
  Icon,
  children,
}: {
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  Icon: typeof Images;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panel}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-meta font-bold",
        "transition-colors dur-fast ease-carnet",
        selected
          ? "bg-card text-foreground shadow-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}
