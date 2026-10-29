import { and, eq, ne } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  attachments,
  children,
  entries,
  entryItems,
  memberships,
  subscriptions,
  wordCorrections,
} from "../db/schema.js";
import type { Uncertainty } from "../db/schema.js";
import {
  DuplicateEntryError,
  EntryNotReviewableError,
  InvalidEntryDateError,
} from "../domain/errors.js";
import type { ItemRow } from "../domain/entry-items.js";
import type { Source } from "../domain/entry-metadata.js";
import type {
  AttachmentRepository,
  ChildRepository,
  EntryContent,
  EntryRecord,
  EntryRepository,
  EntryRevision,
  EntryRevisionRepository,
  NewEntry,
  RecordedCorrection,
  StoredImage,
} from "../ports.js";

type Db = typeof defaultDb;

export class DrizzleEntryRepository implements EntryRepository {
  constructor(private readonly db: Db = defaultDb) {}

  async findById(entryId: string): Promise<EntryRecord | null> {
    const [row] = await this.db
      .select()
      .from(entries)
      .where(eq(entries.id, entryId))
      .limit(1);
    return row ?? null;
  }

  async findByDay(
    childId: string,
    date: string,
    source: Source,
  ): Promise<EntryRecord | null> {
    const [row] = await this.db
      .select()
      .from(entries)
      .where(
        and(
          eq(entries.childId, childId),
          eq(entries.date, date),
          eq(entries.source, source),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createIfAbsent(entry: NewEntry): Promise<EntryRecord | null> {
    const [row] = await this.db
      .insert(entries)
      .values(entry)
      .onConflictDoNothing({
        target: [entries.childId, entries.date, entries.source],
      })
      .returning();
    return row ?? null;
  }

  async createWithItems(
    entry: NewEntry,
    items: ItemRow[],
  ): Promise<EntryRecord | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(entries)
        .values(entry)
        .onConflictDoNothing({
          target: [entries.childId, entries.date, entries.source],
        })
        .returning();
      if (!row) return null;
      if (items.length)
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId: row.id })));
      return row;
    });
  }

  async markProcessingUnlessPublished(entryId: string): Promise<boolean> {
    const rows = await this.db
      .update(entries)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(eq(entries.id, entryId), ne(entries.status, "published")))
      .returning({ id: entries.id });
    return rows.length > 0;
  }

  async applyReadingIfProcessing(
    entryId: string,
    patch: EntryContent & { date?: string; batchId?: string | null },
    items: ItemRow[],
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const moved = await tx
        .update(entries)
        .set({
          ...patch,
          status: "draft",
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(entries.id, entryId), eq(entries.status, "processing")))
        .returning({ id: entries.id });
      if (!moved.length) return false;
      await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
      if (items.length)
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId })));
      return true;
    });
  }

  async replaceReading(
    entryId: string,
    patch: EntryContent & { batchId?: string | null },
    items: ItemRow[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(entries)
        .set({
          ...patch,
          status: "draft",
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, entryId));
      await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
      if (items.length)
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId })));
    });
  }

  async failIfProcessing(entryId: string, reason: string): Promise<boolean> {
    const rows = await this.db
      .update(entries)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
      .where(and(eq(entries.id, entryId), eq(entries.status, "processing")))
      .returning({ id: entries.id });
    return rows.length > 0;
  }

  async claimFailedForRetry(entryId: string): Promise<boolean> {
    const rows = await this.db
      .update(entries)
      .set({ status: "processing", failureReason: null, updatedAt: new Date() })
      .where(and(eq(entries.id, entryId), eq(entries.status, "failed")))
      .returning({ id: entries.id });
    return rows.length > 0;
  }

  async reclaimProcessing(reason: string): Promise<number> {
    const rows = await this.db
      .update(entries)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
      .where(eq(entries.status, "processing"))
      .returning({ id: entries.id });
    return rows.length;
  }

  async appendUncertainty(
    entryId: string,
    uncertainty: Uncertainty,
  ): Promise<void> {
    const [row] = await this.db
      .select({ uncertainties: entries.uncertainties })
      .from(entries)
      .where(eq(entries.id, entryId))
      .limit(1);
    await this.db
      .update(entries)
      .set({ uncertainties: [...(row?.uncertainties ?? []), uncertainty] })
      .where(eq(entries.id, entryId));
  }
}

export class DrizzleAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Db = defaultDb) {}

  async pathsFor(entryId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: attachments.originalPath })
      .from(attachments)
      .where(eq(attachments.entryId, entryId))
      .orderBy(attachments.position);
    return rows.map((r) => r.path);
  }

  async idsFor(entryId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.entryId, entryId))
      .orderBy(attachments.position);
    return rows.map((r) => r.id);
  }

  async nextPosition(entryId: string): Promise<number> {
    const rows = await this.db
      .select({ position: attachments.position })
      .from(attachments)
      .where(eq(attachments.entryId, entryId));
    return rows.reduce((max, a) => Math.max(max, a.position + 1), 0);
  }

  async addMany(
    entryId: string,
    images: StoredImage[],
    startPosition: number,
  ): Promise<void> {
    if (!images.length) return;
    await this.db.insert(attachments).values(
      images.map((img, i) => ({
        entryId,
        kind: "carnet" as const,
        originalPath: img.originalPath,
        thumbPath: img.thumbPath,
        mime: img.mime,
        width: img.width,
        height: img.height,
        position: startPosition + i,
      })),
    );
  }

  async moveTo(attachmentIds: string[], targetEntryId: string): Promise<void> {
    if (!attachmentIds.length) return;
    let position = await this.nextPosition(targetEntryId);
    for (const id of attachmentIds) {
      await this.db
        .update(attachments)
        .set({ entryId: targetEntryId, position: position++ })
        .where(eq(attachments.id, id));
    }
  }
}

export function sqlStateOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "";
}

function translatePgError(err: unknown): never {
  const code = sqlStateOf(err);
  if (code === "23505")
    throw new DuplicateEntryError(
      "Une journée existe déjà pour cet enfant à cette date et cette source.",
    );
  if (code === "22007" || code === "22008")
    throw new InvalidEntryDateError("date invalide");
  throw err;
}

export class DrizzleEntryRevisionRepository
  implements EntryRevisionRepository
{
  constructor(private readonly db: Db = defaultDb) {}

  async revise(
    entryId: string,
    patch: EntryRevision,
    items: ItemRow[] | null,
    publish: boolean,
  ): Promise<{ firstPublish: boolean }> {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: entries.status })
          .from(entries)
          .where(eq(entries.id, entryId))
          .for("update");
        if (!current || (current.status !== "draft" && current.status !== "published"))
          throw new EntryNotReviewableError(
            current?.status === "processing"
              ? "la lecture de cette journée est en cours : attendez qu'elle se termine"
              : "cette journée n'a pas pu être lue : relancez la lecture avant de la relire",
          );
        if (items) {
          await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
          if (items.length)
            await tx
              .insert(entryItems)
              .values(items.map((it) => ({ ...it, entryId })));
        }
        await tx
          .update(entries)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(entries.id, entryId));

        if (!publish) return { firstPublish: false };

        const flipped = await tx
          .update(entries)
          .set({
            status: "published",
            publishedAt: new Date(),
            failureReason: null,
          })
          .where(and(eq(entries.id, entryId), ne(entries.status, "published")))
          .returning({ id: entries.id });
        return { firstPublish: flipped.length > 0 };
      });
    } catch (err) {
      translatePgError(err);
    }
  }

  async saveResolvedReading(
    entryId: string,
    patch: EntryRevision,
    correction: RecordedCorrection,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(entries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(entries.id, entryId));
      await tx.insert(wordCorrections).values({
        childId: correction.childId,
        original: correction.original,
        corrected: correction.corrected,
        field: correction.field,
        entryId: correction.entryId,
        createdBy: correction.createdBy,
      });
    });
  }

  async remove(
    entryId: string,
  ): Promise<{ originalPath: string; thumbPath: string | null }[]> {
    return this.db.transaction(async (tx) => {
      const files = await tx
        .select({
          originalPath: attachments.originalPath,
          thumbPath: attachments.thumbPath,
        })
        .from(attachments)
        .where(eq(attachments.entryId, entryId));
      await tx.delete(entries).where(eq(entries.id, entryId));
      return files;
    });
  }
}

export class DrizzleChildRepository implements ChildRepository {
  constructor(private readonly db: Db = defaultDb) {}

  async createWithOwner(params: {
    name: string;
    birthdate: string | null;
    ownerUserId: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [child] = await tx
        .insert(children)
        .values({ name: params.name, birthdate: params.birthdate })
        .returning();
      await tx
        .insert(memberships)
        .values({ userId: params.ownerUserId, childId: child.id, role: "admin" });
      await tx
        .insert(subscriptions)
        .values({ userId: params.ownerUserId, childId: child.id })
        .onConflictDoNothing({
          target: [subscriptions.userId, subscriptions.childId],
        });
      return child;
    });
  }
}
