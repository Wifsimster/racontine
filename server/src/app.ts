import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { dbHealthy } from "./db.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // photos de carnet jusqu'à 20 Mo
  });

  app.get("/api/health", async () => ({
    status: "ok",
    db: (await dbHealthy()) ? "up" : "down",
  }));

  // À venir (Phase 1) :
  // - POST /api/entries/ingest : upload photo(s) → extraction VLM → brouillon
  // - GET  /api/entries        : timeline du journal
  // - PATCH /api/entries/:id   : relecture/correction puis publication

  return app;
}
