export const NBSP = " ";

export function fr(text: string): string {
  return text.replace(/(\p{L})['‘](\p{L})/gu, "$1’$2");
}

const fmtDayMonth = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});
const fmtWeekdayDayMonth = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtFull = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtMonthYear = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

export function dayOf(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

export function daysAgo(iso: string): number {
  const d = dayOf(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

export function dayLabel(iso: string): string {
  const n = daysAgo(iso);
  if (n === 0) return "aujourd’hui";
  if (n === 1) return "hier";
  if (n < 7) return fmtWeekdayDayMonth.format(dayOf(iso));
  return fmtDayMonth.format(dayOf(iso));
}

export function dayMonth(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtDayMonth.format(d);
}

export function dayMonthShort(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    .replace(/\.$/, "");
}

export function longDate(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtWeekdayDayMonth.format(d);
}

export function fullDate(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtFull.format(d);
}

export function monthYear(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtMonthYear.format(d);
}

export function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(s?: string | null): string | null {
  const t = parseTime(s);
  if (t === null) return null;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
