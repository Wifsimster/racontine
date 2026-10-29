import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireUser } from "../plugins/auth.js";
import {
  authenticateMcpToken,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "../mcp-tokens.js";
import {
  MAX_PENDING_UPLOADS,
  MAX_STAGED_BYTES,
  stageUpload,
} from "../mcp-uploads.js";
import { buildMcpServer } from "../mcp.js";
import { canContributeSomewhere } from "../access.js";

const MCP_BODY_LIMIT = 32 * 1024 * 1024;

export async function mcpRoutes(app: FastifyInstance) {
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
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
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

  app.post(
    "/api/mcp/uploads",
    { bodyLimit: MCP_BODY_LIMIT },
    async (req, reply) => {
      const user = await authenticateMcpToken(req.headers.authorization);
      if (!user)
        return reply
          .code(401)
          .header("WWW-Authenticate", "Bearer")
          .send({ error: "jeton MCP invalide ou absent" });

      if (!(await canContributeSomewhere(user.id)))
        return reply.code(403).send({
          error: "Ce compte ne peut ajouter de journée à aucun carnet.",
        });

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0)
        return reply.code(400).send({
          error:
            "Corps vide ou non binaire. Envoyez les octets bruts de la photo (Content-Type: application/octet-stream).",
        });
      if (body.length > MAX_STAGED_BYTES)
        return reply
          .code(413)
          .send({ error: "Photo trop volumineuse (max 20 Mo par page)." });

      const staged = await stageUpload(user.id, body);
      if (!staged)
        return reply.code(429).send({
          error: `Trop de pages en attente (${MAX_PENDING_UPLOADS} au plus) : importez-les avec \`upload_daily_note\`, ou attendez leur expiration (30 min).`,
        });
      return reply.code(201).send({
        uploadId: staged.id,
        byteSize: staged.byteSize,
        expiresAt: staged.expiresAt.toISOString(),
      });
    },
  );

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
