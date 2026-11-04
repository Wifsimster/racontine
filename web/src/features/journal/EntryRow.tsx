import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Entry } from "@/lib/types";
import { capitalize, dayMonthShort, fr } from "@/lib/format";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, glanceOf, pickGlance } from "./glance";
import { StatusBadge, UnreadDot, isUnread } from "./EntryCard";

export function EntryRow({
  entry,
  showChild = false,
}: {
  entry: Entry;
  showChild?: boolean;
}) {
  const aBadge = entry.status !== "published";
  const unread = isUnread(entry);
  const shown = pickGlance(glanceOf(entry)).slice(0, aBadge ? 1 : 2);
  return (
    <Link
      to={`/entries/${entry.id}`}
      className="flex min-h-14 items-center gap-3 px-2 py-3 transition-colors dur-fast outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <time
        dateTime={entry.date}
        className="w-14 shrink-0 text-meta whitespace-nowrap text-muted-foreground"
        data-tabular
      >
        {capitalize(dayMonthShort(entry.date))}
      </time>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {unread && <UnreadDot className="mr-0.5" />}
          {showChild && entry.child && <ChildMark name={entry.child.name} />}
          <span className="min-w-0 flex-1 truncate text-ui font-bold">
            {entry.title ? fr(entry.title) : "Journée sans titre"}
          </span>
        </span>
        {(shown.length > 0 || aBadge) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <GlanceStrip stats={shown} />
            <StatusBadge entry={entry} canEdit={false} />
          </span>
        )}
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
