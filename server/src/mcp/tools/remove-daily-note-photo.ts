import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

export const removeDailyNotePhotoTool: McpTool = {
  name: "remove_daily_note_photo",
  register(server, ctx) {
    server.registerTool(
      "remove_daily_note_photo",
      {
        title: "Retirer une photo souvenir",
        description:
          "Retire une photo souvenir d'une journée (brouillon ou publiée). Ne retire jamais une page du carnet. Geste irréversible : le fichier est supprimé. Les identifiants des photos sont donnés par `get_daily_note` (`photoIds`).",
        inputSchema: {
          photoId: z
            .string()
            .describe("Identifiant de la photo (voir `photoIds` de get_daily_note)."),
        },
      },
      async ({ photoId }) => {
        const kind = await ctx.queries.attachmentKind(ctx.user.id, photoId);
        if (kind !== "souvenir")
          return errorContent(
            kind
              ? "Ceci est une page du carnet, pas une photo souvenir."
              : "Photo introuvable.",
          );
        const result = await ctx.pages.remove(ctx.user.id, photoId);
        if (!result.ok) return errorContent(result.error);
        return jsonContent({ photoId, removed: true });
      },
    );
  },
};
