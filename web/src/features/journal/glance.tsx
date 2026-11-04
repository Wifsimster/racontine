import {
  Smile,
  Soup,
} from "lucide-react";
import {
  type Entry,
  type EntryItem,
  type ItemType,
} from "@/lib/types";
import { ITEM_CHIP } from "@/lib/ui";
import {
  ITEM_KINDS,
  itemKind,
  type ItemGlance,
} from "@/lib/items";
import {
  fr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function moodShort(mood: string): string | null {
  const first = mood.split(/[,;]| et | puis /i)[0].trim();
  if (first.length <= 16) return first;
  const cut = first.slice(0, 16);
  const space = cut.lastIndexOf(" ");
  return space >= 4 ? cut.slice(0, space) + "…" : null;
}

export type Glance = {
  key: string;
  type: ItemType | null;
  Icon: typeof Soup;
  value: string;
  spoken: string;
};

export function glanceOf(entry: Entry): Glance[] {
  const out: Glance[] = [];
  for (const kind of ITEM_KINDS) {
    if (kind.type === "activity") {
      const mood = entry.mood ? moodShort(fr(entry.mood)) : null;
      if (mood)
        out.push({
          key: "mood",
          type: null,
          Icon: Smile,
          value: mood,
          spoken: "humeur",
        });
    }
    const mine = entry.items.filter((i) => i.type === kind.type);
    const glance: ItemGlance | null = kind.glance(mine);
    if (glance)
      out.push({ key: kind.type, type: kind.type, Icon: kind.Icon, ...glance });
  }
  return out;
}

export const GLANCE_RANK: Record<string, number> = {
  ...Object.fromEntries(ITEM_KINDS.map((k) => [k.type, k.glanceRank])),
  mood: 3,
};

export function pickGlance(all: Glance[]): Glance[] {
  if (all.length <= 3) return all;
  const keep = new Set(
    [...all]
      .sort((a, b) => (GLANCE_RANK[a.key] ?? 9) - (GLANCE_RANK[b.key] ?? 9))
      .slice(0, 3)
      .map((g) => g.key),
  );
  return all.filter((g) => keep.has(g.key));
}

export function GlanceStrip({
  stats,
  className,
}: {
  stats: Glance[];
  className?: string;
}) {
  if (stats.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5 text-meta", className)}>
      {stats.map(({ key, type, Icon, value, spoken }) => (
        <li
          key={key}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1",
            type ? ITEM_CHIP[type] : "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" role="img" aria-label={spoken} />
          <span className="font-bold" data-tabular>
            {value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Chip({ type, icon }: { type: ItemType; icon?: typeof Soup }) {
  const Icon = icon ?? itemKind(type).Icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 -rotate-6 place-items-center rounded-[0.625rem]",
        ITEM_CHIP[type],
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function ItemLine({ item }: { item: EntryItem }) {
  const kind = itemKind(item.type);
  return (
    <li className="flex items-start gap-3 text-ui">
      <Chip type={item.type} icon={kind.iconFor(item)} />
      <div className="min-w-0 pt-1">{kind.renderLine(item)}</div>
    </li>
  );
}
