import { z } from "zod";
import type { EntryStatus } from "../../db/schema.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/** États possibles d'une journée (aligné sur l'enum `entry_status`). */
const ENTRY_STATUSES = [
  "processing",
  "draft",
  "published",
  "failed",
] as const satisfies readonly EntryStatus[];

/** Liste les journées récentes visibles par le compte. */
export const listDailyNotesTool: McpTool = {
  name: "list_daily_notes",
  register(server, ctx) {
    server.registerTool(
      "list_daily_notes",
      {
        title: "Lister les journées",
        description:
          "Liste les journées récentes d'un enfant (les plus récentes d'abord). Un lecteur ne voit que les journées publiées ; un contributeur/admin voit aussi les brouillons. Utilise l'`id` renvoyé avec `get_daily_note` pour le détail complet.",
        inputSchema: {
          childId: z
            .string()
            .optional()
            .describe(
              "Identifiant de l'enfant (voir list_children). Facultatif : sans lui, toutes les journées accessibles sont listées.",
            ),
          status: z
            .enum(ENTRY_STATUSES)
            .optional()
            .describe(
              "Filtre optionnel sur l'état : processing, draft, published ou failed.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Nombre maximum de journées à renvoyer (défaut 20, max 50)."),
        },
      },
      async ({ childId, status, limit }) => {
        const notes = await ctx.queries.listNotes({
          userId: ctx.user.id,
          childId,
          status,
          limit: limit ?? 20,
        });
        // On ne divulgue pas l'existence d'un enfant non partagé : message uniforme.
        if (notes === null)
          return errorContent("Enfant introuvable ou inaccessible.");
        return jsonContent({ notes });
      },
    );
  },
};
