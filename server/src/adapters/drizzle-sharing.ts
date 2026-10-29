import { and, count, eq, sql } from "drizzle-orm";
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
import {
  roleRank,
  type CircleChange,
  type InvitationRepository,
  type InvitationRow,
  type LinkDelivery,
  type MemberRow,
  type MembershipRepository,
  type UserDirectory,
} from "../services/sharing-service.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockCircle(tx: Tx, childId: string): Promise<void> {
  await tx
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, childId))
    .for("update");
}

async function countAdmins(tx: Tx, childId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.childId, childId), eq(memberships.role, "admin")));
  return row?.n ?? 0;
}

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
  ): Promise<CircleChange> {
    return db.transaction(async (tx) => {
      await lockCircle(tx, childId);
      const [current] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(eq(memberships.childId, childId), eq(memberships.userId, userId)),
        )
        .limit(1);
      if (!current) return "missing";
      if (
        current.role === "admin" &&
        role !== "admin" &&
        (await countAdmins(tx, childId)) <= 1
      )
        return "last-admin";
      await tx
        .update(memberships)
        .set({ role })
        .where(
          and(eq(memberships.childId, childId), eq(memberships.userId, userId)),
        );
      return "ok";
    });
  }

  async remove(childId: string, userId: string): Promise<CircleChange> {
    return db.transaction(async (tx) => {
      await lockCircle(tx, childId);
      const [current] = await tx
        .select({ role: memberships.role, email: user.email })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(
          and(eq(memberships.childId, childId), eq(memberships.userId, userId)),
        )
        .limit(1);
      if (!current) return "missing";
      if (current.role === "admin" && (await countAdmins(tx, childId)) <= 1)
        return "last-admin";
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
      await tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitations.childId, childId),
            eq(invitations.status, "pending"),
            sql`lower(${invitations.email}) = lower(${current.email})`,
          ),
        );
      return "ok";
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

  async nameIfBlank(
    childId: string,
    userId: string,
    name: string,
  ): Promise<"ok" | "missing" | "named"> {
    if (!(await this.isMember(childId, userId))) return "missing";
    const updated = await db
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(user.id, userId), sql`trim(${user.name}) = ''`))
      .returning({ id: user.id });
    return updated.length ? "ok" : "named";
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

  async revoke(id: string): Promise<boolean> {
    const rows = await db
      .update(invitations)
      .set({ status: "revoked" })
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
      .returning({ id: invitations.id });
    return rows.length > 0;
  }

  async revokePendingFor(childId: string, email: string): Promise<void> {
    await db
      .update(invitations)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitations.childId, childId),
          eq(invitations.status, "pending"),
          sql`lower(${invitations.email}) = lower(${email})`,
        ),
      );
  }

  async acceptIfPending(invitationId: string, userId: string): Promise<boolean> {
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
      await lockCircle(tx, inv.childId);
      const [current] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.childId, inv.childId),
            eq(memberships.userId, userId),
          ),
        )
        .limit(1);
      if (!current)
        await tx
          .insert(memberships)
          .values({ userId, childId: inv.childId, role: inv.role });
      else if (roleRank(inv.role) > roleRank(current.role))
        await tx
          .update(memberships)
          .set({ role: inv.role })
          .where(
            and(
              eq(memberships.childId, inv.childId),
              eq(memberships.userId, userId),
            ),
          );
      return true;
    });
  }
}

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

export class NotifyLinkDelivery implements LinkDelivery {
  deliver(to: string, subject: string, url: string): Promise<void> {
    return deliverLink(to, subject, url, "invitation");
  }
}
