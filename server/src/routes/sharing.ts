import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { children } from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { hasChildRole } from "../access.js";
import { sharing } from "../composition.js";

/* ===========================================================================
   LA COUCHE HTTP DU PARTAGE.

   Les règles du cercle — « il doit rester au moins un administrateur », « une
   invitation ne sert qu'une fois », « elle est nominative » — vivaient ici,
   entre deux requêtes SQL. Elles sont dans `services/sharing-service.ts`, où
   elles se vérifient sans base ni requête HTTP ; ces gestionnaires ne font plus
   que garder la porte et traduire le résultat.
   =========================================================================== */

/** Garde : l'appelant doit être admin de l'enfant, sinon 403 (404 si absent). */
async function requireChildAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  childId: string,
): Promise<boolean> {
  const [child] = await db
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);
  if (!child) {
    reply.code(404).send({ error: "enfant introuvable" });
    return false;
  }
  if (!(await hasChildRole(req.user!.id, childId, "admin"))) {
    reply.code(403).send({ error: "réservé à l'administrateur de l'enfant" });
    return false;
  }
  return true;
}

export async function sharingRoutes(app: FastifyInstance) {
  /* ------------------------- Membres & invitations ---------------------- */

  // Cercle d'un enfant : membres + invitations en attente (admin uniquement).
  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/members",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;
      return sharing.circle(req.params.childId);
    },
  );

  // Inviter un proche (admin).
  app.post<{
    Params: { childId: string };
    Body: { email?: string; role?: string };
  }>(
    "/api/children/:childId/invitations",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;

      const result = await sharing.invite({
        childId: req.params.childId,
        inviterId: req.user!.id,
        email: req.body?.email,
        role: req.body?.role,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });

      return reply.code(201).send({
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
        url: result.url,
      });
    },
  );

  // Révoquer une invitation en attente (admin de l'enfant concerné).
  app.delete<{ Params: { id: string } }>(
    "/api/invitations/:id",
    { preHandler: requireUser },
    async (req, reply) => {
      const inv = await sharing.findInvitation(req.params.id);
      if (!inv) return reply.code(204).send();
      // L'autorisation se vérifie AVANT de révoquer — et il faut d'abord
      // retrouver l'invitation pour savoir de quel enfant elle relève.
      if (!(await requireChildAdmin(req, reply, inv.childId))) return;
      await sharing.revokeInvitation(req.params.id);
      return reply.code(204).send();
    },
  );

  // Changer le rôle d'un membre (admin). Interdit de retirer le dernier admin.
  app.patch<{
    Params: { childId: string; userId: string };
    Body: { role?: string };
  }>(
    "/api/children/:childId/members/:userId",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;
      const result = await sharing.setRole({
        childId: req.params.childId,
        userId: req.params.userId,
        role: req.body?.role,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(204).send();
    },
  );

  // Retirer un membre (admin). Interdit de retirer le dernier admin.
  app.delete<{ Params: { childId: string; userId: string } }>(
    "/api/children/:childId/members/:userId",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;
      const result = await sharing.removeMember({
        childId: req.params.childId,
        userId: req.params.userId,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(204).send();
    },
  );

  /* ----------------------- Réception d'une invitation ------------------- */

  // Aperçu public (le jeton est la capacité) : ce que le proche va accepter.
  app.get<{ Params: { token: string } }>(
    "/api/invitations/token/:token",
    async (req, reply) => {
      const preview = await sharing.preview(req.params.token);
      if (!preview)
        return reply.code(404).send({ error: "invitation introuvable" });
      return preview;
    },
  );

  // Accepter : crée l'adhésion pour l'utilisateur connecté (auth requise).
  app.post<{ Params: { token: string } }>(
    "/api/invitations/token/:token/accept",
    { preHandler: requireUser },
    async (req, reply) => {
      const result = await sharing.accept({
        token: req.params.token,
        userId: req.user!.id,
        userEmail: req.user!.email,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(200).send({ childId: result.childId, role: result.role });
    },
  );
}
