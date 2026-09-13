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
/* Les états de l'écran de relecture : squelette, lecture en cours, échec de
   lecture, échec d'accès, et la confirmation de suppression. */

/**
 * Squelette : la FORME de l'écran de relecture — l'en-tête, la ligne de
 * source, une carte à vérifier, le titre et le récit sur les lignes du cahier.
 */
export function ReviewSkeleton() {
  /* Le chargement DIT CE QU'IL FAIT, et il le dit deux fois : au bout de trois
     secondes, la ligne d'état change pour nommer la cause probable au lieu de
     répéter la même phrase indéfiniment. Aucune roue, aucune deuxième boucle :
     c'est le balayage des squelettes (déjà déclaré dans index.css) qui respire. */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-32">
      {/* Le rail n'est PAS un squelette : on sait déjà où l'on est dans le
          parcours avant que la journée arrive, et l'écran ne saute pas quand
          elle arrive. */}
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "done" },
          { key: "review", label: "Relecture", state: "current" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="mb-4 w-full"
      />
      {/* La ligne d'état est EN HAUT, pas en bas : en bas de 1 200 px de
          squelette, elle était sous la ligne de flottaison — un écran qui
          charge sans le dire. */}
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
        {/* La forme exacte de la réponse : cinq lignes de moments de 56 px,
            puis la ligne « Corriger les moments », puis le titre et le récit
            sur les lignes du cahier. L'écran ne saute pas quand la journée
            arrive, et le bas de la page n'est plus 230 px de vide. */}
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
      {/* La barre d'action existe déjà, désactivée, à sa hauteur définitive :
          l'écran ne saute pas quand la journée arrive, et on sait tout de suite
          ce qu'on viendra faire ici. */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4">
        <div className="mx-auto w-full max-w-5xl">
          {/* La ligne de conséquence a sa place gardée : la barre ne change pas
              de hauteur quand la journée arrive avec des lectures à vérifier. */}
          <div className="skeleton mb-2 h-5 w-56" />
          {/* La barre montre l'action à venir, désactivée — pas une deuxième
              fois « Ouverture… » (le squelette le dit déjà), et pas de roue :
              une boucle de 1000 ms de plus n'est pas au budget mouvement. */}
          <Button size="lg" className="w-full" disabled>
            Publier la journée
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lecture en cours. La progression est RÉELLE (page N sur M du carnet, pas une
 * roue), et les trois lignes fantômes ont la forme de la réponse qui arrive.
 */
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
  // On lit la page idx+1 : les pages précédentes sont faites, celle-ci est en
  // cours. La barre s'arrête donc au milieu du dernier pas — elle ne dit jamais
  // « terminé » avant de l'être.
  const pct = Math.round(((idx + 0.5) / total) * 100);

  return (
    /* gap-4 et vignette à 224 px : à gap-5/256, la sortie « Revenir au
       journal » tombait 39 px sous la ligne de flottaison. Un écran d'attente
       qui cache sa sortie est un cul-de-sac de 39 px. */
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-4 p-4">
      {/* Le rail est le PREMIER objet de l'écran d'attente : « la photo est
          partie, on en est à la lecture, il reste deux temps ». C'est la réponse
          à la seule question qu'on se pose en attendant. */}
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
        /* `w-fit` : le cadre épouse la page au lieu de laisser deux bandes
           grises de chaque côté d'une image plus haute que large. */
        <div className="seam relative w-fit max-w-64 overflow-hidden rounded-xl">
          <img
            key={current.id}
            src={current.thumbUrl}
            alt={`Page ${idx + 1} du carnet, en cours de lecture`}
            className="animate-scan-fade block max-h-56 w-auto"
          />
          {/* Boucle déclarée (1800 ms) : elle n'porte aucune information, et
              elle s'arrête sous prefers-reduced-motion. */}
          <div className="animate-scan-sweep pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary-soft to-transparent" />
        </div>
      )}

      {/* Progression DÉTERMINÉE : la page qu'on lit sur celles qu'on a
          envoyées. Une roue qui tourne ne dit rien ; « page 2 sur 3 », si. */}
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

      {/* La forme de la réponse : trois moments qui vont s'écrire. */}
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

      {/* Jamais de cul-de-sac, même pendant une attente — et cette sortie DIT
          maintenant où elle mène. Elle était une promesse à moitié fausse : le
          journal, lui, ne sondait rien, donc la carte y restait « Lecture en
          cours » jusqu'à un rechargement à la main. Depuis que le fil suit la
          lecture (cf. `Timeline.tsx`), on peut écrire la phrase — et c'est elle
          qui rend le départ gratuit. */}
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

/** La lecture a échoué : cause, sorties (relancer, rephotographier, supprimer). */
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
  /** Des pages sont sur le serveur ET l'appelant a le droit de les relire. */
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
      {/* Le rail porte l'ÉCHEC à son pas — le composant dessine cet état depuis
          le début (triangle sur fond destructive-soft) et personne ne s'en
          servait. On voit d'un coup d'œil que c'est la LECTURE qui a échoué, pas
          la photo ni la publication. */}
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
        {/* La CAUSE, telle que le serveur la nomme (et elle est écrite pour un
            parent, pas pour un journal de logs) — pas rangée derrière une
            disclosure « détail technique ». */}
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {reason ??
            "La lecture s'est arrêtée avant la fin, sans raison enregistrée."}
        </p>
        <p className="max-w-[34ch] text-meta text-muted-foreground">
          Rien n'a été publié et rien n'a été perdu : vos pages sont
          conservées telles quelles.
        </p>
      </div>

      {/* LES CONSEILS DE PRISE DE VUE NE S'ADRESSENT QU'À UNE PAGE ILLISIBLE.
          Quand les pages sont là et relisibles, la première sortie est la
          RELANCE, pas la reprise de photo : le carnet papier est souvent déjà
          reparti chez la nounou, et « reprenez la photo » est alors un conseil
          qu'on ne peut pas suivre. On ne montre donc les conseils de cadrage
          que lorsqu'il n'y a effectivement rien à relire. */}
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
        {/* La relance prend la place de tête : c'est la sortie qui n'existait
            pas, et celle qui n'exige rien de plus que ce qu'on a déjà donné. */}
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

/** La journée existe mais n'a pas pu être ouverte : ce n'est pas « vide ». */
export function LoadFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rise-enter mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      {/* AMBRE et non ROUGE. Deux raisons, et la première est mesurée :
          --primary (groseille) et --destructive sont à 1,08:1 de clarté et 17°
          de teinte l'un de l'autre en clair (1,00:1 / 14° en sombre), donc une
          tuile rouge à 200 px d'un bouton groseille faisait DEUX aplats saturés
          qui se lisaient comme un seul système — l'écran n'avait plus de
          dimension colorée unique. La seconde est sémantique : le texte dit
          « elle n'est pas perdue », c'est un incident, pas une destruction.
          Rouge reste réservé à ce qui détruit (les dialogues de suppression). */}
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
    /* La ligne de dépli était collée à gauche au milieu d'un bloc centré : elle
       cassait l'axe. Elle est centrée comme le reste, et le chevron tourne
       vraiment (piloté par l'état — `group-open:` ne compile pas ici). */
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


