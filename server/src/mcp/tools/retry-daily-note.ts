import { z } from "zod";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/**
 * Relance la lecture d'une journée en échec, sur ses pages déjà téléversées.
 *
 * La seule sortie d'un échec était « Reprendre la photo » : correct quand la
 * page est floue, faux quand la lecture est morte avec le processus — les pages
 * sont alors intactes sur le disque, et le carnet papier est reparti chez la
 * nounou. C'est le geste d'exploitation le plus fréquent, et celui qu'un agent
 * peut enchaîner seul après `instance_status`.
 */
export const retryDailyNoteTool: McpTool = {
  name: "retry_daily_note",
  register(server, ctx) {
    server.registerTool(
      "retry_daily_note",
      {
        title: "Relancer la lecture d'une journée",
        description:
          "Relance la lecture VLM d'une journée en échec, sur ses pages déjà téléversées (aucune photo à reprendre). La lecture repart en arrière-plan : la journée passe en `processing` puis en `draft`, à relire et publier. Consomme la clé API Anthropic de l'appelant. Refusé si la journée n'est pas (ou plus) en échec, ou si elle n'a plus de page.",
        inputSchema: {
          entryId: z
            .string()
            .describe(
              "Identifiant de la journée en échec (voir `instance_status` ou `list_daily_notes` avec status=failed).",
            ),
        },
      },
      async ({ entryId }) => {
        const started = await ctx.reading.retry(entryId, ctx.user.id);
        // Refus uniforme : on ne divulgue pas l'existence d'une journée non
        // partagée (le service rend déjà « introuvable » dans ce cas).
        if (!started.ok) return errorContent(started.error);
        return jsonContent({
          id: entryId,
          status: "processing",
          message:
            "Lecture relancée en arrière-plan. Vérifie l'état avec get_daily_note dans une minute.",
        });
      },
    );
  },
};
