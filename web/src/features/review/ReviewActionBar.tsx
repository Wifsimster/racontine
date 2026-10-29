import type { RefObject } from "react";
import { Check, Send, TriangleAlert } from "lucide-react";
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
import { PublishProgress } from "./PublishProgress";
import { Kbd } from "./source";

export function ReviewActionBar({
  barRef,
  saving,
  publishSeconds,
  moments,
  pages,
  republish,
  pending,
  onStopWaiting,
  onPublish,
}: {
  barRef: RefObject<HTMLDivElement | null>;
  saving: "draft" | "publish" | null;
  publishSeconds: number;
  moments: number;
  pages: number;
  republish: boolean;
  pending: number;
  onStopWaiting: () => void;
  onPublish: () => void;
}) {
  return (
  <div
    ref={barRef}
    className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4"
  >
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background"
    />
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      {saving === "publish" ? (
        <PublishProgress
          seconds={publishSeconds}
          moments={moments}
          pages={pages}
          republish={republish}
          onStopWaiting={onStopWaiting}
        />
      ) : (
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        {pending > 0 ? (
          <p className="flex min-w-0 items-start gap-2 text-meta text-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {pending === 1
              ? "1 lecture sera publiée telle quelle."
              : `${pending} lectures seront publiées telles quelles.`}
          </p>
        ) : (
          <p className="flex min-w-0 items-start gap-2 text-meta text-muted-foreground">
            <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {republish
              ? "Vos proches liront la version corrigée."
              : "La journée part aux proches, qui en sont prévenus."}
          </p>
        )}
        <p className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
          <Kbd>⌘/Ctrl</Kbd>
          <Kbd>⏎</Kbd>
          publier
        </p>
      </div>
      )}
      <Button
        size="lg"
        className="w-full md:w-auto md:self-end md:px-10"
        loading={saving === "publish"}
        disabled={saving !== null}
        onClick={onPublish}
      >
        {saving === "publish" ? null : <Check aria-hidden="true" />}
        {saving === "publish"
          ? republish
            ? "Republication en cours…"
            : "Publication en cours…"
          : republish
            ? "Republier la journée"
            : "Publier la journée"}
      </Button>
    </div>
  </div>
  );
}

export function LeaveGuardDialog({
  open,
  saving,
  onDismiss,
  onLeaveAnyway,
  onSaveThenLeave,
}: {
  open: boolean;
  saving: boolean;
  onDismiss: () => void;
  onLeaveAnyway: () => void;
  onSaveThenLeave: () => void;
}) {
  return (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onDismiss();
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
        <AlertDialogDescription>
          Vos corrections ne sont pas encore enregistrées. La journée reste
          un brouillon, mais ce que vous venez d’écrire sera perdu.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Rester sur la journée</AlertDialogCancel>
        <AlertDialogAction
          variant="outline"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          onClick={onLeaveAnyway}
        >
          Quitter quand même
        </AlertDialogAction>
        <Button loading={saving} onClick={onSaveThenLeave}>
          Enregistrer, puis quitter
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );
}

export function RemovePageDialog({
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
        <AlertDialogTitle>Retirer cette page ?</AlertDialogTitle>
        <AlertDialogDescription>
          La photo sera définitivement supprimée du carnet. Le récit déjà
          écrit n'est pas modifié.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Annuler</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={onConfirm}
        >
          Retirer
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );
}
