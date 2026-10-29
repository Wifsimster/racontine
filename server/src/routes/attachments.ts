import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pages } from "../composition.js";
import { requireUser } from "../plugins/auth.js";
import { resolveUpload } from "../storage.js";
import { attachmentUrls } from "./attachment-urls.js";

export async function attachmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    "/api/attachments/:id",
    async (req, reply) => {
      const file = await pages.openForRead(
        req.user!.id,
        req.params.id,
        req.query.size === "thumb",
      );
      if (!file)
        return reply.code(404).send({ error: "pièce jointe introuvable" });

      const abs = resolveUpload(file.relPath);
      try {
        await stat(abs);
      } catch {
        return reply.code(404).send({ error: "fichier absent" });
      }

      reply.header("Content-Type", file.mime);
      reply.header("Cache-Control", "private, max-age=31536000, immutable");
      return reply.send(createReadStream(abs));
    },
  );

  app.post<{ Params: { id: string }; Body: { quarter?: number } }>(
    "/api/attachments/:id/rotate",
    async (req, reply) => {
      const result = await pages.rotate({
        userId: req.user!.id,
        attachmentId: req.params.id,
        quarter: req.body?.quarter ?? 1,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });

      return reply.send({
        id: result.id,
        ...attachmentUrls({ id: result.id, rotation: result.rotation }),
        width: result.width,
        height: result.height,
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/attachments/:id",
    async (req, reply) => {
      const result = await pages.remove(req.user!.id, req.params.id);
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(204).send();
    },
  );
}
