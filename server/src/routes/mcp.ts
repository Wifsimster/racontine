import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireUser } from "../plugins/auth.js";
import {
  authenticateMcpToken,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "../mcp-tokens.js";
import { buildMcpServer } from "../mcp.js";

// Les images arrivent en base64 dans le corps JSON (une page ~2400px pèse
// quelques Mo une fois encodée) : on relève la limite de corps pour cette route.
const MCP_BODY_LIMIT = 32 * 1024 * 1024;

export async function mcpRoutes(app: FastifyInstance) {
  /* ---------------------- Endpoint MCP (jeton Bearer) ------------------- */

  // Transport Streamable HTTP en mode stateless : une paire serveur/transport
  // par requête, authentifiée par un jeton personnel (et non par cookie de
  // session — l'appelant est un client MCP, pas le navigateur).
  app.route({
    method: ["POST", "GET", "DELETE"],
    url: "/api/mcp",
    bodyLimit: MCP_BODY_LIMIT,
    async handler(req, reply) {
      const user = await authenticateMcpToken(req.headers.authorization);
      if (!user) {
        return reply
          .code(401)
          .header("WWW-Authenticate", "Bearer")
          .send({ error: "jeton MCP invalide ou absent" });
      }

      const server = buildMcpServer(user);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });

      // Nettoyage quand la réponse se termine (mode stateless : rien à conserver).
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        // On rend la main à la couche brute : le transport écrit lui-même la
        // réponse sur reply.raw. Fastify ne doit plus tenter d'y répondre.
        reply.hijack();
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } catch (err) {
        app.log.error({ err }, "Échec de la requête MCP");
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { "content-type": "application/json" });
          reply.raw.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Erreur interne du serveur MCP." },
              id: null,
            }),
          );
        }
      }
    },
  });

  /* ---------------- Gestion des jetons (session utilisateur) ------------ */

  app.get(
    "/api/mcp/tokens",
    { preHandler: requireUser },
    async (req) => ({ tokens: await listMcpTokens(req.user!.id) }),
  );

  app.post<{ Body: { name?: unknown } }>(
    "/api/mcp/tokens",
    { preHandler: requireUser },
    async (req, reply) => {
      const raw = req.body?.name;
      const name = typeof raw === "string" ? raw.trim() : "";
      if (!name || name.length > 60)
        return reply
          .code(400)
          .send({ error: "nom de jeton invalide (1 à 60 caractères)" });
      const created = await createMcpToken(req.user!.id, name);
      return reply.code(201).send(created);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/mcp/tokens/:id",
    { preHandler: requireUser },
    async (req, reply) => {
      const ok = await revokeMcpToken(req.user!.id, req.params.id);
      if (!ok) return reply.code(404).send({ error: "jeton introuvable" });
      return reply.code(204).send();
    },
  );
}
