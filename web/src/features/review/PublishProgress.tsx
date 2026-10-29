import { X } from "lucide-react";
import { Button } from "@/components/ui/button";


export const PUBLISH_USUAL_SECONDS = 3;

export function PublishProgress({
  seconds,
  moments,
  pages,
  republish,
  onStopWaiting,
}: {
  seconds: number;
  moments: number;
  pages: number;
  republish: boolean;
  onStopWaiting: () => void;
}) {
  const pct = Math.min(
    92,
    Math.round((seconds / PUBLISH_USUAL_SECONDS) * 100) || 8,
  );
  const what = [
    `${moments} moment${moments > 1 ? "s" : ""}`,
    pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const line =
    seconds >= 12
      ? "Le carnet ne répond toujours pas."
      : seconds >= 5
        ? "C’est plus long que d’habitude."
        : republish
          ? `Republication en cours : ${what}.`
          : `Publication en cours : ${what}, puis les proches sont prévenus.`;

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] dur-slow ease-page"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p role="status" className="min-w-0 text-meta text-muted-foreground">
          {line}
        </p>
        <p
          aria-hidden="true"
          data-tabular
          className="shrink-0 text-meta text-muted-foreground"
        >
          {seconds}&nbsp;s
        </p>
      </div>
      {seconds >= 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={onStopWaiting}
        >
          <X aria-hidden="true" />
          Arrêter d’attendre
        </Button>
      )}
    </div>
  );
}
