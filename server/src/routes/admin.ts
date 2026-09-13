import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { adminConsole } from "../composition.js";

/* ===========================================================================
   LA COUCHE HTTP DE L'ADMINISTRATION — une seule route, en lecture.

   Les gestes (changer un rôle, retirer un proche, révoquer une invitation)
   passent par les routes du partage, déjà gardées enfant par enfant : la
   console d'administration n'ouvre AUCUN chemin d'écriture nouveau. Elle donne
   la vue d'ensemble qui manquait, pas un second jeu de règles.
   =========================================================================== */

export async function adminRoutes(app: FastifyInstance) {
  // Vue d'ensemble des carnets administrés : enfants, cercle rassemblé par
  // personne, invitations en attente. 403 pour qui n'administre rien.
  app.get("/api/admin/console", { preHandler: requireUser }, async (req, reply) => {
    const result = await adminConsole.console(req.user!.id);
    if (!result.ok)
      return reply.code(result.httpCode).send({ error: result.error });
    return result.console;
  });
}
