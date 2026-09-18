import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Retire un proche du cercle d'un carnet — son adhésion ET son abonnement,
 * sans quoi il continuerait de recevoir les notifications d'un journal qu'il
 * ne peut plus ouvrir. Le dernier administrateur ne peut pas être retiré.
 */
export const removeMemberTool: McpTool = {
  name: "remove_member",
  register(server, ctx) {
    server.registerTool(
      "remove_member",
      {
        title: "Retirer un proche",
        description:
          "Retire un proche du cercle d'un carnet : il en perd l'accès, et ses notifications s'arrêtent. Réservé à l'administrateur de ce carnet. Refusé s'il en est le dernier administrateur. Geste irréversible — le proche devra être réinvité ; vérifie le cercle avec `list_circle` avant d'appeler.",
        inputSchema: {
          childId: z.string().describe("Identifiant du carnet."),
          userId: z
            .string()
            .describe("Identifiant du membre à retirer (voir `list_circle`)."),
        },
      },
      async ({ childId, userId }) => {
        const verdict = await ctx.circleAccess.requireAdmin(ctx.user.id, childId);
        if (!verdict.ok) return errorContent(verdict.error);

        const result = await ctx.sharing.removeMember({ childId, userId });
        if (!result.ok) return errorContent(result.error);
        return jsonContent({ childId, userId, removed: true });
      },
    );
  },
};
