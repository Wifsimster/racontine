import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { children, memberships } from "./db/schema.js";
import { roleAtLeast } from "./access.js";
import { ingestCarnetImages, SOURCES } from "./ingest.js";
import type { McpTokenUser } from "./mcp-tokens.js";

const SERVER_INFO = { name: "racontine", version: "1.0.0" } as const;

/** Décode une image base64 (avec ou sans préfixe `data:…;base64,`) en Buffer. */
function decodeBase64Image(input: string): Buffer | null {
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ children: contributable }, null, 2),
          },
        ],
      };
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
          return {
            content: [
              {
                type: "text",
                text: `Image ${i + 1} invalide : chaîne base64 non décodable.`,
              },
            ],
            isError: true,
          };
        buffers.push(buf);
      }

      const result = await ingestCarnetImages({
        userId: user.id,
        images: buffers,
        childId,
        date,
        source,
      });

      if (!result.ok)
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };

      return {
        content: [
          {
            type: "text",
            text: `Journée créée (id ${result.id}) — lecture du carnet en cours. Elle apparaîtra en brouillon à relire puis publier dans Racontine.`,
          },
        ],
      };
    },
  );

  return server;
}
