import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpTooling } from "./composition.js";
import { describeFailure } from "./log.js";
import { errorContent } from "./mcp/protocol.js";
import type { McpTokenUser } from "./mcp-tokens.js";
import { MCP_TOOLS } from "./mcp/tools/index.js";
import { SERVER_VERSION } from "./version.js";

export { decodeBase64Image } from "./mcp/protocol.js";
export { SERVER_VERSION };

const SERVER_INFO = { name: "racontine", version: SERVER_VERSION } as const;

export function buildMcpServer(user: McpTokenUser): McpServer {
  const server = new McpServer(SERVER_INFO);
  const ctx = { user, ...mcpTooling };
  const guarded = guardToolFailures(server);
  for (const tool of MCP_TOOLS) tool.register(guarded, ctx);
  return server;
}

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
