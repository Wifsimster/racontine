import { api } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushState =
  | "unsupported"
  | "unavailable"
  | "denied"
  | "subscribed"
  | "unsubscribed";

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { publicKey } = await api.getPushPublicKey();
  if (!publicKey) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function enablePush(): Promise<void> {
  if (!pushSupported())
    throw new Error("Notifications non supportées par ce navigateur.");

  const { publicKey } = await api.getPushPublicKey();
  if (!publicKey)
    throw new Error(
      "Notifications navigateur indisponibles (serveur non configuré).",
    );

  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Permission refusée. Autorisez les notifications dans votre navigateur.",
    );

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    throw new Error("Abonnement push incomplet.");

  await api.subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
