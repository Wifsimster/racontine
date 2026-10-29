import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { pushSubscriptions } from "./db/schema.js";
import { config } from "./config.js";

const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];
const PUSH_SERVICE_SUFFIXES = [
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com",
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username) return false;
  const host = url.hostname.toLowerCase();
  return (
    PUSH_SERVICE_HOSTS.includes(host) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

let configured: boolean | undefined;

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

export function webPushEnabled(): boolean {
  return ensureConfigured();
}

export function vapidPublicKey(): string | null {
  return ensureConfigured() ? config.webPush.publicKey! : null;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

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

  const reachable = subs.filter((s) => isPushServiceEndpoint(s.endpoint));

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    reachable.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
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
