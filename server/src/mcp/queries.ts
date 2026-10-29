import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  entries,
  memberships,
  type EntryItemData,
  type EntryStatus,
  type MemberRole,
  type Uncertainty,
} from "../db/schema.js";
import { roleAtLeast } from "../access.js";
import type { ItemType } from "../domain/entry-items.js";
import { timelineScope } from "../domain/visibility.js";

export type ContributableChild = { id: string; name: string; role: MemberRole };

export type NoteSummary = {
  id: string;
  childId: string;
  child: string | null;
  date: string;
  source: string;
  status: EntryStatus;
  title: string | null;
  mood: string | null;
  highlight: string | null;
};

export type NoteDetail = {
  entry: {
    id: string;
    childId: string;
    childName: string | null;
    date: string;
    source: string;
    status: EntryStatus;
    failureReason: string | null;
    title: string | null;
    mood: string | null;
    story: string | null;
    highlight: string | null;
    transcription: string | null;
    uncertainties: Uncertainty[];
    pageCount: number;
  };
  items: { type: ItemType; data: EntryItemData }[];
};

export interface EntryQueries {
  contributableChildren(userId: string): Promise<ContributableChild[]>;
  listNotes(params: {
    userId: string;
    childId?: string;
    status?: EntryStatus;
    limit: number;
  }): Promise<NoteSummary[] | null>;
  findNote(userId: string, entryId: string): Promise<NoteDetail | null>;
}

export class DrizzleEntryQueries implements EntryQueries {
  async contributableChildren(userId: string): Promise<ContributableChild[]> {
    const rows = await db
      .select({ id: children.id, name: children.name, role: memberships.role })
      .from(children)
      .innerJoin(memberships, eq(memberships.childId, children.id))
      .where(eq(memberships.userId, userId))
      .orderBy(children.createdAt);
    return rows.filter((r) => roleAtLeast(r.role, "contributor"));
  }

  async listNotes(params: {
    userId: string;
    childId?: string;
    status?: EntryStatus;
    limit: number;
  }): Promise<NoteSummary[] | null> {
    const mems = await db
      .select({ childId: memberships.childId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, params.userId));

    const scope = timelineScope(mems, params.childId);
    if (scope.kind === "denied") return null;
    if (scope.kind === "empty") return [];

    const rows = await db.query.entries.findMany({
      where: and(
        inArray(entries.childId, scope.childIds),
        params.status ? eq(entries.status, params.status) : undefined,
        or(
          eq(entries.status, "published"),
          scope.draftableChildIds.length
            ? inArray(entries.childId, scope.draftableChildIds)
            : undefined,
        ),
      ),
      orderBy: [desc(entries.date), desc(entries.createdAt)],
      limit: params.limit,
      with: { child: { columns: { name: true } } },
    });

    return rows.map((e) => ({
      id: e.id,
      childId: e.childId,
      child: e.child?.name ?? null,
      date: e.date,
      source: e.source,
      status: e.status,
      title: e.title,
      mood: e.mood,
      highlight: e.highlight,
    }));
  }

  async findNote(userId: string, entryId: string): Promise<NoteDetail | null> {
    const entry = await db.query.entries.findFirst({
      where: eq(entries.id, entryId),
      with: {
        child: { columns: { name: true } },
        items: { orderBy: (i, { asc }) => [asc(i.position)] },
        attachments: { columns: { id: true } },
      },
    });
    if (!entry) return null;

    const [membership] = await db
      .select({ childId: memberships.childId, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.childId, entry.childId),
        ),
      )
      .limit(1);
    if (!membership) return null;
    if (membership.role === "reader" && entry.status !== "published")
      return null;

    return {
      entry: {
        id: entry.id,
        childId: entry.childId,
        childName: entry.child?.name ?? null,
        date: entry.date,
        source: entry.source,
        status: entry.status,
        failureReason: entry.failureReason,
        title: entry.title,
        mood: entry.mood,
        story: entry.story,
        highlight: entry.highlight,
        transcription: entry.transcription,
        uncertainties: entry.uncertainties ?? [],
        pageCount: entry.attachments.length,
      },
      items: entry.items.map((i) => ({ type: i.type, data: i.data })),
    };
  }
}
