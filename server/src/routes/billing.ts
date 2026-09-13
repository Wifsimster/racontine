import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { billingEnabled, config } from "../config.js";
import {
  applyStripeEvent,
  billingState,
  openPortal,
  startCheckout,
  syncFromCheckoutSession,
} from "../billing/index.js";
import { WebhookSignatureError, constructEvent } from "../billing/stripe.js";

/* ===========================================================================
   L'ABONNEMENT, CÔTÉ HTTP — et seulement HTTP.

   Quatre routes pour la famille (lire l'état, payer, gérer, rattraper un retour
   de paiement) et UNE pour Stripe. La règle du péage, elle, est ailleurs :
   `domain/paywall.ts` décide, `billing/` orchestre, ce fichier choisit des codes
   de statut.

   Ce qui n'est PAS ici, et ne doit jamais y venir : la moindre donnée bancaire.
   Racontine ne voit ni numéro de carte, ni cryptogramme, ni adresse de
   facturation — la page de paiement et le portail sont hébergés par Stripe, et
   tout ce que ce fichier fabrique, ce sont deux liens.
   =========================================================================== */

/** Les dates partent en ISO : le front les relit, le JSON ne connaît pas `Date`. */
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

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /**
   * L'état de l'abonnement pour l'appelant. Appelée par l'écran d'accueil : elle
   * doit donc être bon marché et ne JAMAIS faire tomber le journal — une panne
   * de Stripe ne doit pas empêcher de lire le carnet (le tarif retombe à null,
   * l'écran le dit).
   */
  app.get("/api/billing", async (req) => {
    const state = await billingState(req.user!.id);
    return { ...state, access: serializeAccess(state.access) };
  });

  /** Ouvre la page de paiement Stripe (propriétaire du foyer uniquement). */
  app.post("/api/billing/checkout", async (req, reply) => {
    const link = await startCheckout(req.user!.id);
    if (!link.ok) return reply.code(link.httpCode).send({ error: link.error });
    return { url: link.url };
  });

  /** Ouvre le portail Stripe : carte, factures, résiliation. */
  app.post("/api/billing/portal", async (req, reply) => {
    const link = await openPortal(req.user!.id);
    if (!link.ok) return reply.code(link.httpCode).send({ error: link.error });
    return { url: link.url };
  });

  /**
   * RATTRAPAGE AU RETOUR DE PAIEMENT. Le webhook est la vérité, mais il arrive
   * parfois quelques secondes après le parent : sans cette route, l'écran
   * d'arrivée dirait « essai terminé » à quelqu'un qui vient de payer. Le front
   * la rappelle avec l'identifiant de session rendu par Stripe.
   */
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

/**
 * LA ROUTE DE STRIPE — encapsulée, parce qu'elle a besoin du CORPS BRUT.
 *
 * La signature se calcule sur les octets reçus : un corps déjà analysé puis
 * re-sérialisé (`JSON.stringify(req.body)`) change un espace ou un ordre de clé,
 * et plus aucune signature ne correspond. Le parseur brut ne vaut donc que pour
 * ce plugin — les autres routes gardent le JSON de Fastify.
 *
 * Elle est publique par nature (Stripe n'a pas de session), et c'est
 * exactement pourquoi la signature n'est pas négociable : sans elle, l'URL
 * suffirait à n'importe qui pour s'offrir un abonnement à vie en postant
 * `{"status":"active"}`.
 */
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
      /* On répond 500 EXPRÈS : Stripe rejoue alors l'événement (pendant trois
         jours, en espaçant). Répondre 200 sur un échec perdrait définitivement
         une résiliation ou un renouvellement — et le foyer le découvrirait au
         plus mauvais moment, des deux côtés. */
      req.log.error(
        { err: err instanceof Error ? err.message : String(err), event: event.type },
        "webhook Stripe non appliqué",
      );
      return reply.code(500).send({ error: "événement non appliqué" });
    }
  });
}

/** Horodatage de l'événement Stripe (`created`), s'il est lisible. */
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
