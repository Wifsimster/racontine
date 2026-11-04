import type { SubscriptionCadence } from "../db/schema.js";
import type {
  DigestEntry,
  OutgoingKind,
  OutgoingMessage,
  PendingNotification,
  Recipient,
} from "./types.js";

export const QUIET_MS = 2 * 60 * 1000;
export const MAX_WAIT_MS = 15 * 60 * 1000;
export const DIGEST_TIME_ZONE = "Europe/Paris";
export const DIGEST_HOUR = 19;

export type DispatchBatch = {
  kind: OutgoingKind;
  recipient: Recipient;
  childId: string;
  childName: string;
  notificationIds: string[];
  entries: DigestEntry[];
};

export type DispatchPlan = {
  batches: DispatchBatch[];
  discard: string[];
};

export function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (seen === wanted) break;
    guess += wanted - seen;
  }
  return new Date(guess);
}

export function lastWeeklyDigestAt(
  now: Date,
  timeZone = DIGEST_TIME_ZONE,
  hour = DIGEST_HOUR,
): Date {
  const p = zonedParts(now, timeZone);
  const sunday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday));
  const at = (d: Date) =>
    zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, timeZone);
  const candidate = at(sunday);
  if (candidate.getTime() <= now.getTime()) return candidate;
  sunday.setUTCDate(sunday.getUTCDate() - 7);
  return at(sunday);
}

function uniqueEntries(rows: PendingNotification[]): DigestEntry[] {
  const byId = new Map<string, DigestEntry>();
  for (const r of rows) if (r.entry) byId.set(r.entry.entryId, r.entry);
  return [...byId.values()].sort((a, b) =>
    a.date === b.date ? a.entryId.localeCompare(b.entryId) : a.date.localeCompare(b.date),
  );
}

export function planDispatch(
  rows: PendingNotification[],
  now: Date,
  options: { quietMs?: number; maxWaitMs?: number } = {},
): DispatchPlan {
  const quietMs = options.quietMs ?? QUIET_MS;
  const maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  const weeklyCutoff = lastWeeklyDigestAt(now).getTime();
  const discard: string[] = [];
  const groups = new Map<
    string,
    { cadence: SubscriptionCadence; rows: PendingNotification[] }
  >();

  for (const row of rows) {
    if (!row.cadence || !row.entry) {
      discard.push(row.notificationId);
      continue;
    }
    if (row.cadence === "hebdo" && row.createdAt.getTime() >= weeklyCutoff)
      continue;
    const key = `${row.cadence}|${row.recipient.userId}|${row.childId}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { cadence: row.cadence, rows: [row] });
  }

  const batches: DispatchBatch[] = [];
  for (const { cadence, rows: grouped } of groups.values()) {
    if (cadence === "chaque") {
      const times = grouped.map((r) => r.createdAt.getTime());
      const settled = now.getTime() - Math.max(...times) >= quietMs;
      const overdue = now.getTime() - Math.min(...times) >= maxWaitMs;
      if (!settled && !overdue) continue;
    }
    const first = grouped[0];
    batches.push({
      kind: cadence === "hebdo" ? "hebdo" : "publications",
      recipient: first.recipient,
      childId: first.childId,
      childName: first.childName,
      notificationIds: grouped.map((r) => r.notificationId),
      entries: uniqueEntries(grouped),
    });
  }
  return { batches, discard };
}

export function describeBatch(
  batch: Pick<DispatchBatch, "kind" | "childId" | "childName" | "entries">,
  webBaseUrl: string,
): OutgoingMessage {
  const { kind, childId, childName, entries } = batch;
  const n = entries.length;
  const base = {
    kind,
    childId,
    childName,
    entries,
    tag: `carnet-${childId}`,
  };
  if (kind === "hebdo")
    return {
      ...base,
      title:
        n === 1
          ? `La semaine de ${childName} : une journée`
          : `La semaine de ${childName} : ${n} journées`,
      body:
        n === 1
          ? `Une journée a été publiée cette semaine dans le journal de ${childName}.`
          : `${n} journées ont été publiées cette semaine dans le journal de ${childName}.`,
      link: `${webBaseUrl}/`,
    };
  if (n === 1)
    return {
      ...base,
      title: `Une nouvelle journée de ${childName}`,
      body: `La journée du ${formatDateFr(entries[0].date)} vient d'être publiée dans le journal de ${childName}.`,
      link: `${webBaseUrl}/entries/${entries[0].entryId}`,
    };
  return {
    ...base,
    title: `${n} nouvelles journées de ${childName}`,
    body: `${n} journées viennent d'être publiées dans le journal de ${childName}.`,
    link: `${webBaseUrl}/`,
  };
}
