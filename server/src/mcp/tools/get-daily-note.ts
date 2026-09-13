import { z } from "zod";
import { itemsToNoteLists } from "../../domain/entry-items.js";
import { tidyUncertainties } from "../../uncertainties.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/** Détail complet d'une journée. */
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
        // Message uniforme « introuvable » pour l'absence comme pour l'accès
        // refusé : on ne révèle pas l'existence d'une journée non partagée.
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
            // Remise en forme comme pour l'API web : un mot par incertitude, sa
            // glose dans `contexte` (voir uncertainties.ts).
            uncertainties: tidyUncertainties(entry.uncertainties),
            // Les listes par type viennent du registre des moments : la lecture
            // et l'écriture ne peuvent pas diverger.
            ...itemsToNoteLists(items),
            pageCount: entry.pageCount,
          },
        });
      },
    );
  },
};
