import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachments, entries } from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { childRole, hasChildRole } from "../access.js";
import { deleteStored, resolveUpload } from "../storage.js";

export async function attachmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    "/api/attachments/:id",
    async (req, reply) => {
      const [att] = await db
        .select({
          id: attachments.id,
          thumbPath: attachments.thumbPath,
          originalPath: attachments.originalPath,
          mime: attachments.mime,
          childId: entries.childId,
          status: entries.status,
        })
        .from(attachments)
        .innerJoin(entries, eq(entries.id, attachments.entryId))
        .where(eq(attachments.id, req.params.id))
        .limit(1);
      if (!att) return reply.code(404).send({ error: "pièce jointe introuvable" });

      // Autorisation par enfant : sans rôle, 404 (on ne révèle pas l'existence).
      const role = await childRole(req.user!.id, att.childId);
      if (!role || (role === "reader" && att.status !== "published"))
        return reply.code(404).send({ error: "pièce jointe introuvable" });

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

  app.delete<{ Params: { id: string } }>(
    "/api/attachments/:id",
    async (req, reply) => {
      const [att] = await db
        .select({
          id: attachments.id,
          entryId: attachments.entryId,
          originalPath: attachments.originalPath,
          thumbPath: attachments.thumbPath,
          childId: entries.childId,
          status: entries.status,
        })
        .from(attachments)
        .innerJoin(entries, eq(entries.id, attachments.entryId))
        .where(eq(attachments.id, req.params.id))
        .limit(1);
      if (!att) return reply.code(404).send({ error: "pièce jointe introuvable" });

      // Retirer une page du carnet exige contributor+ sur l'enfant, et
      // uniquement tant que la journée n'est pas encore publiée : une fois
      // publiée, les photos sources restent la preuve du récit.
      if (!(await hasChildRole(req.user!.id, att.childId, "contributor")))
        return reply.code(404).send({ error: "pièce jointe introuvable" });
      if (att.status === "published")
        return reply
          .code(409)
          .send({ error: "impossible de retirer une page d'une journée déjà publiée" });

      // Une journée doit garder au moins une page source.
      const siblings = await db
        .select({ id: attachments.id })
        .from(attachments)
        .where(eq(attachments.entryId, att.entryId));
      if (siblings.length <= 1)
        return reply
          .code(409)
          .send({ error: "impossible de retirer la dernière page du carnet" });

      await db.delete(attachments).where(eq(attachments.id, req.params.id));
      await deleteStored({
        originalPath: att.originalPath,
        thumbPath: att.thumbPath ?? att.originalPath,
      });

      return reply.code(204).send();
    },
  );
}
