import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { adminConsole } from "../composition.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/console", { preHandler: requireUser }, async (req, reply) => {
    const result = await adminConsole.console(req.user!.id);
    if (!result.ok)
      return reply.code(result.httpCode).send({ error: result.error });
    return result.console;
  });
}
