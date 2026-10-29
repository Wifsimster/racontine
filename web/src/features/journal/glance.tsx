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

export function GlanceStrip({ stats }: { stats: Glance[] }) {
  if (stats.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {stats.map(({ key, type, Icon, value, spoken }) => (
        <li
          key={key}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2",
            type
              ? ITEM_CHIP[type]
              :
                "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" role="img" aria-label={spoken} />
          <span className="text-meta font-bold" data-tabular>
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
      className={cn(
        "-mt-1 grid size-7 shrink-0 place-items-center rounded-md",
        ITEM_CHIP[type],
      )}
      aria-hidden="true"
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
      {kind.renderLine(item)}
    </li>
  );
}
