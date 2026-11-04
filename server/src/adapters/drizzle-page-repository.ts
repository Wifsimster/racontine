import { and, count, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachments, entries } from "../db/schema.js";
import type { PageRecord, PageRepository } from "../ports.js";

export class DrizzlePageRepository implements PageRepository {
  async findWithEntry(attachmentId: string): Promise<PageRecord | null> {
    const [row] = await db
      .select({
        id: attachments.id,
        entryId: attachments.entryId,
        kind: attachments.kind,
        originalPath: attachments.originalPath,
        thumbPath: attachments.thumbPath,
        mime: attachments.mime,
        rotation: attachments.rotation,
        width: attachments.width,
        height: attachments.height,
        childId: entries.childId,
        entryStatus: entries.status,
      })
      .from(attachments)
      .innerJoin(entries, eq(entries.id, attachments.entryId))
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    return row ?? null;
  }

  async countSiblings(entryId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(attachments)
      .where(
        and(eq(attachments.entryId, entryId), eq(attachments.kind, "carnet")),
      );
    return row?.n ?? 0;
  }

  async saveRotation(
    attachmentId: string,
    size: { width: number; height: number; rotation: number },
  ): Promise<void> {
    await db
      .update(attachments)
      .set(size)
      .where(eq(attachments.id, attachmentId));
  }

  async remove(attachmentId: string): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, attachmentId));
  }
}
