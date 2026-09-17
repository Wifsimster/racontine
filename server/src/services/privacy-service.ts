import {
  confirms,
  planAccountErasure,
  type CarnetRef,
  type ErasureBlockCode,
} from "../domain/erasure.js";
import type {
  ExportArchive,
  ImageStore,
  Logger,
  PrivacyRepository,
  StoredFile,
} from "../ports.js";

/* ===========================================================================
   EMPORTER SES DONNÉES, ET S'EN ALLER.

   Deux droits qu'aucune route ne servait, alors même que l'instance porte ce
   qu'un produit peut porter de plus intime : le journal quotidien d'un enfant,
   des photos de son carnet de liaison, le nom de ses proches. On pouvait
   effacer une journée, retirer une page, révoquer un proche — jamais reprendre
   l'ensemble, jamais partir.

   Ce service ferme ce trou, en trois gestes qui vont ensemble :
     · EMPORTER  — une archive JSON de tout ce que le compte peut lire, avec
                   l'adresse de chaque photo pour aller chercher les octets ;
     · EFFACER UN CARNET — le journal d'un enfant, ses journées, ses photos ;
     · EFFACER SON COMPTE — et avec lui les carnets que personne d'autre ne tient.

   Les deux effacements sont SANS RETOUR : il n'y a pas de corbeille, et la
   sauvegarde — s'il y en a une — appartient à l'exploitant du homelab. C'est
   pour cela qu'ils exigent une phrase recopiée, et que l'effacement d'un compte
   passe d'abord par les règles de `domain/erasure.ts`, qui protègent les autres
   de ce départ.
   =========================================================================== */

/** Refus, portant déjà son code HTTP et — s'il y a lieu — ce qui bloque. */
export type PrivacyRejection = {
  ok: false;
  httpCode: number;
  error: string;
  code?: ErasureBlockCode | "confirmation";
  carnets?: CarnetRef[];
};

/** Ce qu'un effacement de compte ferait, dit AVANT de le faire. */
export type ErasurePreview =
  | { ok: true; deletes: CarnetRef[]; leaves: CarnetRef[] }
  | PrivacyRejection;

export type PrivacyDeps = {
  privacy: PrivacyRepository;
  images: ImageStore;
  logger: Logger;
};

export class PrivacyService {
  constructor(private readonly deps: PrivacyDeps) {}

  /**
   * L'archive du compte. `null` si le compte n'existe plus (session survivant
   * à un effacement concurrent) : la route en fait un 404, pas un 500.
   */
  exportAccount(userId: string): Promise<ExportArchive | null> {
    return this.deps.privacy.exportFor(userId);
  }

  /**
   * CE QUI VA PARTIR, avant d'appuyer.
   *
   * L'écran ne doit pas offrir un bouton dont il ignore la portée : « votre
   * compte, et avec lui le carnet de Lou (312 journées) » se lit autrement que
   * « effacer mon compte ». Même calcul que l'effacement lui-même — même
   * fonction, mêmes refus —, sans rien toucher : un aperçu qui divergerait du
   * geste serait pire que pas d'aperçu du tout.
   */
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

  /**
   * EFFACE LE CARNET D'UN ENFANT — journées, moments, photos, cercle, glossaire.
   *
   * Réservé aux administrateurs du carnet : c'est le rôle qui tient déjà les
   * invitations et les révocations, et il n'y a personne au-dessus de lui sur un
   * carnet (le propriétaire de l'instance tient les réglages, pas les journaux
   * des autres). Le carnet introuvable et le carnet qu'on n'administre pas
   * rendent le MÊME 404 : un contributeur qui tape une adresse au hasard
   * n'apprend pas l'existence des carnets qu'on lui cache.
   */
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

  /**
   * EFFACE LE COMPTE, et ce que lui seul tenait.
   *
   * La confirmation est l'ADRESSE DU COMPTE, pas un mot générique : sur un
   * téléphone partagé, « SUPPRIMER » recopié ne dit pas QUEL compte s'efface.
   *
   * Le plan est recalculé ici, et pas repris de l'aperçu : entre l'écran et le
   * bouton, un co-parent a pu quitter un cercle, ou un abonnement redémarrer.
   * C'est cette relecture — et elle seule — qui fait foi.
   */
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

    /* Les fichiers en attente (pages téléversées par un client MCP, jamais
       rattachées à une journée) ne pendent à aucun carnet : sans cette ligne,
       ils survivraient au compte qui les a envoyés, sur le disque, sans plus
       aucune ligne en base pour dire à qui ils sont. */
    const staged = await this.deps.privacy.stagedFilesOf(params.userId);
    await this.erase(
      plan.deletes.map((c) => c.id),
      staged,
      params.userId,
    );
    this.deps.logger.info("Compte effacé", {
      userId: params.userId,
      carnets: plan.deletes.length,
    });
    return { ok: true, carnets: plan.deletes };
  }

  /**
   * L'EFFACEMENT LUI-MÊME : LES FICHIERS D'ABORD, LES LIGNES ENSUITE.
   *
   * L'ordre n'est pas indifférent, et ce n'est pas celui qu'on écrit par
   * réflexe. Si la base partait la première, une panne entre les deux laisserait
   * sur le disque les photos du carnet d'un enfant sans plus aucune ligne pour
   * les désigner : invisibles depuis l'application, impossibles à retrouver par
   * l'écran qui vient justement de promettre leur effacement. C'est exactement
   * la donnée personnelle orpheline qu'on est censé faire disparaître.
   *
   * Dans l'autre sens, la même panne laisse des journées dont les photos
   * manquent — un état VISIBLE, que la route des pièces jointes sait déjà
   * servir (404 « fichier absent »), et qu'un second clic achève. On préfère
   * un carnet visiblement abîmé à un fichier secrètement conservé.
   *
   * L'effacement des fichiers est best-effort par nature (`ImageStore.delete`
   * ne lève pas sur un fichier déjà absent) : un disque en lecture seule ne doit
   * pas empêcher les lignes de partir, mais il doit se voir dans le journal.
   */
  private async erase(
    childIds: string[],
    extraFiles: StoredFile[],
    userId?: string,
  ): Promise<void> {
    const files = childIds.length
      ? await this.deps.privacy.filesOfChildren(childIds)
      : [];

    for (const file of [...files, ...extraFiles]) {
      try {
        await this.deps.images.delete({
          originalPath: file.originalPath,
          // `ImageStore.delete` attend deux chemins ; sans miniature, on lui
          // redonne l'original — effacer deux fois le même fichier est sans
          // effet, alors qu'un chemin fabriqué pourrait viser autre chose.
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
    if (userId) await this.deps.privacy.deleteAccount(userId);
  }
}

function notFound(error: string): PrivacyRejection {
  return { ok: false, httpCode: 404, error };
}
