import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/* ===========================================================================
   LE CERCLE D'UN CARNET — qui le suit, et qui a été invité sans répondre.

   `admin_console` rassemble les gens de TOUS les carnets administrés ; cet
   outil-ci regarde UN carnet et rend, en plus, le LIEN de chaque invitation en
   attente. Ce lien compte : sur un homelab sans SMTP configuré, l'e-mail
   d'invitation ne part pas, et c'est ce lien-là qu'un parent recopie dans un
   message à sa mère.
   =========================================================================== */

/** Membres et invitations en attente d'un carnet. */
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
