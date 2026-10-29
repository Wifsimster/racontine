import { isIsoDate } from "./dates.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseCursor(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}

export function parseFrom(raw: unknown): string | null {
  return typeof raw === "string" && isIsoDate(raw) ? raw : null;
}

export function parseLimit(raw: unknown, { fallback = 20, max = 50 } = {}): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

export function lastDayOfMonth(month: string): string | null {
  if (typeof month !== "string" || !MONTH_RE.test(month)) return null;
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}
