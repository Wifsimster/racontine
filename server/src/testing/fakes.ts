import { Readable } from "node:stream";
import type { Entry, EntryItemData, MemberRole, Uncertainty } from "../db/schema.js";
import type { CarnetDay } from "../domain/carnet.js";
import type { ItemRow, ItemType } from "../domain/entry-items.js";
import type { Source } from "../domain/entry-metadata.js";
import { EntryNotReviewableError } from "../domain/errors.js";
import type {
  AccessPolicy,
  ApiKeyStore,
  AttachmentRepository,
  BackgroundRunner,
  CarnetReader,
  ChildDirectory,
  EntryContent,
  EntryRecord,
  EntryRepository,
  EntryRevision,
  EntryRevisionRepository,
  GlossaryEntry,
  GlossaryStore,
  ImageStore,
  Logger,
  NewEntry,
  Paywall,
  PublicationNotifier,
  RecordedCorrection,
  StoredImage,
} from "../ports.js";

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export function entryRecord(over: Partial<Entry> = {}): Entry {
  const now = new Date("2026-02-01T08:00:00Z");
  return {
    id: over.id ?? nextId("entry"),
    childId: "child-1",
    date: "2026-02-01",
    source: "nounou",
    status: "processing",
    failureReason: null,
    mood: null,
    title: null,
    story: null,
    highlight: null,
    transcription: null,
    uncertainties: [],
    batchId: null,
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    ...over,
  };
}

export function carnetDay(over: Partial<CarnetDay> = {}): CarnetDay {
  return {
    date: null,
    enfant: null,
    repas: [],
    siestes: [],
    humeur: null,
    activites: [],
    sante: null,
    anecdotes: [],
    transcription_integrale: null,
    titre: null,
    recit: null,
    temps_fort: null,
    incertitudes: [],
    illisible: false,
    pages: [1],
    ...over,
  };
}

export class FakeEntryRepository
  implements EntryRepository, EntryRevisionRepository
{
  readonly rows = new Map<string, Entry>();
  readonly items = new Map<string, ItemRow[]>();
  readonly corrections: RecordedCorrection[] = [];

  constructor(seed: Entry[] = []) {
    for (const row of seed) this.rows.set(row.id, row);
  }

  itemsOf(entryId: string): ItemRow[] {
    return this.items.get(entryId) ?? [];
  }

  async findById(entryId: string): Promise<EntryRecord | null> {
    return this.rows.get(entryId) ?? null;
  }

  async findByDay(
    childId: string,
    date: string,
    source: Source,
  ): Promise<EntryRecord | null> {
    for (const row of this.rows.values())
      if (row.childId === childId && row.date === date && row.source === source)
        return row;
    return null;
  }

  async createIfAbsent(entry: NewEntry): Promise<EntryRecord | null> {
    if (await this.findByDay(entry.childId, entry.date, entry.source))
      return null;
    const row = entryRecord({ ...entry, uncertainties: entry.uncertainties ?? [] });
    this.rows.set(row.id, row);
    return row;
  }

  async createWithItems(
    entry: NewEntry,
    items: ItemRow[],
  ): Promise<EntryRecord | null> {
    const row = await this.createIfAbsent(entry);
    if (!row) return null;
    this.items.set(row.id, items);
    return row;
  }

  async markProcessingUnlessPublished(entryId: string): Promise<boolean> {
    const row = this.rows.get(entryId);
    if (!row || row.status === "published") return false;
    this.rows.set(entryId, { ...row, status: "processing" });
    return true;
  }

  async applyReadingIfProcessing(
    entryId: string,
    patch: EntryContent & { date?: string; batchId?: string | null },
    items: ItemRow[],
  ): Promise<boolean> {
    const row = this.rows.get(entryId);
    if (!row || row.status !== "processing") return false;
    this.rows.set(entryId, {
      ...row,
      ...patch,
      status: "draft",
      failureReason: null,
    });
    this.items.set(entryId, items);
    return true;
  }

  async replaceReading(
    entryId: string,
    patch: EntryContent & { batchId?: string | null },
    items: ItemRow[],
  ): Promise<void> {
    const row = this.rows.get(entryId);
    if (!row) return;
    this.rows.set(entryId, {
      ...row,
      ...patch,
      status: "draft",
      failureReason: null,
    });
    this.items.set(entryId, items);
  }

  async failIfProcessing(entryId: string, reason: string): Promise<boolean> {
    const row = this.rows.get(entryId);
    if (!row || row.status !== "processing") return false;
    this.rows.set(entryId, { ...row, status: "failed", failureReason: reason });
    return true;
  }

  async claimFailedForRetry(entryId: string): Promise<boolean> {
    const row = this.rows.get(entryId);
    if (!row || row.status !== "failed") return false;
    this.rows.set(entryId, {
      ...row,
      status: "processing",
      failureReason: null,
    });
    return true;
  }

  async reclaimProcessing(reason: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows)
      if (row.status === "processing") {
        this.rows.set(id, { ...row, status: "failed", failureReason: reason });
        count++;
      }
    return count;
  }

  async appendUncertainty(
    entryId: string,
    uncertainty: Uncertainty,
  ): Promise<void> {
    const row = this.rows.get(entryId);
    if (!row) return;
    this.rows.set(entryId, {
      ...row,
      uncertainties: [...(row.uncertainties ?? []), uncertainty],
    });
  }

  failNextRevision: Error | null = null;

  async revise(
    entryId: string,
    patch: EntryRevision,
    items: ItemRow[] | null,
    publish: boolean,
  ): Promise<{ firstPublish: boolean }> {
    if (this.failNextRevision) {
      const err = this.failNextRevision;
      this.failNextRevision = null;
      throw err;
    }
    const row = this.rows.get(entryId);
    if (!row) return { firstPublish: false };
    if (row.status !== "draft" && row.status !== "published")
      throw new EntryNotReviewableError(`journée ${row.status}`);
    if (items) this.items.set(entryId, items);
    const next = { ...row, ...patch };
    const firstPublish = publish && next.status !== "published";
    this.rows.set(entryId, {
      ...next,
      ...(publish
        ? {
            status: "published" as const,
            publishedAt: new Date(),
            failureReason: null,
          }
        : {}),
    });
    return { firstPublish };
  }

  async saveResolvedReading(
    entryId: string,
    patch: EntryRevision,
    correction: RecordedCorrection,
  ): Promise<void> {
    const row = this.rows.get(entryId);
    if (row) this.rows.set(entryId, { ...row, ...patch });
    this.corrections.push(correction);
  }

  readonly files = new Map<
    string,
    { originalPath: string; thumbPath: string | null }[]
  >();

  async remove(
    entryId: string,
  ): Promise<{ originalPath: string; thumbPath: string | null }[]> {
    this.rows.delete(entryId);
    this.items.delete(entryId);
    const files = this.files.get(entryId) ?? [];
    this.files.delete(entryId);
    return files;
  }
}

export class FakeAttachmentRepository implements AttachmentRepository {
  readonly pages = new Map<
    string,
    { id: string; path: string; position: number }[]
  >();

  constructor(seed: Record<string, string[]> = {}) {
    for (const [entryId, paths] of Object.entries(seed))
      this.pages.set(
        entryId,
        paths.map((path, position) => ({
          id: `${entryId}-page-${position + 1}`,
          path,
          position,
        })),
      );
  }

  private listOf(entryId: string) {
    return [...(this.pages.get(entryId) ?? [])].sort(
      (a, b) => a.position - b.position,
    );
  }

  async pathsFor(entryId: string): Promise<string[]> {
    return this.listOf(entryId).map((p) => p.path);
  }

  async idsFor(entryId: string): Promise<string[]> {
    return this.listOf(entryId).map((p) => p.id);
  }

  async nextPosition(entryId: string): Promise<number> {
    return this.listOf(entryId).reduce(
      (max, p) => Math.max(max, p.position + 1),
      0,
    );
  }

  async addMany(
    entryId: string,
    images: StoredImage[],
    startPosition: number,
  ): Promise<void> {
    const list = this.pages.get(entryId) ?? [];
    images.forEach((img, i) =>
      list.push({
        id: nextId("page"),
        path: img.originalPath,
        position: startPosition + i,
      }),
    );
    this.pages.set(entryId, list);
  }

  async moveTo(attachmentIds: string[], targetEntryId: string): Promise<void> {
    let position = await this.nextPosition(targetEntryId);
    for (const id of attachmentIds) {
      for (const [entryId, list] of this.pages) {
        const found = list.find((p) => p.id === id);
        if (!found) continue;
        this.pages.set(
          entryId,
          list.filter((p) => p.id !== id),
        );
        const target = this.pages.get(targetEntryId) ?? [];
        target.push({ ...found, position: position++ });
        this.pages.set(targetEntryId, target);
        break;
      }
    }
  }
}

export class FakeImageStore implements ImageStore {
  readonly stored: StoredImage[] = [];
  readonly deleted: string[] = [];
  readonly contents = new Map<string, Buffer>();
  rejectNext = false;

  async store(input: Buffer): Promise<StoredImage> {
    if (this.rejectNext) throw new Error("format non supporté");
    const id = nextId("img");
    const img: StoredImage = {
      originalPath: `${id}.jpg`,
      thumbPath: `${id}_thumb.jpg`,
      mime: "image/jpeg",
      width: 1200,
      height: 1600,
    };
    this.contents.set(img.originalPath, input);
    this.stored.push(img);
    return img;
  }

  async read(relPath: string): Promise<Buffer> {
    return this.contents.get(relPath) ?? Buffer.from(relPath);
  }

  readonly missing = new Set<string>();

  async exists(relPath: string): Promise<boolean> {
    return !this.missing.has(relPath);
  }

  openRead(relPath: string): Readable {
    return Readable.from([this.contents.get(relPath) ?? Buffer.from(relPath)]);
  }

  async delete(img: { originalPath: string; thumbPath: string }): Promise<void> {
    this.deleted.push(img.originalPath);
  }

  readonly rotated: { path: string; quarters: number }[] = [];
  rotateFails = false;

  async rotate(
    img: { originalPath: string; thumbPath: string | null },
    quarters: number,
  ): Promise<{ width: number; height: number }> {
    if (this.rotateFails) throw new Error("image illisible");
    this.rotated.push({ path: img.originalPath, quarters });
    return quarters % 2 === 0
      ? { width: 1200, height: 1600 }
      : { width: 1600, height: 1200 };
  }
}

export class FakeCarnetReader implements CarnetReader {
  readonly calls: { pages: number; apiKey: string; glossary: GlossaryEntry[] }[] =
    [];

  constructor(
    private readonly outcome: CarnetDay[] | Error,
  ) {}

  async read(
    pages: Buffer[],
    apiKey: string,
    glossary: GlossaryEntry[],
  ): Promise<CarnetDay[]> {
    this.calls.push({ pages: pages.length, apiKey, glossary });
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

export class FakeApiKeyStore implements ApiKeyStore {
  constructor(private readonly key: string | null = "sk-ant-test") {}
  async getKey(): Promise<string | null> {
    return this.key;
  }
}

export class FakeGlossaryStore implements GlossaryStore {
  constructor(private readonly entries: GlossaryEntry[] = []) {}
  async forChild(): Promise<GlossaryEntry[]> {
    return this.entries;
  }
}

export class FakeAccessPolicy implements AccessPolicy {
  constructor(
    private readonly childIds: string[] = ["child-1"],
    private readonly role: MemberRole | null = "contributor",
  ) {}
  async accessibleChildIds(): Promise<string[]> {
    return this.childIds;
  }
  async hasChildRole(
    _userId: string,
    _childId: string,
    min: MemberRole,
  ): Promise<boolean> {
    if (!this.role) return false;
    const rank: Record<MemberRole, number> = {
      reader: 1,
      contributor: 2,
      admin: 3,
    };
    return rank[this.role] >= rank[min];
  }
  async roleOn(): Promise<MemberRole | null> {
    return this.role;
  }
}

export class FakePaywall implements Paywall {
  constructor(private readonly reason: string | null = null) {}
  async blockedReason(): Promise<string | null> {
    return this.reason;
  }
}

export class FakeChildDirectory implements ChildDirectory {
  constructor(private readonly name: string | null = "Lou") {}
  async nameOf(): Promise<string | null> {
    return this.name;
  }
}

export class FakePublicationNotifier implements PublicationNotifier {
  readonly announcements: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
    actorUserId?: string | null;
  }[] = [];

  async entryPublished(params: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
    actorUserId?: string | null;
  }): Promise<void> {
    this.announcements.push(params);
  }
}

export class ImmediateRunner implements BackgroundRunner {
  readonly labels: string[] = [];
  private readonly pending: Promise<unknown>[] = [];

  run(label: string, task: () => Promise<void>): void {
    this.labels.push(label);
    this.pending.push(task());
  }

  async settle(): Promise<void> {
    await Promise.allSettled(this.pending);
  }
}

export class FakeLogger implements Logger {
  readonly errors: string[] = [];
  info(): void {}
  warn(): void {}
  error(message: string): void {
    this.errors.push(message);
  }
}

export function itemPairs(
  rows: ItemRow[],
): { type: ItemType; data: EntryItemData }[] {
  return rows.map((r) => ({ type: r.type, data: r.data }));
}
