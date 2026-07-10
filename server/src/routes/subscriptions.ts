import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  subscriptions,
  notifications,
  children,
  user,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";

export async function subscriptionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /* --------------------------- Abonnements ------------------------------ */

  /** Statut d'abonnement de l'utilisateur courant pour un enfant. */
  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/subscription",
    async (req) => {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.childId, req.params.childId),
            eq(subscriptions.userId, req.user!.id),
          ),
        )
        .limit(1);
      return {
        subscribed: !!sub,
        emailEnabled: sub?.emailEnabled ?? true,
      };
    },
  );

  /** S'abonner (ou mettre à jour la préférence e-mail). Idempotent. */
  app.put<{
    Params: { childId: string };
    Body: { emailEnabled?: boolean };
  }>("/api/children/:childId/subscription", async (req, reply) => {
    const { childId } = req.params;
    const emailEnabled = req.body?.emailEnabled ?? true;

    const [child] = await db
      .select({ id: children.id })
      .from(children)
      .where(eq(children.id, childId))
      .limit(1);
    if (!child) return reply.code(404).send({ error: "enfant introuvable" });

    await db
      .insert(subscriptions)
      .values({ userId: req.user!.id, childId, emailEnabled })
      .onConflictDoUpdate({
        target: [subscriptions.userId, subscriptions.childId],
        set: { emailEnabled },
      });

    return { subscribed: true, emailEnabled };
  });

  /** Se désabonner. */
  app.delete<{ Params: { childId: string } }>(
    "/api/children/:childId/subscription",
    async (req, reply) => {
      await db
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.childId, req.params.childId),
            eq(subscriptions.userId, req.user!.id),
          ),
        );
      return reply.code(204).send();
    },
  );

  /** Liste des proches abonnés à la timeline d'un enfant. */
  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/subscribers",
    async (req) => {
      const rows = await db
        .select({
          userId: subscriptions.userId,
          name: user.name,
          email: user.email,
          emailEnabled: subscriptions.emailEnabled,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .innerJoin(user, eq(subscriptions.userId, user.id))
        .where(eq(subscriptions.childId, req.params.childId))
        .orderBy(subscriptions.createdAt);
      return { subscribers: rows };
    },
  );

  /* -------------------------- Notifications ----------------------------- */

  /** Notifications in-app de l'utilisateur courant + nombre de non-lues. */
  app.get<{ Querystring: { limit?: string } }>(
    "/api/notifications",
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, req.user!.id),
            isNull(notifications.readAt),
          ),
        );

      return { notifications: rows, unread: count };
    },
  );

  /** Marque une notification comme lue. */
  app.post<{ Params: { id: string } }>(
    "/api/notifications/:id/read",
    async (req, reply) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, req.params.id),
            eq(notifications.userId, req.user!.id),
          ),
        );
      return reply.code(204).send();
    },
  );

  /** Marque toutes les notifications comme lues. */
  app.post("/api/notifications/read-all", async (req, reply) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, req.user!.id),
          isNull(notifications.readAt),
        ),
      );
    return reply.code(204).send();
  });
}
