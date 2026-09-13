import { mailEnabled, sendMail } from "../mailer.js";
import { getSettings } from "../settings.js";
import type {
  NotificationChannel,
  PublicationEvent,
  Recipient,
} from "./types.js";

/** Échappe le texte destiné à être interpolé dans du HTML d'e-mail. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * L'e-mail de publication.
 *
 * Deux interrupteurs le précèdent : SMTP doit être configuré, et le
 * propriétaire ne doit pas avoir coupé globalement les e-mails. Un troisième
 * est par abonné (« je veux les e-mails »), et il appartient à ce canal : c'est
 * SA préférence, l'orchestrateur n'a pas à la connaître.
 */
export class EmailChannel implements NotificationChannel {
  readonly name = "email";

  async isEnabled(): Promise<boolean> {
    if (!mailEnabled()) return false;
    const { emailNotificationsEnabled } = await getSettings();
    return emailNotificationsEnabled;
  }

  async deliver(
    event: PublicationEvent,
    recipient: Recipient,
  ): Promise<Date | null> {
    if (!recipient.emailEnabled || !recipient.email) return null;

    const greeting = recipient.name ? `Bonjour ${recipient.name},` : "Bonjour,";
    const text = `${greeting}\n\n${event.body}\n\nVoir la journée : ${event.link}\n\n— Racontine`;
    // Le nom de l'enfant (donc le corps) et le nom du destinataire sont saisis
    // par des utilisateurs : on les échappe avant interpolation HTML pour éviter
    // toute injection de balises (liens de phishing, images traçantes…). Le lien
    // est construit côté serveur.
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;line-height:1.5">
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(event.body)}</p>
  <p><a href="${encodeURI(event.link)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Voir la journée</a></p>
  <p style="color:#6b7280;font-size:13px">— Racontine, le journal de l'enfance</p>
</div>`;

    const ok = await sendMail({
      to: recipient.email,
      subject: event.title,
      text,
      html,
    });
    return ok ? new Date() : null;
  }
}
