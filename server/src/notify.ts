import { config } from "./config.js";

/**
 * Livraison d'un lien (magic link, invitation) à un proche.
 *
 * MVP homelab : pas de SMTP par défaut. Le lien est journalisé côté serveur et,
 * si `NOTIFY_WEBHOOK_URL` est défini (ntfy…), poussé en notification. L'admin
 * peut de toute façon copier le lien d'invitation depuis l'UI et le partager
 * lui-même (WhatsApp, SMS…). Brancher un vrai envoi email ici le moment venu.
 */
export async function deliverLink(
  to: string,
  subject: string,
  url: string,
): Promise<void> {
  console.log(`[racontine] ${subject} → ${to}\n  ${url}`);
  if (!config.notifyWebhookUrl) return;
  try {
    await fetch(config.notifyWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Title: subject },
      body: `${to} : ${url}`,
    });
  } catch (err) {
    console.error("[racontine] échec de la notification :", err);
  }
}
