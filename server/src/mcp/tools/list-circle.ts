import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

export const listCircleTool: McpTool = {
  name: "list_circle",
  register(server, ctx) {
    server.registerTool(
      "list_circle",
      {
        title: "Lister le cercle d'un carnet",
        description:
          "Liste le cercle d'un carnet : chaque membre (identifiant, nom, e-mail, rôle, date d'entrée) et chaque invitation en attente, avec sa date d'expiration et **son lien** — utile quand l'instance n'a pas de SMTP configuré et que le lien doit être transmis à la main. Réservé à l'administrateur de CE carnet. Les identifiants renvoyés (`userId`, `id` d'invitation) sont ceux qu'attendent `set_member_role`, `set_member_name`, `remove_member` et `revoke_invitation`.",
        inputSchema: {
          childId: z
            .string()
            .describe("Identifiant du carnet (voir `list_children` ou `instance_status`)."),
        },
      },
      async ({ childId }) => {
        const verdict = await ctx.circleAccess.requireAdmin(ctx.user.id, childId);
        if (!verdict.ok) return errorContent(verdict.error);
        return jsonContent(await ctx.sharing.circle(childId));
      },
    );
  },
};
