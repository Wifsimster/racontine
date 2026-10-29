import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { requireChildAdminAccess } from "../access.js";
import { sharing } from "../composition.js";

async function requireChildAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  childId: string,
): Promise<boolean> {
  const verdict = await requireChildAdminAccess(req.user!.id, childId);
  if (!verdict.ok) {
    reply.code(verdict.httpCode).send({ error: verdict.error });
    return false;
  }
  return true;
}

export async function sharingRoutes(app: FastifyInstance) {
  app.get<{ Params: { childId: string } }>(
    "/api/children/:childId/members",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;
      return sharing.circle(req.params.childId);
    },
  );

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

  app.delete<{ Params: { id: string } }>(
    "/api/invitations/:id",
    { preHandler: requireUser },
    async (req, reply) => {
      const inv = await sharing.findInvitation(req.params.id);
      if (!inv) return reply.code(204).send();
      if (!(await requireChildAdmin(req, reply, inv.childId))) return;
      if (
        inv.status === "accepted" ||
        (!(await sharing.revokeInvitation(req.params.id)) &&
          inv.status === "pending")
      )
        return reply.code(409).send({
          error: "invitation déjà acceptée : retirez plutôt ce proche du cercle",
        });
      return reply.code(204).send();
    },
  );

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

  app.put<{
    Params: { childId: string; userId: string };
    Body: { name?: string };
  }>(
    "/api/children/:childId/members/:userId/name",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireChildAdmin(req, reply, req.params.childId))) return;
      const result = await sharing.nameMember({
        childId: req.params.childId,
        userId: req.params.userId,
        name: req.body?.name,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(200).send({ name: result.name });
    },
  );

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

  app.get<{ Params: { token: string } }>(
    "/api/invitations/token/:token",
    async (req, reply) => {
      const preview = await sharing.preview(req.params.token);
      if (!preview)
        return reply.code(404).send({ error: "invitation introuvable" });
      return preview;
    },
  );

  app.post<{ Params: { token: string } }>(
    "/api/invitations/token/:token/accept",
    { preHandler: requireUser },
    async (req, reply) => {
      const result = await sharing.accept({
        token: req.params.token,
        userId: req.user!.id,
        userEmail: req.user!.email,
        emailVerified: req.user!.emailVerified,
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(200).send({ childId: result.childId, role: result.role });
    },
  );
}
