import {
  Check,
  ChevronDown,
  CloudOff,
  Layers,
  RotateCcw,
  X,
} from "lucide-react";
import { type EntrySource, SOURCE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PREP_SHARE,
  MOMENT_SHAPES,
  formatBytes,
  pageCount,
  type Shot,
  type Stage,
} from "./model";
import { Tip } from "./inputs";
/* L'ENVOI : ce qu'on montre pendant qu'il part, et ce qu'on montre quand il
   échoue — une cause, un remède, des sorties. */

export function SendingPanel({
  shots,
  stage,
  prepDone,
  onCancel,
}: {
  shots: Shot[];
  stage: Stage;
  prepDone: number;
  onCancel: () => void;
}) {
  const total = shots.length;
  const bytes = shots.reduce((n, s) => n + s.file.size, 0);
  const solid =
    stage === "prep"
      ? Math.round(total ? (prepDone / total) * PREP_SHARE : 0)
      : PREP_SHARE;
  const text =
    stage === "prep"
      ? `Préparation de la page ${Math.min(prepDone + 1, total)} sur ${total}…`
      : `Envoi de ${pageCount(total)} vers Racontine…`;

  return (
    <section className="rise-enter flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="surtitre text-muted-foreground">Envoi du carnet</h2>
          {/* 13/20 et pas le surtitre : `text-transform: uppercase` écrivait
              « 1,1 MO » — l'unité du système est « Mo ». Les deux crans
              s'alignent sur la même ligne de base. */}
          <p className="text-meta text-muted-foreground" data-tabular>
            {pageCount(total)} · {formatBytes(bytes)}
          </p>
        </div>

        {/* Deux segments, et c'est volontaire : le premier est MESURÉ (page par
            page), le second est un balayage déclaré — on ne fait pas grimper un
            faux pourcentage pendant que le réseau travaille. */}
        <div
          role="progressbar"
          aria-label="Envoi du carnet"
          aria-valuetext={text}
          aria-valuemin={stage === "prep" ? 0 : undefined}
          aria-valuemax={stage === "prep" ? total : undefined}
          aria-valuenow={stage === "prep" ? prepDone : undefined}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          {/* LA BARRE PARLE LE VOCABULAIRE DE L'ÉCRAN, pas la couleur de marque.
              Elle portait deux groseilles (pleine + pâle) : le chemin est passé à
              l'encre dans les pas, mais la barre restait groseille — deux objets
              qui disent la même chose de deux couleurs, et groseille qui reprend
              un second métier. Ses deux segments ont pourtant chacun un sens déjà
              nommé par le système :
                VERT = acquis   — ces pages sont prêtes, c'est derrière nous ;
                OR   = en attente — cette part est en vol, et elle n'est PAS
                       mesurable (`fetch` ne rapporte aucune progression), donc
                       elle est déclarée, pâle et IMMOBILE : sur une capture figée
                       et sous « moins de mouvement », un balayage ne dit rien.
              Aucun faux pourcentage ne grimpe, et rien ici n'est décoratif. */}
          <div className="flex h-full">
            <div
              className="h-full rounded-full bg-success transition-[width] dur-slow ease-page"
              style={{ width: `${solid}%` }}
            />
            {stage === "upload" && (
              <div className="h-full flex-1 rounded-full bg-warning-bg" />
            )}
          </div>
        </div>

        <p role="status" className="mt-3 text-meta text-muted-foreground">
          {text}
        </p>

        {/* Les pages en vol, en petit : on voit CE QUI part. */}
        <ul className="mt-3 flex gap-2">
          {/* Même traitement que les vignettes de la grille (plateau `--muted`,
              page entière, liseré) : une page se montre en entier partout. */}
          {shots.slice(0, 6).map((s) => (
            <li key={s.id} className="seam overflow-hidden rounded-sm bg-muted">
              <img src={s.url} alt="" className="h-12 w-11 object-contain" />
            </li>
          ))}
          {shots.length > 6 && (
            <li className="surtitre grid h-12 w-11 place-items-center rounded-sm bg-muted text-muted-foreground">
              +{shots.length - 6}
            </li>
          )}
        </ul>

        {/* LA SORTIE PENDANT L'ATTENTE, et elle est HONNÊTE sur les deux moments.
            La référence affiche « Annuler la lecture » ; nous ne l'avions pas.
            · PENDANT LA PRÉPARATION, rien n'a quitté le téléphone : la boucle de
              compression est séquentielle, elle s'arrête au tour suivant et les
              pages restent en place. Le bouton marche vraiment.
            · PENDANT L'ENVOI, `lib/api.ts` appelle `fetch` sans `AbortSignal` —
              fichier hors de cet écran. Proposer « Annuler » là serait promettre
              d'arrêter quelque chose qui continue : le serveur créerait la journée
              quand même. Le bouton reste donc EN PLACE (une commande qui
              disparaît laisse un parent chercher) mais devient désactivé — surface
              `muted`, libellé mesuré à 5,1:1, jamais un `opacity-50` — et la ligne
              dessous dit exactement pourquoi. C'est le point de non-retour, nommé.
            Petit et centré, pas pleine largeur : ce n'est pas l'action de l'écran,
            c'est sa sortie de secours. */}
        <div className="mt-4 flex flex-col items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={stage === "upload"}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
            Annuler la lecture
          </Button>
          <p className="text-center text-meta text-muted-foreground">
            {stage === "prep"
              ? "Rien n’a encore quitté le téléphone."
              : "Les pages sont parties, et restent enregistrées ici : rien ne se perd."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="surtitre text-muted-foreground">
          Ce que Racontine cherche
        </h2>
        <ul className="mt-1 flex flex-col">
          {MOMENT_SHAPES.map(({ key, label, Icon, width }) => (
            <li
              key={key}
              className="flex items-center gap-3 border-t py-3 first:border-t-0"
            >
              {/* Les tuiles sont GRISES : sur cet écran la couleur dit l'état de
                  l'envoi, pas le type de moment. */}
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="surtitre text-muted-foreground">{label}</span>
                <span
                  aria-hidden="true"
                  className={cn("skeleton h-4", width)}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   L'échec : la cause, la preuve, le remède, la sortie.
   -------------------------------------------------------------------------- */

export function SendError({
  message,
  shots,
  childName,
  source,
}: {
  message: string;
  shots: Shot[];
  childName: string;
  source: EntrySource;
}) {
  const bytes = shots.reduce((n, s) => n + s.file.size, 0);
  return (
    <section className="rise-enter flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-3xl bg-destructive-soft text-destructive"
      >
        <CloudOff className="size-7" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-title font-semibold">
          L’envoi n’est pas passé
        </h2>
        {/* La CAUSE, telle que le serveur la nomme — en français, jamais une
            exception brute. Les apostrophes droites du message sont redressées
            à l'AFFICHAGE : sinon la même carte mélange « l'envoi » (serveur) et
            « l’appareil » (écran), et la couture se voit. */}
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {message.replace(/'/g, "\u2019")}
        </p>
      </div>

      {/* La preuve, pas la promesse : c'est ce qui décide un parent à réessayer
          demain plutôt qu'à abandonner l'app. */}
      <p className="flex items-start gap-2 rounded-lg bg-success-bg px-4 py-3 text-meta font-bold text-success">
        {/* `mt-0.5` (2 px) : centrage optique d'une icône de 16 px sur une ligne
            de 20 px. */}
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {pageCount(shots.length)} gardée{shots.length > 1 ? "s" : ""} sur
        l’appareil.
      </p>

      <ul className="flex flex-col gap-3">
        <Tip Icon={RotateCcw}>
          Vérifiez votre réseau, puis réessayez : l’envoi repart de zéro, sans
          doublon.
        </Tip>
        <Tip Icon={Layers}>
          Vous pouvez aussi fermer l’app et revenir plus tard — les pages vous
          attendront ici.
        </Tip>
      </ul>

      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-meta text-muted-foreground transition-colors dur-fast ease-carnet hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          Détail technique
        </summary>
        <p
          className="rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground"
          data-tabular
        >
          POST /api/entries/ingest · {pageCount(shots.length)} ·{" "}
          {formatBytes(bytes)} · {childName} · {SOURCE_LABELS[source]}
        </p>
      </details>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

