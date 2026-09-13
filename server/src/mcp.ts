import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpTooling } from "./composition.js";
import type { McpTokenUser } from "./mcp-tokens.js";
import { MCP_TOOLS } from "./mcp/tools/index.js";

export { decodeBase64Image } from "./mcp/protocol.js";

// Version alignée sur le package (évite une valeur figée qui dérive à chaque
// release). `require` résout `../package.json` aussi bien depuis `src/` (tsx) que
// depuis `dist/` (build) : le fichier est toujours à la racine de `server/`.
const require = createRequire(import.meta.url);
/** Version du serveur MCP, tirée de `server/package.json`. */
export const SERVER_VERSION: string = (
  require("../package.json") as { version: string }
).version;

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
