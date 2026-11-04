import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  children,
  entries,
  entryItems,
  memberships,
  notifications,
  subscriptions,
  user,
} from "../db/schema.js";
import { dayChips, type DayChip } from "../domain/day-glance.js";
import type {
  DayGlance,
  NotificationLog,
  PendingNotification,
  PendingNotifications,
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

export class DrizzleSubscriberDirectory implements SubscriberDirectory {
  async subscribersOf(
    childId: string,
    excludeUserId?: string | null,
  ): Promise<Recipient[]> {
    const rows = await db
      .select({
        userId: subscriptions.userId,
        emailEnabled: subscriptions.emailEnabled,
        email: user.email,
        name: user.name,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, subscriptions.userId),
          eq(memberships.childId, subscriptions.childId),
        ),
      )
      .where(
        excludeUserId
          ? and(
              eq(subscriptions.childId, childId),
              ne(subscriptions.userId, excludeUserId),
            )
          : eq(subscriptions.childId, childId),
      );
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email ?? null,
      name: r.name ?? "",
      emailEnabled: r.emailEnabled,
    }));
  }
}

export class DrizzleNotificationLog implements NotificationLog {
  async record(
    event: PublicationEvent,
    recipient: Recipient,
  ): Promise<string> {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: recipient.userId,
        childId: event.childId,
        entryId: event.entryId,
        type: "entry_published",
        title: event.title,
        body: event.body,
      })
      .returning({ id: notifications.id });
    return row.id;
  }
}

export class DrizzlePendingNotifications implements PendingNotifications {
  async pending(): Promise<PendingNotification[]> {
    const rows = await db
      .select({
        id: notifications.id,
        createdAt: notifications.createdAt,
        userId: notifications.userId,
        childId: notifications.childId,
        email: user.email,
        name: user.name,
        emailEnabled: subscriptions.emailEnabled,
        cadence: subscriptions.cadence,
        membershipId: memberships.id,
        childName: children.name,
        entryId: entries.id,
        entryDate: entries.date,
        entryTitle: entries.title,
        entryHighlight: entries.highlight,
        entryStatus: entries.status,
      })
      .from(notifications)
      .innerJoin(user, eq(user.id, notifications.userId))
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.userId, notifications.userId),
          eq(subscriptions.childId, notifications.childId),
        ),
      )
      .leftJoin(
        memberships,
        and(
          eq(memberships.userId, notifications.userId),
          eq(memberships.childId, notifications.childId),
        ),
      )
      .leftJoin(children, eq(children.id, notifications.childId))
      .leftJoin(entries, eq(entries.id, notifications.entryId))
      .where(
        and(
          isNull(notifications.dispatchedAt),
          eq(notifications.type, "entry_published"),
        ),
      )
      .orderBy(notifications.createdAt);
    return rows.map((r) => ({
      notificationId: r.id,
      createdAt: r.createdAt,
      recipient: {
        userId: r.userId,
        email: r.email ?? null,
        name: r.name ?? "",
        emailEnabled: r.emailEnabled ?? false,
      },
      cadence:
        r.childId && r.cadence && r.membershipId ? r.cadence : null,
      childId: r.childId ?? "",
      childName: r.childName ?? "",
      entry:
        r.entryId && r.entryDate && r.entryStatus === "published"
          ? {
              entryId: r.entryId,
              date: r.entryDate,
              title: r.entryTitle,
              highlight: r.entryHighlight,
            }
          : null,
    }));
  }

  async claim(notificationIds: string[], at: Date): Promise<string[]> {
    if (!notificationIds.length) return [];
    const rows = await db
      .update(notifications)
      .set({ dispatchedAt: at })
      .where(
        and(
          inArray(notifications.id, notificationIds),
          isNull(notifications.dispatchedAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.map((r) => r.id);
  }

  async markEmailed(notificationIds: string[], at: Date): Promise<void> {
    if (!notificationIds.length) return;
    await db
      .update(notifications)
      .set({ emailedAt: at })
      .where(inArray(notifications.id, notificationIds));
  }
}

export class DrizzleDayGlance implements DayGlance {
  async chipsFor(entryId: string): Promise<DayChip[]> {
    const [items, [entry]] = await Promise.all([
      db
        .select({ type: entryItems.type, data: entryItems.data })
        .from(entryItems)
        .where(eq(entryItems.entryId, entryId)),
      db
        .select({ mood: entries.mood })
        .from(entries)
        .where(eq(entries.id, entryId))
        .limit(1),
    ]);
    return dayChips({ items, mood: entry?.mood ?? null });
  }
}
