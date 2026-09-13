import { z } from "zod";
import { SOURCES } from "../../domain/entry-metadata.js";
import type { McpTool } from "../protocol.js";
import {
  MAX_PAGES,
  decodeBase64Image,
  errorContent,
  jsonContent,
} from "../protocol.js";

/** Téléverse des pages photographiées : le serveur les lit et crée un brouillon. */
export const uploadDailyNoteTool: McpTool = {
  name: "upload_daily_note",
  register(server, ctx) {
    server.registerTool(
      "upload_daily_note",
      {
        title: "Téléverser une page de carnet",
        description:
          "Téléverse une ou plusieurs photos d'une page du carnet de liaison pour une journée. Le serveur les lit avec un modèle vision et crée un brouillon de journée à relire puis publier dans Racontine. Les pages d'une même journée (même enfant / date / lieu) sont fusionnées automatiquement. Fournir les pages via `images` (base64 inline) OU `imageIds` (pré-téléversées). Pour des photos réelles, préférer `imageIds` : le base64 d'une page pèse des centaines de Ko et ne passe pas par les arguments d'outil.",
        inputSchema: {
          images: z
            .array(z.string())
            .max(MAX_PAGES)
            .optional()
            .describe(
              "Pages du carnet, chacune encodée en base64 (JPEG/PNG/HEIC/WebP). Le préfixe `data:…;base64,` est accepté. À réserver aux petites images : pour une photo réelle, utiliser plutôt `imageIds`.",
            ),
          imageIds: z
            .array(z.string())
            .max(MAX_PAGES)
            .optional()
            .describe(
              "Identifiants de pages pré-téléversées en octets bruts via `POST /api/mcp/uploads` (en-tête `Authorization: Bearer <jeton MCP>`, corps = fichier). Alternative recommandée à `images` : évite de faire transiter le base64 par le contexte. Exemple : `curl -H \"Authorization: Bearer $TOKEN\" --data-binary @page.jpg <hôte>/api/mcp/uploads` renvoie l'`uploadId` à passer ici.",
            ),
          childId: z
            .string()
            .optional()
            .describe(
              "Identifiant de l'enfant (voir list_children). Facultatif si le compte ne suit qu'un seul enfant.",
            ),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe("Date de la journée au format AAAA-MM-JJ. Défaut : aujourd'hui."),
          source: z
            .enum(SOURCES as unknown as [string, ...string[]])
            .optional()
            .describe(
              "Lieu où la journée a été passée : nounou, mam, creche ou maison. Défaut : nounou.",
            ),
        },
      },
      async ({ images, imageIds, childId, date, source }) => {
        const buffers: Buffer[] = [];

        // Pages pré-téléversées (octets bruts) d'abord, puis base64 inline. On
        // conserve l'ordre demandé pour la fusion/positions des pages.
        if (imageIds?.length) {
          const resolved = await ctx.uploads.resolve(ctx.user.id, imageIds);
          if (!resolved.ok) return errorContent(resolved.error);
          buffers.push(...resolved.buffers);
        }
        if (images?.length) {
          for (const [i, img] of images.entries()) {
            const buf = decodeBase64Image(img);
            if (!buf)
              return errorContent(
                `Image ${i + 1} invalide : chaîne base64 non décodable.`,
              );
            buffers.push(buf);
          }
        }

        if (!buffers.length)
          return errorContent(
            "Aucune page fournie : renseignez `images` (base64) ou `imageIds` (pré-téléversées via POST /api/mcp/uploads).",
          );
        if (buffers.length > MAX_PAGES)
          return errorContent(`Trop de pages (max ${MAX_PAGES} par journée).`);

        const result = await ctx.ingest.ingest({
          userId: ctx.user.id,
          images: buffers,
          childId,
          date,
          source,
        });

        if (!result.ok) return errorContent(result.error);

        // Ingestion réussie : les octets bruts en attente ne servent plus. En cas
        // d'échec on les laisse (l'appelant peut réessayer jusqu'à l'expiration).
        if (imageIds?.length) await ctx.uploads.consume(ctx.user.id, imageIds);

        return jsonContent({
          id: result.id,
          status: result.status,
          message:
            "Journée créée — lecture du carnet en cours. Elle apparaîtra en brouillon à relire puis publier dans Racontine.",
        });
      },
    );
  },
};
