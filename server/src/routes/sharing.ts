import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  memberships,
  invitations,
  subscriptions,
  user,
  type MemberRole,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { hasChildRole } from "../access.js";
import { config } from "../config.js";
import { deliverLink } from "../notify.js";
import { getSettings } from "../settings.js";

const ROLES: readonly MemberRole[] = ["admin", "contributor", "reader"];

function inviteUrl(token: string): string {
  return `${config.webBaseUrl}/invite/${token}`;
}

/** Garde : l'appelant doit être admin de l'enfant, sinon 403 (404 si absent). */
async function requireChildAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  childId: string,
): Promise<boolean> {
  const [child] = await db
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  if (!child) {
    reply.code(404).send({ error: "enfant introuvable" });
    return false;
  }
  if (!(await hasChildRole(req.user!.id, childId, "admin"))) {
    reply.code(403).send({ error: "réservé à l'administrateur de l'enfant" });
    return false;
  }
  return true;
}

export async function sharingRoutes(app: FastifyInstance) {
  /* ------------------------- Membres & invitations ---------------------- */

  // Cercle d'un enfant : membres + invitations en attente (admin uniquement).
  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/members",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;

      const members = await db
        .select({
          userId: memberships.userId,
          role: memberships.role,
          name: user.name,
          email: user.email,
          createdAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.childId, req.params.childId))
        .orderBy(memberships.createdAt);

      const pending = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.childId, req.params.childId),
            eq(invitations.status, "pending"),
          ),
        )
        .orderBy(invitations.createdAt);

      return {
        members,
        invitations: pending.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
          expired: i.expiresAt.getTime() < Date.now(),
          url: inviteUrl(i.token),
        })),
      };
    },
  );

  // Inviter un proche (admin).
  app.post<{ Params: { childId: string }; Body: { email?: string; role?: string } }>(
    "/api/children/:childId/invitations",
    { preHandler: requireUser },
    async (req, reply) => {
      const { childId } = req.params;
      if (!(await requireChildAdmin(req, reply, childId))) return;

      const email = req.body?.email?.trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return reply.code(400).send({ error: "email invalide" });
      const role = (req.body?.role ?? "reader") as MemberRole;
      if (!ROLES.includes(role))
        return reply.code(400).send({ error: "rôle invalide" });

      // Déjà membre ? (l'utilisateur existe et a une adhésion sur cet enfant.)
      const [existingUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (existingUser) {
        const [m] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, existingUser.id),
              eq(memberships.childId, childId),
            ),
          )
          .limit(1);
        if (m)
          return reply
            .code(409)
            .send({ error: "cette personne suit déjà cet enfant" });
      }

      const token = randomBytes(24).toString("base64url");
      const { invitationTtlDays } = await getSettings();
      const expiresAt = new Date(
        Date.now() + invitationTtlDays * 24 * 60 * 60 * 1000,
      );
      const [invitation] = await db
        .insert(invitations)
        .values({
          childId,
          email,
          role,
          token,
          invitedBy: req.user!.id,
          expiresAt,
        })
        .returning();

      const url = inviteUrl(token);
      await deliverLink(email, "Invitation à suivre un enfant sur Racontine", url);

      return reply.code(201).send({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        url,
      });
    },
  );

  // Révoquer une invitation en attente (admin de l'enfant concerné).
  app.delete<{ Params: { id: string } }>(
    "/api/invitations/:id",
    { preHandler: requireUser },
    async (req, reply) => {
      const [inv] = await db
        .select({ id: invitations.id, childId: invitations.childId })
        .from(invitations)
        .where(eq(invitations.id, req.params.id))
        .limit(1);
      if (!inv) return reply.code(204).send();
      if (!(await requireChildAdmin(req, reply, inv.childId))) return;
      await db
        .update(invitations)
        .set({ status: "revoked" })
        .where(eq(invitations.id, req.params.id));
      return reply.code(204).send();
    },
  );

  // Changer le rôle d'un membre (admin). Interdit de retirer le dernier admin.
  app.patch<{
    Params: { childId: string; userId: string };
    Body: { role?: string };
  }>(
    "/api/children/:childId/members/:userId",
    { preHandler: requireUser },
    async (req, reply) => {
      const { childId, userId } = req.params;
      if (!(await requireChildAdmin(req, reply, childId))) return;
      const role = (req.body?.role ?? "") as MemberRole;
      if (!ROLES.includes(role))
        return reply.code(400).send({ error: "rôle invalide" });

      if (await wouldOrphanAdmin(childId, userId, role))
        return reply
          .code(400)
          .send({ error: "il doit rester au moins un administrateur" });

      const res = await db
        .update(memberships)
        .set({ role })
        .where(
          and(
            eq(memberships.childId, childId),
            eq(memberships.userId, userId),
          ),
        )
        .returning({ id: memberships.id });
      if (!res.length)
        return reply.code(404).send({ error: "membre introuvable" });
      return reply.code(204).send();
    },
  );

  // Retirer un membre (admin). Interdit de retirer le dernier admin.
  app.delete<{ Params: { childId: string; userId: string } }>(
    "/api/children/:childId/members/:userId",
    { preHandler: requireUser },
    async (req, reply) => {
      const { childId, userId } = req.params;
      if (!(await requireChildAdmin(req, reply, childId))) return;
      if (await wouldOrphanAdmin(childId, userId, null))
        return reply
          .code(400)
          .send({ error: "il doit rester au moins un administrateur" });
      // Retirer l'adhésion ET l'abonnement : sans quoi le proche continuerait de
      // recevoir notifications et e-mails de la timeline malgré l'accès révoqué.
      await db.transaction(async (tx) => {
        await tx
          .delete(memberships)
          .where(
            and(
              eq(memberships.childId, childId),
              eq(memberships.userId, userId),
            ),
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
      return reply.code(204).send();
    },
  );

  /* ----------------------- Réception d'une invitation ------------------- */

  // Aperçu public (le token est la capacité) : ce que le proche va accepter.
  app.get<{ Params: { token: string } }>(
    "/api/invitations/token/:token",
    async (req, reply) => {
      const [inv] = await db
        .select({
          email: invitations.email,
          role: invitations.role,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          childName: children.name,
        })
        .from(invitations)
        .innerJoin(children, eq(children.id, invitations.childId))
        .where(eq(invitations.token, req.params.token))
        .limit(1);
      if (!inv) return reply.code(404).send({ error: "invitation introuvable" });
      return {
        email: inv.email,
        role: inv.role,
        childName: inv.childName,
        status: inv.status,
        expired: inv.expiresAt.getTime() < Date.now(),
      };
    },
  );

  // Accepter : crée l'adhésion pour l'utilisateur connecté (auth requise).
  app.post<{ Params: { token: string } }>(
    "/api/invitations/token/:token/accept",
    { preHandler: requireUser },
    async (req, reply) => {
      const [inv] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, req.params.token))
        .limit(1);
      if (!inv) return reply.code(404).send({ error: "invitation introuvable" });
      // Usage unique : une invitation déjà acceptée (ou révoquée) n'est plus une
      // capacité valide. Sans ça, un lien transféré resterait exploitable par
      // n'importe quel compte jusqu'à l'expiration.
      if (inv.status !== "pending")
        return reply
          .code(410)
          .send({ error: "invitation déjà utilisée ou révoquée" });
      if (inv.expiresAt.getTime() < Date.now())
        return reply.code(410).send({ error: "invitation expirée" });
      // L'invitation est nominative : seul le destinataire (même e-mail) peut
      // l'accepter — le token ne doit pas onboarder un tiers.
      if (req.user!.email.trim().toLowerCase() !== inv.email.toLowerCase())
        return reply.code(403).send({
          error: "cette invitation est destinée à une autre adresse e-mail",
        });

      // Acceptation atomique : on ne crée l'adhésion que si l'invitation est
      // toujours « pending » au moment du commit (garde contre le double usage
      // concurrent). returning() vide ⇒ quelqu'un l'a acceptée entre-temps.
      const accepted = await db.transaction(async (tx) => {
        const marked = await tx
          .update(invitations)
          .set({
            status: "accepted",
            acceptedAt: new Date(),
            acceptedBy: req.user!.id,
          })
          .where(
            and(
              eq(invitations.id, inv.id),
              eq(invitations.status, "pending"),
            ),
          )
          .returning({ id: invitations.id });
        if (!marked.length) return false;
        await tx
          .insert(memberships)
          .values({ userId: req.user!.id, childId: inv.childId, role: inv.role })
          .onConflictDoUpdate({
            target: [memberships.userId, memberships.childId],
            set: { role: inv.role },
          });
        return true;
      });
      if (!accepted)
        return reply
          .code(410)
          .send({ error: "invitation déjà utilisée ou révoquée" });

      return reply.code(200).send({ childId: inv.childId, role: inv.role });
    },
  );
}

/**
 * true si modifier/retirer ce membre laisserait l'enfant sans admin.
 * `nextRole` = null pour une suppression, sinon le futur rôle.
 */
async function wouldOrphanAdmin(
  childId: string,
  userId: string,
  nextRole: MemberRole | null,
): Promise<boolean> {
  const admins = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(eq(memberships.childId, childId), eq(memberships.role, "admin")),
    );
  const isTargetAdmin = admins.some((a) => a.userId === userId);
  if (!isTargetAdmin) return false;
  const remaining = admins.filter((a) => a.userId !== userId).length;
  const keepsAdmin = nextRole === "admin";
  return remaining === 0 && !keepsAdmin;
}
