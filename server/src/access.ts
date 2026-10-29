import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  children,
  memberships,
  entries,
  user,
  type MemberRole,
} from "./db/schema.js";

const RANK: Record<MemberRole, number> = {
  reader: 1,
  contributor: 2,
  admin: 3,
};

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min];
}

export async function accessibleChildIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ childId: memberships.childId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return rows.map((r) => r.childId);
}

export async function canContributeSomewhere(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ childId: memberships.childId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        inArray(memberships.role, ["contributor", "admin"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

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

export async function hasChildRole(
  userId: string,
  childId: string,
  min: MemberRole,
): Promise<boolean> {
  const role = await childRole(userId, childId);
  return role != null && roleAtLeast(role, min);
}

export async function isChildAdminSomewhere(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "admin")))
    .limit(1);
  return Boolean(row);
}

export async function ownerUserId(): Promise<string | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1);
  return row?.id ?? null;
}

export async function isOwner(userId: string): Promise<boolean> {
  const owner = await ownerUserId();
  return owner != null && owner === userId;
}

export async function childExists(childId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  return Boolean(row);
}

export async function entryChildId(entryId: string): Promise<string | null> {
  const [row] = await db
    .select({ childId: entries.childId })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  return row?.childId ?? null;
}

export type AccessVerdict =
  | { ok: true }
  | { ok: false; httpCode: number; error: string };

export async function requireChildAdminAccess(
  userId: string,
  childId: string,
): Promise<AccessVerdict> {
  if (!(await childExists(childId)))
    return { ok: false, httpCode: 404, error: "enfant introuvable" };
  if (!(await hasChildRole(userId, childId, "admin")))
    return {
      ok: false,
      httpCode: 403,
      error: "réservé à l'administrateur de l'enfant",
    };
  return { ok: true };
}

export interface ChildAdminAccess {
  requireAdmin(userId: string, childId: string): Promise<AccessVerdict>;
}
