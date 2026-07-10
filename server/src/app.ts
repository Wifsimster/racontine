import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { dbHealthy } from "./db/index.js";
import { config } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { entriesRoutes } from "./routes/entries.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { subscriptionsRoutes } from "./routes/subscriptions.js";

export async function buildApp() {
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

  app.get("/api/health", async () => ({
    status: "ok",
    db: (await dbHealthy()) ? "up" : "down",
  }));

  // Better Auth (email/password) — plugin encapsulé (corps brut).
  await app.register(authPlugin);

  // Routes métier (protégées par requireUser).
  await app.register(entriesRoutes);
  await app.register(attachmentsRoutes);
  await app.register(subscriptionsRoutes);

  return app;
}
