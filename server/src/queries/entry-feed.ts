import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, entries, memberships } from "../db/schema.js";
import { childRole } from "../access.js";
import { timelineScope } from "../domain/visibility.js";

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

export type TimelinePage =
  | { kind: "denied" }
  | {
      kind: "page";
      entries: NonNullable<FeedEntry>[];
      nextCursor: string | null;
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

async function readingScope(userId: string, childId?: string) {
  const mems = await db
    .select({ childId: memberships.childId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return timelineScope(mems, childId);
}

export async function listTimeline(params: {
  userId: string;
  childId?: string;
  limit: number;
  cursor?: string | null;
  from?: string | null;
}): Promise<TimelinePage> {
  const scope = await readingScope(params.userId, params.childId);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty")
    return { kind: "page", entries: [], nextCursor: null };

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

  return {
    kind: "page",
    entries: rows,
    nextCursor: rows.length === params.limit ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}

export async function listTimelineMonths(params: {
  userId: string;
  childId?: string;
}): Promise<TimelineMonths> {
  const scope = await readingScope(params.userId, params.childId);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty") return { kind: "months", months: [] };

  const month = sql<string>`to_char(${entries.date}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, count: sql<number>`count(*)::int` })
    .from(entries)
    .where(visibleTo(scope))
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
