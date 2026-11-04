import { sendPushToUser, webPushEnabled } from "../push.js";
import type {
  NotificationChannel,
  OutgoingMessage,
  Recipient,
} from "./types.js";

export class WebPushChannel implements NotificationChannel {
  readonly name = "push";

  async isEnabled(): Promise<boolean> {
    return webPushEnabled();
  }

  async deliver(
    message: OutgoingMessage,
    recipient: Recipient,
  ): Promise<Date | null> {
    if (message.kind !== "publications") return null;
    await sendPushToUser(recipient.userId, {
      title: message.title,
      body: message.body,
      url: message.link,
      tag: message.tag,
    });
    return null;
  }
}
