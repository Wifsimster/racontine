import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  subscriptions,
  notifications,
  user,
  type SubscriptionCadence,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { hasChildRole } from "../access.js";

const CADENCES: readonly SubscriptionCadence[] = ["chaque", "hebdo"];

function isCadence(value: unknown): value is SubscriptionCadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}

export async function subscriptionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

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
        cadence: sub?.cadence ?? "chaque",
      };
    },
  );

  app.put<{
    Params: { childId: string };
    Body: { emailEnabled?: unknown; cadence?: unknown };
  }>("/api/children/:childId/subscription", async (req, reply) => {
    const { childId } = req.params;
    const body = req.body ?? {};
    if (body.emailEnabled !== undefined && typeof body.emailEnabled !== "boolean")
      return reply.code(400).send({ error: "emailEnabled invalide" });
    if (body.cadence !== undefined && !isCadence(body.cadence))
      return reply.code(400).send({ error: "cadence invalide" });

    if (!(await hasChildRole(req.user!.id, childId, "reader")))
      return reply.code(404).send({ error: "enfant introuvable" });

    const changes: { emailEnabled?: boolean; cadence?: SubscriptionCadence } = {};
    if (typeof body.emailEnabled === "boolean") changes.emailEnabled = body.emailEnabled;
    if (isCadence(body.cadence)) changes.cadence = body.cadence;

    const [row] = await db
      .insert(subscriptions)
      .values({ userId: req.user!.id, childId, ...changes })
      .onConflictDoUpdate({
        target: [subscriptions.userId, subscriptions.childId],
        set: Object.keys(changes).length ? changes : { childId },
      })
      .returning({
        emailEnabled: subscriptions.emailEnabled,
        cadence: subscriptions.cadence,
      });

    return { subscribed: true, emailEnabled: row.emailEnabled, cadence: row.cadence };
  });

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

  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/subscribers",
    async (req, reply) => {
      if (!(await hasChildRole(req.user!.id, req.params.childId, "admin")))
        return reply.code(404).send({ error: "enfant introuvable" });

      const rows = await db
        .select({
          userId: subscriptions.userId,
          name: user.name,
          email: user.email,
          emailEnabled: subscriptions.emailEnabled,
          cadence: subscriptions.cadence,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .innerJoin(user, eq(subscriptions.userId, user.id))
        .where(eq(subscriptions.childId, req.params.childId))
        .orderBy(subscriptions.createdAt);
      return { subscribers: rows };
    },
  );

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
