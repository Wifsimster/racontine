import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { pushSubscriptions } from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { vapidPublicKey } from "../push.js";

// Un abonnement PushSubscription tel que sérialisé par le navigateur
// (`subscription.toJSON()`). On ne retient que ce dont web-push a besoin.
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function pushRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /**
   * Clé publique VAPID (ou null si le push est désactivé côté serveur). Le
   * client s'en sert comme `applicationServerKey` pour s'abonner ; elle n'est
   * pas secrète.
   */
  app.get("/api/push/public-key", async () => {
    return { publicKey: vapidPublicKey() };
  });

  /**
   * Enregistre (ou réattribue) l'abonnement push de l'appareil courant.
   * Idempotent : l'endpoint est unique — on met à jour les clés et le
   * propriétaire s'il est déjà connu (un appareil partagé change de compte).
   */
  app.post("/api/push/subscribe", async (req, reply) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "abonnement push invalide" });

    const { endpoint, keys } = parsed.data;
    await db
      .insert(pushSubscriptions)
      .values({
        userId: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
      });

    return reply.code(204).send();
  });

  /** Supprime l'abonnement push de l'appareil courant (par endpoint). */
  app.post("/api/push/unsubscribe", async (req, reply) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "endpoint invalide" });

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, parsed.data.endpoint),
          eq(pushSubscriptions.userId, req.user!.id),
        ),
      );

    return reply.code(204).send();
  });
}
