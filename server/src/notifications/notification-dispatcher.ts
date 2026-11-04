import type { Logger } from "../ports.js";
import { describeBatch, planDispatch, type DispatchBatch } from "./dispatch-plan.js";
import type {
  NotificationChannel,
  PendingNotification,
  PendingNotifications,
} from "./types.js";

export type NotificationDispatcherDeps = {
  pending: PendingNotifications;
  channels: NotificationChannel[];
  webBaseUrl: string;
  logger: Logger;
  quietMs?: number;
  maxWaitMs?: number;
};

export type TickReport = { sent: number; discarded: number };

export class NotificationDispatcher {
  private running: Promise<TickReport> | null = null;

  constructor(private readonly deps: NotificationDispatcherDeps) {}

  tick(now: Date = new Date()): Promise<TickReport> {
    if (this.running) return this.running;
    this.running = this.run(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  start(intervalMs = 30_000): () => void {
    const safeTick = () => {
      this.tick().catch((err) =>
        this.deps.logger.error("Envoi des notifications en échec", {
          err: err instanceof Error ? err.message : err,
        }),
      );
    };
    safeTick();
    const timer = setInterval(safeTick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async run(now: Date): Promise<TickReport> {
    const rows = await this.deps.pending.pending();
    if (!rows.length) return { sent: 0, discarded: 0 };
    const plan = planDispatch(rows, now, {
      quietMs: this.deps.quietMs,
      maxWaitMs: this.deps.maxWaitMs,
    });
    if (plan.discard.length) await this.deps.pending.claim(plan.discard, now);
    if (!plan.batches.length) return { sent: 0, discarded: plan.discard.length };

    const byId = new Map<string, PendingNotification>(
      rows.map((r) => [r.notificationId, r]),
    );
    const channels = await this.enabledChannels();
    let sent = 0;
    for (const batch of plan.batches) {
      const claimed = await this.deps.pending.claim(batch.notificationIds, now);
      if (!claimed.length) continue;
      const kept = claimed
        .map((id) => byId.get(id)?.entry)
        .filter((e): e is NonNullable<typeof e> => !!e);
      const entryIds = new Set(kept.map((e) => e.entryId));
      const effective: DispatchBatch = {
        ...batch,
        notificationIds: claimed,
        entries: batch.entries.filter((e) => entryIds.has(e.entryId)),
      };
      if (!effective.entries.length) continue;
      await this.send(effective, channels);
      sent++;
    }
    return { sent, discarded: plan.discard.length };
  }

  private async send(
    batch: DispatchBatch,
    channels: NotificationChannel[],
  ): Promise<void> {
    const message = describeBatch(batch, this.deps.webBaseUrl);
    await Promise.allSettled(
      channels.map(async (channel) => {
        try {
          const deliveredAt = await channel.deliver(message, batch.recipient);
          if (deliveredAt)
            await this.deps.pending.markEmailed(batch.notificationIds, deliveredAt);
        } catch (err) {
          this.deps.logger.error(`Canal « ${channel.name} » en échec`, {
            err: err instanceof Error ? err.message : err,
          });
        }
      }),
    );
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
}
