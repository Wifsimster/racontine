import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachments } from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { resolveUpload } from "../storage.js";

export async function attachmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    "/api/attachments/:id",
    async (req, reply) => {
      const [att] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, req.params.id))
        .limit(1);
      if (!att) return reply.code(404).send({ error: "pièce jointe introuvable" });

      const wantsThumb = req.query.size === "thumb" && att.thumbPath;
      const relPath = wantsThumb ? att.thumbPath! : att.originalPath;
      const abs = resolveUpload(relPath);

      try {
        await stat(abs);
      } catch {
        return reply.code(404).send({ error: "fichier absent" });
      }

      reply.header("Content-Type", att.mime);
      reply.header("Cache-Control", "private, max-age=31536000, immutable");
      return reply.send(createReadStream(abs));
    },
  );
}
