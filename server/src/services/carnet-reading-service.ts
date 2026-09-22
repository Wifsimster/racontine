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

/**
 * Message porté par une journée dont la lecture est morte avec le processus.
 * Il dit CE QUI S'EST PASSÉ et CE QU'ON PEUT FAIRE : la carte d'échec du
 * journal l'affiche tel quel, et sa sortie est « Reprendre la lecture ».
 */
export const INTERRUPTED_REASON =
  "La lecture a été interrompue par un redémarrage du serveur. Vos pages sont intactes : relancez la lecture, il n'y a rien à rephotographier.";

const UNREADABLE_REASON =
  "Photo illisible : aucun contenu de carnet exploitable détecté.";

const GENERIC_FAILURE =
  "La lecture automatique du carnet a échoué. Réessayez plus tard.";

const NO_KEY_REASON =
  "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages puis réimportez le carnet.";

/** Issue d'une demande de relance. */
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
  /** Identifiant de lot (injectable pour des tests déterministes). */
  newBatchId?: () => string;
};

/**
 * LA LECTURE D'UN CARNET, de bout en bout : processing → draft | failed.
 *
 * Le service ne connaît ni Postgres, ni le disque, ni le fournisseur du modèle
 * vision — seulement les ports. C'est ce qui rend testable ce qui ne l'était
 * pas : le découpage d'un carnet couvrant plusieurs jours, la journée illisible,
 * la relance après échec, la course avec une relecture humaine.
 *
 * Le carnet photographié peut couvrir plusieurs journées d'un coup : chaque
 * journée détectée devient sa propre entrée (la première réutilise l'entrée
 * d'origine, les suivantes sont créées à la volée), reliées par un `batchId`
 * commun que le front utilise pour proposer une relecture séquentielle.
 */
export class CarnetReadingService {
  private readonly newBatchId: () => string;
  /**
   * La lecture la plus récente de chaque journée. Ajouter une page à une
   * journée EN COURS de lecture relance une lecture sur toutes ses pages : la
   * première, partie avec moins de pages, finissait souvent avant et gagnait —
   * la page ajoutée n'apparaissait jamais. Seule la dernière lecture lancée a
   * désormais le droit d'écrire (un seul processus serveur : voir
   * `reclaimStuck`).
   */
  private readonly latestRead = new Map<string, number>();
  private readSeq = 0;

  constructor(private readonly deps: CarnetReadingDeps) {
    this.newBatchId = deps.newBatchId ?? randomUUID;
  }

  /**
   * Récupère les journées restées « en lecture » au démarrage.
   *
   * Une lecture tourne EN MÉMOIRE : elle ne survit pas à son processus, et le
   * homelab redémarre le conteneur à chaque déploiement. Une journée
   * photographiée pile à ce moment-là perdait son lecteur et affichait
   * « Racontine relit la page… » POUR TOUJOURS, sans aucune sortie.
   *
   * Au démarrage, aucune lecture ne peut être en cours : toute journée encore
   * en `processing` est donc orpheline par construction. On la bascule en
   * `failed` avec un message qui dit quoi faire ; les pages sont conservées.
   *
   * NB : ceci suppose UN seul processus serveur (c'est le déploiement livré).
   * Avec plusieurs instances, il faudrait une file de travaux partagée plutôt
   * qu'un balayage au boot.
   */
  reclaimStuck(): Promise<number> {
    return this.deps.entries.reclaimProcessing(INTERRUPTED_REASON);
  }

  /**
   * Relance la lecture d'une journée en échec, sur les pages DÉJÀ téléversées.
   *
   * Sans elle, la seule sortie d'un échec était « Reprendre la photo » — et pour
   * une lecture morte avec le processus, c'est une sortie fausse : les pages
   * sont sur le disque, intactes, et le carnet papier est déjà reparti chez la
   * nounou. On ne demande pas à un parent de rephotographier un carnet qu'il
   * n'a plus.
   *
   * Refuse si la journée n'est pas (ou plus) en échec, ou si elle n'a aucune
   * page à relire. La bascule `failed → processing` est conditionnelle : deux
   * relances simultanées ne lancent qu'une lecture.
   */
  async retry(entryId: string, userId: string): Promise<RetryResult> {
    const entry = await this.deps.entries.findById(entryId);
    // Refus uniforme : on ne divulgue pas l'existence d'une journée non partagée.
    if (!entry) return NOT_FOUND;
    // Relire consomme la clé d'API du demandeur : contributeur au minimum.
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

  /** Lance une lecture sans attendre sa fin (la réponse HTTP part tout de suite). */
  readInBackground(entryId: string, paths: string[], userId: string): void {
    const generation = ++this.readSeq;
    this.latestRead.set(entryId, generation);
    this.deps.background.run("Lecture de carnet", () =>
      this.read(entryId, paths, userId, generation),
    );
  }

  /** Cette lecture est-elle encore la dernière lancée pour la journée ? */
  private isLatest(entryId: string, generation?: number): boolean {
    return (
      generation === undefined || this.latestRead.get(entryId) === generation
    );
  }

  /**
   * Lit les pages d'une journée et écrit le résultat. Ne lève jamais : tout
   * échec devient un état `failed` porteur d'un message affichable.
   */
  async read(
    entryId: string,
    paths: string[],
    userId: string,
    generation?: number,
  ): Promise<void> {
    try {
      const days = await this.extract(entryId, paths, userId);
      // Une lecture plus récente (pages ajoutées entre-temps) est en route :
      // celle-ci n'a vu qu'une partie des pages, elle se retire sans écrire.
      if (!this.isLatest(entryId, generation)) return;

      if (!days.length || days.every((d) => d.illisible)) {
        await this.deps.entries.failIfProcessing(entryId, UNREADABLE_REASON);
        return;
      }

      // Ordre chronologique = ordre physique des pages dans le carnet.
      const sorted = [...days].sort(
        (a, b) => Math.min(...a.pages) - Math.min(...b.pages),
      );

      if (sorted.length === 1) {
        // Journée unique : aucun lot, l'entrée d'origine porte tout.
        await this.deps.entries.applyReadingIfProcessing(
          entryId,
          contentFromCarnetDay(sorted[0]),
          itemsFromCarnetDay(sorted[0]),
        );
        return;
      }

      await this.commitBatch(entryId, sorted, userId);
    } catch (err) {
      // L'échec d'une lecture dépassée ne condamne pas la suivante.
      if (this.isLatest(entryId, generation))
        await this.recordFailure(entryId, err);
    } finally {
      if (generation !== undefined && this.isLatest(entryId, generation))
        this.latestRead.delete(entryId);
    }
  }

  /** Pages du disque → journées structurées, avec la clé et le glossaire qui vont bien. */
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

  /**
   * Plusieurs journées détectées : l'entrée d'origine ne représente plus « la »
   * journée mais le lot. Une relecture humaine concurrente (publication
   * déclenchée avant la fin de la lecture) annule le découpage plutôt que de
   * rouvrir une entrée déjà publiée.
   */
  private async commitBatch(
    entryId: string,
    days: CarnetDay[],
    userId: string,
  ): Promise<void> {
    const placeholder = await this.deps.entries.findById(entryId);
    if (!placeholder || placeholder.status !== "processing") return;

    const attachmentIds = await this.deps.attachments.idsFor(entryId);
    const batchId = this.newBatchId();

    // Date illisible : la première journée retombe sur la date de capture, les
    // suivantes sur « veille + 1 jour » (les pages suivent l'ordre
    // chronologique du carnet). Reste éditable à la relecture.
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

    // La première journée reprend l'entrée d'origine — et donc sa date, si une
    // AUTRE journée occupe déjà la date lue : déplacer l'entrée violerait
    // l'unicité (enfant, date, lieu) et ferait échouer tout le lot, relance
    // comprise. On garde la date de capture et on le signale à la relecture.
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

    // Deux journées lues à la même date n'en font qu'une (sinon la seconde
    // écraserait la première, puisqu'elles visent la même entrée).
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

  /**
   * Journée détectée au-delà de la première : find-or-create par (enfant, date,
   * source), puis rattachement de ses pages. Ne remplace JAMAIS le contenu
   * d'une journée déjà publiée — dans ce cas ses pages restent sur l'entrée
   * d'origine et un signalement y est ajouté pour relecture manuelle.
   */
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
    if (!existing) return; // course improbable : abandonné plutôt que planter.

    if (existing.status === "published") {
      await this.deps.entries.appendUncertainty(placeholder.id, {
        /* `original` non vide : cette incertitude est un simple signalement, pas
           une correction de mot — mais l'UI de relecture (bouton « garder tel
           quel », validation serveur) exige une valeur non vide pour la
           résoudre, d'où ce libellé plutôt qu'une chaîne vide. */
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

  /**
   * Seules les `CarnetReadError` portent un message déjà sûr pour l'utilisateur ;
   * toute autre erreur (base, disque…) pourrait divulguer des détails internes :
   * on la remplace par une phrase générique et on journalise le brut.
   */
  private async recordFailure(entryId: string, err: unknown): Promise<void> {
    if (!(err instanceof CarnetReadError))
      this.deps.logger.error("Lecture de carnet — échec inattendu", {
        err: err instanceof Error ? err.message : err,
      });
    const reason =
      err instanceof CarnetReadError ? err.message : GENERIC_FAILURE;
    // L'écriture de l'échec ne doit jamais rejeter à son tour (l'appel est
    // fire-and-forget) : on l'isole.
    try {
      await this.deps.entries.failIfProcessing(entryId, reason);
    } catch (writeErr) {
      this.deps.logger.error("Échec de l'enregistrement de l'état « failed »", {
        err: writeErr instanceof Error ? writeErr.message : writeErr,
      });
    }
  }
}
