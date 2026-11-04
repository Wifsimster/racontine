import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  captureReminders,
  children,
  entries,
  memberships,
  pushSubscriptions,
} from "../db/schema.js";
import {
  DEFAULT_REMINDER_DAYS,
  DEFAULT_REMINDER_TIME,
} from "../domain/capture-reminder.js";
import type {
  CaptureReminderStore,
  ReminderCandidate,
} from "./capture-reminders.js";

const MANAGER_ROLES = ["admin", "contributor"] as const;

export type ReminderPreference = {
  childId: string;
  childName: string;
  enabled: boolean;
  time: string;
  days: number[];
};

export type ReminderPreferencePatch = {
  enabled?: boolean;
  time?: string;
  days?: number[];
};

export class DrizzleCaptureReminderStore implements CaptureReminderStore {
  async candidates(day: string): Promise<ReminderCandidate[]> {
    const rows = await db
      .select({
        userId: captureReminders.userId,
        childId: captureReminders.childId,
        childName: children.name,
        time: captureReminders.time,
        days: captureReminders.days,
        lastSentOn: captureReminders.lastSentOn,
        hasEntryToday: sql<boolean>`exists (select 1 from ${entries} where ${entries.childId} = ${captureReminders.childId} and ${entries.date} = ${day})`,
        hasPush: sql<boolean>`exists (select 1 from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${captureReminders.userId})`,
      })
      .from(captureReminders)
      .innerJoin(children, eq(children.id, captureReminders.childId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, captureReminders.userId),
          eq(memberships.childId, captureReminders.childId),
          inArray(memberships.role, [...MANAGER_ROLES]),
        ),
      )
      .where(eq(captureReminders.enabled, true));
    return rows.map((r) => ({ ...r, lastSentOn: r.lastSentOn ?? null }));
  }

  async claim(userId: string, childId: string, day: string): Promise<boolean> {
    const rows = await db
      .update(captureReminders)
      .set({ lastSentOn: day })
      .where(
        and(
          eq(captureReminders.userId, userId),
          eq(captureReminders.childId, childId),
          eq(captureReminders.enabled, true),
          or(
            isNull(captureReminders.lastSentOn),
            lt(captureReminders.lastSentOn, day),
          ),
        ),
      )
      .returning({ userId: captureReminders.userId });
    return rows.length > 0;
  }
}

export async function listReminderPreferences(
  userId: string,
): Promise<ReminderPreference[]> {
  const rows = await db
    .select({
      childId: children.id,
      childName: children.name,
      enabled: captureReminders.enabled,
      time: captureReminders.time,
      days: captureReminders.days,
    })
    .from(memberships)
    .innerJoin(children, eq(children.id, memberships.childId))
    .leftJoin(
      captureReminders,
      and(
        eq(captureReminders.userId, memberships.userId),
        eq(captureReminders.childId, memberships.childId),
      ),
    )
    .where(
      and(
        eq(memberships.userId, userId),
        inArray(memberships.role, [...MANAGER_ROLES]),
      ),
    )
    .orderBy(asc(children.createdAt), asc(children.name));
  return rows.map((r) => ({
    childId: r.childId,
    childName: r.childName,
    enabled: r.enabled ?? false,
    time: r.time ?? DEFAULT_REMINDER_TIME,
    days: r.days ?? [...DEFAULT_REMINDER_DAYS],
  }));
}

export async function saveReminderPreference(
  userId: string,
  childId: string,
  patch: ReminderPreferencePatch,
): Promise<Omit<ReminderPreference, "childName">> {
  const changes = { ...patch, updatedAt: new Date() };
  const [row] = await db
    .insert(captureReminders)
    .values({ userId, childId, ...patch })
    .onConflictDoUpdate({
      target: [captureReminders.userId, captureReminders.childId],
      set: changes,
    })
    .returning({
      childId: captureReminders.childId,
      enabled: captureReminders.enabled,
      time: captureReminders.time,
      days: captureReminders.days,
    });
  return row;
}
