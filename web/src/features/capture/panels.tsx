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
          <p className="text-meta text-muted-foreground" data-tabular>
            {pageCount(total)} · {formatBytes(bytes)}
          </p>
        </div>

        <div
          role="progressbar"
          aria-label="Envoi du carnet"
          aria-valuetext={text}
          aria-valuemin={stage === "prep" ? 0 : undefined}
          aria-valuemax={stage === "prep" ? total : undefined}
          aria-valuenow={stage === "prep" ? prepDone : undefined}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
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

        <ul className="mt-3 flex gap-2">
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
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {message.replace(/'/g, "\u2019")}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-success-bg px-4 py-3 text-meta font-bold text-success">
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
