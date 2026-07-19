import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { pushSubscriptions } from "./db/schema.js";
import { config } from "./config.js";

/**
 * Web Push (VAPID) — notifications navigateur/mobile poussées aux proches
 * abonnés, même app fermée. Dégradation propre : sans paire de clés VAPID,
 * `webPushEnabled()` est faux et les envois sont silencieusement ignorés (les
 * notifs in-app et e-mail restent actives).
 */

let configured: boolean | undefined;

/**
 * Configure VAPID au premier appel (paresseux, mémoïsé). Retourne false si les
 * clés sont absentes — le push est alors désactivé.
 */
function ensureConfigured(): boolean {
  if (configured !== undefined) return configured;
  const { publicKey, privateKey, subject } = config.webPush;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** True si une paire de clés VAPID est configurée. */
export function webPushEnabled(): boolean {
  return ensureConfigured();
}

/** Clé publique VAPID à exposer au client, ou null si le push est désactivé. */
export function vapidPublicKey(): string | null {
  return ensureConfigured() ? config.webPush.publicKey! : null;
}

export type PushPayload = {
  title: string;
  body: string;
  /** URL ouverte au clic sur la notification. */
  url?: string;
  /** Regroupe/écrase les notifications d'un même sujet (ex. une entrée). */
  tag?: string;
};

/**
 * Pousse une notification à tous les appareils d'un utilisateur. Ne lève
 * jamais : chaque envoi est isolé (`allSettled`) et un abonnement expiré
 * (404/410) est purgé au passage plutôt que réessayé indéfiniment.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404 (endpoint inconnu) / 410 (abonnement révoqué) : l'appareil s'est
        // désabonné ou le navigateur a fait tourner l'endpoint. On purge pour
        // ne pas retenter à chaque publication.
        if (code === 404 || code === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error(
            "[push] échec d'envoi :",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }),
  );
}
