import type { SubscriptionCadence } from "../db/schema.js";
import type { DayChip } from "../domain/day-glance.js";

export type PublicationEvent = {
  entryId: string;
  childId: string;
  childName: string;
  date: string;
  dateLabel: string;
  title: string;
  body: string;
  link: string;
};

export type Recipient = {
  userId: string;
  email: string | null;
  name: string;
  emailEnabled: boolean;
};

export type DigestEntry = {
  entryId: string;
  date: string;
  title: string | null;
  highlight: string | null;
};

export type PendingNotification = {
  notificationId: string;
  createdAt: Date;
  recipient: Recipient;
  cadence: SubscriptionCadence | null;
  childId: string;
  childName: string;
  entry: DigestEntry | null;
};

export type OutgoingKind = "publications" | "hebdo";

export type OutgoingMessage = {
  kind: OutgoingKind;
  childId: string;
  childName: string;
  entries: DigestEntry[];
  title: string;
  body: string;
  link: string;
  tag: string;
};

export interface NotificationChannel {
  readonly name: string;
  isEnabled(): Promise<boolean>;
  deliver(message: OutgoingMessage, recipient: Recipient): Promise<Date | null>;
}

export interface NotificationLog {
  record(event: PublicationEvent, recipient: Recipient): Promise<string>;
}

export interface PendingNotifications {
  pending(): Promise<PendingNotification[]>;
  claim(notificationIds: string[], at: Date): Promise<string[]>;
  markEmailed(notificationIds: string[], at: Date): Promise<void>;
}

export interface DayGlance {
  chipsFor(entryId: string): Promise<DayChip[]>;
}

export interface SubscriberDirectory {
  subscribersOf(
    childId: string,
    excludeUserId?: string | null,
  ): Promise<Recipient[]>;
}
