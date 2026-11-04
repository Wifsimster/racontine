import { type ChangeEvent, useRef, useState } from "react";
import { ImagePlus, Images, X } from "lucide-react";
import { api } from "@/lib/api";
import { deName } from "@/lib/child";
import { fullDate } from "@/lib/format";
import { compressImage, preloadImage } from "@/lib/image";
import { type AttachmentRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageViewer, souvenirAlt } from "./pages";

export const MAX_SOUVENIRS = 12;

const THUMB_MAX = 512;

function sourcesOf(a: AttachmentRef): { src: string; srcSet?: string } {
  if (!a.width || !a.height) return { src: a.thumbUrl };
  const thumbWidth =
    a.width >= a.height
      ? Math.min(THUMB_MAX, a.width)
      : Math.round((THUMB_MAX * a.width) / a.height);
  if (thumbWidth >= a.width) return { src: a.thumbUrl };
  return {
    src: a.thumbUrl,
    srcSet: `${a.thumbUrl} ${thumbWidth}w, ${a.url} ${a.width}w`,
  };
}

function SouvenirImage({
  souvenir,
  alt,
  sizes,
  className,
}: {
  souvenir: AttachmentRef;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const { src, srcSet } = sourcesOf(souvenir);
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={souvenir.width ?? undefined}
      height={souvenir.height ?? undefined}
      loading="lazy"
      decoding="async"
      className={cn("size-full object-cover", className)}
    />
  );
}

export function SouvenirCover({
  souvenirs,
  childName,
  date,
  onOpen,
}: {
  souvenirs: AttachmentRef[];
  childName?: string;
  date: string;
  onOpen: (index: number, from: HTMLElement) => void;
}) {
  const first = souvenirs[0];
  if (!first) return null;
  const count = souvenirs.length;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(0, e.currentTarget)}
      className="relative block aspect-[4/3] w-full overflow-hidden sm:aspect-[3/2] rounded-t-[calc(var(--radius)+3px)] bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <SouvenirImage
        souvenir={first}
        alt={souvenirAlt(childName, fullDate(date))}
        sizes="(min-width: 48rem) 40rem, 100vw"
      />
      {count > 1 && (
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-surface-bar px-3 py-1 text-meta font-bold text-foreground backdrop-blur-md">
          <Images className="size-4" aria-hidden="true" />
          <span data-tabular>{count} photos</span>
        </span>
      )}
    </button>
  );
}

export function SouvenirGallery({
  souvenirs,
  childName,
  date,
}: {
  souvenirs: AttachmentRef[];
  childName?: string;
  date: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  if (!souvenirs.length) return null;
  const dateText = fullDate(date);
  const odd = souvenirs.length % 2 === 1;

  return (
    <section aria-label={childName ? `Les photos ${deName(childName)}` : "Les photos"}>
      <ul className="grid grid-cols-2 gap-2">
        {souvenirs.map((s, i) => (
          <li key={s.id} className={cn(odd && i === 0 && "col-span-2")}>
            <button
              type="button"
              onClick={(e) => {
                returnTo.current = e.currentTarget;
                setOpen(i);
              }}
              className={cn(
                "seam block w-full overflow-hidden rounded-xl bg-muted transition-transform dur-press ease-carnet active:scale-[0.98]",
                odd && i === 0 ? "aspect-[4/3]" : "aspect-square",
              )}
            >
              <SouvenirImage
                souvenir={s}
                alt={souvenirAlt(childName, dateText)}
                sizes={
                  odd && i === 0
                    ? "(min-width: 48rem) 40rem, 100vw"
                    : "(min-width: 48rem) 20rem, 50vw"
                }
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <PageViewer
          kind="souvenir"
          childName={childName}
          pages={souvenirs}
          index={open}
          date={date}
          onIndex={setOpen}
          onClose={() => {
            setOpen(null);
            returnTo.current?.focus();
          }}
        />
      )}
    </section>
  );
}

type Pending = { key: string; url: string };

export function SouvenirsEditor({
  entryId,
  childName,
  date,
  souvenirs,
  onChange,
}: {
  entryId: string;
  childName?: string;
  date: string;
  souvenirs: AttachmentRef[];
  onChange: (update: (prev: AttachmentRef[]) => AttachmentRef[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const dateText = fullDate(date);
  const label = childName
    ? `Ajouter une photo ${deName(childName)}`
    : "Ajouter une photo";
  const room = MAX_SOUVENIRS - souvenirs.length;
  const busy = pending.length > 0;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    setError(null);
    if (picked.length > room) {
      setError(
        room > 0
          ? `Encore ${room} photo${room > 1 ? "s" : ""} possible${room > 1 ? "s" : ""} pour cette journée.`
          : `Une journée garde au plus ${MAX_SOUVENIRS} photos.`,
      );
      return;
    }
    const previews = picked.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      url: URL.createObjectURL(f),
    }));
    setPending(previews);
    try {
      const files = await Promise.all(picked.map((f) => compressImage(f)));
      const res = await api.addSouvenirs(entryId, files);
      await Promise.all(res.souvenirs.map((s) => preloadImage(s.thumbUrl)));
      onChange((prev) => [...prev, ...res.souvenirs]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La photo n’a pas pu être ajoutée.",
      );
    } finally {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setError(null);
    try {
      await api.deleteAttachment(id);
      onChange((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La photo n’a pas pu être retirée.",
      );
    } finally {
      setRemoving(null);
      setConfirmId(null);
    }
  }

  return (
    <section aria-labelledby="rv-souvenirs" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="rv-souvenirs" className="text-ui font-bold">
          {childName ? `Les photos ${deName(childName)}` : "Les photos du jour"}
        </h2>
        <p className="text-meta text-muted-foreground">
          Une bouille, un dessin, un moment pris au vol : la première photo
          ouvre la journée dans le journal, à part des pages du carnet.
        </p>
      </div>

      {(souvenirs.length > 0 || busy) && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {souvenirs.map((s, i) => (
            <li key={s.id} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  returnTo.current = e.currentTarget;
                  setViewer(i);
                }}
                aria-label={`Voir la photo ${i + 1} en grand`}
                className="seam block aspect-square w-full overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={s.thumbUrl}
                  alt={souvenirAlt(childName, dateText)}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="absolute top-1 right-1"
                loading={removing === s.id}
                disabled={busy}
                onClick={() => setConfirmId(s.id)}
                aria-label={`Retirer la photo ${i + 1}`}
              >
                {removing === s.id ? null : <X aria-hidden="true" />}
              </Button>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} aria-busy="true">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                <img
                  src={p.url}
                  alt=""
                  className="size-full object-cover opacity-60"
                />
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-surface-bar px-3 py-1 text-center text-meta font-bold text-foreground backdrop-blur-md">
                  Envoi…
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        loading={busy}
        disabled={busy || room <= 0}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? null : <ImagePlus aria-hidden="true" />}
        {label}
      </Button>
      {room <= 0 && (
        <p className="text-meta text-muted-foreground">
          {MAX_SOUVENIRS} photos au plus par journée : retirez-en une pour en
          ajouter une autre.
        </p>
      )}
      {error && (
        <p role="alert" className="text-meta text-destructive">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void onPick(e)}
      />

      <AlertDialog
        open={!!confirmId}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Elle disparaît de la journée et du journal. Les pages du
              carnet et le récit ne bougent pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmId) void remove(confirmId);
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewer !== null && souvenirs[viewer] && (
        <PageViewer
          kind="souvenir"
          childName={childName}
          pages={souvenirs}
          index={viewer}
          date={date}
          onIndex={setViewer}
          onClose={() => {
            setViewer(null);
            returnTo.current?.focus();
          }}
        />
      )}
    </section>
  );
}
