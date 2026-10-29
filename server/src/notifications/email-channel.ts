import { mailEnabled, sendMail } from "../mailer.js";
import { getSettings } from "../settings.js";
import { renderEntryEmail } from "./email-template.js";
import type {
  DayGlance,
  NotificationChannel,
  PublicationEvent,
  Recipient,
} from "./types.js";

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
