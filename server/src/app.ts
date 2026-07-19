import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { dbHealthy } from "./db/index.js";
import { config, validateConfig } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { entriesRoutes } from "./routes/entries.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { sharingRoutes } from "./routes/sharing.js";
import { subscriptionsRoutes } from "./routes/subscriptions.js";
import { pushRoutes } from "./routes/push.js";
import { settingsRoutes } from "./routes/settings.js";
import { mcpRoutes } from "./routes/mcp.js";

export async function buildApp() {
  validateConfig();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // photos de carnet jusqu'à 20 Mo
      files: 12, // un carnet tient largement en 12 pages/jour
    },
  });

  // Corps binaire brut pour la mise en attente d'une page (POST /api/mcp/uploads) :
  // le client envoie les octets tels quels, sans multipart ni base64. Aucune
  // autre route n'attend ce type de contenu, le parseur global est donc sûr.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 32 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.get("/api/health", async () => ({
    status: "ok",
    db: (await dbHealthy()) ? "up" : "down",
  }));

  // Better Auth (email/password) — plugin encapsulé (corps brut).
  await app.register(authPlugin);

  // Routes métier (protégées par requireUser).
  await app.register(entriesRoutes);
  await app.register(attachmentsRoutes);
  await app.register(sharingRoutes);
  await app.register(subscriptionsRoutes);
  await app.register(pushRoutes);
  await app.register(settingsRoutes);
  await app.register(mcpRoutes);

  return app;
}
