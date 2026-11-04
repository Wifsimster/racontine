import { z } from "zod";
import type { McpTool } from "../protocol.js";
import {
  MAX_PAGES,
  collectPages,
  errorContent,
  jsonContent,
} from "../protocol.js";

export const attachDailyNotePhotosTool: McpTool = {
  name: "attach_daily_note_photos",
  register(server, ctx) {
    server.registerTool(
      "attach_daily_note_photos",
      {
        title: "Joindre des photos souvenirs à une journée",
        description:
          "Ajoute une ou plusieurs photos SOUVENIRS (photos de l'enfant, pas les pages du carnet) à une journée existante, brouillon ou publiée. Elles s'affichent en tête de la carte du journal et sur la page de la journée, ne sont jamais lues par le modèle vision et ne modifient pas le texte. Au plus 12 photos par journée. Pour des pages du carnet, utiliser `attach_daily_note_pages`. Fournir les photos via `imageIds` (pré-téléversées via `POST /api/mcp/uploads`, recommandé) ou `images` (base64, petites images seulement).",
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
        const photos = await collectPages(ctx, images, imageIds);
        if (!photos.ok) return errorContent(photos.error);
        const result = await ctx.pages.addSouvenirs({
          userId: ctx.user.id,
          entryId,
          images: photos.buffers,
        });
        if (!result.ok) return errorContent(result.error);
        if (imageIds?.length) await ctx.uploads.consume(ctx.user.id, imageIds);
        return jsonContent({
          id: entryId,
          added: result.added.map((p) => p.id),
          total: result.total,
          message: `${result.added.length} photo(s) souvenir jointe(s) à la journée.`,
        });
      },
    );
  },
};
