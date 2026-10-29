import type { TranscribedNote } from "../domain/carnet.js";
import { contentFromNote } from "../domain/carnet-content.js";
import { normalizeEntryMetadata } from "../domain/entry-metadata.js";
import { itemsFromNote } from "../domain/entry-items.js";
import type {
  AccessPolicy,
  ChildDirectory,
  EntryRepository,
  Paywall,
  PublicationNotifier,
} from "../ports.js";
import { resolveContributionTarget } from "./contribution-target.js";

export type CreateNoteInput = TranscribedNote & {
  userId: string;
  childId?: string;
  date?: string;
  source?: string;
  publish?: boolean;
};

export type CreateNoteResult =
  | { ok: true; id: string; status: "draft" | "published" }
  | { ok: false; httpCode: number; error: string; id?: string };

export type TranscribedNoteDeps = {
  entries: EntryRepository;
  access: AccessPolicy;
  children: ChildDirectory;
  paywall: Paywall;
  notifier: PublicationNotifier;
  background: { run(label: string, task: () => Promise<void>): void };
};

export class TranscribedNoteService {
  constructor(private readonly deps: TranscribedNoteDeps) {}

  async create(input: CreateNoteInput): Promise<CreateNoteResult> {
    const meta = normalizeEntryMetadata(input);
    if (!meta.ok) return meta;
    const { date, source } = meta.value;

    const blocked = await this.deps.paywall.blockedReason();
    if (blocked) return { ok: false, httpCode: 402, error: blocked };

    const target = await resolveContributionTarget(
      this.deps.access,
      input.userId,
      input.childId,
    );
    if (!target.ok) return target;
    const childId = target.childId;

    const publish = input.publish === true;
    const created = await this.deps.entries.createWithItems(
      {
        childId,
        date,
        source,
        status: publish ? "published" : "draft",
        createdBy: input.userId,
        publishedAt: publish ? new Date() : null,
        ...contentFromNote(input),
      },
      itemsFromNote(input),
    );

    if (!created) {
      const existing = await this.deps.entries.findByDay(childId, date, source);
      return {
        ok: false,
        httpCode: 409,
        error:
          "Une journée existe déjà pour cet enfant à cette date et cette source. Modifiez-la depuis Racontine.",
        id: existing?.id,
      };
    }

    if (publish) {
      this.deps.background.run("Notification de publication", async () => {
        const childName = await this.deps.children.nameOf(childId);
        if (!childName) return;
        await this.deps.notifier.entryPublished({
          entryId: created.id,
          childId,
          childName,
          date,
          actorUserId: input.userId,
        });
      });
    }

    return {
      ok: true,
      id: created.id,
      status: created.status as "draft" | "published",
    };
  }
}
