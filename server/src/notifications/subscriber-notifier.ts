import type { Logger, PublicationNotifier } from "../ports.js";
import type {
  NotificationChannel,
  NotificationLog,
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

/** Met une date AAAA-MM-JJ en français lisible (« mardi 25 novembre »). */
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
  /** Base publique de l'app, pour le lien profond. */
  webBaseUrl: string;
  logger: Logger;
};

/**
 * L'ORCHESTRATEUR : qui prévenir, quoi écrire, puis chaque canal à son tour.
 *
 * Il ne sait ni envoyer un e-mail ni pousser une notification — il connaît la
 * liste des canaux et le registre in-app. Deux garanties tiennent ici :
 *  · la notification in-app est écrite AVANT toute tentative externe, pour
 *    qu'un SMTP en panne ne prive jamais un abonné de sa notification ;
 *  · chaque destinataire et chaque canal sont isolés (`allSettled`) : un échec
 *    n'emporte pas les autres.
 *
 * Ne lève jamais : prévenir est un effet de bord de la publication, et ne doit
 * pas la faire échouer.
 */
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
      // Les canaux indisponibles (SMTP absent, VAPID absent, interrupteur du
      // propriétaire) sont écartés UNE fois, pas une fois par abonné.
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
    return {
      entryId: params.entryId,
      childId: params.childId,
      childName: params.childName,
      date: params.date,
      title: `Nouvelle journée de ${params.childName}`,
      body: `La journée du ${formatDateFr(params.date)} vient d'être publiée dans le journal de ${params.childName}.`,
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
