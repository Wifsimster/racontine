import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachments, entries } from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { childRole, hasChildRole } from "../access.js";
import { deleteStored, resolveUpload, rotateStoredImage } from "../storage.js";
import { attachmentUrls } from "./attachment-urls.js";

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

  /**
   * TOURNER UNE PAGE, ET QUE ÇA RESTE.
   *
   * Le carnet se photographie d'une main au-dessus d'une table : une page sur
   * deux arrive de travers. La rotation n'était qu'un confort d'affichage, perdu
   * à la fermeture de l'écran — la page suivante repartait à l'envers, et la
   * même page était retournée à chaque relecture. Ici, le fichier lui-même est
   * réécrit : la page est droite partout et pour tout le monde, définitivement.
   *
   * Tourner reste possible APRÈS publication, contrairement à retirer une page :
   * l'orientation ne change rien à ce que le carnet dit, et c'est justement une
   * fois la journée publiée qu'on la relit. Il faut contributor+ tout de même,
   * parce que c'est une écriture sur les fichiers sources.
   */
  app.post<{ Params: { id: string }; Body: { quarter?: number } }>(
    "/api/attachments/:id/rotate",
    async (req, reply) => {
      // Un quart de tour horaire par défaut, ce que fait le bouton de l'écran
      // de relecture. On accepte les autres multiples de 90° (demi-tour, sens
      // inverse) pour ne pas imposer trois allers-retours réseau.
      const raw = req.body?.quarter ?? 1;
      if (!Number.isInteger(raw))
        return reply.code(400).send({ error: "quarter doit être un entier" });
      const quarter = ((raw % 4) + 4) % 4;

      const [att] = await db
        .select({
          id: attachments.id,
          originalPath: attachments.originalPath,
          thumbPath: attachments.thumbPath,
          rotation: attachments.rotation,
          width: attachments.width,
          height: attachments.height,
          childId: entries.childId,
        })
        .from(attachments)
        .innerJoin(entries, eq(entries.id, attachments.entryId))
        .where(eq(attachments.id, req.params.id))
        .limit(1);
      if (!att) return reply.code(404).send({ error: "pièce jointe introuvable" });
      if (!(await hasChildRole(req.user!.id, att.childId, "contributor")))
        return reply.code(404).send({ error: "pièce jointe introuvable" });

      const rotation = (att.rotation + quarter) % 4;
      let size = { width: att.width, height: att.height };
      // Un quart de tour nul ne touche à rien : réencoder pour rien dégraderait
      // le JPEG et invaliderait le cache sans qu'aucun pixel n'ait bougé.
      if (quarter !== 0) {
        try {
          size = await rotateStoredImage(att, quarter);
        } catch (err) {
          req.log.error({ err, attachmentId: att.id }, "rotation impossible");
          return reply
            .code(422)
            .send({ error: "impossible de tourner cette page" });
        }
        await db
          .update(attachments)
          .set({ width: size.width, height: size.height, rotation })
          .where(eq(attachments.id, att.id));
      }

      return reply.send({
        id: att.id,
        ...attachmentUrls({ id: att.id, rotation }),
        width: size.width,
        height: size.height,
      });
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
