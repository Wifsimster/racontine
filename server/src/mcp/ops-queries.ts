import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, entries, memberships } from "../db/schema.js";
import { roleAtLeast } from "../access.js";
import type { StuckNote } from "../domain/ops-status.js";

/* ===========================================================================
   LES LECTURES D'EXPLOITATION — ce qui coince, et rien d'autre.

   Un port à part de `EntryQueries` : lister les journées d'un carnet et
   inventorier les lectures mortes ne changent pas pour les mêmes raisons, et un
   outil qui ne fait que publier un brouillon n'a aucune raison de dépendre de
   celles-ci.
   =========================================================================== */

export interface OpsQueries {
  /**
   * Les journées en échec ou en lecture, sur les carnets où l'appelant peut
   * agir (contributeur au minimum : relancer une lecture consomme SA clé API).
   * Les plus récemment remuées d'abord.
   */
  stuckNotes(userId: string, limit: number): Promise<StuckNote[]>;
}

/** Les mêmes lectures, en Postgres. */
export class DrizzleOpsQueries implements OpsQueries {
  async stuckNotes(userId: string, limit: number): Promise<StuckNote[]> {
    const mems = await db
      .select({ childId: memberships.childId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    // Un lecteur ne voit ni brouillon ni échec : ces journées n'existent pas
    // pour lui, et l'exploitation n'est pas une porte dérobée vers le non-publié.
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
