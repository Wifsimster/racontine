import { z } from "zod";
import { SOURCES } from "../../domain/entry-metadata.js";
import type { McpTool } from "../protocol.js";
import { errorContent, jsonContent } from "../protocol.js";

/** Crée une journée à partir d'un contenu déjà transcrit (sans photo ni VLM). */
export const createDailyNoteTool: McpTool = {
  name: "create_daily_note",
  register(server, ctx) {
    server.registerTool(
      "create_daily_note",
      {
        title: "Créer une journée déjà transcrite",
        description:
          "Crée une journée à partir d'un contenu DÉJÀ transcrit (texte + listes structurées), sans photo ni lecture par le modèle vision. À utiliser quand tu disposes déjà du récit (transcription manuelle, autre OCR, saisie assistée…) : aucune clé API Anthropic n'est requise, contrairement à `upload_daily_note`. Crée un brouillon par défaut (`publish: true` pour publier directement). Si une journée existe déjà pour cet enfant/date/lieu, l'appel échoue (409) — modifie-la depuis Racontine.",
        inputSchema: {
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
          title: z
            .string()
            .optional()
            .describe("Titre court et évocateur de la journée (3 à 6 mots)."),
          story: z
            .string()
            .optional()
            .describe(
              "Récit chaleureux de la journée destiné aux proches (2 à 4 phrases).",
            ),
          highlight: z
            .string()
            .optional()
            .describe("Le temps fort du jour en une phrase courte."),
          mood: z.string().optional().describe("Humeur générale de l'enfant."),
          transcription: z
            .string()
            .optional()
            .describe("Transcription intégrale et fidèle du texte du carnet."),
          uncertainties: z
            .array(z.string())
            .optional()
            .describe(
              "Mots ou champs dont la lecture est incertaine, à faire relire.",
            ),
          meals: z
            .array(
              z.object({
                moment: z
                  .string()
                  .describe("Moment du repas : matin, midi, goûter, soir…"),
                contenu: z.string().describe("Ce qui a été mangé."),
                appetit: z
                  .string()
                  .optional()
                  .describe("ex. tout mangé, moitié, refusé."),
              }),
            )
            .optional()
            .describe("Repas de la journée."),
          naps: z
            .array(
              z.object({
                debut: z.string().optional().describe("Heure de début, ex. 13h."),
                fin: z.string().optional().describe("Heure de fin, ex. 15h10."),
                note: z.string().optional(),
              }),
            )
            .optional()
            .describe("Siestes de la journée."),
          activities: z
            .array(z.string())
            .optional()
            .describe("Activités de la journée (une par entrée)."),
          anecdotes: z
            .array(z.string())
            .optional()
            .describe("Moments marquants, premières fois, mots rigolos."),
          health: z
            .array(z.string())
            .optional()
            .describe("Notes de santé : température, soins, incidents… (une par entrée)."),
          publish: z
            .boolean()
            .optional()
            .describe(
              "true pour publier immédiatement dans le journal (notifie les abonnés). Défaut : false — la journée reste en brouillon à relire puis publier.",
            ),
        },
      },
      async (input) => {
        const result = await ctx.notes.create({ userId: ctx.user.id, ...input });
        if (!result.ok) return errorContent(result.error);
        return jsonContent({
          id: result.id,
          status: result.status,
          message:
            result.status === "published"
              ? "Journée créée et publiée dans le journal."
              : "Journée créée en brouillon — à relire puis publier dans Racontine.",
        });
      },
    );
  },
};
