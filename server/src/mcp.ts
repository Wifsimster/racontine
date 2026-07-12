import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "./db/index.js";
import { children, entries, memberships } from "./db/schema.js";
import { childRole, roleAtLeast } from "./access.js";
import { ingestCarnetImages, SOURCES } from "./ingest.js";
import type { McpTokenUser } from "./mcp-tokens.js";

// Version alignée sur le package (évite une valeur figée qui dérive à chaque
// release). `require` résout `../package.json` aussi bien depuis `src/` (tsx) que
// depuis `dist/` (build) : le fichier est toujours à la racine de `server/`.
const require = createRequire(import.meta.url);
/** Version du serveur MCP, tirée de `server/package.json`. */
export const SERVER_VERSION: string = (
  require("../package.json") as { version: string }
).version;

const SERVER_INFO = { name: "racontine", version: SERVER_VERSION } as const;

/** États possibles d'une journée (aligné sur l'enum `entry_status`). */
const ENTRY_STATUSES = ["processing", "draft", "published", "failed"] as const;

/** Bloc de contenu texte JSON (réponse standard d'un outil). */
function jsonContent(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

/** Réponse d'erreur outil (message lisible, `isError`). */
function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Décode une image base64 (avec ou sans préfixe `data:…;base64,`) en Buffer. */
export function decodeBase64Image(input: string): Buffer | null {
  const cleaned = input.replace(/^data:[^;,]*;base64,/, "").trim();
  if (!cleaned) return null;
  try {
    const buf = Buffer.from(cleaned, "base64");
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Construit un serveur MCP dédié à `user` (droits par enfant hérités du jeton).
 * En mode HTTP stateless, une instance est créée par requête, si bien que le
 * contexte utilisateur est isolé — aucun partage d'état entre appels.
 */
export function buildMcpServer(user: McpTokenUser): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "list_children",
    {
      title: "Lister les enfants",
      description:
        "Liste les enfants auxquels ce compte peut contribuer (photographier / publier une journée). Utilise l'`id` renvoyé comme `childId` de `upload_daily_note`.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          id: children.id,
          name: children.name,
          role: memberships.role,
        })
        .from(children)
        .innerJoin(memberships, eq(memberships.childId, children.id))
        .where(eq(memberships.userId, user.id))
        .orderBy(children.createdAt);
      const contributable = rows.filter((r) =>
        roleAtLeast(r.role, "contributor"),
      );
      return jsonContent({ children: contributable });
    },
  );

  server.registerTool(
    "upload_daily_note",
    {
      title: "Téléverser une page de carnet",
      description:
        "Téléverse une ou plusieurs photos d'une page du carnet de liaison pour une journée. Le serveur les lit avec un modèle vision et crée un brouillon de journée à relire puis publier dans Racontine. Les pages d'une même journée (même enfant / date / lieu) sont fusionnées automatiquement.",
      inputSchema: {
        images: z
          .array(z.string())
          .min(1)
          .max(12)
          .describe(
            "Pages du carnet, chacune encodée en base64 (JPEG/PNG/HEIC/WebP). Le préfixe `data:…;base64,` est accepté.",
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
    async ({ images, childId, date, source }) => {
      const buffers: Buffer[] = [];
      for (const [i, img] of images.entries()) {
        const buf = decodeBase64Image(img);
        if (!buf)
          return errorContent(
            `Image ${i + 1} invalide : chaîne base64 non décodable.`,
          );
        buffers.push(buf);
      }

      const result = await ingestCarnetImages({
        userId: user.id,
        images: buffers,
        childId,
        date,
        source,
      });

      if (!result.ok) return errorContent(result.error);

      return jsonContent({
        id: result.id,
        status: result.status,
        message:
          "Journée créée — lecture du carnet en cours. Elle apparaîtra en brouillon à relire puis publier dans Racontine.",
      });
    },
  );

  server.registerTool(
    "list_daily_notes",
    {
      title: "Lister les journées",
      description:
        "Liste les journées récentes d'un enfant (les plus récentes d'abord). Un lecteur ne voit que les journées publiées ; un contributeur/admin voit aussi les brouillons. Utilise l'`id` renvoyé avec `get_daily_note` pour le détail complet.",
      inputSchema: {
        childId: z
          .string()
          .optional()
          .describe(
            "Identifiant de l'enfant (voir list_children). Facultatif : sans lui, toutes les journées accessibles sont listées.",
          ),
        status: z
          .enum(ENTRY_STATUSES)
          .optional()
          .describe(
            "Filtre optionnel sur l'état : processing, draft, published ou failed.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Nombre maximum de journées à renvoyer (défaut 20, max 50)."),
      },
    },
    async ({ childId, status, limit }) => {
      const mems = await db
        .select({ childId: memberships.childId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user.id));
      if (!mems.length) return jsonContent({ notes: [] });

      const roleByChild = new Map(mems.map((m) => [m.childId, m.role]));
      let scopeIds = [...roleByChild.keys()];
      if (childId !== undefined) {
        // On ne divulgue pas l'existence d'un enfant non partagé : message uniforme.
        if (!roleByChild.has(childId))
          return errorContent("Enfant introuvable ou inaccessible.");
        scopeIds = [childId];
      }

      // Visibilité : un lecteur ne voit que le publié ; contributeur/admin voient
      // aussi les brouillons (relecture) sur les enfants qu'ils co-gèrent.
      const draftableIds = scopeIds.filter((id) =>
        roleAtLeast(roleByChild.get(id)!, "contributor"),
      );
      const where = and(
        inArray(entries.childId, scopeIds),
        status ? eq(entries.status, status) : undefined,
        or(
          eq(entries.status, "published"),
          draftableIds.length
            ? inArray(entries.childId, draftableIds)
            : undefined,
        ),
      );

      const rows = await db.query.entries.findMany({
        where,
        orderBy: [desc(entries.date), desc(entries.createdAt)],
        limit: limit ?? 20,
        with: { child: { columns: { name: true } } },
      });

      const notes = rows.map((e) => ({
        id: e.id,
        childId: e.childId,
        child: e.child?.name ?? null,
        date: e.date,
        source: e.source,
        status: e.status,
        title: e.title,
        mood: e.mood,
        highlight: e.highlight,
      }));
      return jsonContent({ notes });
    },
  );

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
      const entry = await db.query.entries.findFirst({
        where: eq(entries.id, entryId),
        with: {
          child: { columns: { name: true } },
          items: { orderBy: (i, { asc }) => [asc(i.position)] },
          attachments: { columns: { id: true } },
        },
      });
      // Message uniforme « introuvable » pour l'absence comme pour l'accès refusé :
      // on ne révèle pas l'existence d'une journée non partagée.
      if (!entry) return errorContent("Journée introuvable.");
      const role = await childRole(user.id, entry.childId);
      if (!role) return errorContent("Journée introuvable.");
      if (role === "reader" && entry.status !== "published")
        return errorContent("Journée introuvable.");

      const items = entry.items;
      const note = {
        id: entry.id,
        childId: entry.childId,
        child: entry.child?.name ?? null,
        date: entry.date,
        source: entry.source,
        status: entry.status,
        failureReason: entry.failureReason,
        title: entry.title,
        mood: entry.mood,
        story: entry.story,
        highlight: entry.highlight,
        transcription: entry.transcription,
        uncertainties: entry.uncertainties,
        meals: items.filter((i) => i.type === "meal").map((i) => i.data),
        naps: items.filter((i) => i.type === "nap").map((i) => i.data),
        activities: items
          .filter((i) => i.type === "activity")
          .map((i) => (i.data as { label: string }).label),
        anecdotes: items
          .filter((i) => i.type === "anecdote")
          .map((i) => (i.data as { text: string }).text),
        health: items
          .filter((i) => i.type === "health")
          .map((i) => (i.data as { note: string }).note),
        pageCount: entry.attachments.length,
      };
      return jsonContent({ note });
    },
  );

  return server;
}
