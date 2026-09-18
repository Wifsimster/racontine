import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpTooling } from "./composition.js";
import type { McpTokenUser } from "./mcp-tokens.js";
import { MCP_TOOLS } from "./mcp/tools/index.js";
import { SERVER_VERSION } from "./version.js";

export { decodeBase64Image } from "./mcp/protocol.js";
// Version alignée sur le package (évite une valeur figée qui dérive à chaque
// release). Elle vit dans `version.ts` : les outils d'exploitation la lisent
// sans passer par ce fichier, qui dépend, lui, de la racine de composition.
export { SERVER_VERSION };

const SERVER_INFO = { name: "racontine", version: SERVER_VERSION } as const;

/**
 * Construit un serveur MCP dédié à `user` (droits par enfant hérités du jeton).
 * En mode HTTP stateless, une instance est créée par requête, si bien que le
 * contexte utilisateur est isolé — aucun partage d'état entre appels.
 *
 * Le constructeur ne connaît plus AUCUN outil en particulier : il parcourt le
 * catalogue et passe à chacun le même contexte. Les cinq outils qui vivaient
 * ici, schémas et SQL compris, sont dans `mcp/tools/`.
 */
export function buildMcpServer(user: McpTokenUser): McpServer {
  const server = new McpServer(SERVER_INFO);
  const ctx = { user, ...mcpTooling };
  for (const tool of MCP_TOOLS) tool.register(server, ctx);
  return server;
}
