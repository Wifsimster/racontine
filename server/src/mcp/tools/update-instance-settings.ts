import { z } from "zod";
import { parseSettingsPatch } from "../../domain/settings-patch.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Change les réglages de l'instance à chaud — l'équivalent MCP de l'écran
 * Réglages. La validation est celle du domaine (`domain/settings-patch.ts`),
 * partagée mot pour mot avec `PATCH /api/settings` : deux protocoles, une seule
 * règle sur le nom de l'instance ou la durée d'une invitation.
 */
export const updateInstanceSettingsTool: McpTool = {
  name: "update_instance_settings",
  register(server, ctx) {
    server.registerTool(
      "update_instance_settings",
      {
        title: "Modifier les réglages de l'instance",
        description:
          "Modifie à chaud les réglages de l'instance (réservé au propriétaire, c'est-à-dire au premier compte créé) : nom affiché, ouverture des inscriptions, durée de validité des invitations, modèle VLM d'extraction, interrupteur global des e-mails de notification. Seuls les champs fournis changent. `instance_status` rend les valeurs en vigueur et la liste des modèles VLM connus.",
        inputSchema: {
          appName: z
            .string()
            .optional()
            .describe(
              "Nom de l'instance (1 à 60 caractères), affiché dans l'en-tête et sur l'écran de connexion. Chaîne vide : retour au défaut.",
            ),
          signupEnabled: z
            .boolean()
            .optional()
            .describe(
              "Ouvre ou ferme la création de comptes e-mail/mot de passe. Les proches invités par lien restent toujours acceptés. À laisser fermé hors ajout d'un co-parent.",
            ),
          // Les BORNES sont dans `domain/settings-patch.ts`, pas ici : deux
          // gardes, ce serait deux vérités, et l'agent recevrait un refus en
          // anglais du SDK là où la règle du produit parle français. Zod ne
          // décrit donc que la FORME ; la borne est dite dans la description.
          invitationTtlDays: z
            .number()
            .int()
            .optional()
            .describe("Durée de validité d'un lien d'invitation, en jours (1 à 365)."),
          vlmModel: z
            .string()
            .optional()
            .describe(
              "Modèle Claude vision utilisé pour lire les carnets (ex. « claude-opus-4-8 »).",
            ),
          emailNotificationsEnabled: z
            .boolean()
            .optional()
            .describe(
              "Interrupteur global des e-mails de notification aux abonnés (sans effet si aucun SMTP n'est configuré).",
            ),
        },
      },
      async (input) => {
        if (!(await ctx.instance.isOwner(ctx.user.id)))
          return errorContent(
            "Réservé au propriétaire de l'instance (le premier compte créé).",
          );

        const parsed = parseSettingsPatch(input);
        if (!parsed.ok) return errorContent(parsed.error);
        if (!Object.keys(parsed.patch).length)
          return errorContent("Aucun réglage fourni : rien à modifier.");

        const settings = await ctx.instance.update(parsed.patch, ctx.user.id);
        return jsonContent({
          updated: Object.keys(parsed.patch),
          settings,
          infra: ctx.instance.infra(),
        });
      },
    );
  },
};
