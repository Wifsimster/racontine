import { z } from "zod";
import { itemsToNoteLists } from "../../domain/entry-items.js";
import { tidyUncertainties } from "../../uncertainties.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

export const getDailyNoteTool: McpTool = {
  name: "get_daily_note",
  register(server, ctx) {
    server.registerTool(
      "get_daily_note",
      {
        title: "Consulter une journée",
        description:
          "Renvoie le détail complet d'une journée : récit, temps fort, humeur, repas, siestes, activités, anecdotes, santé et transcription. Un lecteur ne peut consulter que les journées publiées.",
        inputSchema: {
          entryId: z
            .string()
            .describe("Identifiant de la journée (voir list_daily_notes)."),
        },
      },
      async ({ entryId }) => {
        const found = await ctx.queries.findNote(ctx.user.id, entryId);
        if (!found) return errorContent("Journée introuvable.");

        const { entry, items } = found;
        return jsonContent({
          note: {
            id: entry.id,
            childId: entry.childId,
            child: entry.childName,
            date: entry.date,
            source: entry.source,
            status: entry.status,
            failureReason: entry.failureReason,
            title: entry.title,
            mood: entry.mood,
            story: entry.story,
            highlight: entry.highlight,
            transcription: entry.transcription,
            uncertainties: tidyUncertainties(entry.uncertainties),
            ...itemsToNoteLists(items),
            pageCount: entry.pageCount,
          },
        });
      },
    );
  },
};
