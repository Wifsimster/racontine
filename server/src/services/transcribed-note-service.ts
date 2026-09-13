import type { TranscribedNote } from "../domain/carnet.js";
import { contentFromNote } from "../domain/carnet-content.js";
import { normalizeEntryMetadata } from "../domain/entry-metadata.js";
import { itemsFromNote } from "../domain/entry-items.js";
import type {
  AccessPolicy,
  ChildDirectory,
  EntryRepository,
  PublicationNotifier,
} from "../ports.js";
import { resolveContributionTarget } from "./contribution-target.js";

export type CreateNoteInput = TranscribedNote & {
  /** Utilisateur au nom duquel on crée (droits vérifiés par enfant). */
  userId: string;
  /** Facultatif si l'utilisateur ne suit qu'un seul enfant. */
  childId?: string;
  /** AAAA-MM-JJ. Défaut : aujourd'hui. Rejeté (400) si mal formé. */
  date?: string;
  /** Lieu de la journée. Défaut : nounou. Rejeté (400) si inconnu. */
  source?: string;
  /** Publier directement plutôt que de laisser en brouillon (défaut : brouillon). */
  publish?: boolean;
};

/** Résultat de la création d'une journée déjà transcrite. */
export type CreateNoteResult =
  | { ok: true; id: string; status: "draft" | "published" }
  | { ok: false; httpCode: number; error: string; id?: string };

export type TranscribedNoteDeps = {
  entries: EntryRepository;
  access: AccessPolicy;
  children: ChildDirectory;
  notifier: PublicationNotifier;
  /** Lance un effet de bord sans retarder la réponse (notification). */
  background: { run(label: string, task: () => Promise<void>): void };
};

/**
 * UNE JOURNÉE DÉJÀ ÉCRITE, sans photo ni lecture automatique.
 *
 * Contrepartie de l'ingestion pour les clients qui disposent déjà du récit
 * (transcription manuelle, autre OCR, saisie assistée…) : aucune clé d'API
 * n'est requise. Mêmes règles d'accès et de validation que l'ingestion — elles
 * sont littéralement le même code (`normalizeEntryMetadata`,
 * `resolveContributionTarget`), ce qui interdit aux deux chemins de diverger.
 *
 * Ne fusionne PAS avec une journée existante (contrairement à l'ajout de
 * pages) : un contenu déjà transcrit remplacerait silencieusement ce qui est
 * là. En cas de conflit, 409 avec l'id existant — la modification passe par
 * l'app.
 */
export class TranscribedNoteService {
  constructor(private readonly deps: TranscribedNoteDeps) {}

  async create(input: CreateNoteInput): Promise<CreateNoteResult> {
    const meta = normalizeEntryMetadata(input);
    if (!meta.ok) return meta;
    const { date, source } = meta.value;

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

    // Publication directe : prévenir les abonnés en arrière-plan (comme le PATCH
    // web). Effet de bord isolé — n'impacte ni la réponse ni la création.
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
