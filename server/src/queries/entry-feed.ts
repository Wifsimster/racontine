import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  entries,
  entryReads,
  memberships,
  notifications,
} from "../db/schema.js";
import { childRole } from "../access.js";
import {
  reviewQueueChildIds,
  seesDrafts,
  timelineScope,
} from "../domain/visibility.js";

export type FeedEntry = Awaited<ReturnType<typeof findEntryWithRelations>>;

async function findEntryWithRelations(entryId: string) {
  return db.query.entries.findFirst({
    where: eq(entries.id, entryId),
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });
}

export async function listAccessibleChildren(userId: string) {
  return db
    .select({
      id: children.id,
      name: children.name,
      birthdate: children.birthdate,
      createdAt: children.createdAt,
      role: memberships.role,
    })
    .from(children)
    .innerJoin(memberships, eq(memberships.childId, children.id))
    .where(eq(memberships.userId, userId))
    .orderBy(children.createdAt);
}

export type ReadState = { read: boolean; readAt: Date | null };

export type TimelinePage =
  | { kind: "denied" }
  | {
      kind: "page";
      entries: (NonNullable<FeedEntry> & ReadState)[];
      nextCursor: string | null;
      unreadCount: number;
      pendingCount?: number;
    };

export type TimelineMonths =
  | { kind: "denied" }
  | { kind: "months"; months: { month: string; count: number }[] };

function visibleTo(scope: { childIds: string[]; draftableChildIds: string[] }) {
  return and(
    inArray(entries.childId, scope.childIds),
    or(
      eq(entries.status, "published"),
      scope.draftableChildIds.length
        ? inArray(entries.childId, scope.draftableChildIds)
        : undefined,
    ),
  );
}

const pendingUncertainty = sql`exists (
  select 1
  from jsonb_array_elements(
    case when jsonb_typeof(${entries.uncertainties}) = 'array'
      then ${entries.uncertainties} else '[]'::jsonb end
  ) as incertitude(v)
  where case jsonb_typeof(incertitude.v)
    when 'string' then btrim(incertitude.v #>> '{}') <> ''
    when 'object' then
      btrim(coalesce(incertitude.v ->> 'original', '')) <> ''
      and coalesce(incertitude.v ->> 'resolved', '') = ''
    else false
  end
)`;

function toVerify(childIds: string[]) {
  return and(inArray(entries.childId, childIds), pendingUncertainty);
}

async function countPending(childIds: string[]) {
  if (!childIds.length) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(entries)
    .where(toVerify(childIds));
  return row?.n ?? 0;
}

async function readingScope(
  userId: string,
  childId?: string,
  asReader = false,
) {
  const mems = await db
    .select({ childId: memberships.childId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return timelineScope(mems, childId, { asReader });
}

function unreadBy(userId: string, childIds: string[]) {
  return and(
    inArray(entries.childId, childIds),
    eq(entries.status, "published"),
    sql`${entries.createdBy} is distinct from ${userId}`,
    notExists(
      db
        .select({ one: sql`1` })
        .from(entryReads)
        .where(
          and(
            eq(entryReads.entryId, entries.id),
            eq(entryReads.userId, userId),
          ),
        ),
    ),
  );
}

async function countUnread(userId: string, childIds: string[]) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(entries)
    .where(unreadBy(userId, childIds));
  return row?.n ?? 0;
}

export async function readStates<
  T extends { id: string; status: string; createdBy: string | null },
>(userId: string, rows: T[]): Promise<(T & ReadState)[]> {
  const ids = rows.map((r) => r.id);
  const reads = ids.length
    ? await db
        .select({ entryId: entryReads.entryId, readAt: entryReads.readAt })
        .from(entryReads)
        .where(
          and(eq(entryReads.userId, userId), inArray(entryReads.entryId, ids)),
        )
    : [];
  const byEntry = new Map(reads.map((r) => [r.entryId, r.readAt]));
  return rows.map((r) => {
    const readAt = byEntry.get(r.id) ?? null;
    return {
      ...r,
      readAt,
      read:
        r.status !== "published" || r.createdBy === userId || readAt !== null,
    };
  });
}

export async function listTimeline(params: {
  userId: string;
  childId?: string;
  limit: number;
  cursor?: string | null;
  from?: string | null;
  asReader?: boolean;
  pending?: boolean;
}): Promise<TimelinePage> {
  const scope = await readingScope(
    params.userId,
    params.childId,
    params.asReader,
  );
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty")
    return { kind: "page", entries: [], nextCursor: null, unreadCount: 0 };

  const queue = reviewQueueChildIds(scope);
  if (params.pending && !queue.length)
    return {
      kind: "page",
      entries: [],
      nextCursor: null,
      unreadCount: await countUnread(params.userId, scope.childIds),
    };

  const anchor = params.cursor
    ? (
        await db
          .select({ id: entries.id })
          .from(entries)
          .where(eq(entries.id, params.cursor))
          .limit(1)
      )[0]?.id
    : undefined;

  const rows = await db.query.entries.findMany({
    where: and(
      visibleTo(scope),
      params.pending ? toVerify(queue) : undefined,
      params.from ? lte(entries.date, params.from) : undefined,
      anchor
        ? sql`(${entries.date}, ${entries.createdAt}, ${entries.id}) < (
              SELECT ancre.date, ancre.created_at, ancre.id
              FROM ${entries} AS ancre
              WHERE ancre.id = ${anchor}
            )`
        : undefined,
    ),
    orderBy: [desc(entries.date), desc(entries.createdAt), desc(entries.id)],
    limit: params.limit,
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });

  const [withReads, unreadCount, pendingCount] = await Promise.all([
    readStates(params.userId, rows),
    countUnread(params.userId, scope.childIds),
    queue.length ? countPending(queue) : undefined,
  ]);

  return {
    kind: "page",
    entries: withReads,
    nextCursor: rows.length === params.limit ? (rows[rows.length - 1]?.id ?? null) : null,
    unreadCount,
    ...(pendingCount === undefined ? {} : { pendingCount }),
  };
}

export async function listTimelineMonths(params: {
  userId: string;
  childId?: string;
  asReader?: boolean;
  pending?: boolean;
}): Promise<TimelineMonths> {
  const scope = await readingScope(
    params.userId,
    params.childId,
    params.asReader,
  );
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty") return { kind: "months", months: [] };
  const queue = reviewQueueChildIds(scope);
  if (params.pending && !queue.length) return { kind: "months", months: [] };

  const month = sql<string>`to_char(${entries.date}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, count: sql<number>`count(*)::int` })
    .from(entries)
    .where(and(visibleTo(scope), params.pending ? toVerify(queue) : undefined))
    .groupBy(month)
    .orderBy(sql`1 desc`);

  return { kind: "months", months: rows };
}

export async function findVisibleEntry(userId: string, entryId: string) {
  const entry = await findEntryWithRelations(entryId);
  if (!entry) return null;
  const role = await childRole(userId, entry.childId);
  if (!role) return null;
  if (role === "reader" && entry.status !== "published") return null;
  return entry;
}

export type Neighbours = { prevId: string | null; nextId: string | null };

export async function findNeighbours(
  userId: string,
  entry: { id: string; childId: string },
): Promise<Neighbours> {
  const role = await childRole(userId, entry.childId);
  if (!role) return { prevId: null, nextId: null };
  const visible = and(
    eq(entries.childId, entry.childId),
    seesDrafts(role) ? undefined : eq(entries.status, "published"),
  );
  const position = (op: "<" | ">") =>
    sql`(${entries.date}, ${entries.createdAt}, ${entries.id}) ${sql.raw(op)} (
      SELECT repere.date, repere.created_at, repere.id
      FROM ${entries} AS repere
      WHERE repere.id = ${entry.id}
    )`;
  const [prev, next] = await Promise.all([
    db
      .select({ id: entries.id })
      .from(entries)
      .where(and(visible, position("<")))
      .orderBy(desc(entries.date), desc(entries.createdAt), desc(entries.id))
      .limit(1),
    db
      .select({ id: entries.id })
      .from(entries)
      .where(and(visible, position(">")))
      .orderBy(asc(entries.date), asc(entries.createdAt), asc(entries.id))
      .limit(1),
  ]);
  return { prevId: prev[0]?.id ?? null, nextId: next[0]?.id ?? null };
}

export type BatchSummary = {
  id: string;
  date: string;
  status: string;
  title: string | null;
};

export async function listBatch(
  userId: string,
  batchId: string,
): Promise<BatchSummary[] | null> {
  const rows = await db.query.entries.findMany({
    where: eq(entries.batchId, batchId),
    orderBy: [asc(entries.date)],
  });
  if (!rows.length) return null;

  const role = await childRole(userId, rows[0].childId);
  if (!role) return null;
  const visible =
    role === "reader" ? rows.filter((e) => e.status === "published") : rows;

  return visible.map((e) => ({
    id: e.id,
    date: e.date,
    status: e.status,
    title: e.title,
  }));
}

export type ReadToggle =
  | { kind: "not_found" }
  | { kind: "not_published" }
  | { kind: "done"; read: boolean; readAt: Date | null };

export async function setEntryRead(
  userId: string,
  entryId: string,
  read: boolean,
): Promise<ReadToggle> {
  const entry = await findVisibleEntry(userId, entryId);
  if (!entry) return { kind: "not_found" };
  if (entry.status !== "published") return { kind: "not_published" };

  if (!read) {
    await db
      .delete(entryReads)
      .where(
        and(eq(entryReads.userId, userId), eq(entryReads.entryId, entryId)),
      );
    return { kind: "done", read: false, readAt: null };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(entryReads)
      .values({ userId, entryId, readAt: now })
      .onConflictDoNothing();
    await tx
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.entryId, entryId),
          isNull(notifications.readAt),
        ),
      );
  });
  return { kind: "done", read: true, readAt: now };
}

export async function markAllRead(
  userId: string,
  childId?: string,
): Promise<{ kind: "denied" } | { kind: "done"; marked: number }> {
  const scope = await readingScope(userId, childId, true);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty") return { kind: "done", marked: 0 };

  const now = new Date();
  const marked = await db.transaction(async (tx) => {
    const unread = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(unreadBy(userId, scope.childIds));
    if (!unread.length) return 0;
    const ids = unread.map((u) => u.id);
    await tx
      .insert(entryReads)
      .values(ids.map((entryId) => ({ userId, entryId, readAt: now })))
      .onConflictDoNothing();
    await tx
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, userId),
          inArray(notifications.entryId, ids),
          isNull(notifications.readAt),
        ),
      );
    return ids.length;
  });
  return { kind: "done", marked };
}
