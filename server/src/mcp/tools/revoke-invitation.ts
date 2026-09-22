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
          "Révoque une invitation en attente : son lien cesse de fonctionner. Réservé à l'administrateur du carnet concerné. Idempotent — révoquer une invitation déjà révoquée ou inexistante réussit sans rien changer. Une invitation déjà acceptée ne se révoque pas : retirer le membre avec `remove_member`. L'`id` se lit dans `list_circle`, `admin_console` ou `instance_status` (invitations expirées).",
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

        // Une invitation déjà acceptée n'est plus un lien : c'est un membre.
        // La « révoquer » ne retirerait rien — il faut retirer le membre.
        if (invitation.status === "accepted")
          return errorContent(
            "Cette invitation a déjà été acceptée : le proche fait partie du cercle. Pour lui retirer l'accès, utilisez `remove_member`.",
          );
        const revoked = await ctx.sharing.revokeInvitation(invitationId);
        if (!revoked && invitation.status === "pending")
          return errorContent(
            "L'invitation vient d'être acceptée : le proche fait partie du cercle. Pour lui retirer l'accès, utilisez `remove_member`.",
          );
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
