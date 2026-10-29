import type { Readable } from "node:stream";
import {
  confirms,
  planAccountErasure,
  type CarnetRef,
  type ErasureBlockCode,
} from "../domain/erasure.js";
import { planExportPhotos } from "../domain/export-photos.js";
import type {
  ArchivePacker,
  ImageStore,
  Logger,
  PrivacyRepository,
  StoredFile,
} from "../ports.js";

export type PrivacyRejection = {
  ok: false;
  httpCode: number;
  error: string;
  code?: ErasureBlockCode | "confirmation";
  carnets?: CarnetRef[];
};

export type ErasurePreview =
  | { ok: true; deletes: CarnetRef[]; leaves: CarnetRef[] }
  | PrivacyRejection;

export type PrivacyDeps = {
  privacy: PrivacyRepository;
  images: ImageStore;
  packer: ArchivePacker;
  logger: Logger;
};

export const EXPORT_JSON = "racontine-export.json";

const README = `Racontine — vos données

${EXPORT_JSON}
  Le journal : vos carnets, les journées que vous pouvez lire, leurs moments,
  vos corrections, vos abonnements et vos notifications. Chaque page
  photographiée y indique, dans « file », où trouver sa photo dans ce dossier.

photos/
  Les pages du carnet, rangées par enfant puis par date
  (photos/<prénom>/<date>-<n° de page>.jpg).

Aucun mot de passe, jeton ni clé n'y figure.
`;

export class PrivacyService {
  constructor(private readonly deps: PrivacyDeps) {}

  async exportAccount(userId: string): Promise<Readable | null> {
    const archive = await this.deps.privacy.exportFor(userId);
    if (!archive) return null;

    const pageIds = archive.carnets.flatMap((c) =>
      c.entries.flatMap((e) => e.pages.map((p) => p.id)),
    );
    const files = await this.deps.privacy.pageFilesOf(pageIds);
    const present = await Promise.all(
      files.map((f) => this.deps.images.exists(f.originalPath)),
    );
    const stored = new Map(
      files.filter((_, i) => present[i]).map((f) => [f.id, f.originalPath]),
    );
    if (stored.size < pageIds.length)
      this.deps.logger.warn("Export : photos absentes du disque", {
        userId,
        missing: pageIds.length - stored.size,
      });

    const plan = planExportPhotos(archive, stored);
    return this.deps.packer.pack([
      {
        path: EXPORT_JSON,
        data: Buffer.from(JSON.stringify(plan.archive, null, 2)),
      },
      { path: "LISEZ-MOI.txt", data: Buffer.from(README) },
      ...plan.photos.map((p) => ({
        path: p.file,
        open: () => this.deps.images.openRead(p.storedPath),
      })),
    ]);
  }

  async erasurePreview(userId: string): Promise<ErasurePreview> {
    const snapshot = await this.deps.privacy.erasureSnapshot(userId);
    if (!snapshot) return notFound("compte introuvable");
    const plan = planAccountErasure(snapshot);
    if (!plan.ok)
      return {
        ok: false,
        httpCode: 409,
        error: plan.error,
        code: plan.code,
        carnets: plan.carnets,
      };
    return { ok: true, deletes: plan.deletes, leaves: plan.leaves };
  }

  async deleteCarnet(params: {
    userId: string;
    childId: string;
    confirmation: string;
  }): Promise<{ ok: true; name: string } | PrivacyRejection> {
    const standing = await this.deps.privacy.standingOn(
      params.userId,
      params.childId,
    );
    if (!standing || standing.role !== "admin")
      return notFound("carnet introuvable");

    if (!confirms(params.confirmation, standing.childName))
      return {
        ok: false,
        httpCode: 400,
        code: "confirmation",
        error: `Pour effacer ce carnet, recopiez le prénom de l'enfant : ${standing.childName}.`,
      };

    await this.erase([params.childId], []);
    this.deps.logger.info("Carnet effacé", {
      childId: params.childId,
      by: params.userId,
    });
    return { ok: true, name: standing.childName };
  }

  async deleteAccount(params: {
    userId: string;
    email: string;
    confirmation: string;
  }): Promise<{ ok: true; carnets: CarnetRef[] } | PrivacyRejection> {
    if (!confirms(params.confirmation, params.email))
      return {
        ok: false,
        httpCode: 400,
        code: "confirmation",
        error: `Pour effacer votre compte, recopiez votre adresse : ${params.email}.`,
      };

    const snapshot = await this.deps.privacy.erasureSnapshot(params.userId);
    if (!snapshot) return notFound("compte introuvable");

    const plan = planAccountErasure(snapshot);
    if (!plan.ok)
      return {
        ok: false,
        httpCode: 409,
        error: plan.error,
        code: plan.code,
        carnets: plan.carnets,
      };

    const staged = await this.deps.privacy.stagedFilesOf(params.userId);
    const erased = await this.erase(
      plan.deletes.map((c) => c.id),
      staged,
      params.userId,
    );
    if (!erased)
      return {
        ok: false,
        httpCode: 409,
        error:
          "Un autre administrateur vient de quitter l'un de vos carnets : vous en êtes maintenant le seul. Rechargez la page pour voir quoi faire avant d'effacer votre compte.",
      };
    this.deps.logger.info("Compte effacé", {
      userId: params.userId,
      carnets: plan.deletes.length,
    });
    return { ok: true, carnets: plan.deletes };
  }

  private async erase(
    childIds: string[],
    extraFiles: StoredFile[],
    userId?: string,
  ): Promise<boolean> {
    const files = childIds.length
      ? await this.deps.privacy.filesOfChildren(childIds)
      : [];

    for (const file of [...files, ...extraFiles]) {
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

    if (childIds.length) await this.deps.privacy.deleteChildren(childIds);
    if (userId) return this.deps.privacy.deleteAccount(userId);
    return true;
  }
}

function notFound(error: string): PrivacyRejection {
  return { ok: false, httpCode: 404, error };
}
