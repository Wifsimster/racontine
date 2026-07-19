import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchEntrySummary } from "@/lib/types";

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function shortDay(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(/\.$/, ""),
    day: d.toLocaleDateString("fr-FR", { day: "numeric" }),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(/\.$/, ""),
  };
}

/**
 * Stepper dynamique affiché quand un même envoi de photos couvre plusieurs
 * journées : une puce par journée détectée, cochée une fois publiée, pour
 * guider une relecture séquentielle sans perdre le fil du lot en cours.
 */
export function DayStepper({
  days,
  currentId,
  onSelect,
}: {
  days: BatchEntrySummary[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const doneCount = days.filter((d) => d.status === "published").length;
  const currentIndex = Math.max(
    0,
    days.findIndex((d) => d.id === currentId),
  );
  const progressPct = days.length ? (doneCount / days.length) * 100 : 0;

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-base font-semibold leading-tight tracking-tight">
            Journée {currentIndex + 1} sur {days.length}
          </span>
          <span className="text-xs capitalize text-muted-foreground">
            {longDate(days[currentIndex]?.date ?? currentId)}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {doneCount}/{days.length} publiées
        </span>
      </div>

      {/* Progression globale du lot */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* py : `overflow-x-auto` seul force `overflow-y` à « auto » (au lieu de
          « visible »), ce qui rognerait sinon le halo (ring) du pas courant en
          haut/bas tout en le laissant intact à gauche/droite. */}
      <div className="flex items-start justify-center gap-0 overflow-x-auto py-2 -my-2">
        {days.map((d, i) => {
          const isCurrent = d.id === currentId;
          const done = d.status === "published";
          const { weekday, day, month } = shortDay(d.date);
          return (
            <div key={d.id} className="flex shrink-0 items-start">
              {i > 0 && (
                <div
                  className={cn(
                    "mt-4 h-0.5 w-4 shrink-0 rounded-full transition-colors duration-300 sm:w-7",
                    days[i - 1].status === "published" ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                title={d.title ?? undefined}
                aria-current={isCurrent ? "step" : undefined}
                className="group flex shrink-0 flex-col items-center gap-1.5 px-1 py-0.5"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200",
                    isCurrent &&
                      "scale-110 border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !isCurrent &&
                      done &&
                      "border-primary/50 bg-primary/10 text-primary group-hover:border-primary",
                    !isCurrent &&
                      !done &&
                      "border-border bg-background text-muted-foreground group-hover:border-primary/50 group-hover:text-primary",
                  )}
                >
                  {done && !isCurrent ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "flex flex-col items-center leading-none",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="text-[11px] font-medium capitalize">
                    {weekday}
                  </span>
                  <span className="text-[10px]">
                    {day} {month}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
