import { and, asc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  children,
  memberships,
  entries,
  user,
  type MemberRole,
} from "./db/schema.js";

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
 * Cet utilisateur administre-t-il au moins un enfant ? C'est la porte de la
 * console d'administration : le rôle `admin` se porte PAR ENFANT, il n'existe
 * pas d'administrateur d'instance en dehors du propriétaire (voir plus bas).
 * Un parent pivot en tient donc la clé, sur ses carnets à lui — et sur eux
 * seuls, car chaque lecture de la console redemande son périmètre.
 */
export async function isChildAdminSomewhere(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "admin")))
    .limit(1);
  return Boolean(row);
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

/** Cet enfant existe-t-il ? (404 contre 403 : une garde d'administration.) */
export async function childExists(childId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  return Boolean(row);
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

/* ===========================================================================
   LA GARDE DES GESTES DU CERCLE — admin de CET enfant, et de lui seul.

   Inviter un proche, changer son rôle, le retirer, révoquer une invitation :
   quatre gestes, une seule porte. Elle vivait dans `routes/sharing.ts`, écrite
   en termes de `reply.code()` — donc impossible à réutiliser pour les outils
   MCP, qui font les mêmes gestes sans requête HTTP. Elle rend maintenant un
   verdict que chaque protocole traduit à sa façon, et le message français n'a
   qu'une seule version.
   =========================================================================== */

/** Verdict d'une garde : passe, ou refus déjà porteur de son code HTTP. */
export type AccessVerdict =
  | { ok: true }
  | { ok: false; httpCode: number; error: string };

/**
 * L'appelant administre-t-il cet enfant ? Distingue l'enfant absent (404) de
 * l'enfant qu'on n'administre pas (403) : les identifiants sont des UUID, donc
 * inendevinables, et un administrateur qui se trompe de carnet mérite de savoir
 * lequel des deux problèmes il a.
 */
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

/** La même garde, vue comme un port : ce dont un outil MCP a besoin. */
export interface ChildAdminAccess {
  requireAdmin(userId: string, childId: string): Promise<AccessVerdict>;
}
