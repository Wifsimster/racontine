import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { mcpTokens, user, type McpToken } from "./db/schema.js";

/** Préfixe reconnaissable des jetons MCP (aide au repérage / au filtrage). */
const TOKEN_PREFIX = "rac_mcp_";

/** SHA-256 (hex) du jeton. On ne stocke jamais la valeur en clair. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Génère un jeton en clair, montré une seule fois à l'utilisateur. */
export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** Vue publique d'un jeton (sans le secret). */
export type McpTokenPublic = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreatedMcpToken = {
  token: McpTokenPublic;
  /** Valeur en clair — à afficher une seule fois, jamais restockée. */
  secret: string;
};

/** Utilisateur porteur d'un jeton MCP (résolu à l'authentification). */
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

/** Crée un jeton pour `userId` et renvoie sa valeur en clair (une seule fois). */
export async function createMcpToken(
  userId: string,
  name: string,
): Promise<CreatedMcpToken> {
  const secret = generateRawToken();
  const tokenHash = hashToken(secret);
  // Préfixe + 4 caractères : assez pour distinguer plusieurs jetons dans l'UI,
  // pas assez pour reconstituer le secret.
  const tokenPrefix = secret.slice(0, TOKEN_PREFIX.length + 4);
  const [row] = await db
    .insert(mcpTokens)
    .values({ userId, name, tokenHash, tokenPrefix })
    .returning();
  return { token: toPublic(row), secret };
}

/** Jetons de l'utilisateur, du plus récent au plus ancien. */
export async function listMcpTokens(userId: string): Promise<McpTokenPublic[]> {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt));
  return rows.map(toPublic);
}

/** Révoque un jeton de l'utilisateur. true s'il existait (et a été supprimé). */
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

/**
 * Authentifie un en-tête « Authorization: Bearer <token> ». Renvoie l'utilisateur
 * porteur du jeton (ses droits), ou null si le jeton est absent/invalide.
 * La recherche se fait par hash exact (le secret n'existe nulle part en base).
 * Met à jour `lastUsedAt` en tâche de fond (best-effort, sans bloquer l'appel).
 */
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
      /* horodatage best-effort : une erreur ici ne doit pas casser l'appel */
    });

  return { id: row.userId, name: row.userName, email: row.userEmail };
}
