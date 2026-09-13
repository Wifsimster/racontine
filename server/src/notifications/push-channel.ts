import { sendPushToUser, webPushEnabled } from "../push.js";
import type {
  NotificationChannel,
  PublicationEvent,
  Recipient,
} from "./types.js";

/**
 * La notification poussée au navigateur / au téléphone, app fermée comprise.
 *
 * Elle part à TOUS les appareils enregistrés de l'abonné, indépendamment de sa
 * préférence e-mail. Sans paire de clés VAPID, le canal se déclare simplement
 * indisponible : les autres continuent.
 */
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
    // Le push ne rend aucun accusé de réception exploitable : rien à horodater.
    return null;
  }
}
