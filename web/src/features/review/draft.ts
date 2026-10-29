import {
  type EntryItem,
  type EntrySource,
  type ItemType,
  type Uncertainty,
} from "@/lib/types";
import { itemKind } from "@/lib/items";

export type DraftItem = {
  type: ItemType;
  data: Record<string, string>;
  position: number;
};

export function toDraftItems(items: EntryItem[]): DraftItem[] {
  return items.map((it, i) => ({
    type: it.type,
    data: { ...(it.data as Record<string, string>) },
    position: it.position ?? i,
  }));
}

export function emptyDraft(type: ItemType): Record<string, string> {
  return itemKind(type).emptyDraft();
}

export function glanceOf(it: DraftItem): { label: string; value: string } {
  return itemKind(it.type).summarize(it.data);
}

export function pruneEmpty(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function fingerprint(v: {
  title: string | null;
  story: string | null;
  highlight: string | null;
  mood: string | null;
  transcription: string | null;
  source: EntrySource;
  date: string;
  items: DraftItem[];
}): string {
  return JSON.stringify({
    title: v.title?.trim() || null,
    story: v.story?.trim() || null,
    highlight: v.highlight?.trim() || null,
    mood: v.mood || null,
    transcription: v.transcription || null,
    source: v.source,
    date: v.date,
    items: v.items
      .map((it, position) => ({
        type: it.type,
        data: pruneEmpty(it.data),
        position,
      }))
      .filter((it) => Object.keys(it.data).length > 0),
  });
}

export function normalizeUncertainties(raw: unknown): Uncertainty[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u) =>
    typeof u === "string"
      ? { original: u, contexte: "", suggestions: [], champ: null, resolved: null }
      : (u as Uncertainty),
  );
}

