import { isIsoDate } from "../domain/dates.js";
import { isItemType, type ItemRow } from "../domain/entry-items.js";
import { isSource } from "../domain/entry-metadata.js";
import {
  DuplicateEntryError,
  EntryNotReviewableError,
  InvalidEntryDateError,
} from "../domain/errors.js";
import {
  applyResolvedReading,
  resolveUncertaintyAt,
} from "../domain/readings.js";
import { tidyUncertainties } from "../uncertainties.js";
import type { EntryItemData } from "../db/schema.js";
import type {
  AccessPolicy,
  BackgroundRunner,
  ChildDirectory,
  EntryRepository,
  ImageStore,
  Logger,
  EntryRevision,
  EntryRevisionRepository,
  PublicationNotifier,
} from "../ports.js";

export type EditRejection = { ok: false; httpCode: number; error: string };
export type EditSuccess = { ok: true; entryId: string };
export type EditResult = EditSuccess | EditRejection;

export type ReviseEntryInput = {
  entryId: string;
  userId: string;
  mood?: string | null;
  title?: string | null;
  story?: string | null;
  highlight?: string | null;
  transcription?: string | null;
  source?: string;
  date?: string;
  items?: { type: string; data: unknown; position?: number }[];
  publish?: boolean;
};

export type EntryEditingDeps = {
  entries: EntryRepository;
  revisions: EntryRevisionRepository;
  access: AccessPolicy;
  children: ChildDirectory;
  notifier: PublicationNotifier;
  background: BackgroundRunner;
  images: ImageStore;
  logger: Logger;
};

export class EntryEditingService {
  constructor(private readonly deps: EntryEditingDeps) {}

  async revise(input: ReviseEntryInput): Promise<EditResult> {
    const entry = await this.deps.entries.findById(input.entryId);
    if (!entry) return notFound();
    if (
      !(await this.deps.access.hasChildRole(
        input.userId,
        entry.childId,
        "contributor",
      ))
    )
      return notFound();

    const patch: EntryRevision = {};
    if (input.mood !== undefined) patch.mood = input.mood;
    if (input.title !== undefined) patch.title = input.title;
    if (input.story !== undefined) patch.story = input.story;
    if (input.highlight !== undefined) patch.highlight = input.highlight;
    if (input.transcription !== undefined)
      patch.transcription = input.transcription;
    if (input.source && isSource(input.source)) patch.source = input.source;
    if (input.date !== undefined) {
      if (!isIsoDate(input.date))
        return {
          ok: false,
          httpCode: 400,
          error: "date invalide (attendu AAAA-MM-JJ)",
        };
      patch.date = input.date;
    }

    const items = input.items ? toItemRows(input.items) : null;

    let firstPublish = false;
    try {
      ({ firstPublish } = await this.deps.revisions.revise(
        input.entryId,
        patch,
        items,
        input.publish === true,
      ));
    } catch (err) {
      if (err instanceof DuplicateEntryError)
        return { ok: false, httpCode: 409, error: err.message };
      if (err instanceof InvalidEntryDateError)
        return { ok: false, httpCode: 400, error: err.message };
      if (err instanceof EntryNotReviewableError)
        return { ok: false, httpCode: 409, error: err.message };
      throw err;
    }

    if (firstPublish)
      this.announce(input.entryId, entry.childId, patch.date ?? entry.date, input.userId);

    return { ok: true, entryId: input.entryId };
  }

  async resolveUncertainty(input: {
    entryId: string;
    userId: string;
    index: number;
    value: string;
  }): Promise<EditResult> {
    const value = input.value.trim();
    if (!value) return { ok: false, httpCode: 400, error: "value requis" };
    if (!Number.isInteger(input.index) || input.index < 0)
      return { ok: false, httpCode: 400, error: "index invalide" };

    const entry = await this.deps.entries.findById(input.entryId);
    if (!entry) return notFound();
    if (
      !(await this.deps.access.hasChildRole(
        input.userId,
        entry.childId,
        "contributor",
      ))
    )
      return notFound();

    const uncertainties = tidyUncertainties(entry.uncertainties);
    const item = uncertainties[input.index];
    if (!item)
      return { ok: false, httpCode: 404, error: "incertitude introuvable" };
    if (item.resolved)
      return { ok: false, httpCode: 409, error: "incertitude déjà validée" };

    await this.deps.revisions.saveResolvedReading(
      input.entryId,
      {
        uncertainties: resolveUncertaintyAt(uncertainties, input.index, value),
        ...applyResolvedReading(entry, item.original, value),
      },
      {
        childId: entry.childId,
        original: item.original,
        corrected: value,
        field: item.champ,
        entryId: input.entryId,
        createdBy: input.userId,
      },
    );

    return { ok: true, entryId: input.entryId };
  }

  async remove(entryId: string, userId: string): Promise<EditResult> {
    const entry = await this.deps.entries.findById(entryId);
    if (!entry) return { ok: true, entryId };
    if (!(await this.deps.access.hasChildRole(userId, entry.childId, "admin")))
      return { ok: false, httpCode: 403, error: "accès refusé" };
    const files = await this.deps.revisions.remove(entryId);
    for (const file of files) {
      try {
        await this.deps.images.delete({
          originalPath: file.originalPath,
          thumbPath: file.thumbPath ?? file.originalPath,
        });
      } catch (err) {
        this.deps.logger.error("Fichier non effacé", {
          path: file.originalPath,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
    return { ok: true, entryId };
  }

  private announce(
    entryId: string,
    childId: string,
    date: string,
    actorUserId: string,
  ): void {
    this.deps.background.run("Notification de publication", async () => {
      const childName = await this.deps.children.nameOf(childId);
      if (!childName) return;
      await this.deps.notifier.entryPublished({
        entryId,
        childId,
        childName,
        date,
        actorUserId,
      });
    });
  }
}

function notFound(): EditRejection {
  return { ok: false, httpCode: 404, error: "entrée introuvable" };
}

function toItemRows(
  items: { type: string; data: unknown; position?: number }[],
): ItemRow[] {
  return items
    .filter((it) => isItemType(it.type))
    .map((it, i) => ({
      type: it.type as ItemRow["type"],
      data: it.data as EntryItemData,
      position: it.position ?? i,
    }));
}
