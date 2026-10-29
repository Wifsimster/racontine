import type { ReactNode } from "react";
import {
  Baby,
  Cookie,
  HeartPulse,
  Moon,
  Soup,
  Sparkles,
  Sun,
  Sunrise,
} from "lucide-react";
import {
  ITEM_LABELS,
  type ActivityData,
  type AnecdoteData,
  type EntryItem,
  type HealthData,
  type ItemType,
  type MealData,
  type NapData,
} from "./types";
import { ITEM_CHIP } from "./ui";
import { NBSP, formatClock, formatDuration, fr, parseTime } from "./format";

type LucideIcon = typeof Soup;

export type ItemField = {
  key: string;
  label: string;
  long: boolean;
};

export type ItemGlance = { value: string; spoken: string };

export type ItemKind = {
  type: ItemType;
  label: string;
  Icon: LucideIcon;
  chip: string;
  glanceRank: number;
  iconFor(item: EntryItem): LucideIcon;
  fields: ItemField[];
  emptyDraft(): Record<string, string>;
  summarize(data: Record<string, string>): { label: string; value: string };
  glance(items: EntryItem[]): ItemGlance | null;
  renderLine(item: EntryItem): ReactNode;
};

function join(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`;
}

function mealIcon(moment?: string): LucideIcon {
  const m = (moment ?? "").toLowerCase();
  if (m.includes("matin") || m.includes("réveil") || m.includes("petit-déj"))
    return Sunrise;
  if (m.includes("midi") || m.includes("déjeun") || m.includes("dîner"))
    return Sun;
  if (m.includes("goûter") || m.includes("gouter") || m.includes("collation"))
    return Cookie;
  return Soup;
}

export const ITEM_KINDS: readonly ItemKind[] = [
  {
    type: "meal",
    label: ITEM_LABELS.meal,
    Icon: Soup,
    chip: ITEM_CHIP.meal,
    glanceRank: 1,
    iconFor: (item) => mealIcon((item.data as MealData).moment),
    fields: [
      { key: "moment", label: "Moment", long: false },
      { key: "contenu", label: "Contenu", long: true },
      { key: "appetit", label: "Appétit", long: false },
    ],
    emptyDraft: () => ({ moment: "", contenu: "", appetit: "" }),
    summarize: (d) => ({
      label: d.moment?.trim() || ITEM_LABELS.meal,
      value: join(d.contenu, d.appetit),
    }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "repas", "repas"), spoken: "repas" }
        : null,
    renderLine: (item) => {
      const d = item.data as MealData;
      return (
        <span>
          <span className="font-bold">{fr(d.moment)}</span> — {fr(d.contenu)}
          {d.appetit ? ` (${fr(d.appetit)})` : ""}
        </span>
      );
    },
  },
  {
    type: "nap",
    label: ITEM_LABELS.nap,
    Icon: Moon,
    chip: ITEM_CHIP.nap,
    glanceRank: 2,
    iconFor: () => Moon,
    fields: [
      { key: "debut", label: "Début", long: false },
      { key: "fin", label: "Fin", long: false },
      { key: "note", label: "Note", long: true },
    ],
    emptyDraft: () => ({ debut: "", fin: "", note: "" }),
    summarize: (d) => {
      const span =
        d.debut?.trim() && d.fin?.trim()
          ? `${d.debut.trim()} → ${d.fin.trim()}`
          : d.debut?.trim() || d.fin?.trim() || "";
      return { label: ITEM_LABELS.nap, value: join(span, d.note) };
    },
    glance: (items) => {
      if (!items.length) return null;
      let total = 0;
      for (const n of items) {
        const d = n.data as NapData;
        const a = parseTime(d.debut);
        const b = parseTime(d.fin);
        if (a !== null && b !== null && b > a) total += b - a;
      }
      const noun = items.length > 1 ? "siestes" : "sieste";
      return {
        value:
          total > 0
            ? `${noun} ${formatDuration(total)}`
            : `${items.length} ${noun}`,
        spoken: "sieste",
      };
    },
    renderLine: (item) => {
      const d = item.data as NapData;
      const a = formatClock(d.debut);
      const b = formatClock(d.fin);
      const from = parseTime(d.debut);
      const to = parseTime(d.fin);
      const dur = from !== null && to !== null && to > from ? to - from : null;
      return (
        <span>
          <span className="font-bold">Sieste</span>{" "}
          <span data-tabular>
            {a ?? "?"}
            {b ? ` → ${b}` : ""}
          </span>
          {dur ? ` (${formatDuration(dur)})` : ""}
          {d.note ? ` · ${fr(d.note)}` : ""}
        </span>
      );
    },
  },
  {
    type: "activity",
    label: ITEM_LABELS.activity,
    Icon: Sparkles,
    chip: ITEM_CHIP.activity,
    glanceRank: 4,
    iconFor: () => Sparkles,
    fields: [{ key: "label", label: "Activité", long: true }],
    emptyDraft: () => ({ label: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.activity, value: join(d.label) }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "activité"), spoken: "activités" }
        : null,
    renderLine: (item) => <span>{fr((item.data as ActivityData).label)}</span>,
  },
  {
    type: "anecdote",
    label: ITEM_LABELS.anecdote,
    Icon: Baby,
    chip: ITEM_CHIP.anecdote,
    glanceRank: 5,
    iconFor: () => Baby,
    fields: [{ key: "text", label: "Anecdote", long: true }],
    emptyDraft: () => ({ text: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.anecdote, value: join(d.text) }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "anecdote"), spoken: "anecdotes" }
        : null,
    renderLine: (item) => (
      <span className="text-anecdote">
        «{NBSP}
        {fr((item.data as AnecdoteData).text)}
        {NBSP}»
      </span>
    ),
  },
  {
    type: "health",
    label: ITEM_LABELS.health,
    Icon: HeartPulse,
    chip: ITEM_CHIP.health,
    glanceRank: 0,
    iconFor: () => HeartPulse,
    fields: [{ key: "note", label: "Note", long: true }],
    emptyDraft: () => ({ note: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.health, value: join(d.note) }),
    glance: (items) =>
      items.length
        ? {
            value: items.length > 1 ? `${items.length} soins` : "santé",
            spoken: "santé",
          }
        : null,
    renderLine: (item) => <span>{fr((item.data as HealthData).note)}</span>,
  },
];

const BY_TYPE = new Map(ITEM_KINDS.map((k) => [k.type, k]));

export function itemKind(type: ItemType): ItemKind {
  return BY_TYPE.get(type) ?? ITEM_KINDS[0];
}

export const ITEM_TYPES_IN_ORDER: ItemType[] = ITEM_KINDS.map((k) => k.type);
