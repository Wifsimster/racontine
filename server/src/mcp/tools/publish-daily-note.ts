import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Publie un brouillon déjà relu. La règle est celle de la relecture humaine
 * (`EntryEditingService`) — contrôle d'accès, transition de publication et
 * notification des proches comprises : publier depuis un agent et publier
 * depuis l'écran de relecture, c'est le même chemin.
 */
export const publishDailyNoteTool: McpTool = {
  name: "publish_daily_note",
  register(server, ctx) {
    server.registerTool(
      "publish_daily_note",
      {
        title: "Publier une journée",
        description:
          "Publie un brouillon : la journée devient visible des proches abonnés au carnet, qui en sont notifiés (e-mail / notification push, selon leurs réglages). Réservé aux contributeurs et administrateurs du carnet. Relis la journée avec `get_daily_note` avant de publier — la publication part vers de vraies personnes.",
        inputSchema: {
          entryId: z
            .string()
            .describe(
              "Identifiant de la journée à publier (voir `instance_status` ou `list_daily_notes` avec status=draft).",
            ),
        },
      },
      async ({ entryId }) => {
        const result = await ctx.editing.revise({
          entryId,
          userId: ctx.user.id,
          publish: true,
        });
        if (!result.ok) return errorContent(result.error);

        // On rend la journée telle qu'elle vient d'être publiée : l'agent voit
        // ce que les proches vont lire, sans second appel.
        const published = await ctx.queries.findNote(ctx.user.id, entryId);
        return jsonContent({
          id: entryId,
          status: published?.entry.status ?? "published",
          date: published?.entry.date ?? null,
          child: published?.entry.childName ?? null,
          title: published?.entry.title ?? null,
          story: published?.entry.story ?? null,
        });
      },
    );
  },
};
