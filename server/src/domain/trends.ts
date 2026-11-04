import type {
  ActivityData,
  AnecdoteData,
  EntryItemData,
  HealthData,
  MealData,
  NapData,
} from "../db/schema.js";
import { addDays } from "./dates.js";
import { napMinutes } from "./day-glance.js";
import type { ItemType } from "./entry-items.js";

export const TREND_PERIODS = ["4s", "3m", "12m"] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number];

export function parsePeriod(value: unknown): TrendPeriod {
  return TREND_PERIODS.includes(value as TrendPeriod)
    ? (value as TrendPeriod)
    : "4s";
}

export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function periodRange(
  period: TrendPeriod,
  today: string,
): { from: string; to: string } {
  const weeks = period === "4s" ? 4 : period === "3m" ? 13 : 52;
  return { from: addDays(mondayOf(today), -7 * (weeks - 1)), to: today };
}

export const APPETITE_LEVELS = [
  "tout",
  "bien",
  "partie",
  "peu",
  "refus",
  "autre",
] as const;
export type AppetiteLevel = (typeof APPETITE_LEVELS)[number];

export const APPETITE_LABELS: Record<AppetiteLevel, string> = {
  tout: "Tout mangé",
  bien: "Bien mangé",
  partie: "En partie",
  peu: "Peu",
  refus: "Refusé",
  autre: "Autre remarque",
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const APPETITE_RULES: [AppetiteLevel, RegExp][] = [
  ["refus", /\brefus|\bvomi|\brien mange|\bn'a rien|\bpas mange|\bn'a pas mange|\bne mange pas\b/],
  ["bien", /\bpresque tout\b/],
  [
    "tout",
    /\btout mange|\btermine tout|\bavale tout|\bmange tout\b|\btout (son|le|la) |\btoute (la|sa) |\btout bu\b|\bfini\b|\btermine\b|\bresservi/,
  ],
  [
    "partie",
    /\bpartiel|\bmoitie|½|\b1\/2\b|\b3\/4\b|\blaisse\b|\babandonn|\bcompliqu|\bde mal\b|\bne veut pas\b|\bne lui plait pas\b|\brepouss/,
  ],
  [
    "peu",
    /\bpetit appetit|\bun peu\b|\bpeu\b|\bseulement\b|\bsans trop\b|\bgoute\b|\bpicor|\bpas faim\b/,
  ],
  ["bien", /\bbon appetit|\bbien mange|\bmange bien|\bse regale|\btres bien\b|\bbien\b|\bplat mange\b/],
];

export function normalizeAppetite(
  value: string | null | undefined,
): AppetiteLevel | null {
  if (!value) return null;
  const s = fold(value);
  if (!s) return null;
  for (const [level, re] of APPETITE_RULES) if (re.test(s)) return level;
  return "autre";
}

export type TrendDay = {
  date: string;
  items: readonly { type: ItemType; data: EntryItemData }[];
};

export type NapWeek = {
  weekStart: string;
  averageMinutes: number | null;
  days: number;
};

export type Trends = {
  range: { from: string; to: string };
  days: number;
  naps: { weeks: NapWeek[]; averageMinutes: number | null; days: number };
  appetite: {
    levels: { level: AppetiteLevel; label: string; count: number }[];
    unspecified: number;
  };
  activities: { label: string; count: number }[];
  health: { date: string; note: string }[];
  anecdotes: { date: string; text: string }[];
};

function activityKey(label: string): string {
  return fold(label).replace(/[.!…]+$/u, "");
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase("fr-FR") + s.slice(1);
}

export function buildTrends(
  days: readonly TrendDay[],
  range: { from: string; to: string },
  options: { topActivities?: number; anecdotes?: number } = {},
): Trends {
  const inRange = days
    .filter((d) => d.date >= range.from && d.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const napByDay = new Map<string, number>();
  const appetite = new Map<AppetiteLevel, number>();
  let unspecified = 0;
  const activities = new Map<
    string,
    { count: number; forms: Map<string, number> }
  >();
  const health: Trends["health"] = [];
  const anecdotes: Trends["anecdotes"] = [];

  for (const day of inRange) {
    for (const item of day.items) {
      if (item.type === "nap") {
        const m = napMinutes(item.data as NapData);
        if (m !== null) napByDay.set(day.date, (napByDay.get(day.date) ?? 0) + m);
      } else if (item.type === "meal") {
        const level = normalizeAppetite((item.data as MealData).appetit);
        if (level === null) unspecified += 1;
        else appetite.set(level, (appetite.get(level) ?? 0) + 1);
      } else if (item.type === "activity") {
        const label = (item.data as ActivityData).label?.trim();
        if (!label) continue;
        const key = activityKey(label);
        const slot = activities.get(key) ?? { count: 0, forms: new Map() };
        slot.count += 1;
        slot.forms.set(label, (slot.forms.get(label) ?? 0) + 1);
        activities.set(key, slot);
      } else if (item.type === "health") {
        const note = (item.data as HealthData).note?.trim();
        if (note) health.push({ date: day.date, note });
      } else if (item.type === "anecdote") {
        const text = (item.data as AnecdoteData).text?.trim();
        if (text) anecdotes.push({ date: day.date, text });
      }
    }
  }

  const weeks: NapWeek[] = [];
  for (
    let w = mondayOf(range.from);
    w <= range.to;
    w = addDays(w, 7)
  ) {
    const end = addDays(w, 6);
    const totals = [...napByDay.entries()]
      .filter(([d]) => d >= w && d <= end)
      .map(([, m]) => m);
    weeks.push({
      weekStart: w,
      averageMinutes: totals.length
        ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
        : null,
      days: totals.length,
    });
  }
  const allTotals = [...napByDay.values()];

  const top = [...activities.values()]
    .map((slot) => {
      const label = [...slot.forms.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"),
      )[0][0];
      return { label: capitalizeFirst(label), count: slot.count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
    .slice(0, options.topActivities ?? 8);

  return {
    range,
    days: inRange.length,
    naps: {
      weeks,
      averageMinutes: allTotals.length
        ? Math.round(allTotals.reduce((a, b) => a + b, 0) / allTotals.length)
        : null,
      days: allTotals.length,
    },
    appetite: {
      levels: APPETITE_LEVELS.map((level) => ({
        level,
        label: APPETITE_LABELS[level],
        count: appetite.get(level) ?? 0,
      })),
      unspecified,
    },
    activities: top,
    health,
    anecdotes: anecdotes.reverse().slice(0, options.anecdotes ?? 8),
  };
}

export function parseYear(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : fallback;
}

export function groupByMonth<T extends { date: string }>(
  days: readonly T[],
): { month: string; days: T[] }[] {
  const out: { month: string; days: T[] }[] = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = d.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) last.days.push(d);
    else out.push({ month, days: [d] });
  }
  return out;
}
