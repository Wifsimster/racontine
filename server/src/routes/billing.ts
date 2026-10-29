import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { billingEnabled, config } from "../config.js";
import {
  applyStripeEvent,
  billingState,
  openPortal,
  planPrice,
  startCheckout,
  syncFromCheckoutSession,
} from "../billing/index.js";
import { TRIAL_DAYS } from "../domain/paywall.js";
import { WebhookSignatureError, constructEvent } from "../billing/stripe.js";

function serializeAccess(access: {
  open: boolean;
  reason: string;
  daysLeft: number | null;
  until: Date | null;
  endingAt: Date | null;
}) {
  return {
    ...access,
    until: access.until?.toISOString() ?? null,
    endingAt: access.endingAt?.toISOString() ?? null,
  };
}

export async function billingPublicRoutes(app: FastifyInstance) {
  app.get("/api/billing/offer", async () => {
    const enabled = billingEnabled();
    return {
      enabled,
      price: enabled ? await planPrice() : null,
      trialDays: TRIAL_DAYS,
    };
  });
}

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get("/api/billing", async (req) => {
    const state = await billingState(req.user!.id);
    return { ...state, access: serializeAccess(state.access) };
  });

  app.post("/api/billing/checkout", async (req, reply) => {
    const link = await startCheckout(req.user!.id);
    if (!link.ok) return reply.code(link.httpCode).send({ error: link.error });
    return { url: link.url };
  });

  app.post("/api/billing/portal", async (req, reply) => {
    const link = await openPortal(req.user!.id);
    if (!link.ok) return reply.code(link.httpCode).send({ error: link.error });
    return { url: link.url };
  });

  app.post<{ Body: { session?: unknown } }>(
    "/api/billing/sync",
    async (req, reply) => {
      const session = (req.body ?? {}).session;
      if (typeof session !== "string" || !session.startsWith("cs_"))
        return reply.code(400).send({ error: "session de paiement invalide" });
      const synced = await syncFromCheckoutSession(session);
      const state = await billingState(req.user!.id);
      return { synced, ...state, access: serializeAccess(state.access) };
    },
  );
}

export async function billingWebhookRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post("/api/billing/webhook", async (req, reply) => {
    if (!billingEnabled() || !config.billing.webhookSecret)
      return reply
        .code(404)
        .send({ error: "aucun encaissement configuré sur cette instance" });

    let event: ReturnType<typeof constructEvent>;
    try {
      event = constructEvent(
        req.body as Buffer,
        req.headers["stripe-signature"] as string | undefined,
        config.billing.webhookSecret,
      );
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        req.log.warn({ err: err.message }, "webhook Stripe refusé");
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }

    const created = (req.body as Buffer).length
      ? eventCreatedAt(req.body as Buffer)
      : null;

    try {
      const result = await applyStripeEvent({ ...event, createdAt: created });
      req.log.info(
        { event: event.type, applied: result.applied, reason: result.reason },
        "webhook Stripe",
      );
      return { received: true };
    } catch (err) {
      req.log.error(
        { err: err instanceof Error ? err.message : String(err), event: event.type },
        "webhook Stripe non appliqué",
      );
      return reply.code(500).send({ error: "événement non appliqué" });
    }
  });
}

function eventCreatedAt(raw: Buffer): Date | null {
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as { created?: unknown };
    return typeof parsed.created === "number"
      ? new Date(parsed.created * 1000)
      : null;
  } catch {
    return null;
  }
}
