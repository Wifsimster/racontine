import { and, asc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  entries,
  invitations,
  memberships,
  user,
} from "../db/schema.js";
import { ownerUserId } from "../access.js";
import type {
  AdminChild,
  AdminEntryCount,
  AdminInvitation,
  AdminMembership,
  AdminRepository,
} from "../services/admin-service.js";

/**
 * Les lectures de la console d'administration, en Postgres. Toutes prennent la
 * liste des enfants administrés en paramètre : le périmètre est décidé UNE fois
 * (par `administeredChildren`), et aucune requête d'ici ne peut le déborder.
 */
export class DrizzleAdminRepository implements AdminRepository {
  async administeredChildren(userId: string): Promise<AdminChild[]> {
    return db
      .select({
        id: children.id,
        name: children.name,
        birthdate: children.birthdate,
      })
      .from(memberships)
      .innerJoin(children, eq(children.id, memberships.childId))
      .where(
        and(eq(memberships.userId, userId), eq(memberships.role, "admin")),
      )
      .orderBy(asc(children.name));
  }

  async members(childIds: string[]): Promise<AdminMembership[]> {
    if (childIds.length === 0) return [];
    const rows = await db
      .select({
        childId: memberships.childId,
        userId: memberships.userId,
        role: memberships.role,
        name: user.name,
        email: user.email,
        since: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(inArray(memberships.childId, childIds))
      .orderBy(asc(memberships.createdAt));
    return rows.map((r) => ({ ...r, name: r.name ?? "", email: r.email ?? "" }));
  }

  async entryCounts(childIds: string[]): Promise<AdminEntryCount[]> {
    if (childIds.length === 0) return [];
    return db
      .select({
        childId: entries.childId,
        status: entries.status,
        count: sql<number>`count(*)::int`,
      })
      .from(entries)
      .where(inArray(entries.childId, childIds))
      .groupBy(entries.childId, entries.status);
  }

  async lastPublished(
    childIds: string[],
  ): Promise<{ childId: string; at: Date }[]> {
    if (childIds.length === 0) return [];
    const rows = await db
      .select({
        childId: entries.childId,
        // `max()` de Drizzle, et non un `sql` brut : lui seul repasse la valeur
        // par le décodeur de la colonne, et rend donc une Date là où le SQL nu
        // rendrait ce que le pilote a bien voulu.
        at: max(entries.publishedAt),
      })
      .from(entries)
      .where(
        and(
          inArray(entries.childId, childIds),
          isNotNull(entries.publishedAt),
        ),
      )
      .groupBy(entries.childId);
    return rows.filter((r): r is { childId: string; at: Date } => r.at != null);
  }

  async pendingInvitations(childIds: string[]): Promise<AdminInvitation[]> {
    if (childIds.length === 0) return [];
    return db
      .select({
        id: invitations.id,
        childId: invitations.childId,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          inArray(invitations.childId, childIds),
          eq(invitations.status, "pending"),
        ),
      )
      .orderBy(asc(invitations.expiresAt));
  }

  async ownerId(): Promise<string | null> {
    return ownerUserId();
  }
}
