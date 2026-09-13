import type { Entry, EntryItemData, MemberRole, Uncertainty } from "../db/schema.js";
import type { CarnetDay } from "../domain/carnet.js";
import type { ItemRow, ItemType } from "../domain/entry-items.js";
import type { Source } from "../domain/entry-metadata.js";
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
  PublicationNotifier,
  RecordedCorrection,
  StoredImage,
} from "../ports.js";

/* ===========================================================================
   DES DOUBLURES, PARCE QUE LES PORTS EXISTENT.

   Ce fichier est la preuve la plus directe du découpage : la lecture d'un
   carnet, l'arrivée d'un lot de photos, la publication d'une journée
   s'exécutent ici EN ENTIER, sans Postgres, sans disque, sans appel facturé au
   modèle. Ce qu'aucun test ne pouvait toucher hier — le découpage d'un carnet
   couvrant trois jours, la course entre une lecture et une publication — se
   vérifie maintenant en millisecondes.
   =========================================================================== */

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

/** Journée en base, avec des valeurs par défaut plausibles. */
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

/** Journée lue par le modèle, avec des valeurs par défaut vides. */
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

/** Dépôt des journées en mémoire — respecte les mêmes garanties que le SQL. */
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

  async markProcessing(entryId: string): Promise<void> {
    const row = this.rows.get(entryId);
    if (row) this.rows.set(entryId, { ...row, status: "processing" });
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

  /* ----------------------------- Révisions ------------------------------ */

  /** Erreur à lever à la prochaine révision (pour rejouer un conflit de base). */
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

  async remove(entryId: string): Promise<void> {
    this.rows.delete(entryId);
    this.items.delete(entryId);
  }
}

/** Pages rattachées, en mémoire. */
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

/** Stockage d'images en mémoire, avec trace des suppressions. */
export class FakeImageStore implements ImageStore {
  readonly stored: StoredImage[] = [];
  readonly deleted: string[] = [];
  readonly contents = new Map<string, Buffer>();
  /** Si vrai, `store` lève — comme sharp sur une image indécodable. */
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

  async delete(img: { originalPath: string; thumbPath: string }): Promise<void> {
    this.deleted.push(img.originalPath);
  }
}

/** Lecteur de carnet programmable : rend des journées, ou lève. */
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

/** Droits programmables : la liste des enfants et le rôle accordé. */
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
}

export class FakeChildDirectory implements ChildDirectory {
  constructor(private readonly name: string | null = "Lou") {}
  async nameOf(): Promise<string | null> {
    return this.name;
  }
}

/** Notificateur qui garde trace de ce qu'il aurait annoncé. */
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

/**
 * Exécuteur d'arrière-plan pour les tests : il lance tout de suite et retient la
 * promesse, pour qu'un test puisse attendre la fin d'un effet censé être
 * asynchrone plutôt que de dormir.
 */
export class ImmediateRunner implements BackgroundRunner {
  readonly labels: string[] = [];
  private readonly pending: Promise<unknown>[] = [];

  run(label: string, task: () => Promise<void>): void {
    this.labels.push(label);
    this.pending.push(task());
  }

  /** Attend tous les travaux lancés (les échecs sont ignorés, comme en prod). */
  async settle(): Promise<void> {
    await Promise.allSettled(this.pending);
  }
}

/** Journal silencieux, qui garde ce qu'on lui a écrit. */
export class FakeLogger implements Logger {
  readonly errors: string[] = [];
  info(): void {}
  warn(): void {}
  error(message: string): void {
    this.errors.push(message);
  }
}

/** Raccourci de lecture : les moments d'une entrée, en (type, données). */
export function itemPairs(
  rows: ItemRow[],
): { type: ItemType; data: EntryItemData }[] {
  return rows.map((r) => ({ type: r.type, data: r.data }));
}
