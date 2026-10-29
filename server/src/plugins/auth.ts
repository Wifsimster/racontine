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

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(req);
  if (!session) {
    return reply.code(401).send({ error: "authentification requise" });
  }
  req.user = session.user;
}

export async function authPlugin(app: FastifyInstance) {
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
