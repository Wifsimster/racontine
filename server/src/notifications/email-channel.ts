import { mailEnabled, sendMail } from "../mailer.js";
import { getSettings } from "../settings.js";
import { formatDateFr } from "./dispatch-plan.js";
import { renderDigestEmail, renderEntryEmail } from "./email-template.js";
import type {
  DayGlance,
  NotificationChannel,
  OutgoingMessage,
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
    message: OutgoingMessage,
    recipient: Recipient,
  ): Promise<Date | null> {
    if (!recipient.emailEnabled || !recipient.email) return null;
    const greeting = recipient.name ? `Bonjour ${recipient.name},` : "Bonjour,";
    const single =
      message.kind === "publications" && message.entries.length === 1
        ? message.entries[0]
        : null;
    const { text, html } = single
      ? renderEntryEmail({
          greeting,
          body: message.body,
          link: message.link,
          childName: message.childName,
          dateLabel: formatDateFr(single.date),
          chips: await this.glance.chipsFor(single.entryId),
        })
      : renderDigestEmail({
          kind: message.kind,
          greeting,
          body: message.body,
          link: message.link,
          childName: message.childName,
          entries: message.entries.map((e) => ({
            dateLabel: formatDateFr(e.date),
            title: e.title,
            highlight: e.highlight,
          })),
        });
    const ok = await sendMail({
      to: recipient.email,
      subject: message.title,
      text,
      html,
    });
    return ok ? new Date() : null;
  }
}
