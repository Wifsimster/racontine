import { z } from "zod";
import { assessOps, type OpsCarnet } from "../../domain/ops-status.js";
import type { McpTool } from "../protocol.js";
import { jsonContent } from "../protocol.js";

/* ===========================================================================
   « COMMENT VA L'INSTANCE ? » — le premier appel d'un agent d'exploitation.

   Un seul aller-retour rend tout ce qu'il faut pour décider : la version qui
   tourne, les réglages en vigueur, l'état de l'infrastructure, les carnets
   administrés avec leurs compteurs, et ce qui attend une main. Les trois outils
   qui suivent (`retry_daily_note`, `publish_daily_note`,
   `update_instance_settings`) sont les gestes que cette photo appelle.

   Le périmètre est TOUJOURS celui du jeton : un contributeur y voit ses
   lectures en échec, pas les carnets du foyer d'à côté ; les réglages et
   l'infrastructure ne s'ouvrent qu'au propriétaire de l'instance.
   =========================================================================== */

/** Photo d'exploitation de l'instance, au périmètre du jeton. */
export const instanceStatusTool: McpTool = {
  name: "instance_status",
  register(server, ctx) {
    server.registerTool(
      "instance_status",
      {
        title: "État de l'instance",
        description:
          "Photo d'exploitation de l'instance : version du serveur, réglages en vigueur et état de l'infrastructure (e-mail, notifications push, webhook) pour le propriétaire, carnets administrés avec leurs compteurs de journées, et ce qui demande une intervention — lectures en échec (relançables par `retry_daily_note`), lectures bloquées, brouillons à publier (`publish_daily_note`), invitations expirées. Commence par cet outil avant tout geste d'exploitation.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe(
              "Nombre maximum de journées coincées (en échec ou en lecture) à détailler (défaut 20, max 50).",
            ),
        },
      },
      async ({ limit }) => {
        const owner = await ctx.instance.isOwner(ctx.user.id);
        const settings = await ctx.instance.settings();

        // La console rend 403 à qui n'administre aucun carnet : c'est un
        // périmètre vide, pas une erreur — un contributeur pilote quand même
        // ses lectures.
        const console = await ctx.admin.console(ctx.user.id);
        const carnets: OpsCarnet[] = console.ok
          ? console.console.children.map((c) => ({
              id: c.id,
              name: c.name,
              processing: c.entries.processing,
              draft: c.entries.draft,
              published: c.entries.published,
              failed: c.entries.failed,
              lastPublishedAt: c.lastPublishedAt,
            }))
          : [];
        const invitations = console.ok ? console.console.invitations : [];

        const stuck = await ctx.ops.stuckNotes(ctx.user.id, limit ?? 20);
        const assessment = assessOps({
          carnets,
          stuck,
          invitations,
          now: new Date(),
        });

        const { healthy, summary, ...attention } = assessment;
        return jsonContent({
          healthy,
          summary,
          instance: {
            appName: settings.appName,
            version: ctx.instance.version,
            // Réglages et infrastructure : affaire du propriétaire seul.
            settings: owner ? settings : null,
            infra: owner ? ctx.instance.infra() : null,
          },
          caller: {
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
            isOwner: owner,
            isAdmin: console.ok,
          },
          carnets,
          attention,
        });
      },
    );
  },
};
