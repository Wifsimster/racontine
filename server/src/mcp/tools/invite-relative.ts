import { z } from "zod";
import { ROLES } from "../../services/sharing-service.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Invite un proche dans le cercle d'un carnet. L'invitation est NOMINATIVE (le
 * lien ne vaut que pour l'adresse invitée) et le lien part par e-mail quand
 * l'instance sait en envoyer — il est rendu ici dans tous les cas, parce qu'un
 * homelab sans SMTP est le cas normal et non l'exception.
 */
export const inviteRelativeTool: McpTool = {
  name: "invite_relative",
  register(server, ctx) {
    server.registerTool(
      "invite_relative",
      {
        title: "Inviter un proche",
        description:
          "Invite un proche à suivre un carnet : crée une invitation nominative, tente de l'envoyer par e-mail, et renvoie **le lien** dans tous les cas (à transmettre à la main si l'instance n'a pas de SMTP). Réservé à l'administrateur du carnet. Refusé si la personne suit déjà ce carnet. Le lien expire selon le réglage « validité des invitations » de l'instance.",
        inputSchema: {
          childId: z
            .string()
            .describe("Identifiant du carnet (voir `list_children` ou `instance_status`)."),
          email: z
            .string()
            .describe(
              "Adresse e-mail du proche. L'invitation n'est acceptable que par elle.",
            ),
          role: z
            .enum(ROLES as unknown as [string, ...string[]])
            .optional()
            .describe(
              "Rôle accordé : `reader` (lit le journal publié — le défaut, celui d'un grand-parent), `contributor` (lit et ajoute des journées — un co-parent), `admin` (en plus, gère le cercle). Défaut : reader.",
            ),
        },
      },
      async ({ childId, email, role }) => {
        const verdict = await ctx.circleAccess.requireAdmin(ctx.user.id, childId);
        if (!verdict.ok) return errorContent(verdict.error);

        const result = await ctx.sharing.invite({
          childId,
          inviterId: ctx.user.id,
          email,
          role,
        });
        if (!result.ok) return errorContent(result.error);

        return jsonContent({
          id: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          expiresAt: result.invitation.expiresAt,
          url: result.url,
        });
      },
    );
  },
};
