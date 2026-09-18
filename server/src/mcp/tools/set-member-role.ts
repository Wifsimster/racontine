import { z } from "zod";
import { ROLES } from "../../services/sharing-service.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Change le rôle d'un membre du cercle. La règle du DERNIER ADMINISTRATEUR est
 * celle du service : un carnet ne peut pas se retrouver sans personne pour le
 * gérer, et le refus arrive avant l'écriture.
 */
export const setMemberRoleTool: McpTool = {
  name: "set_member_role",
  register(server, ctx) {
    server.registerTool(
      "set_member_role",
      {
        title: "Changer le rôle d'un proche",
        description:
          "Change le rôle d'un membre du cercle d'un carnet. Réservé à l'administrateur de ce carnet. Refusé si le changement laisserait le carnet sans aucun administrateur. Le `userId` se lit dans `list_circle` ou `admin_console`.",
        inputSchema: {
          childId: z.string().describe("Identifiant du carnet."),
          userId: z
            .string()
            .describe("Identifiant du membre (voir `list_circle`)."),
          role: z
            .enum(ROLES as unknown as [string, ...string[]])
            .describe(
              "Nouveau rôle : `reader` (lit le journal publié), `contributor` (lit et ajoute des journées), `admin` (en plus, gère le cercle).",
            ),
        },
      },
      async ({ childId, userId, role }) => {
        const verdict = await ctx.circleAccess.requireAdmin(ctx.user.id, childId);
        if (!verdict.ok) return errorContent(verdict.error);

        const result = await ctx.sharing.setRole({ childId, userId, role });
        if (!result.ok) return errorContent(result.error);
        return jsonContent({ childId, userId, role });
      },
    );
  },
};
