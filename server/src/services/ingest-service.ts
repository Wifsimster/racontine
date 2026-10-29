import {
  normalizeEntryMetadata,
  type Source,
} from "../domain/entry-metadata.js";
import type {
  AccessPolicy,
  ApiKeyStore,
  AttachmentRepository,
  EntryRepository,
  ImageStore,
  Paywall,
  StoredImage,
} from "../ports.js";
import type { CarnetReadingService } from "./carnet-reading-service.js";
import { resolveContributionTarget } from "./contribution-target.js";

const MAX_PAGES_PER_DAY = 20;

const INGEST_FAILED_REASON =
  "L'envoi des pages a échoué avant leur lecture. Réessayez l'envoi.";

export type IngestResult =
  | { ok: true; id: string; status: "processing" }
  | { ok: false; httpCode: number; error: string; id?: string };

export type IngestInput = {
  userId: string;
  images: Buffer[];
  childId?: string;
  date?: string;
  source?: string;
};

export type IngestDeps = {
  entries: EntryRepository;
  attachments: AttachmentRepository;
  images: ImageStore;
  apiKeys: ApiKeyStore;
  access: AccessPolicy;
  paywall: Paywall;
  reading: Pick<CarnetReadingService, "readInBackground">;
};

export class IngestService {
  constructor(private readonly deps: IngestDeps) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const meta = normalizeEntryMetadata(input);
    if (!meta.ok) return meta;
    const { date, source } = meta.value;

    if (!input.images.length)
      return { ok: false, httpCode: 400, error: "aucune photo fournie" };

    const blocked = await this.deps.paywall.blockedReason();
    if (blocked) return { ok: false, httpCode: 402, error: blocked };

    if (!(await this.deps.apiKeys.getKey(input.userId)))
      return {
        ok: false,
        httpCode: 400,
        error:
          "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages avant d'importer un carnet.",
      };

    const target = await resolveContributionTarget(
      this.deps.access,
      input.userId,
      input.childId,
    );
    if (!target.ok) return target;
    const childId = target.childId;

    const sameDay = await this.deps.entries.findByDay(childId, date, source);
    const already = sameDay
      ? (await this.deps.attachments.pathsFor(sameDay.id)).length
      : 0;
    if (already + input.images.length > MAX_PAGES_PER_DAY)
      return {
        ok: false,
        httpCode: 400,
        error: `Une journée compte au plus ${MAX_PAGES_PER_DAY} pages (elle en a déjà ${already}).`,
      };

    const stored: StoredImage[] = [];
    try {
      for (const buf of input.images) stored.push(await this.deps.images.store(buf));
    } catch {
      await this.discard(stored);
      return {
        ok: false,
        httpCode: 400,
        error: "Image indécodable (format non supporté ou fichier corrompu).",
      };
    }

    let attachmentsCommitted = false;
    let claimedId: string | null = null;
    try {
      const entry = await this.claimDay(input.userId, childId, date, source);
      if (!entry.ok) {
        await this.discard(stored);
        return entry;
      }
      claimedId = entry.id;

      const basePosition = await this.deps.attachments.nextPosition(entry.id);
      await this.deps.attachments.addMany(entry.id, stored, basePosition);
      attachmentsCommitted = true;

      const paths = await this.deps.attachments.pathsFor(entry.id);
      this.deps.reading.readInBackground(entry.id, paths, input.userId);

      return { ok: true, id: entry.id, status: "processing" };
    } catch (err) {
      if (!attachmentsCommitted) await this.discard(stored);
      if (claimedId)
        await this.deps.entries
          .failIfProcessing(claimedId, INGEST_FAILED_REASON)
          .catch(() => {});
      throw err;
    }
  }

  private async claimDay(
    userId: string,
    childId: string,
    date: string,
    source: Source,
  ): Promise<
    | { ok: true; id: string }
    | { ok: false; httpCode: number; error: string; id?: string }
  > {
    const created = await this.deps.entries.createIfAbsent({
      childId,
      date,
      source,
      status: "processing",
      createdBy: userId,
    });
    if (created) return { ok: true, id: created.id };

    const existing = await this.deps.entries.findByDay(childId, date, source);
    if (!existing)
      return {
        ok: false,
        httpCode: 409,
        error: "Cette journée vient d'être modifiée. Réessayez.",
      };
    if (!(await this.deps.entries.markProcessingUnlessPublished(existing.id)))
      return {
        ok: false,
        httpCode: 409,
        error:
          "Cette journée est déjà publiée. Modifiez ou supprimez l'entrée existante avant de re-photographier.",
        id: existing.id,
      };
    return { ok: true, id: existing.id };
  }

  private async discard(stored: StoredImage[]): Promise<void> {
    await Promise.all(stored.map((img) => this.deps.images.delete(img)));
  }
}
