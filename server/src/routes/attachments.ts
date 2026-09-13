import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pages } from "../composition.js";
import { requireUser } from "../plugins/auth.js";
import { resolveUpload } from "../storage.js";
import { attachmentUrls } from "./attachment-urls.js";

/* Les pages photographiées, côté HTTP : servir un fichier, et traduire les
   refus du service (`services/page-service.ts`) en codes de statut. Les règles
   — qui voit quoi, ce qui reste possible après publication, la dernière page
   qu'on ne retire pas — sont là-bas, et s'y vérifient sans base ni requête. */

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

  /**
   * TOURNER UNE PAGE, ET QUE ÇA RESTE.
   *
   * Le carnet se photographie d'une main au-dessus d'une table : une page sur
   * deux arrive de travers. La rotation n'était qu'un confort d'affichage, perdu
   * à la fermeture de l'écran — la page suivante repartait à l'envers, et la
   * même page était retournée à chaque relecture. Ici, le fichier lui-même est
   * réécrit : la page est droite partout et pour tout le monde, définitivement.
   *
   * Un quart de tour horaire par défaut, ce que fait le bouton de l'écran de
   * relecture ; les autres multiples de 90° sont acceptés pour ne pas imposer
   * trois allers-retours réseau.
   */
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
