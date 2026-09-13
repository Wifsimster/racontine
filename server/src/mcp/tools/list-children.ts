import type { McpTool } from "../protocol.js";
import { jsonContent } from "../protocol.js";

/** Les enfants auxquels ce compte peut contribuer. */
export const listChildrenTool: McpTool = {
  name: "list_children",
  register(server, ctx) {
    server.registerTool(
      "list_children",
      {
        title: "Lister les enfants",
        description:
          "Liste les enfants auxquels ce compte peut contribuer (photographier / publier une journée). Utilise l'`id` renvoyé comme `childId` de `upload_daily_note`.",
        inputSchema: {},
      },
      async () => {
        const children = await ctx.queries.contributableChildren(ctx.user.id);
        return jsonContent({ children });
      },
    );
  },
};
