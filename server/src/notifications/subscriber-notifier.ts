import type { Logger, PublicationNotifier } from "../ports.js";
import type {
  NotificationChannel,
  NotificationLog,
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

export function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export type SubscriberNotifierDeps = {
  subscribers: SubscriberDirectory;
  log: NotificationLog;
  channels: NotificationChannel[];
  webBaseUrl: string;
  logger: Logger;
};

export class SubscriberNotifier implements PublicationNotifier {
  constructor(private readonly deps: SubscriberNotifierDeps) {}

  async entryPublished(params: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      const recipients = await this.deps.subscribers.subscribersOf(
        params.childId,
        params.actorUserId,
      );
      if (!recipients.length) return;

      const event = this.describe(params);
      const channels = await this.enabledChannels();

      const results = await Promise.allSettled(
        recipients.map((r) => this.notifyOne(event, r, channels)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed)
        this.deps.logger.error("Notification des abonnés partiellement en échec", {
          failed,
          total: recipients.length,
        });
    } catch (err) {
      this.deps.logger.error("Échec de la notification des abonnés", {
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  private describe(params: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
  }): PublicationEvent {
    const dateLabel = formatDateFr(params.date);
    return {
      entryId: params.entryId,
      childId: params.childId,
      childName: params.childName,
      date: params.date,
      dateLabel,
      title: `Nouvelle journée de ${params.childName}`,
      body: `La journée du ${dateLabel} vient d'être publiée dans le journal de ${params.childName}.`,
      link: `${this.deps.webBaseUrl}/entries/${params.entryId}`,
    };
  }

  private async enabledChannels(): Promise<NotificationChannel[]> {
    const flags = await Promise.all(
      this.deps.channels.map(async (c) => {
        try {
          return await c.isEnabled();
        } catch {
          return false;
        }
      }),
    );
    return this.deps.channels.filter((_, i) => flags[i]);
  }

  private async notifyOne(
    event: PublicationEvent,
    recipient: Recipient,
    channels: NotificationChannel[],
  ): Promise<void> {
    const notificationId = await this.deps.log.record(event, recipient);
    await Promise.allSettled(
      channels.map(async (channel) => {
        try {
          const deliveredAt = await channel.deliver(event, recipient);
          if (deliveredAt)
            await this.deps.log.markDelivered(notificationId, deliveredAt);
        } catch (err) {
          this.deps.logger.error(`Canal « ${channel.name} » en échec`, {
            err: err instanceof Error ? err.message : err,
          });
        }
      }),
    );
  }
}
