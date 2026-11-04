import type {
  AccessPolicy,
  AttachmentRepository,
  EntryRepository,
  ImageStore,
  Logger,
  PageRecord,
  Paywall,
  PageRepository,
  StoredImage,
} from "../ports.js";

export const MAX_PAGES_PER_ENTRY = 20;
export const MAX_SOUVENIRS_PER_ENTRY = 12;

export type AddedSouvenir = {
  id: string;
  width: number;
  height: number;
};

export type PageRejection = { ok: false; httpCode: number; error: string };

const NOT_FOUND: PageRejection = {
  ok: false,
  httpCode: 404,
  error: "pièce jointe introuvable",
};

export type PageDeps = {
  pages: PageRepository;
  entries: Pick<EntryRepository, "findById">;
  attachments: Pick<
    AttachmentRepository,
    "pathsFor" | "nextPosition" | "addMany" | "countOf"
  >;
  images: ImageStore;
  access: AccessPolicy;
  paywall: Paywall;
  logger: Logger;
};

export class PageService {
  constructor(private readonly deps: PageDeps) {}

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

  async attach(params: {
    userId: string;
    entryId: string;
    images: Buffer[];
  }): Promise<{ ok: true; added: number; total: number } | PageRejection> {
    if (!params.images.length)
      return { ok: false, httpCode: 400, error: "aucune photo fournie" };

    const entry = await this.deps.entries.findById(params.entryId);
    const notFound: PageRejection = {
      ok: false,
      httpCode: 404,
      error: "journée introuvable",
    };
    if (!entry) return notFound;
    if (
      !(await this.deps.access.hasChildRole(
        params.userId,
        entry.childId,
        "contributor",
      ))
    )
      return notFound;
    if (entry.status === "processing")
      return {
        ok: false,
        httpCode: 409,
        error:
          "la journée est encore en cours de lecture, réessayez une fois le brouillon prêt",
      };

    const already = (await this.deps.attachments.pathsFor(entry.id)).length;
    if (already + params.images.length > MAX_PAGES_PER_ENTRY)
      return {
        ok: false,
        httpCode: 413,
        error: `Une journée compte au plus ${MAX_PAGES_PER_ENTRY} pages (elle en a déjà ${already}).`,
      };

    const stored: StoredImage[] = [];
    try {
      for (const buf of params.images)
        stored.push(await this.deps.images.store(buf));
      const position = await this.deps.attachments.nextPosition(entry.id);
      await this.deps.attachments.addMany(entry.id, stored, position);
    } catch (err) {
      await Promise.allSettled(
        stored.map((img) => this.deps.images.delete(img)),
      );
      this.deps.logger.error("Ajout de pages impossible", {
        entryId: entry.id,
        err: err instanceof Error ? err.message : err,
      });
      return {
        ok: false,
        httpCode: 422,
        error: "Image indécodable (format non supporté ou fichier corrompu).",
      };
    }

    return {
      ok: true,
      added: stored.length,
      total: already + stored.length,
    };
  }

  async addSouvenirs(params: {
    userId: string;
    entryId: string;
    images: Buffer[];
  }): Promise<
    { ok: true; added: AddedSouvenir[]; total: number } | PageRejection
  > {
    if (!params.images.length)
      return { ok: false, httpCode: 400, error: "aucune photo fournie" };

    const entry = await this.deps.entries.findById(params.entryId);
    if (
      !entry ||
      !(await this.deps.access.hasChildRole(
        params.userId,
        entry.childId,
        "contributor",
      ))
    )
      return { ok: false, httpCode: 404, error: "journée introuvable" };

    const blocked = await this.deps.paywall.blockedReason();
    if (blocked) return { ok: false, httpCode: 402, error: blocked };

    const already = await this.deps.attachments.countOf(entry.id, "souvenir");
    if (already + params.images.length > MAX_SOUVENIRS_PER_ENTRY)
      return {
        ok: false,
        httpCode: 413,
        error: `Une journée garde au plus ${MAX_SOUVENIRS_PER_ENTRY} photos (elle en a déjà ${already}).`,
      };

    const stored: StoredImage[] = [];
    let ids: string[];
    try {
      for (const buf of params.images)
        stored.push(await this.deps.images.store(buf));
      const position = await this.deps.attachments.nextPosition(entry.id);
      ids = await this.deps.attachments.addMany(
        entry.id,
        stored,
        position,
        "souvenir",
      );
    } catch (err) {
      await Promise.allSettled(
        stored.map((img) => this.deps.images.delete(img)),
      );
      this.deps.logger.error("Ajout de photos impossible", {
        entryId: entry.id,
        err: err instanceof Error ? err.message : err,
      });
      return {
        ok: false,
        httpCode: 422,
        error: "Image indécodable (format non supporté ou fichier corrompu).",
      };
    }

    return {
      ok: true,
      added: ids.map((id, i) => ({
        id,
        width: stored[i]!.width,
        height: stored[i]!.height,
      })),
      total: already + ids.length,
    };
  }

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

  async remove(
    userId: string,
    attachmentId: string,
  ): Promise<{ ok: true } | PageRejection> {
    const page = await this.deps.pages.findWithEntry(attachmentId);
    if (!page) return NOT_FOUND;
    if (!(await this.mayContribute(userId, page))) return NOT_FOUND;

    if (page.kind === "souvenir") return this.discard(page);

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

    return this.discard(page);
  }

  private async discard(page: PageRecord): Promise<{ ok: true }> {
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
