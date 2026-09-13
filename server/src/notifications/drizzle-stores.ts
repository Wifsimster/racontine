import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import {
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
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

/** Les abonnés d'un enfant, lus en base. */
export class DrizzleSubscriberDirectory implements SubscriberDirectory {
  async subscribersOf(
    childId: string,
    excludeUserId?: string | null,
  ): Promise<Recipient[]> {
    // La jointure sur `memberships` est la règle, pas une optimisation : un
    // proche dont l'accès a été révoqué ne doit plus être prévenu, même si sa
    // ligne d'abonnement subsiste.
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

/** Le registre in-app des notifications, en base. */
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

  async markDelivered(notificationId: string, at: Date): Promise<void> {
    await db
      .update(notifications)
      .set({ emailedAt: at })
      .where(eq(notifications.id, notificationId));
  }
}

/** La bande de feutres d'une journée, lue en base puis calculée par le domaine. */
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
