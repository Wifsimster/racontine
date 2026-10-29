import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Entry } from "@/lib/types";
import { capitalize, dayMonthShort, fr } from "@/lib/format";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, glanceOf, pickGlance } from "./glance";
import { StatusBadge } from "./EntryCard";

export function EntryRow({ entry }: { entry: Entry }) {
  const aBadge = entry.status !== "published";
  const shown = pickGlance(glanceOf(entry)).slice(0, aBadge ? 1 : 2);
  return (
    <Link
      to={`/entries/${entry.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card transition-colors dur-fast hover:bg-accent"
    >
      <time
        dateTime={entry.date}
        className="w-16 shrink-0 text-meta font-bold whitespace-nowrap text-muted-foreground"
        data-tabular
      >
        {capitalize(dayMonthShort(entry.date))}
      </time>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {entry.child && <ChildMark name={entry.child.name} />}
          <span className="min-w-0 flex-1 truncate text-ui font-bold">
            {entry.title ? fr(entry.title) : "Journée sans titre"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <GlanceStrip stats={shown} />
          <StatusBadge entry={entry} canEdit={false} />
        </span>
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
