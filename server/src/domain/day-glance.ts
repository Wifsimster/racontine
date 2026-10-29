import type { EntryItemData, NapData } from "../db/schema.js";
import type { ItemType } from "./entry-items.js";

const NBSP = "\u00a0";

function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

function moodShort(mood: string): string | null {
  const first = mood.split(/[,;]| et | puis /i)[0].trim();
  if (first.length <= 16) return first;
  const cut = first.slice(0, 16);
  const space = cut.lastIndexOf(" ");
  return space >= 4 ? cut.slice(0, space) + "\u2026" : null;
}

export type DayChip = { label: string; tone: "meal" | "nap" | "mood" };

export function dayChips(day: {
  items: readonly { type: ItemType; data: EntryItemData }[];
  mood: string | null;
}): DayChip[] {
  const chips: DayChip[] = [];

  const meals = day.items.filter((i) => i.type === "meal");
  if (meals.length > 0)
    chips.push({ label: `${meals.length} repas`, tone: "meal" });

  const naps = day.items.filter((i) => i.type === "nap");
  if (naps.length > 0) {
    let total = 0;
    for (const n of naps) {
      const d = n.data as NapData;
      const a = parseTime(d.debut);
      const b = parseTime(d.fin);
      if (a !== null && b !== null && b > a) total += b - a;
    }
    const noun = naps.length > 1 ? "siestes" : "sieste";
    chips.push({
      label:
        total > 0 ? `${noun} ${formatDuration(total)}` : `${naps.length} ${noun}`,
      tone: "nap",
    });
  }

  const short = day.mood ? moodShort(day.mood) : null;
  if (short) chips.push({ label: short, tone: "mood" });

  return chips;
}
