import { and, asc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { memberships, entries, user, type MemberRole } from "./db/schema.js";

/** Hiérarchie des rôles : un rôle « ≥ » englobe les droits des rôles inférieurs. */
const RANK: Record<MemberRole, number> = {
  reader: 1,
  contributor: 2,
  admin: 3,
};

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min];
}

/** Les enfants auxquels l'utilisateur a accès (n'importe quel rôle). */
export async function accessibleChildIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ childId: memberships.childId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return rows.map((r) => r.childId);
}

/** Rôle de l'utilisateur sur un enfant, ou null s'il n'y a pas accès. */
export async function childRole(
  userId: string,
  childId: string,
): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.childId, childId)),
    )
    .limit(1);
  return row?.role ?? null;
}

/** true si l'utilisateur détient au moins le rôle `min` sur l'enfant. */
export async function hasChildRole(
  userId: string,
  childId: string,
  min: MemberRole,
): Promise<boolean> {
  const role = await childRole(userId, childId);
  return role != null && roleAtLeast(role, min);
}

/**
 * Propriétaire de l'instance = le premier compte créé (celui qui a installé
 * Racontine sur son homelab et gère les réglages). Déterministe et auto-amorcé :
 * pas de colonne d'appartenance à migrer, pas d'étape de bootstrap manuelle.
 * Départage une éventuelle égalité de `createdAt` par l'id pour rester stable.
 */
export async function ownerUserId(): Promise<string | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1);
  return row?.id ?? null;
}

/** true si l'utilisateur est le propriétaire de l'instance. */
export async function isOwner(userId: string): Promise<boolean> {
  const owner = await ownerUserId();
  return owner != null && owner === userId;
}

/** Enfant porteur d'une entrée (pour autoriser par entrée). */
export async function entryChildId(entryId: string): Promise<string | null> {
  const [row] = await db
    .select({ childId: entries.childId })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  return row?.childId ?? null;
}
