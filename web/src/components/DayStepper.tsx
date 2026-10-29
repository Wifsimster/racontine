import { Check, ScanLine, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchEntrySummary, EntryStatus } from "@/lib/types";

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function shortDay(iso: string): {
  weekday: string;
  day: string;
  month: string;
} {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d
      .toLocaleDateString("fr-FR", { weekday: "short" })
      .replace(/\.$/, ""),
    day: d.toLocaleDateString("fr-FR", { day: "numeric" }),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(/\.$/, ""),
  };
}

const STATUS_TEXT: Record<EntryStatus, string> = {
  published: "publiée",
  draft: "à relire",
  processing: "lecture en cours",
  failed: "échec de lecture",
};

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

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3 md:justify-start md:gap-4">
        <span className="font-serif text-title font-semibold text-balance">
          Journée {currentIndex + 1} sur {days.length}
        </span>
        <span className="shrink-0 rounded-full bg-success-bg px-3 py-1 text-meta font-bold text-success">
          {doneCount}/{days.length} publiées
        </span>
      </div>

      <div className="overflow-x-auto py-2 -my-2">
        <ol className="mx-auto flex w-fit md:mx-0">
          {days.map((d, i) => {
            const isCurrent = d.id === currentId;
            const done = d.status === "published";
            const failed = d.status === "failed";
            const reading = d.status === "processing";
            const { weekday, day, month } = shortDay(d.date);
            return (
              <li
                key={d.id}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex w-20 shrink-0 flex-col items-center"
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[17px] right-1/2 h-0.5 w-full rounded-full transition-colors dur-slow ease-carnet",
                      days[i - 1].status === "published"
                        ? "bg-foreground"
                        : "bg-border",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(d.id)}
                  title={d.title ?? undefined}
                  aria-label={`Journée ${i + 1} sur ${days.length}, ${longDate(d.date)}, ${STATUS_TEXT[d.status]}`}
                  className="group flex w-full flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "relative z-10 flex size-9 items-center justify-center rounded-full border-2 text-ui font-bold transition-all dur-base ease-carnet",
                      isCurrent &&
                        "scale-110 border-foreground bg-foreground text-background ring-4 ring-muted",
                      !isCurrent &&
                        done &&
                        "border-foreground bg-card text-foreground group-hover:bg-foreground group-hover:text-background",
                      !isCurrent &&
                        failed &&
                        "border-destructive bg-destructive-soft text-destructive",
                      !isCurrent &&
                        reading &&
                        "border-input bg-muted text-muted-foreground",
                      !isCurrent &&
                        !done &&
                        !failed &&
                        !reading &&
                        "border-input bg-card text-muted-foreground group-hover:border-foreground group-hover:text-foreground",
                    )}
                  >
                    {!isCurrent && done && <Check className="size-4" />}
                    {!isCurrent && failed && (
                      <TriangleAlert className="size-4" />
                    )}
                    {!isCurrent && reading && <ScanLine className="size-4" />}
                    {(isCurrent || (!done && !failed && !reading)) && i + 1}
                  </span>
                  <span
                    className={cn(
                      "flex flex-col items-center",
                      isCurrent ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="text-xs font-bold capitalize">
                      {weekday}
                    </span>
                    <span className="text-xs">
                      {day} {month}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
