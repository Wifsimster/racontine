import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, entries, memberships } from "../db/schema.js";
import { timelineScope } from "../domain/visibility.js";
import {
  buildTrends,
  periodRange,
  type TrendPeriod,
  type Trends,
} from "../domain/trends.js";

async function publishedScope(userId: string, childId: string) {
  const mems = await db
    .select({ childId: memberships.childId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  const scope = timelineScope(mems, childId, { asReader: true });
  return scope.kind === "scoped" ? scope.childIds : null;
}

function publishedOf(childIds: string[]) {
  return and(
    inArray(entries.childId, childIds),
    eq(entries.status, "published"),
  );
}

async function publishedYears(childIds: string[]): Promise<number[]> {
  const year = sql<number>`extract(year from ${entries.date})::int`;
  const rows = await db
    .selectDistinct({ year })
    .from(entries)
    .where(publishedOf(childIds))
    .orderBy(sql`1 desc`);
  return rows.map((r) => r.year);
}

export type TrendsResult =
  | { kind: "denied" }
  | {
      kind: "trends";
      child: { id: string; name: string };
      period: TrendPeriod;
      years: number[];
      trends: Trends;
    };

export async function loadTrends(params: {
  userId: string;
  childId: string;
  period: TrendPeriod;
  today: string;
}): Promise<TrendsResult> {
  const childIds = await publishedScope(params.userId, params.childId);
  if (!childIds) return { kind: "denied" };

  const range = periodRange(params.period, params.today);
  const [child, rows, years] = await Promise.all([
    db.query.children.findFirst({
      where: eq(children.id, params.childId),
      columns: { id: true, name: true },
    }),
    db.query.entries.findMany({
      where: and(
        publishedOf(childIds),
        gte(entries.date, range.from),
        lte(entries.date, range.to),
      ),
      orderBy: [asc(entries.date)],
      columns: { date: true },
      with: {
        items: {
          orderBy: (i, { asc }) => [asc(i.position)],
          columns: { type: true, data: true },
        },
      },
    }),
    publishedYears(childIds),
  ]);
  if (!child) return { kind: "denied" };

  return {
    kind: "trends",
    child,
    period: params.period,
    years,
    trends: buildTrends(rows, range),
  };
}

export type YearBookResult =
  | { kind: "denied" }
  | {
      kind: "book";
      child: { id: string; name: string; birthdate: string | null };
      year: number;
      years: number[];
      entries: Awaited<ReturnType<typeof bookEntries>>;
    };

function bookEntries(childIds: string[], year: number) {
  return db.query.entries.findMany({
    where: and(
      publishedOf(childIds),
      gte(entries.date, `${year}-01-01`),
      lte(entries.date, `${year}-12-31`),
    ),
    orderBy: [asc(entries.date), asc(entries.createdAt)],
    columns: {
      id: true,
      date: true,
      source: true,
      title: true,
      story: true,
      highlight: true,
      mood: true,
    },
    with: {
      items: {
        orderBy: (i, { asc }) => [asc(i.position)],
        columns: { type: true, data: true },
      },
      attachments: {
        where: (a, { eq }) => eq(a.kind, "souvenir"),
        orderBy: (a, { asc }) => [asc(a.position)],
        columns: { id: true, rotation: true, width: true, height: true },
      },
    },
  });
}

export async function loadYearBook(params: {
  userId: string;
  childId: string;
  year: number;
}): Promise<YearBookResult> {
  const childIds = await publishedScope(params.userId, params.childId);
  if (!childIds) return { kind: "denied" };

  const [child, rows, years] = await Promise.all([
    db.query.children.findFirst({
      where: eq(children.id, params.childId),
      columns: { id: true, name: true, birthdate: true },
    }),
    bookEntries(childIds, params.year),
    publishedYears(childIds),
  ]);
  if (!child) return { kind: "denied" };

  return { kind: "book", child, year: params.year, years, entries: rows };
}
