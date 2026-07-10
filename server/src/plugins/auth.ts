import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { auth, type AuthSession } from "../auth.js";

function toWebHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : value);
  }
  return headers;
}

/** Session Better Auth pour une requête Fastify, ou null si non connecté. */
export async function getSession(
  req: FastifyRequest,
): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: toWebHeaders(req) });
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthSession["user"];
  }
}

/** preHandler : exige une session valide, sinon 401. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(req);
  if (!session) {
    return reply.code(401).send({ error: "authentification requise" });
  }
  req.user = session.user;
}

/**
 * Monte le handler Better Auth sur /api/auth/*.
 * Plugin encapsulé : son content-type parser (corps brut) ne s'applique qu'ici,
 * les autres routes gardent le parsing JSON de Fastify.
 */
export async function authPlugin(app: FastifyInstance) {
  // Sans ça, le parser application/json hérité du parent interceperait le corps
  // avant notre parser brut → Better Auth recevrait un objet, pas des octets.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_req, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on("data", (c: Buffer) => chunks.push(c));
    payload.on("end", () => done(null, Buffer.concat(chunks)));
    payload.on("error", done);
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(req, reply) {
      const url = new URL(
        req.url,
        `${req.protocol}://${req.headers.host ?? "localhost"}`,
      );
      const hasBody = !["GET", "HEAD"].includes(req.method);
      const rawBody = req.body as Buffer | undefined;
      const request = new Request(url, {
        method: req.method,
        headers: toWebHeaders(req),
        body: hasBody && rawBody ? new Uint8Array(rawBody) : undefined,
      });

      const response = await auth.handler(request);

      reply.code(response.status);
      const setCookies =
        (response.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ??
        [];
      for (const cookie of setCookies) reply.header("set-cookie", cookie);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
      });

      const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
      return reply.send(body);
    },
  });
}
