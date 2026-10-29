import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, entries, memberships } from "../db/schema.js";
import { roleAtLeast } from "../access.js";
import type { StuckNote } from "../domain/ops-status.js";

export interface OpsQueries {
  stuckNotes(userId: string, limit: number): Promise<StuckNote[]>;
}

export class DrizzleOpsQueries implements OpsQueries {
  async stuckNotes(userId: string, limit: number): Promise<StuckNote[]> {
    const mems = await db
      .select({ childId: memberships.childId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    const childIds = mems
      .filter((m) => roleAtLeast(m.role, "contributor"))
      .map((m) => m.childId);
    if (!childIds.length) return [];

    const rows = await db
      .select({
        id: entries.id,
        childId: entries.childId,
        child: children.name,
        date: entries.date,
        status: entries.status,
        failureReason: entries.failureReason,
        since: entries.updatedAt,
      })
      .from(entries)
      .innerJoin(children, eq(children.id, entries.childId))
      .where(
        and(
          inArray(entries.childId, childIds),
          inArray(entries.status, ["failed", "processing"]),
        ),
      )
      .orderBy(desc(entries.updatedAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      childId: r.childId,
      child: r.child,
      date: r.date,
      status: r.status as StuckNote["status"],
      failureReason: r.failureReason,
      since: r.since,
    }));
  }
}
