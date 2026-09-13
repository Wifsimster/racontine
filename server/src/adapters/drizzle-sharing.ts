import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  invitations,
  memberships,
  subscriptions,
  user,
  type MemberRole,
} from "../db/schema.js";
import { deliverLink } from "../notify.js";
import type {
  InvitationRepository,
  InvitationRow,
  LinkDelivery,
  MemberRow,
  MembershipRepository,
  UserDirectory,
} from "../services/sharing-service.js";

/** Les adhésions au cercle d'un enfant, en Postgres. */
export class DrizzleMembershipRepository implements MembershipRepository {
  async listMembers(childId: string): Promise<MemberRow[]> {
    const rows = await db
      .select({
        userId: memberships.userId,
        role: memberships.role,
        name: user.name,
        email: user.email,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.childId, childId))
      .orderBy(memberships.createdAt);
    return rows.map((r) => ({ ...r, name: r.name ?? "", email: r.email ?? "" }));
  }

  async adminIds(childId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(eq(memberships.childId, childId), eq(memberships.role, "admin")),
      );
    return rows.map((r) => r.userId);
  }

  async setRole(
    childId: string,
    userId: string,
    role: MemberRole,
  ): Promise<boolean> {
    const rows = await db
      .update(memberships)
      .set({ role })
      .where(
        and(eq(memberships.childId, childId), eq(memberships.userId, userId)),
      )
      .returning({ id: memberships.id });
    return rows.length > 0;
  }

  async remove(childId: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(memberships)
        .where(
          and(eq(memberships.childId, childId), eq(memberships.userId, userId)),
        );
      await tx
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.childId, childId),
            eq(subscriptions.userId, userId),
          ),
        );
    });
  }

  async upsert(
    childId: string,
    userId: string,
    role: MemberRole,
  ): Promise<void> {
    await db
      .insert(memberships)
      .values({ userId, childId, role })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.childId],
        set: { role },
      });
  }

  async isMember(childId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(eq(memberships.userId, userId), eq(memberships.childId, childId)),
      )
      .limit(1);
    return Boolean(row);
  }
}

/** Les invitations, en Postgres. */
export class DrizzleInvitationRepository implements InvitationRepository {
  async listPending(childId: string): Promise<InvitationRow[]> {
    return db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.childId, childId),
          eq(invitations.status, "pending"),
        ),
      )
      .orderBy(invitations.createdAt);
  }

  async create(row: {
    childId: string;
    email: string;
    role: MemberRole;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<InvitationRow> {
    const [created] = await db.insert(invitations).values(row).returning();
    return created;
  }

  async findById(id: string): Promise<InvitationRow | null> {
    const [row] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByToken(
    token: string,
  ): Promise<(InvitationRow & { childName: string }) | null> {
    const [row] = await db
      .select({
        id: invitations.id,
        childId: invitations.childId,
        email: invitations.email,
        role: invitations.role,
        token: invitations.token,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        childName: children.name,
      })
      .from(invitations)
      .innerJoin(children, eq(children.id, invitations.childId))
      .where(eq(invitations.token, token))
      .limit(1);
    return row ?? null;
  }

  async revoke(id: string): Promise<void> {
    await db
      .update(invitations)
      .set({ status: "revoked" })
      .where(eq(invitations.id, id));
  }

  async acceptIfPending(invitationId: string, userId: string): Promise<boolean> {
    // Acceptation atomique : l'adhésion n'est créée que si l'invitation est
    // TOUJOURS « pending » au moment du commit (garde contre le double usage
    // concurrent). `returning()` vide ⇒ quelqu'un l'a acceptée entre-temps.
    return db.transaction(async (tx) => {
      const [inv] = await tx
        .update(invitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: userId,
        })
        .where(
          and(eq(invitations.id, invitationId), eq(invitations.status, "pending")),
        )
        .returning({ childId: invitations.childId, role: invitations.role });
      if (!inv) return false;
      await tx
        .insert(memberships)
        .values({ userId, childId: inv.childId, role: inv.role })
        .onConflictDoUpdate({
          target: [memberships.userId, memberships.childId],
          set: { role: inv.role },
        });
      return true;
    });
  }
}

/** Les comptes, par adresse e-mail. */
export class DrizzleUserDirectory implements UserDirectory {
  async findIdByEmail(email: string): Promise<string | null> {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return row?.id ?? null;
  }
}

/** La remise d'un lien de capacité (e-mail ou webhook), jamais par les logs. */
export class NotifyLinkDelivery implements LinkDelivery {
  deliver(to: string, subject: string, url: string): Promise<void> {
    return deliverLink(to, subject, url);
  }
}
