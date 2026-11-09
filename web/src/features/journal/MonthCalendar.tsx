import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { Entry, ItemType } from "@/lib/types";
import { capitalize, fr, fullDate } from "@/lib/format";
import { ITEM_KINDS } from "@/lib/items";
import { ITEM_DOT } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { isUnread } from "./EntryCard";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function typesOf(entries: Entry[]): ItemType[] {
  const present = new Set(entries.flatMap((e) => e.items.map((i) => i.type)));
  return ITEM_KINDS.map((k) => k.type).filter((t) => present.has(t));
}

function dayLabelFor(iso: string, entries: Entry[]): string {
  const date = capitalize(fullDate(iso));
  const titles = entries
    .map((e) => (e.title ? fr(e.title) : "journée sans titre"))
    .join(", ");
  const unread = entries.some(isUnread) ? ", nouveau" : "";
  const draft = entries.some((e) => e.status !== "published")
    ? ", à relire"
    : "";
  return `${date} : ${titles}${unread}${draft}`;
}

export function MonthCalendar({
  month,
  entries,
}: {
  month: string;
  entries: Entry[];
}) {
  const [today] = useState(() => new Date());
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  return (
    <div className="tape tape-green mt-4 mb-2 rounded-2xl border bg-card px-3 pt-4 pb-3 shadow-card">
      <div
        aria-hidden="true"
        className="grid grid-cols-7 gap-1.5 pb-1 text-center text-xs font-extrabold text-muted-foreground"
      >
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <ol
        aria-label="Les journées du mois"
        className="grid grid-cols-7 gap-1.5"
      >
        {Array.from({ length: lead }, (_, i) => (
          <li key={`v${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const iso = `${month}-${pad(day)}`;
          const list = byDay.get(iso);
          const isToday = iso === todayIso;
          if (!list)
            return (
              <li
                key={iso}
                aria-hidden="true"
                className={cn(
                  "grid aspect-square place-items-center rounded-xl text-meta",
                  "text-muted-foreground",
                  isToday && "ring-2 ring-border",
                )}
                data-tabular
              >
                {day}
              </li>
            );
          const unread = list.some(isUnread);
          const draft = list.some((e) => e.status !== "published");
          const highlight = list.some((e) => e.highlight);
          const types = typesOf(list).slice(0, 3);
          return (
            <li key={iso}>
              <Link
                to={`/entries/${list[0].id}`}
                aria-label={dayLabelFor(iso, list)}
                className={cn(
                  "relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-xl text-meta font-extrabold shadow-card transition-transform dur-press ease-carnet outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-ring",
                  draft
                    ? "bg-warning-bg text-warning"
                    : "bg-primary-soft text-foreground",
                  i % 3 === 0 ? "-rotate-3" : i % 3 === 1 ? "rotate-2" : "",
                  unread && "ring-2 ring-primary",
                  isToday && !unread && "ring-2 ring-foreground",
                )}
                data-tabular
              >
                {highlight && (
                  <Star
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 size-3.5 fill-spark text-spark"
                  />
                )}
                <span>{day}</span>
                {types.length > 0 && (
                  <span aria-hidden="true" className="flex gap-0.5">
                    {types.map((t) => (
                      <span
                        key={t}
                        className={cn("size-1.5 rounded-full", ITEM_DOT[t])}
                      />
                    ))}
                  </span>
                )}
                {list.length > 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 -left-1 grid size-4 place-items-center rounded-full bg-foreground text-xs font-bold text-background"
                  >
                    {list.length}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
