import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpTooling } from "./composition.js";
import { describeFailure } from "./log.js";
import { errorContent } from "./mcp/protocol.js";
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
  const guarded = guardToolFailures(server);
  for (const tool of MCP_TOOLS) tool.register(guarded, ctx);
  return server;
}

/**
 * Ce qu'une panne d'outil a le droit de dire — la même règle que l'API HTTP
 * (`describeFailure`). Sans cette garde, le SDK renvoyait `error.message` tel
 * quel au client : pour un identifiant mal formé, c'était le texte de la
 * requête SQL (tables, colonnes, paramètres), que `log.ts` interdit justement
 * de laisser sortir.
 */
function guardToolFailures(server: McpServer): McpServer {
  const register = server.registerTool.bind(server);
  const guarded = Object.create(server) as McpServer;
  guarded.registerTool = ((name: string, config: unknown, handler: Function) =>
    register(name, config as never, (async (...args: unknown[]) => {
      try {
        return await handler(...args);
      } catch (err) {
        const { body, severity } = describeFailure(err);
        if (severity === "error")
          console.error(`[mcp] outil ${name} en échec`, err);
        return errorContent(body.error);
      }
    }) as never)) as McpServer["registerTool"];
  return guarded;
}
