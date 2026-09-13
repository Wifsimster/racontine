import { Link } from "react-router-dom";
import { Bell, BookOpenText, Crop, Layers, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "./inputs";

/* Deux écrans de remplacement : le compte qui ne tient aucun carnet, et le
   compte neuf qui n'a pas encore d'enfant. */

export function CaptureDenied() {
  return (
    <div className="shell-width flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-3xl bg-muted text-muted-foreground"
      >
        <BookOpenText className="size-7" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-serif text-title font-semibold text-balance">
          Ce carnet, vous le lisez
        </h1>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Vous êtes <span className="font-bold text-foreground">Lecteur</span> :
          les journées vous arrivent une fois publiées. Photographier et relire le
          carnet revient à la famille qui le tient.
        </p>
      </div>
      <ul className="flex w-full flex-col gap-3 text-left">
        <Tip Icon={BookOpenText}>
          Toutes les journées publiées sont dans le journal, de la plus récente à
          la plus ancienne.
        </Tip>
        <Tip Icon={Sparkles}>
          Pour photographier le carnet à votre tour, demandez le rôle
          Contributeur à la personne qui l’administre.
        </Tip>
      </ul>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg">
          <Link to="/">
            <BookOpenText aria-hidden="true" />
            Ouvrir le journal
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/proches">
            <Bell aria-hidden="true" />
            Régler les notifications
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   L'état vide VEND le geste suivant : une vignette, une promesse en une
   phrase, trois conseils de prise de vue. Rien ici n'est un haussement
   d'épaules — c'est le premier écran du soir.
   -------------------------------------------------------------------------- */

export function CaptureEmpty() {
  return (
    <section className="rise-enter flex flex-col items-center gap-5 pt-6 text-center">
      <span
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-3xl bg-primary-soft text-primary"
      >
        <BookOpenText className="size-8" />
      </span>

      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold">
          Photographiez la page du jour
        </h2>
        <p className="max-w-[31ch] text-ui text-muted-foreground">
          Racontine la lit, vous la relisez, la journée part aux proches.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3">
        <Tip Icon={Sun}>
          À plat, près d’une fenêtre : la lumière du jour suffit, pas besoin du
          flash.
        </Tip>
        <Tip Icon={Crop}>
          La page entière dans le cadre — un peu de travers, un peu froissée,
          c’est très bien.
        </Tip>
        <Tip Icon={Layers}>
          Plusieurs pages ? Ajoutez-les toutes : leur ordre est conservé.
        </Tip>
      </ul>
    </section>
  );
}

