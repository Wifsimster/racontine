import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Révoque une invitation en attente : le lien cesse d'ouvrir le carnet. La
 * garde se vérifie APRÈS avoir retrouvé l'invitation — c'est elle qui dit de
 * quel carnet elle relève —, et l'absence n'est pas une erreur : révoquer deux
 * fois doit valoir une fois.
 */
export const revokeInvitationTool: McpTool = {
  name: "revoke_invitation",
  register(server, ctx) {
    server.registerTool(
      "revoke_invitation",
      {
        title: "Révoquer une invitation",
        description:
          "Révoque une invitation en attente : son lien cesse de fonctionner. Réservé à l'administrateur du carnet concerné. Idempotent — révoquer une invitation déjà révoquée ou inexistante réussit sans rien changer. L'`id` se lit dans `list_circle`, `admin_console` ou `instance_status` (invitations expirées).",
        inputSchema: {
          invitationId: z
            .string()
            .describe("Identifiant de l'invitation (voir `list_circle`)."),
        },
      },
      async ({ invitationId }) => {
        const invitation = await ctx.sharing.findInvitation(invitationId);
        if (!invitation)
          return jsonContent({
            id: invitationId,
            revoked: true,
            message: "Aucune invitation à révoquer : elle n'existe plus.",
          });

        const verdict = await ctx.circleAccess.requireAdmin(
          ctx.user.id,
          invitation.childId,
        );
        if (!verdict.ok) return errorContent(verdict.error);

        await ctx.sharing.revokeInvitation(invitationId);
        return jsonContent({
          id: invitationId,
          childId: invitation.childId,
          email: invitation.email,
          revoked: true,
        });
      },
    );
  },
};
