import type { Logger } from "../ports.js";
import type { PushPayload } from "../push.js";
import {
  decideReminder,
  localDay,
  reminderMessage,
} from "../domain/capture-reminder.js";

export type ReminderCandidate = {
  userId: string;
  childId: string;
  childName: string;
  time: string;
  days: number[];
  lastSentOn: string | null;
  hasEntryToday: boolean;
  hasPush: boolean;
};

export interface CaptureReminderStore {
  candidates(day: string): Promise<ReminderCandidate[]>;
  claim(userId: string, childId: string, day: string): Promise<boolean>;
}

export interface ReminderPush {
  isEnabled(): boolean;
  send(userId: string, payload: PushPayload): Promise<void>;
}

export type CaptureReminderDeps = {
  store: CaptureReminderStore;
  push: ReminderPush;
  webBaseUrl: string;
  logger: Logger;
  timeZone?: string;
};

export class CaptureReminderScheduler {
  private running: Promise<number> | null = null;

  constructor(private readonly deps: CaptureReminderDeps) {}

  tick(now: Date = new Date()): Promise<number> {
    if (this.running) return this.running;
    this.running = this.run(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  start(intervalMs = 60_000): () => void {
    const safeTick = () => {
      this.tick().catch((err) =>
        this.deps.logger.error("Rappels de capture en échec", {
          err: err instanceof Error ? err.message : err,
        }),
      );
    };
    safeTick();
    const timer = setInterval(safeTick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async run(now: Date): Promise<number> {
    if (!this.deps.push.isEnabled()) return 0;
    const { day } = localDay(now, this.deps.timeZone);
    const candidates = await this.deps.store.candidates(day);
    let sent = 0;
    for (const c of candidates) {
      const decision = decideReminder(
        {
          enabled: true,
          time: c.time,
          days: c.days,
          lastSentOn: c.lastSentOn,
          hasEntryOn: (d) => d === day && c.hasEntryToday,
          hasPush: c.hasPush,
        },
        now,
        this.deps.timeZone,
      );
      if (!decision.send || decision.day !== day) continue;
      if (!(await this.deps.store.claim(c.userId, c.childId, day))) continue;
      try {
        await this.deps.push.send(
          c.userId,
          reminderMessage(c.childId, c.childName, this.deps.webBaseUrl),
        );
        sent++;
      } catch (err) {
        this.deps.logger.error("Rappel de capture non envoyé", {
          err: err instanceof Error ? err.message : err,
        });
      }
    }
    return sent;
  }
}
