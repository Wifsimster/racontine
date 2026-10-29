import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { userLlmSettings } from "./db/schema.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

export function looksLikeAnthropicKey(raw: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(raw.trim());
}

export type UserLlmMeta = { configured: boolean; hint: string | null };

async function readRow(userId: string) {
  const [row] = await db
    .select()
    .from(userLlmSettings)
    .where(eq(userLlmSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getUserLlmMeta(userId: string): Promise<UserLlmMeta> {
  const row = await readRow(userId);
  return { configured: !!row?.anthropicKeyEnc, hint: row?.anthropicKeyHint ?? null };
}

export async function getUserAnthropicKey(
  userId: string,
): Promise<string | null> {
  const row = await readRow(userId);
  if (!row?.anthropicKeyEnc) return null;
  try {
    return decryptSecret(row.anthropicKeyEnc);
  } catch {
    return null;
  }
}

export async function setUserAnthropicKey(
  userId: string,
  rawKey: string,
): Promise<UserLlmMeta> {
  const key = rawKey.trim();
  const set = {
    anthropicKeyEnc: encryptSecret(key),
    anthropicKeyHint: key.slice(-4),
    updatedAt: new Date(),
  };
  await db
    .insert(userLlmSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userLlmSettings.userId, set });
  return { configured: true, hint: set.anthropicKeyHint };
}

export async function clearUserAnthropicKey(
  userId: string,
): Promise<UserLlmMeta> {
  const set = {
    anthropicKeyEnc: null,
    anthropicKeyHint: null,
    updatedAt: new Date(),
  };
  await db
    .insert(userLlmSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userLlmSettings.userId, set });
  return { configured: false, hint: null };
}
