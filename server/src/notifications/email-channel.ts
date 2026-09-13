import { mailEnabled, sendMail } from "../mailer.js";
import { getSettings } from "../settings.js";
import { renderEntryEmail } from "./email-template.js";
import type {
  DayGlance,
  NotificationChannel,
  PublicationEvent,
  Recipient,
} from "./types.js";

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

  constructor(private readonly glance: DayGlance) {}

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

    // Le gabarit est pur (voir `email-template.ts`) : ce canal ne décide que du
    // destinataire et de l'envoi, ce qui rend l'e-mail lui-même vérifiable sans
    // SMTP — et c'est ce que fait `email-template.test.ts`.
    const { text, html } = renderEntryEmail({
      greeting: recipient.name ? `Bonjour ${recipient.name},` : "Bonjour,",
      body: event.body,
      link: event.link,
      childName: event.childName,
      dateLabel: event.dateLabel,
      chips: await this.glance.chipsFor(event.entryId),
    });

    const ok = await sendMail({
      to: recipient.email,
      subject: event.title,
      text,
      html,
    });
    return ok ? new Date() : null;
  }
}
