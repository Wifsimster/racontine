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

/* LA DÉCISION ET SES GARDE-FOUS : la barre qui publie, le dialogue qui empêche
   de perdre un travail non enregistré, et la confirmation de retrait d'une
   page. */

/** La barre d'action : UNE décision, et ce qu'elle coûte, écrit au-dessus. */
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
  /** La journée était déjà publiée : le mot change (« republier »). */
  republish: boolean;
  /** Lectures encore douteuses : l'avertissement passe devant la conséquence. */
  pending: number;
  onStopWaiting: () => void;
  onPublish: () => void;
}) {
  /* ── Barre d'action ───────────────────────────────────────────────────
      OPAQUE, et une seule décision. Deux corrections de fond :
      · `bg-surface-bar` (0,88 / 0,90 d'alpha) laissait dix nœuds de texte
        se lire à travers la barre, en dessous du seuil de contraste et hors
        d'atteinte du pointeur — un fantôme légible. Fond opaque, plus de
        fantôme ; un dégradé de 24 px au-dessus dit que le papier continue.
      · un bouton + une ligne de conséquence = 101 px. Avec l'en-tête de
        l'application (57 px), le chrome tombe à 18,7 % de l'écran (25,4 %
        avant, pour un plafond de 22 %) — et l'indice clavier partage la
        ligne de la conséquence au lieu de coûter 28 px de plus. */
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
      {/* LA CONSÉQUENCE EST TOUJOURS ÉCRITE, et la barre garde donc une
          hauteur CONSTANTE.
          Avant : une ligne quand il restait des lectures douteuses, et rien
          du tout sinon — sur un téléphone (où l'indice clavier est caché) la
          barre passait de 101 à 81 px selon l'état, et le geste le plus
          conséquent du produit (« ça part aux proches ») n'était nommé
          nulle part. Le parcours mesuré s'arrêtait sur un bouton qui ne
          disait pas ce qu'il faisait, puis sur un journal qui ne disait pas
          que c'était fait.
          Maintenant : une ligne, toujours. Ambre quand il reste un doute
          (l'avertissement passe devant), encre pâlie sinon pour dire la
          conséquence. Et l'indice clavier partage la ligne à partir de
          `md`, comme avant. */}
      {/* PENDANT LA PUBLICATION, LA LIGNE CHANGE DE MÉTIER. Elle disait
          « 1 lecture sera publiée telle quelle » au présent pendant que la
          requête partait, comme si rien ne se passait ; le seul signe de vie
          était une roue dans un bouton dont le libellé ne bougeait pas.
          Elle porte maintenant l'avancement (cf. `PublishProgress`), et la
          conséquence revient dès que c'est fini. */}
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
              /* mt-0.5 : même nudge optique de 2 px que ci-dessus. */
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
        {/* L'INDICE CLAVIER EXISTE AUSSI À 390 px. Il était `hidden md:flex` :
            sur le viewport principal du produit, aucun chemin clavier n'était
            montré — alors qu'un clavier Bluetooth sur tablette et un clavier
            d'iPad sont exactement les cas où l'on relit une journée à deux
            mains. Il partage la ligne quand elle a la place, et passe à la
            ligne (`flex-wrap` du parent) quand elle ne l'a pas : la barre
            gagne 20 px sur mobile, et rien n'est rogné à 320 px. */}
        <p className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
          <Kbd>⌘/Ctrl</Kbd>
          <Kbd>⏎</Kbd>
          publier
        </p>
      </div>
      )}
      {/* Pleine largeur au pouce, au fer à droite à la souris : un slab
          groseille de 1 024 px n'est pas un bouton, c'est un mur. */}
      <Button
        size="lg"
        className="w-full md:w-auto md:self-end md:px-10"
        loading={saving === "publish"}
        disabled={saving !== null}
        onClick={onPublish}
      >
        {saving === "publish" ? null : <Check aria-hidden="true" />}
        {/* LE LIBELLÉ DIT CE QUI SE PASSE. « Publier la journée » avec une
            roue, c'était un bouton qui décrivait encore l'intention pendant
            que l'action, elle, durait. Le participe présent est la seule
            chose vraie entre le tap et la réponse. */}
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

/**
 * Le garde-fou du travail non enregistré. Trois issues, dans l'ordre où on les
 * veut : rester (le défaut), enregistrer puis partir, partir en perdant — et
 * cette dernière est la seule marquée comme destructrice, parce que c'est la
 * seule qui détruit.
 */
export function LeaveGuardDialog({
  open,
  saving,
  onDismiss,
  onLeaveAnyway,
  onSaveThenLeave,
}: {
  open: boolean;
  /** Un enregistrement est en cours (bouton « Enregistrer, puis quitter »). */
  saving: boolean;
  onDismiss: () => void;
  onLeaveAnyway: () => void;
  onSaveThenLeave: () => void;
}) {
  /* Le garde-fou du travail non enregistré. Trois issues, dans l'ordre où
      on les veut : rester (le défaut, c'est l'annulation du dialogue),
      enregistrer puis partir, partir en perdant — et cette dernière est la
      seule marquée `destructive`, parce que c'est la seule qui détruit. */
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
      {/* L'ORDRE EST CALCULÉ, PAS SUBI. `AlertDialogFooter` est en
          `flex-col-reverse` sur mobile (et `flex-row justify-end` à partir
          de `sm`) : le DERNIER enfant du DOM est donc celui du HAUT au
          pouce. En écrivant l'ordre naturel (annuler, détruire, enregistrer)
          on obtenait un slab rouge « Quitter quand même » en tête d'un
          dialogue dont tout le propos est de NE PAS perdre le travail.
          L'ordre du DOM est donc renversé exprès :
            mobile, de haut en bas → Enregistrer puis quitter · Quitter quand
              même · Rester (la recommandation domine, le retour est sous le
              pouce) ;
            bureau, de gauche à droite → Rester · Quitter quand même ·
              Enregistrer (l'action principale au fer à droite) ;
            clavier → Rester d'abord, donc la touche la plus sûre en premier.
          Et « Quitter quand même » n'est plus un aplat : rouge en ENCRE sur
          un bord, parce que c'est la sortie qu'on ne veut pas vendre. Le
          rouge plein reste pour ce qui détruit vraiment (supprimer une
          journée). */}
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

/** Confirmation du retrait d'une page photographiée. */
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
