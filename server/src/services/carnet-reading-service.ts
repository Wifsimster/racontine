import { randomUUID } from "node:crypto";
import {
  contentFromCarnetDay,
  mergeCarnetDays,
} from "../domain/carnet-content.js";
import type { CarnetDay } from "../domain/carnet.js";
import { addDays, isIsoDate } from "../domain/dates.js";
import { itemsFromCarnetDay } from "../domain/entry-items.js";
import { CarnetReadError } from "../domain/errors.js";
import type {
  AccessPolicy,
  ApiKeyStore,
  AttachmentRepository,
  BackgroundRunner,
  CarnetReader,
  EntryRecord,
  EntryRepository,
  GlossaryStore,
  ImageStore,
  Logger,
} from "../ports.js";
import type { Uncertainty } from "../db/schema.js";

export const INTERRUPTED_REASON =
  "La lecture a été interrompue par un redémarrage du serveur. Vos pages sont intactes : relancez la lecture, il n'y a rien à rephotographier.";

const UNREADABLE_REASON =
  "Photo illisible : aucun contenu de carnet exploitable détecté.";

const GENERIC_FAILURE =
  "La lecture automatique du carnet a échoué. Réessayez plus tard.";

const NO_KEY_REASON =
  "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages puis réimportez le carnet.";

export type RetryResult =
  | { ok: true }
  | { ok: false; httpCode: number; error: string };

const NOT_FOUND: RetryResult = {
  ok: false,
  httpCode: 404,
  error: "entrée introuvable",
};

const NOT_RETRYABLE: RetryResult = {
  ok: false,
  httpCode: 409,
  error:
    "Cette journée n'est pas en échec, ou elle n'a aucune page à relire.",
};

export type CarnetReadingDeps = {
  entries: EntryRepository;
  access: AccessPolicy;
  attachments: AttachmentRepository;
  images: ImageStore;
  reader: CarnetReader;
  apiKeys: ApiKeyStore;
  glossary: GlossaryStore;
  background: BackgroundRunner;
  logger: Logger;
  newBatchId?: () => string;
};

export class CarnetReadingService {
  private readonly newBatchId: () => string;
  private readonly latestRead = new Map<string, number>();
  private readSeq = 0;

  constructor(private readonly deps: CarnetReadingDeps) {
    this.newBatchId = deps.newBatchId ?? randomUUID;
  }

  reclaimStuck(): Promise<number> {
    return this.deps.entries.reclaimProcessing(INTERRUPTED_REASON);
  }

  async retry(entryId: string, userId: string): Promise<RetryResult> {
    const entry = await this.deps.entries.findById(entryId);
    if (!entry) return NOT_FOUND;
    if (
      !(await this.deps.access.hasChildRole(userId, entry.childId, "contributor"))
    )
      return NOT_FOUND;

    const paths = await this.deps.attachments.pathsFor(entryId);
    if (!paths.length) return NOT_RETRYABLE;
    if (!(await this.deps.entries.claimFailedForRetry(entryId)))
      return NOT_RETRYABLE;
    this.readInBackground(entryId, paths, userId);
    return { ok: true };
  }

  readInBackground(entryId: string, paths: string[], userId: string): void {
    const generation = ++this.readSeq;
    this.latestRead.set(entryId, generation);
    this.deps.background.run("Lecture de carnet", () =>
      this.read(entryId, paths, userId, generation),
    );
  }

  private isLatest(entryId: string, generation?: number): boolean {
    return (
      generation === undefined || this.latestRead.get(entryId) === generation
    );
  }

  async read(
    entryId: string,
    paths: string[],
    userId: string,
    generation?: number,
  ): Promise<void> {
    try {
      const days = await this.extract(entryId, paths, userId);
      if (!this.isLatest(entryId, generation)) return;

      if (!days.length || days.every((d) => d.illisible)) {
        await this.deps.entries.failIfProcessing(entryId, UNREADABLE_REASON);
        return;
      }

      const sorted = [...days].sort(
        (a, b) => Math.min(...a.pages) - Math.min(...b.pages),
      );

      if (sorted.length === 1) {
        await this.deps.entries.applyReadingIfProcessing(
          entryId,
          contentFromCarnetDay(sorted[0]),
          itemsFromCarnetDay(sorted[0]),
        );
        return;
      }

      await this.commitBatch(entryId, sorted, userId);
    } catch (err) {
      if (this.isLatest(entryId, generation))
        await this.recordFailure(entryId, err);
    } finally {
      if (generation !== undefined && this.isLatest(entryId, generation))
        this.latestRead.delete(entryId);
    }
  }

  private async extract(
    entryId: string,
    paths: string[],
    userId: string,
  ): Promise<CarnetDay[]> {
    const apiKey = await this.deps.apiKeys.getKey(userId);
    if (!apiKey) throw new CarnetReadError(NO_KEY_REASON);
    const entry = await this.deps.entries.findById(entryId);
    const glossary = entry
      ? await this.deps.glossary.forChild(entry.childId)
      : [];
    const pages = await Promise.all(
      paths.map((p) => this.deps.images.read(p)),
    );
    return this.deps.reader.read(pages, apiKey, glossary);
  }

  private async commitBatch(
    entryId: string,
    days: CarnetDay[],
    userId: string,
  ): Promise<void> {
    const placeholder = await this.deps.entries.findById(entryId);
    if (!placeholder || placeholder.status !== "processing") return;

    const attachmentIds = await this.deps.attachments.idsFor(entryId);
    const batchId = this.newBatchId();

    const dated: { date: string; day: CarnetDay }[] = [];
    let previousDate = placeholder.date;
    for (const [index, day] of days.entries()) {
      const date =
        day.date && isIsoDate(day.date)
          ? day.date
          : index === 0
            ? placeholder.date
            : addDays(previousDate, 1);
      previousDate = date;
      dated.push({ date, day });
    }

    const warnings: Uncertainty[] = [];
    const firstRead = dated[0]!.date;
    if (firstRead !== placeholder.date) {
      const occupant = await this.deps.entries.findByDay(
        placeholder.childId,
        firstRead,
        placeholder.source,
      );
      if (occupant && occupant.id !== placeholder.id) {
        dated[0]!.date = placeholder.date;
        warnings.push({
          original: `date du ${firstRead}`,
          contexte: `Ces pages semblent dater du ${firstRead}, mais une journée existe déjà à cette date : la date de la photo a été gardée. Vérifiez-la avant de publier.`,
          suggestions: [],
          champ: null,
          resolved: null,
        });
      }
    }

    const merged: { date: string; day: CarnetDay }[] = [];
    for (const d of dated) {
      const same = merged.find((m) => m.date === d.date);
      if (same) same.day = mergeCarnetDays(same.day, d.day);
      else merged.push({ ...d });
    }

    for (const [index, { date, day }] of merged.entries()) {
      if (index === 0) {
        const content = contentFromCarnetDay(day);
        await this.deps.entries.applyReadingIfProcessing(
          entryId,
          {
            ...content,
            uncertainties: [...content.uncertainties, ...warnings],
            date,
            batchId: merged.length > 1 ? batchId : null,
          },
          itemsFromCarnetDay(day),
        );
        continue;
      }

      await this.commitSplitDay({
        placeholder,
        userId,
        date,
        batchId,
        day,
        attachmentIds: day.pages
          .map((p) => attachmentIds[p - 1])
          .filter((v): v is string => Boolean(v)),
      });
    }
  }

  private async commitSplitDay(opts: {
    placeholder: EntryRecord;
    userId: string;
    date: string;
    batchId: string;
    day: CarnetDay;
    attachmentIds: string[];
  }): Promise<void> {
    const { placeholder, userId, date, batchId, day, attachmentIds } = opts;
    const content = contentFromCarnetDay(day);
    const items = itemsFromCarnetDay(day);

    const created = await this.deps.entries.createWithItems(
      {
        childId: placeholder.childId,
        date,
        source: placeholder.source,
        status: "draft",
        batchId,
        createdBy: userId,
        ...content,
      },
      items,
    );
    if (created) {
      await this.deps.attachments.moveTo(attachmentIds, created.id);
      return;
    }

    const existing = await this.deps.entries.findByDay(
      placeholder.childId,
      date,
      placeholder.source,
    );
    if (!existing) return;

    if (existing.status === "published") {
      await this.deps.entries.appendUncertainty(placeholder.id, {
        original: `pages du ${date}`,
        contexte: `Une journée du ${date} déjà publiée a été détectée dans ce lot de photos : ses pages n'ont pas été rattachées automatiquement.`,
        suggestions: [],
        champ: null,
        resolved: null,
      });
      return;
    }

    await this.deps.entries.replaceReading(
      existing.id,
      { ...content, batchId },
      items,
    );
    await this.deps.attachments.moveTo(attachmentIds, existing.id);
  }

  private async recordFailure(entryId: string, err: unknown): Promise<void> {
    if (!(err instanceof CarnetReadError))
      this.deps.logger.error("Lecture de carnet — échec inattendu", {
        err: err instanceof Error ? err.message : err,
      });
    const reason =
      err instanceof CarnetReadError ? err.message : GENERIC_FAILURE;
    try {
      await this.deps.entries.failIfProcessing(entryId, reason);
    } catch (writeErr) {
      this.deps.logger.error("Échec de l'enregistrement de l'état « failed »", {
        err: writeErr instanceof Error ? writeErr.message : writeErr,
      });
    }
  }
}
