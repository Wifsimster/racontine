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
  StoredImage,
} from "../ports.js";
import type { CarnetReadingService } from "./carnet-reading-service.js";
import { resolveContributionTarget } from "./contribution-target.js";

/** Résultat d'une ingestion : succès (entrée en lecture) ou échec typé. */
export type IngestResult =
  | { ok: true; id: string; status: "processing" }
  | { ok: false; httpCode: number; error: string; id?: string };

export type IngestInput = {
  /** Utilisateur au nom duquel on ingère (droits vérifiés par enfant). */
  userId: string;
  /** Pages du carnet, décodées en Buffer (JPEG/PNG/HEIC/WebP bruts). */
  images: Buffer[];
  /** Facultatif si l'utilisateur ne suit qu'un seul enfant. */
  childId?: string;
  /** AAAA-MM-JJ. Défaut : aujourd'hui. Rejeté (400) si mal formé. */
  date?: string;
  /** Lieu de la journée. Défaut : nounou. Rejeté (400) si inconnu. */
  source?: string;
};

export type IngestDeps = {
  entries: EntryRepository;
  attachments: AttachmentRepository;
  images: ImageStore;
  apiKeys: ApiKeyStore;
  access: AccessPolicy;
  reading: Pick<CarnetReadingService, "readInBackground">;
};

/**
 * L'ARRIVÉE D'UN CARNET PHOTOGRAPHIÉ — cœur partagé de la route HTTP multipart
 * et de l'outil MCP.
 *
 * Valide les métadonnées, range les images, crée-ou-fusionne la journée (même
 * enfant / date / lieu), rattache les pages, puis lance la lecture en
 * arrière-plan. Ne lève pas pour les erreurs métier : rend un `IngestResult`,
 * que chaque façade traduit dans son protocole (code HTTP, message d'outil).
 */
export class IngestService {
  constructor(private readonly deps: IngestDeps) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const meta = normalizeEntryMetadata(input);
    if (!meta.ok) return meta;
    const { date, source } = meta.value;

    if (!input.images.length)
      return { ok: false, httpCode: 400, error: "aucune photo fournie" };

    // Chaque contributeur apporte sa propre clé d'API : sans clé, on ne stocke
    // rien et on répond tout de suite (plutôt qu'un échec en arrière-plan).
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

    // Normalisation des images (auto-rotation, JPEG, redimensionnement +
    // miniature). Le stockage lève sur un format indécodable → on nettoie ce qui
    // a déjà été écrit.
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

    // Une fois les pages enregistrées, les fichiers sont référencés en base : on
    // ne doit plus les supprimer en cas d'erreur (sinon lignes orphelines).
    let attachmentsCommitted = false;
    try {
      const entry = await this.claimDay(input.userId, childId, date, source);
      if (!entry.ok) {
        await this.discard(stored);
        return entry;
      }

      // Positions à la suite des pages déjà rattachées (fusion multi-requêtes).
      const basePosition = await this.deps.attachments.nextPosition(entry.id);
      await this.deps.attachments.addMany(entry.id, stored, basePosition);
      attachmentsCommitted = true;

      // Ré-extraction sur TOUTES les pages de l'entrée (existantes + nouvelles) :
      // c'est ce qui fusionne correctement une page ajoutée à une journée déjà lue.
      const paths = await this.deps.attachments.pathsFor(entry.id);
      this.deps.reading.readInBackground(entry.id, paths, input.userId);

      return { ok: true, id: entry.id, status: "processing" };
    } catch (err) {
      if (!attachmentsCommitted) await this.discard(stored);
      throw err;
    }
  }

  /**
   * Find-or-create sûr face aux requêtes concurrentes. Une journée DÉJÀ PUBLIÉE
   * n'est jamais rouverte : on refuse (409) plutôt que d'écraser ce que les
   * proches ont déjà lu.
   */
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
    if (existing.status === "published")
      return {
        ok: false,
        httpCode: 409,
        error:
          "Cette journée est déjà publiée. Modifiez ou supprimez l'entrée existante avant de re-photographier.",
        id: existing.id,
      };
    await this.deps.entries.markProcessing(existing.id);
    return { ok: true, id: existing.id };
  }

  private async discard(stored: StoredImage[]): Promise<void> {
    await Promise.all(stored.map((img) => this.deps.images.delete(img)));
  }
}
