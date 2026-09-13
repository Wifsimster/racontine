import type {
  AccessPolicy,
  ImageStore,
  Logger,
  PageRecord,
  PageRepository,
} from "../ports.js";

/** Refus métier, portant déjà son code HTTP. */
export type PageRejection = { ok: false; httpCode: number; error: string };

const NOT_FOUND: PageRejection = {
  ok: false,
  httpCode: 404,
  error: "pièce jointe introuvable",
};

export type PageDeps = {
  pages: PageRepository;
  images: ImageStore;
  access: AccessPolicy;
  logger: Logger;
};

/**
 * LES PAGES PHOTOGRAPHIÉES — les voir, les tourner, les retirer.
 *
 * Quatre règles y tiennent, et elles vivaient toutes dans des gestionnaires
 * HTTP, entre deux jointures SQL :
 *  · un lecteur ne voit les pages que d'une journée publiée ;
 *  · tourner une page exige contributor+ — c'est une écriture sur le fichier
 *    source — mais reste possible APRÈS publication : l'orientation ne change
 *    rien à ce que le carnet dit, et c'est justement une fois publiée qu'on
 *    relit la journée ;
 *  · on ne retire pas une page d'une journée publiée : les photos sources
 *    restent la preuve du récit ;
 *  · une journée garde toujours au moins une page.
 */
export class PageService {
  constructor(private readonly deps: PageDeps) {}

  /**
   * La page à servir, si l'appelant a le droit de la voir. Rend le chemin
   * relatif (miniature si demandée et disponible) et son type ; `null` couvre
   * l'absence comme le refus — on ne révèle pas l'existence d'une page.
   */
  async openForRead(
    userId: string,
    attachmentId: string,
    wantsThumb: boolean,
  ): Promise<{ relPath: string; mime: string } | null> {
    const page = await this.deps.pages.findWithEntry(attachmentId);
    if (!page) return null;

    const role = await this.deps.access.roleOn(userId, page.childId);
    if (!role) return null;
    if (role === "reader" && page.entryStatus !== "published") return null;

    return {
      relPath: wantsThumb && page.thumbPath ? page.thumbPath : page.originalPath,
      mime: page.mime,
    };
  }

  /**
   * Tourne une page d'un ou plusieurs quarts de tour horaires, POUR DE BON.
   *
   * Un quart de tour nul ne touche à rien : réencoder pour rien dégraderait le
   * JPEG et invaliderait le cache sans qu'aucun pixel n'ait bougé.
   */
  async rotate(params: {
    userId: string;
    attachmentId: string;
    quarter: number;
  }): Promise<
    | {
        ok: true;
        id: string;
        rotation: number;
        width: number | null;
        height: number | null;
      }
    | PageRejection
  > {
    if (!Number.isInteger(params.quarter))
      return { ok: false, httpCode: 400, error: "quarter doit être un entier" };
    const quarter = ((params.quarter % 4) + 4) % 4;

    const page = await this.deps.pages.findWithEntry(params.attachmentId);
    if (!page) return NOT_FOUND;
    if (!(await this.mayContribute(params.userId, page))) return NOT_FOUND;

    const rotation = (page.rotation + quarter) % 4;
    if (quarter === 0)
      return {
        ok: true,
        id: page.id,
        rotation: page.rotation,
        width: page.width,
        height: page.height,
      };

    let size: { width: number; height: number };
    try {
      size = await this.deps.images.rotate(page, quarter);
    } catch (err) {
      // La cause exacte est pour l'exploitant, pas pour l'écran.
      this.deps.logger.error("Rotation impossible", {
        attachmentId: page.id,
        err: err instanceof Error ? err.message : err,
      });
      return {
        ok: false,
        httpCode: 422,
        error: "impossible de tourner cette page",
      };
    }
    await this.deps.pages.saveRotation(page.id, { ...size, rotation });
    return { ok: true, id: page.id, rotation, ...size };
  }

  /** Retire une page du carnet (et son fichier), sous ses deux conditions. */
  async remove(
    userId: string,
    attachmentId: string,
  ): Promise<{ ok: true } | PageRejection> {
    const page = await this.deps.pages.findWithEntry(attachmentId);
    if (!page) return NOT_FOUND;
    if (!(await this.mayContribute(userId, page))) return NOT_FOUND;

    if (page.entryStatus === "published")
      return {
        ok: false,
        httpCode: 409,
        error: "impossible de retirer une page d'une journée déjà publiée",
      };

    if ((await this.deps.pages.countSiblings(page.entryId)) <= 1)
      return {
        ok: false,
        httpCode: 409,
        error: "impossible de retirer la dernière page du carnet",
      };

    await this.deps.pages.remove(page.id);
    await this.deps.images.delete({
      originalPath: page.originalPath,
      thumbPath: page.thumbPath ?? page.originalPath,
    });
    return { ok: true };
  }

  private mayContribute(userId: string, page: PageRecord): Promise<boolean> {
    return this.deps.access.hasChildRole(userId, page.childId, "contributor");
  }
}
