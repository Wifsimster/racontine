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

/** Refus métier, déjà porteur du code HTTP que la façade rendra tel quel. */
export type EditRejection = { ok: false; httpCode: number; error: string };
export type EditSuccess = { ok: true; entryId: string };
export type EditResult = EditSuccess | EditRejection;

/** Ce qu'une relecture humaine envoie. */
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

/**
 * LA RELECTURE D'UNE JOURNÉE — ce qu'un proche change, et ce qui est publié.
 *
 * Ces règles vivaient dans les gestionnaires HTTP : le contrôle d'accès, la
 * validation des champs, la transition de publication, la substitution d'un mot
 * tranché dans le récit, jusqu'à la lecture des codes d'erreur de Postgres.
 * Elles ne dépendaient de rien d'HTTP, et ne pouvaient pourtant s'exécuter que
 * derrière une requête. Elles sont ici ; la route ne fait plus que traduire.
 */
export class EntryEditingService {
  constructor(private readonly deps: EntryEditingDeps) {}

  /** Applique une relecture (champs, moments, publication). */
  async revise(input: ReviseEntryInput): Promise<EditResult> {
    const entry = await this.deps.entries.findById(input.entryId);
    if (!entry) return notFound();
    // Relire / publier exige contributor+ sur l'enfant. Refus uniforme : on ne
    // divulgue pas l'existence d'une journée non partagée.
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
    // La date est validée avant d'être appliquée (comme à l'ingestion), pour
    // rendre un 400 explicite plutôt qu'une erreur de base.
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

  /**
   * Valide une incertitude signalée à la relecture : la valeur choisie remplace
   * le mot partout où il apparaît dans la valorisation, et alimente le glossaire
   * de l'enfant pour améliorer les lectures suivantes.
   */
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

    /* Même remise en forme qu'à la sérialisation : c'est le MOT qui doit être
       remplacé dans le récit, pas la phrase explicative que le modèle a parfois
       glissée dans `original`. Sans ça, la substitution ne trouvait rien et le
       mot douteux partait tel quel chez les proches — le parent avait tranché
       pour rien. */
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

  /** Supprime une journée — réservé à l'admin de l'enfant. */
  async remove(entryId: string, userId: string): Promise<EditResult> {
    const entry = await this.deps.entries.findById(entryId);
    if (!entry) return { ok: true, entryId }; // déjà absente : rien à faire.
    if (!(await this.deps.access.hasChildRole(userId, entry.childId, "admin")))
      return { ok: false, httpCode: 403, error: "accès refusé" };
    const files = await this.deps.revisions.remove(entryId);
    // Les photos du carnet partent avec la journée : la cascade n'efface que
    // les lignes, et un fichier sans ligne n'est plus effaçable par personne.
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

  /** Prévient les abonnés, sans retarder la réponse. */
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

/** Moments envoyés par la relecture → lignes prêtes à écrire (types inconnus ignorés). */
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
