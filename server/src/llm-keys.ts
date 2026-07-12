import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { userLlmSettings } from "./db/schema.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

/**
 * Réglages LLM par utilisateur : chaque contributeur apporte sa propre clé API
 * Anthropic. On ne stocke jamais la clé en clair (voir crypto.ts) ; seul un
 * indice (4 derniers caractères) sert à l'affichage.
 */

/**
 * Forme plausible d'une clé API Anthropic (« sk-ant-… »). Validation souple :
 * on refuse le grossièrement invalide sans se lier au format exact d'Anthropic
 * (qui peut évoluer). La vraie validation, c'est un appel API réussi.
 */
export function looksLikeAnthropicKey(raw: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(raw.trim());
}

/** Vue publique (non sensible) de l'état de la clé d'un utilisateur. */
export type UserLlmMeta = { configured: boolean; hint: string | null };

async function readRow(userId: string) {
  const [row] = await db
    .select()
    .from(userLlmSettings)
    .where(eq(userLlmSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

/** État affichable de la clé (configurée ? indice ?) pour l'UI. */
export async function getUserLlmMeta(userId: string): Promise<UserLlmMeta> {
  const row = await readRow(userId);
  return { configured: !!row?.anthropicKeyEnc, hint: row?.anthropicKeyHint ?? null };
}

/**
 * Clé API en clair de l'utilisateur, ou null si non configurée / illisible
 * (secret d'instance changé, blob corrompu). L'appelant traite null comme
 * « pas de clé » — jamais une erreur brute.
 */
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

/** Enregistre (ou remplace) la clé de l'utilisateur, chiffrée au repos. */
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

/** Supprime la clé de l'utilisateur (retour à « non configurée »). */
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
