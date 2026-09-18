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

/** Garde : l'appelant doit être le propriétaire de l'instance, sinon 403. */
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
  /* ------------------------------- Public ------------------------------- */

  // Réglages non sensibles, sans authentification : sert à l'écran de connexion
  // (nom de l'instance, inscription ouverte ou non).
  app.get("/api/settings/public", async () => {
    const s = await getSettings();
    return { appName: s.appName, signupEnabled: s.signupEnabled };
  });

  /* ------------------------ Identité de l'appelant ---------------------- */

  // Qui suis-je, et quelles portes s'ouvrent : les réglages pour le
  // propriétaire de l'instance, la console d'administration pour qui
  // administre au moins un enfant. Les deux se recoupent souvent (le
  // propriétaire est l'admin du premier carnet) sans se confondre : un
  // co-parent admin n'est pas propriétaire, et le restera.
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

  /* -------------------- Clé API LLM (par utilisateur) ------------------- */
  // Chaque contributeur gère SA propre clé API Anthropic (facturation
  // individuelle). Accessible à tout utilisateur connecté, pas seulement au
  // propriétaire. La clé n'est jamais renvoyée : seul un indice (4 derniers
  // caractères) l'est, pour confirmation visuelle.

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

  /* ------------------------- Réglages (propriétaire) -------------------- */

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
    // La validation est celle du domaine — la même que l'outil MCP
    // `update_instance_settings` applique de son côté.
    const parsed = parseSettingsPatch(req.body ?? {});
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const patch = parsed.patch;

    const settings = await updateSettings(patch, req.user!.id);
    return { settings, meta: infraMeta() };
  });
}
