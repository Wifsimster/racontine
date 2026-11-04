import { z } from "zod";
import type { McpTool } from "../protocol.js";
import {
  MAX_PAGES,
  collectPages,
  errorContent,
  jsonContent,
} from "../protocol.js";

export const attachDailyNotePagesTool: McpTool = {
  name: "attach_daily_note_pages",
  register(server, ctx) {
    server.registerTool(
      "attach_daily_note_pages",
      {
        title: "Joindre des photos à une journée existante",
        description:
          "Ajoute une ou plusieurs photos (pages du carnet, photos collées) à une journée qui existe déjà, brouillon ou publiée, sans relancer la lecture par le modèle vision ni modifier le texte. Utile après `create_daily_note`, qui ne prend pas de photo. Aucune notification n'est envoyée aux proches. Fournir les photos via `imageIds` (pré-téléversées via `POST /api/mcp/uploads`, recommandé) ou `images` (base64, petites images seulement).",
        inputSchema: {
          entryId: z
            .string()
            .describe("Identifiant de la journée (voir list_daily_notes)."),
          imageIds: z
            .array(z.string())
            .max(MAX_PAGES)
            .optional()
            .describe(
              "Identifiants de photos pré-téléversées en octets bruts via `POST /api/mcp/uploads` (en-tête `Authorization: Bearer <jeton MCP>`, corps = fichier).",
            ),
          images: z
            .array(z.string())
            .max(MAX_PAGES)
            .optional()
            .describe(
              "Photos encodées en base64 (JPEG/PNG/HEIC/WebP). À réserver aux petites images.",
            ),
        },
      },
      async ({ entryId, images, imageIds }) => {
        const pages = await collectPages(ctx, images, imageIds);
        if (!pages.ok) return errorContent(pages.error);
        const result = await ctx.pages.attach({
          userId: ctx.user.id,
          entryId,
          images: pages.buffers,
        });
        if (!result.ok) return errorContent(result.error);
        if (imageIds?.length) await ctx.uploads.consume(ctx.user.id, imageIds);
        return jsonContent({
          id: entryId,
          added: result.added,
          total: result.total,
          message: `${result.added} photo(s) jointe(s) à la journée.`,
        });
      },
    );
  },
};
