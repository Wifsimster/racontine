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

export interface NotificationChannel {
  readonly name: string;
  isEnabled(): Promise<boolean>;
  deliver(event: PublicationEvent, recipient: Recipient): Promise<Date | null>;
}

export interface NotificationLog {
  record(event: PublicationEvent, recipient: Recipient): Promise<string>;
  markDelivered(notificationId: string, at: Date): Promise<void>;
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
