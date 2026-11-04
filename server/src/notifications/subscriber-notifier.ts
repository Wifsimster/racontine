import type { Logger, PublicationNotifier } from "../ports.js";
import { formatDateFr } from "./dispatch-plan.js";
import type {
  NotificationLog,
  PublicationEvent,
  SubscriberDirectory,
} from "./types.js";

export type SubscriberNotifierDeps = {
  subscribers: SubscriberDirectory;
  log: NotificationLog;
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
      const results = await Promise.allSettled(
        recipients.map((r) => this.deps.log.record(event, r)),
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
}
