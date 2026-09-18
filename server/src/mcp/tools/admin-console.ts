import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/** La console d'administration, telle que l'écran Administration la montre. */
export const adminConsoleTool: McpTool = {
  name: "admin_console",
  register(server, ctx) {
    server.registerTool(
      "admin_console",
      {
        title: "Console d'administration",
        description:
          "Vue d'ensemble des carnets administrés : chaque carnet avec ses compteurs de journées et sa dernière publication, chaque proche avec TOUS ses rôles carnet par carnet (et les carnets dont il est le seul administrateur), et les invitations en attente. Réservé à qui administre au moins un carnet ; le périmètre est celui de l'appelant — jamais celui de l'instance.",
        inputSchema: {},
      },
      async () => {
        const result = await ctx.admin.console(ctx.user.id);
        // Le refus porte sur le RÔLE : un contributeur reçoit le même message
        // qu'ici, jamais la liste des carnets qu'il n'administre pas.
        if (!result.ok) return errorContent(result.error);
        return jsonContent(result.console);
      },
    );
  },
};
