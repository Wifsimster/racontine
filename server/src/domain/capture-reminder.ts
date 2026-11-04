import { HOUSEHOLD_TIMEZONE } from "./dates.js";

export const DEFAULT_REMINDER_TIME = "18:30";
export const DEFAULT_REMINDER_DAYS: readonly number[] = [1, 2, 3, 4, 5];
export const CATCH_UP_MS = 2 * 60 * 60 * 1000;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ReminderSchedule = {
  enabled: boolean;
  time: string;
  days: readonly number[];
};

export type ReminderSituation = ReminderSchedule & {
  lastSentOn: string | null;
  hasEntryOn: (day: string) => boolean;
  hasPush: boolean;
};

export type ReminderSkip =
  | "disabled"
  | "not-a-reminder-day"
  | "too-early"
  | "too-late"
  | "already-sent"
  | "entry-exists"
  | "no-push";

export type ReminderDecision =
  | { send: true; day: string; dueAt: Date }
  | { send: false; reason: ReminderSkip; day: string };

export function isReminderTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function normalizeReminderDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    isoWeekday: WEEKDAYS.indexOf(get("weekday")) + 1,
  };
}

export function localInstant(
  day: string,
  time: string,
  timeZone: string = HOUSEHOLD_TIMEZONE,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, date, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (seen === wanted) break;
    guess += wanted - seen;
  }
  return new Date(guess);
}

export function localDay(
  now: Date,
  timeZone: string = HOUSEHOLD_TIMEZONE,
): { day: string; isoWeekday: number } {
  const p = localParts(now, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    isoWeekday: p.isoWeekday,
  };
}

export function decideReminder(
  situation: ReminderSituation,
  now: Date,
  timeZone: string = HOUSEHOLD_TIMEZONE,
): ReminderDecision {
  const { day, isoWeekday } = localDay(now, timeZone);
  const skip = (reason: ReminderSkip): ReminderDecision => ({
    send: false,
    reason,
    day,
  });
  if (!situation.enabled || !isReminderTime(situation.time))
    return skip("disabled");
  if (!situation.days.includes(isoWeekday)) return skip("not-a-reminder-day");
  const dueAt = localInstant(day, situation.time, timeZone);
  const elapsed = now.getTime() - dueAt.getTime();
  if (elapsed < 0) return skip("too-early");
  if (elapsed >= CATCH_UP_MS) return skip("too-late");
  if (situation.lastSentOn !== null && situation.lastSentOn >= day)
    return skip("already-sent");
  if (situation.hasEntryOn(day)) return skip("entry-exists");
  if (!situation.hasPush) return skip("no-push");
  return { send: true, day, dueAt };
}

export function reminderMessage(
  childId: string,
  childName: string,
  webBaseUrl: string,
): { title: string; body: string; url: string; tag: string } {
  return {
    title: `Le carnet de ${childName} d'aujourd'hui ?`,
    body: "Rien n'est encore arrivé pour aujourd'hui. Une photo des pages suffit, Racontine s'occupe du reste.",
    url: `${webBaseUrl}/capture?childId=${encodeURIComponent(childId)}`,
    tag: `rappel-${childId}`,
  };
}
