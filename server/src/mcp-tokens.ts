import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { mcpTokens, user, type McpToken } from "./db/schema.js";

const TOKEN_PREFIX = "rac_mcp_";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export type McpTokenPublic = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreatedMcpToken = {
  token: McpTokenPublic;
  secret: string;
};

export type McpTokenUser = { id: string; name: string; email: string };

function toPublic(t: McpToken): McpTokenPublic {
  return {
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt,
  };
}

export async function createMcpToken(
  userId: string,
  name: string,
): Promise<CreatedMcpToken> {
  const secret = generateRawToken();
  const tokenHash = hashToken(secret);
  const tokenPrefix = secret.slice(0, TOKEN_PREFIX.length + 4);
  const [row] = await db
    .insert(mcpTokens)
    .values({ userId, name, tokenHash, tokenPrefix })
    .returning();
  return { token: toPublic(row), secret };
}

export async function listMcpTokens(userId: string): Promise<McpTokenPublic[]> {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt));
  return rows.map(toPublic);
}

export async function revokeMcpToken(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(mcpTokens)
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)))
    .returning({ id: mcpTokens.id });
  return deleted.length > 0;
}

export async function authenticateMcpToken(
  authHeader: string | string[] | undefined,
): Promise<McpTokenUser | null> {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const raw = match?.[1]?.trim();
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(raw);
  const [row] = await db
    .select({
      id: mcpTokens.id,
      userId: mcpTokens.userId,
      userName: user.name,
      userEmail: user.email,
    })
    .from(mcpTokens)
    .innerJoin(user, eq(user.id, mcpTokens.userId))
    .where(eq(mcpTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;

  void db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))
    .catch(() => {
    });

  return { id: row.userId, name: row.userName, email: row.userEmail };
}
