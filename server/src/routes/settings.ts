import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { isOwner } from "../access.js";
import {
  getSettings,
  updateSettings,
  KNOWN_VLM_MODELS,
  type SettingsPatch,
} from "../settings.js";
import { config } from "../config.js";
import { mailEnabled } from "../mailer.js";
import { webPushEnabled } from "../push.js";
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

/**
 * Métadonnées d'infrastructure : réglages pilotés par l'environnement (secrets)
 * que le propriétaire ne peut pas changer depuis l'UI, mais dont l'état est utile
 * à afficher (« l'e-mail est-il configuré ? »).
 */
function infraMeta() {
  return {
    mailConfigured: mailEnabled(),
    webPushConfigured: webPushEnabled(),
    notifyWebhookConfigured: !!config.notifyWebhookUrl,
    webBaseUrl: config.webBaseUrl,
    knownVlmModels: KNOWN_VLM_MODELS,
  };
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

  // Qui suis-je + suis-je le propriétaire (pour afficher l'accès aux réglages).
  app.get(
    "/api/me",
    { preHandler: requireUser },
    async (req) => ({
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      isOwner: await isOwner(req.user!.id),
    }),
  );

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
    const body = req.body ?? {};
    const patch: SettingsPatch = {};

    if (body.appName !== undefined) {
      // Chaîne vide → remise au défaut (null en base).
      if (body.appName === null || body.appName === "") {
        patch.appName = null;
      } else if (typeof body.appName === "string") {
        const name = body.appName.trim();
        if (!name || name.length > 60)
          return reply
            .code(400)
            .send({ error: "nom de l'instance invalide (1 à 60 caractères)" });
        patch.appName = name;
      } else {
        return reply.code(400).send({ error: "appName invalide" });
      }
    }

    if (body.signupEnabled !== undefined) {
      if (typeof body.signupEnabled !== "boolean")
        return reply.code(400).send({ error: "signupEnabled invalide" });
      patch.signupEnabled = body.signupEnabled;
    }

    if (body.emailNotificationsEnabled !== undefined) {
      if (typeof body.emailNotificationsEnabled !== "boolean")
        return reply
          .code(400)
          .send({ error: "emailNotificationsEnabled invalide" });
      patch.emailNotificationsEnabled = body.emailNotificationsEnabled;
    }

    if (body.invitationTtlDays !== undefined) {
      const n = Number(body.invitationTtlDays);
      if (!Number.isInteger(n) || n < 1 || n > 365)
        return reply
          .code(400)
          .send({ error: "durée d'invitation invalide (1 à 365 jours)" });
      patch.invitationTtlDays = n;
    }

    if (body.vlmModel !== undefined) {
      if (typeof body.vlmModel !== "string" || !body.vlmModel.trim())
        return reply.code(400).send({ error: "modèle VLM invalide" });
      const model = body.vlmModel.trim();
      if (model.length > 100)
        return reply.code(400).send({ error: "modèle VLM invalide" });
      patch.vlmModel = model;
    }

    const settings = await updateSettings(patch, req.user!.id);
    return { settings, meta: infraMeta() };
  });
}
