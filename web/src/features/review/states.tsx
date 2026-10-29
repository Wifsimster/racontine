import { useEffect, useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  ChevronDown,
  Moon,
  RotateCcw,
  ScanLine,
  Soup,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type Entry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CaptureSteps } from "@/components/CaptureSteps";
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

export function ReviewSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-32">
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "done" },
          { key: "review", label: "Relecture", state: "current" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="mb-4 w-full"
      />
      <p
        role="status"
        className="mb-4 flex items-center gap-2 text-meta text-muted-foreground"
      >
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
        {slow
          ? "Le carnet met du temps à venir — la connexion est peut-être lente."
          : "Ouverture de la journée…"}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="skeleton h-6 w-56" />
            <div className="skeleton h-3 w-40" />
          </div>
          <div className="skeleton h-6 w-28 rounded-full" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
          <div className="skeleton size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-bg p-3">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-5 w-24" />
          <div className="flex gap-2">
            <div className="skeleton h-11 w-24 rounded-xl" />
            <div className="skeleton h-11 w-24 rounded-xl" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-20" />
          <div className="rounded-2xl border bg-card px-4 shadow-card">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="grid min-h-14 grid-cols-[28px_1fr_auto] items-center gap-3 border-b py-2 last:border-b-0"
              >
                <div className="skeleton size-7 rounded-[9px]" />
                <div className="flex flex-col gap-2">
                  <div className="skeleton h-3 w-16" />
                  <div
                    className="skeleton h-4"
                    style={{ width: `${68 - i * 7}%` }}
                  />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
          <div className="flex flex-col gap-2">
            <div className="skeleton h-4 w-44" />
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="skeleton size-4 shrink-0 rounded-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-4 w-36" />
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="skeleton h-6 w-full" />
            <div className="skeleton h-6 w-2/3" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-4 w-44" />
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-3/5" />
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4">
        <div className="mx-auto w-full max-w-5xl">
          <div className="skeleton mb-2 h-5 w-56" />
          <Button size="lg" className="w-full" disabled>
            Publier la journée
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProcessingView({ attachments }: { attachments: Entry["attachments"] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (attachments.length < 2) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % attachments.length);
    }, 1900);
    return () => clearInterval(t);
  }, [attachments.length]);

  const current = attachments[idx];
  const total = Math.max(attachments.length, 1);
  const pct = Math.round(((idx + 0.5) / total) * 100);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-4 p-4">
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "current" },
          { key: "review", label: "Relecture", state: "todo" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="w-full"
      />
      <span className="grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary">
        <ScanLine className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-title font-semibold">
          Racontine lit le carnet
        </h1>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          La page est transcrite, puis mise en récit. Quelques secondes
          suffisent — vous relirez tout avant publication.
        </p>
      </div>

      {current && (
        <div className="seam relative w-fit max-w-64 overflow-hidden rounded-xl">
          <img
            key={current.id}
            src={current.thumbUrl}
            alt={`Page ${idx + 1} du carnet, en cours de lecture`}
            className="animate-scan-fade block max-h-56 w-auto"
          />
          <div className="animate-scan-sweep pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary-soft to-transparent" />
        </div>
      )}

      <div className="flex w-full max-w-64 flex-col gap-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] dur-slow ease-page"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          role="status"
          className="text-center text-meta text-muted-foreground"
          data-tabular
        >
          Page {idx + 1} sur {total} en cours de lecture
        </p>
      </div>

      <ul aria-hidden="true" className="flex w-full flex-col gap-2">
        {[Soup, Moon, Sparkles].map((Icon, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <span className="flex flex-1 flex-col gap-2">
              <span className="skeleton h-3 w-16" />
              <span className="skeleton h-4" style={{ width: `${72 - i * 12}%` }} />
            </span>
          </li>
        ))}
      </ul>

      <div className="flex w-full flex-col items-center gap-1">
        <Button asChild variant="ghost" className="text-muted-foreground">
          <Link to="/">Revenir au journal</Link>
        </Button>
        <p className="max-w-[34ch] text-center text-meta text-muted-foreground">
          La journée s’y affichera d’elle-même dès qu’elle est prête. Vous
          pouvez fermer l’app.
        </p>
      </div>
    </div>
  );
}

export function ReadFailed({
  when,
  reason,
  canRetry,
  retrying,
  error,
  onRetry,
  onDelete,
  confirmOpen,
  onConfirmOpenChange,
  onConfirmDelete,
}: {
  when: string;
  reason: string | null;
  canRetry: boolean;
  retrying: boolean;
  error: string | null;
  onRetry: () => void;
  onDelete: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  return (
    <section className="rise-enter mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "failed" },
          { key: "review", label: "Relecture", state: "todo" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="w-full"
      />
      <span className="grid size-16 place-items-center rounded-3xl bg-warning-bg text-warning">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="surtitre text-muted-foreground">{when}</p>
        <h1 className="font-serif text-title font-semibold">
          La page n'a pas pu être lue
        </h1>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {reason ??
            "La lecture s'est arrêtée avant la fin, sans raison enregistrée."}
        </p>
        <p className="max-w-[34ch] text-meta text-muted-foreground">
          Rien n'a été publié et rien n'a été perdu : vos pages sont
          conservées telles quelles.
        </p>
      </div>

      {!canRetry && (
        <ul className="flex w-full flex-col gap-2">
          <Tip Icon={Camera}>
            Toute la page dans le cadre, à plat, sans doigt sur le bord.
          </Tip>
          <Tip Icon={Sparkles}>
            Une lumière du côté de la fenêtre plutôt qu'au-dessus : moins d'ombre
            sur l'écriture.
          </Tip>
        </ul>
      )}

      {error && (
        <p role="alert" className="text-ui text-destructive">
          {error}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        {canRetry && (
          <Button size="lg" loading={retrying} onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Relancer la lecture
          </Button>
        )}
        <Button
          asChild
          size={canRetry ? "default" : "lg"}
          variant={canRetry ? "outline" : "default"}
        >
          <Link to="/capture">
            <Camera aria-hidden="true" />
            Reprendre la photo
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Revenir au journal</Link>
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
          Supprimer cette journée
        </Button>
      </div>

      <DeleteDialog
        open={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        onConfirm={onConfirmDelete}
      />
    </section>
  );
}

export function LoadFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rise-enter mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      <span className="grid size-16 place-items-center rounded-3xl bg-warning-bg text-warning">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-title font-semibold">
          Cette journée ne s'ouvre pas
        </h1>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          Elle n'est pas perdue : c'est la connexion au carnet qui a échoué.
          Réessayez — si cela persiste, le serveur redémarre peut-être.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Revenir au journal</Link>
        </Button>
      </div>
      <TechnicalDetail message={message} />
    </section>
  );
}

export function TechnicalDetail({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="w-full"
    >
      <summary className="tap flex cursor-pointer list-none items-center justify-center gap-2 text-meta text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform dur-base ease-carnet",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
        Détail technique
      </summary>
      <p className="rounded-lg bg-muted px-4 py-3 text-left text-meta text-muted-foreground">
        {message}
      </p>
    </details>
  );
}

export function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

export function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. L'entrée et ses photos seront
            supprimées.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


