import type { FastifyInstance } from "fastify";
import { privacy } from "../composition.js";
import { requireUser } from "../plugins/auth.js";

function archiveName(): string {
  return `racontine-export-${new Date().toISOString().slice(0, 10)}.zip`;
}

export async function privacyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get("/api/me/export", async (req, reply) => {
    const archive = await privacy.exportAccount(req.user!.id);
    if (!archive) return reply.code(404).send({ error: "compte introuvable" });
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${archiveName()}"`)
      .header("Cache-Control", "no-store")
      .send(archive);
  });

  app.get("/api/me/erasure", async (req, reply) => {
    const preview = await privacy.erasurePreview(req.user!.id);
    if (!preview.ok)
      return reply.code(preview.httpCode).send({
        error: preview.error,
        code: preview.code,
        carnets: preview.carnets ?? [],
      });
    return { deletes: preview.deletes, leaves: preview.leaves };
  });

  app.delete<{ Body: { confirmation?: unknown } }>(
    "/api/me",
    async (req, reply) => {
      const confirmation = (req.body ?? {}).confirmation;
      const result = await privacy.deleteAccount({
        userId: req.user!.id,
        email: req.user!.email,
        confirmation: typeof confirmation === "string" ? confirmation : "",
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({
          error: result.error,
          code: result.code,
          carnets: result.carnets ?? [],
        });
      return reply.code(200).send({ deleted: true, carnets: result.carnets });
    },
  );

  app.delete<{ Params: { childId: string }; Body: { confirmation?: unknown } }>(
    "/api/children/:childId",
    async (req, reply) => {
      const confirmation = (req.body ?? {}).confirmation;
      const result = await privacy.deleteCarnet({
        userId: req.user!.id,
        childId: req.params.childId,
        confirmation: typeof confirmation === "string" ? confirmation : "",
      });
      if (!result.ok)
        return reply
          .code(result.httpCode)
          .send({ error: result.error, code: result.code });
      return reply.code(200).send({ deleted: true, name: result.name });
    },
  );
}
