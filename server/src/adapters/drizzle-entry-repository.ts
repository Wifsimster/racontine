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

/**
 * Le dépôt des journées, en Postgres (Drizzle).
 *
 * Tout le SQL des journées est ICI : les services au-dessus ne connaissent plus
 * que le port. Les garanties de concurrence que le service attend — « crée si
 * absente », « ne bascule que si encore en lecture » — sont tenues par des
 * `ON CONFLICT DO NOTHING` et des `UPDATE … WHERE status = …`, c'est-à-dire par
 * la base elle-même : deux requêtes simultanées ne peuvent pas toutes deux
 * gagner.
 */
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

  async markProcessing(entryId: string): Promise<void> {
    await this.db
      .update(entries)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(entries.id, entryId));
  }

  async applyReadingIfProcessing(
    entryId: string,
    patch: EntryContent & { date?: string; batchId?: string | null },
    items: ItemRow[],
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // On n'écrase le contenu que si l'entrée est ENCORE en lecture : sinon une
      // relecture humaine faite pendant l'extraction serait silencieusement
      // écrasée par la sortie du modèle.
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

/** Les pages photographiées, en Postgres (Drizzle). */
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

/**
 * Traduit une erreur Postgres en erreur de DOMAINE. Sans cette traduction, la
 * règle « deux journées ne peuvent pas partager enfant + date + lieu » n'existait
 * que sous la forme d'un `code === "23505"` comparé dans un gestionnaire HTTP :
 * la couche métier lisait des codes SQL.
 */
function translatePgError(err: unknown): never {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "23505")
    throw new DuplicateEntryError(
      "Une journée existe déjà pour cet enfant à cette date et cette source.",
    );
  if (code === "22007" || code === "22008")
    throw new InvalidEntryDateError("date invalide");
  throw err;
}

/** Les écritures de relecture, en Postgres. */
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

        // Ne notifier qu'à la PREMIÈRE publication. La transition est détectée
        // de façon atomique (UPDATE … WHERE status <> 'published' … RETURNING) :
        // deux requêtes concurrentes ne peuvent pas toutes deux « gagner ».
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

  async remove(entryId: string): Promise<void> {
    await this.db.delete(entries).where(eq(entries.id, entryId));
  }
}

/** Création d'un enfant et de son cercle, en Postgres. */
export class DrizzleChildRepository implements ChildRepository {
  constructor(private readonly db: Db = defaultDb) {}

  async createWithOwner(params: {
    name: string;
    birthdate: string | null;
    ownerUserId: string;
  }) {
    // Le créateur devient admin de l'enfant et suit d'office sa timeline.
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
