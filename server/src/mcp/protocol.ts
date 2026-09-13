import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpTokenUser } from "../mcp-tokens.js";
import type { IngestService } from "../services/ingest-service.js";
import type { TranscribedNoteService } from "../services/transcribed-note-service.js";
import type { EntryQueries } from "./queries.js";
import type { StagedUploads } from "./uploads.js";

/** Nombre maximum de pages par journée (aligné sur la limite du formulaire web). */
export const MAX_PAGES = 12;

/** Bloc de contenu texte JSON (réponse standard d'un outil). */
export function jsonContent(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

/** Réponse d'erreur outil (message lisible, `isError`). */
export function errorContent(message: string) {
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
 * Ce qu'un outil MCP reçoit : l'utilisateur du jeton et les services dont il a
 * besoin. Aucun outil ne va chercher ses dépendances lui-même — elles arrivent
 * par ici, ce qui les rend interchangeables (et testables).
 */
export type McpToolContext = {
  user: McpTokenUser;
  ingest: IngestService;
  notes: TranscribedNoteService;
  queries: EntryQueries;
  uploads: StagedUploads;
};

/**
 * UN OUTIL MCP = UN MODULE.
 *
 * Les cinq outils tenaient dans une seule fonction de 400 lignes : schémas zod,
 * requêtes SQL et gestion d'erreurs entremêlés, et un sixième outil aurait
 * signifié rouvrir ce bloc. Chacun vit maintenant dans son fichier et s'inscrit
 * dans `MCP_TOOLS` ; le constructeur du serveur, lui, ne change plus jamais.
 */
export type McpTool = {
  /** Nom exposé au client MCP (sert aussi de clé de journalisation). */
  name: string;
  register(server: McpServer, ctx: McpToolContext): void;
};
