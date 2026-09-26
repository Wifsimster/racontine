import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Nomme un proche dont le compte n'a pas de nom (créé par lien magique). La
 * règle est celle du service : on complète un vide, on n'écrase jamais le nom
 * qu'une personne s'est donné.
 */
export const setMemberNameTool: McpTool = {
  name: "set_member_name",
  register(server, ctx) {
    server.registerTool(
      "set_member_name",
      {
        title: "Nommer un proche",
        description:
          "Donne un nom à un membre du cercle d'un carnet dont le compte n'en a pas encore (il s'affiche alors à la place de son e-mail). Réservé à l'administrateur de ce carnet. Refusé si le membre a déjà un nom. Le `userId` se lit dans `list_circle` ou `admin_console`.",
        inputSchema: {
          childId: z.string().describe("Identifiant du carnet."),
          userId: z
            .string()
            .describe("Identifiant du membre (voir `list_circle`)."),
          name: z
            .string()
            .describe("Nom affiché, 1 à 80 caractères (ex. « Mamie Jacqueline »)."),
        },
      },
      async ({ childId, userId, name }) => {
        const verdict = await ctx.circleAccess.requireAdmin(ctx.user.id, childId);
        if (!verdict.ok) return errorContent(verdict.error);

        const result = await ctx.sharing.nameMember({ childId, userId, name });
        if (!result.ok) return errorContent(result.error);
        return jsonContent({ childId, userId, name: result.name });
      },
    );
  },
};
