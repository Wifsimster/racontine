import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { isChildAdminSomewhere, isOwner } from "../access.js";
import { getSettings, updateSettings } from "../settings.js";
import { parseSettingsPatch } from "../domain/settings-patch.js";
import { infraMeta } from "../instance-ops.js";
import {
  getUserLlmMeta,
  setUserAnthropicKey,
  clearUserAnthropicKey,
  looksLikeAnthropicKey,
} from "../llm-keys.js";

async function requireOwner(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await isOwner(req.user!.id))) {
    reply.code(403).send({ error: "réservé au propriétaire de l'instance" });
    return false;
  }
  return true;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings/public", async () => {
    const s = await getSettings();
    return { appName: s.appName, signupEnabled: s.signupEnabled };
  });

  app.get("/api/me", { preHandler: requireUser }, async (req) => {
    const [owner, admin] = await Promise.all([
      isOwner(req.user!.id),
      isChildAdminSomewhere(req.user!.id),
    ]);
    return {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      isOwner: owner,
      isAdmin: admin,
    };
  });

  app.get("/api/me/llm", { preHandler: requireUser }, async (req) =>
    getUserLlmMeta(req.user!.id),
  );

  app.put<{ Body: { anthropicApiKey?: unknown } }>(
    "/api/me/llm",
    { preHandler: requireUser },
    async (req, reply) => {
      const raw = (req.body ?? {}).anthropicApiKey;
      if (typeof raw !== "string" || !looksLikeAnthropicKey(raw))
        return reply
          .code(400)
          .send({ error: "Clé API Anthropic invalide (attendu « sk-ant-… »)." });
      return setUserAnthropicKey(req.user!.id, raw);
    },
  );

  app.delete("/api/me/llm", { preHandler: requireUser }, async (req) =>
    clearUserAnthropicKey(req.user!.id),
  );

  app.get(
    "/api/settings",
    { preHandler: requireUser },
    async (req, reply) => {
      if (!(await requireOwner(req, reply))) return;
      return { settings: await getSettings(), meta: infraMeta() };
    },
  );

  app.patch<{
    Body: {
      appName?: unknown;
      signupEnabled?: unknown;
      invitationTtlDays?: unknown;
      vlmModel?: unknown;
      emailNotificationsEnabled?: unknown;
    };
  }>("/api/settings", { preHandler: requireUser }, async (req, reply) => {
    if (!(await requireOwner(req, reply))) return;
    const parsed = parseSettingsPatch(req.body ?? {});
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const patch = parsed.patch;

    const settings = await updateSettings(patch, req.user!.id);
    return { settings, meta: infraMeta() };
  });
}
