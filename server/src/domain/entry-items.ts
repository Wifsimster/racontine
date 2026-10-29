import type {
  ActivityData,
  AnecdoteData,
  EntryItemData,
  HealthData,
  MealData,
  NapData,
} from "../db/schema.js";
import type { CarnetDay, TranscribedNote } from "./carnet.js";

export const ITEM_TYPES = [
  "meal",
  "nap",
  "activity",
  "anecdote",
  "health",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type ItemRow = {
  type: ItemType;
  data: EntryItemData;
  position: number;
};

export type ItemKind = {
  type: ItemType;
  noteKey: "meals" | "naps" | "activities" | "anecdotes" | "health";
  fromCarnetDay(day: CarnetDay): EntryItemData[];
  fromNote(note: TranscribedNote): EntryItemData[];
  toNoteValue(data: EntryItemData): unknown;
};

export const ITEM_KINDS: readonly ItemKind[] = [
  {
    type: "meal",
    noteKey: "meals",
    fromCarnetDay: (day) => day.repas,
    fromNote: (note) => note.meals ?? [],
    toNoteValue: (data: MealData) => data,
  },
  {
    type: "nap",
    noteKey: "naps",
    fromCarnetDay: (day) => day.siestes,
    fromNote: (note) => note.naps ?? [],
    toNoteValue: (data: NapData) => data,
  },
  {
    type: "activity",
    noteKey: "activities",
    fromCarnetDay: (day) => day.activites.map((label) => ({ label })),
    fromNote: (note) => (note.activities ?? []).map((label) => ({ label })),
    toNoteValue: (data: ActivityData) => data.label,
  },
  {
    type: "anecdote",
    noteKey: "anecdotes",
    fromCarnetDay: (day) => day.anecdotes.map((text) => ({ text })),
    fromNote: (note) => (note.anecdotes ?? []).map((text) => ({ text })),
    toNoteValue: (data: AnecdoteData) => data.text,
  },
  {
    type: "health",
    noteKey: "health",
    fromCarnetDay: (day) =>
      day.sante && day.sante.trim() ? [{ note: day.sante }] : [],
    fromNote: (note) => (note.health ?? []).map((text) => ({ note: text })),
    toNoteValue: (data: HealthData) => data.note,
  },
];

const KIND_BY_TYPE = new Map(ITEM_KINDS.map((k) => [k.type, k]));

export function isItemType(value: string): value is ItemType {
  return KIND_BY_TYPE.has(value as ItemType);
}

function positioned(
  entries: { type: ItemType; data: EntryItemData }[],
): ItemRow[] {
  return entries.map((it, position) => ({ ...it, position }));
}

export function itemsFromCarnetDay(day: CarnetDay): ItemRow[] {
  return positioned(
    ITEM_KINDS.flatMap((kind) =>
      kind.fromCarnetDay(day).map((data) => ({ type: kind.type, data })),
    ),
  );
}

export function itemsFromNote(note: TranscribedNote): ItemRow[] {
  return positioned(
    ITEM_KINDS.flatMap((kind) =>
      kind.fromNote(note).map((data) => ({ type: kind.type, data })),
    ),
  );
}

export function itemsToNoteLists(
  items: readonly { type: ItemType; data: EntryItemData }[],
): Record<ItemKind["noteKey"], unknown[]> {
  const lists = {} as Record<ItemKind["noteKey"], unknown[]>;
  for (const kind of ITEM_KINDS) {
    lists[kind.noteKey] = items
      .filter((i) => i.type === kind.type)
      .map((i) => kind.toNoteValue(i.data));
  }
  return lists;
}
