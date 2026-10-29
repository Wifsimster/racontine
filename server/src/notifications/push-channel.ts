import { sendPushToUser, webPushEnabled } from "../push.js";
import type {
  NotificationChannel,
  PublicationEvent,
  Recipient,
} from "./types.js";

export class WebPushChannel implements NotificationChannel {
  readonly name = "push";

  async isEnabled(): Promise<boolean> {
    return webPushEnabled();
  }

  async deliver(
    event: PublicationEvent,
    recipient: Recipient,
  ): Promise<Date | null> {
    await sendPushToUser(recipient.userId, {
      title: event.title,
      body: event.body,
      url: event.link,
      tag: `entry-${event.entryId}`,
    });
    return null;
  }
}
