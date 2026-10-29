import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { dbHealthy } from "./db/index.js";
import { config, validateConfig } from "./config.js";
import { describeFailure, redactUrl } from "./log.js";
import { authPlugin } from "./plugins/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { entriesRoutes } from "./routes/entries.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { sharingRoutes } from "./routes/sharing.js";
import { subscriptionsRoutes } from "./routes/subscriptions.js";
import { pushRoutes } from "./routes/push.js";
import { billingPublicRoutes, billingRoutes, billingWebhookRoutes } from "./routes/billing.js";
import { settingsRoutes } from "./routes/settings.js";
import { mcpRoutes } from "./routes/mcp.js";
import { privacyRoutes } from "./routes/privacy.js";

const COSTLY_ROUTES = [
  /^\/api\/entries\/ingest\b/,
  /^\/api\/mcp\/uploads\b/,
  /^\/api\/invitations\/token\//,
  /^\/api\/mcp(\?|$)/,
  /^\/api\/me\/export\b/,
];

export async function buildApp() {
  validateConfig();

  const app = Fastify({
    trustProxy: config.trustedProxies,
    logger: {
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: redactUrl(req.url),
            host: req.host,
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort,
          };
        },
      },
    },
  });

  await app.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    max: (req) => (COSTLY_ROUTES.some((re) => re.test(req.url)) ? 30 : 600),
    allowList: (req) => req.url === "/api/health",
    errorResponseBuilder: (_req, ctx) => {
      const err = new Error(
        `Trop de requêtes. Réessayez dans ${Math.ceil(ctx.ttl / 1000)} s.`,
      ) as Error & { statusCode: number };
      err.statusCode = ctx.statusCode;
      return err;
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 12,
    },
  });

  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 32 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.setErrorHandler((err: unknown, req, reply) => {
    const { status, body, severity } = describeFailure(err);
    if (severity === "error") req.log.error({ err }, "Erreur non rattrapée");
    else req.log.warn({ err, status }, "Requête refusée");
    return reply.code(status).send(body);
  });

  app.get("/api/health", async () => ({
    status: "ok",
    db: (await dbHealthy()) ? "up" : "down",
  }));

  await app.register(authPlugin);

  await app.register(entriesRoutes);
  await app.register(attachmentsRoutes);
  await app.register(sharingRoutes);
  await app.register(adminRoutes);
  await app.register(subscriptionsRoutes);
  await app.register(pushRoutes);
  await app.register(settingsRoutes);
  await app.register(privacyRoutes);
  await app.register(billingPublicRoutes);
  await app.register(billingRoutes);
  await app.register(billingWebhookRoutes);
  await app.register(mcpRoutes);

  return app;
}
