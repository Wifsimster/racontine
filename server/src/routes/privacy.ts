import type { FastifyInstance } from "fastify";
import { privacy } from "../composition.js";
import { requireUser } from "../plugins/auth.js";

/* ===========================================================================
   SES DONNÉES : LES EMPORTER, LES EFFACER — côté HTTP, et rien d'autre.

   Les règles (qui peut partir, ce qui part avec lui, ce qu'un export contient)
   sont dans `domain/erasure.ts` et `services/privacy-service.ts`. Ici, on
   traduit : un corps JSON, un code de statut, un nom de fichier.

   Toutes ces routes exigent une session. Aucune n'est utile à qui n'a pas de
   compte, et l'effacement d'un compte ne doit JAMAIS pouvoir être demandé par
   quelqu'un d'autre — pas même par le propriétaire de l'instance, qui n'a pas
   à décider de l'adresse e-mail de la grand-mère qui lit le journal.
   =========================================================================== */

/** Nom de fichier de l'archive : daté, pour qu'un dossier de téléchargements reste lisible. */
function archiveName(): string {
  return `racontine-export-${new Date().toISOString().slice(0, 10)}.zip`;
}

export async function privacyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /**
   * EMPORTER — tout ce que le compte peut lire, en un zip : le journal en JSON
   * et les photos du carnet. Le zip part en flux : les photos ne transitent
   * pas par la mémoire du serveur.
   *
   * `Content-Disposition: attachment` pour que le navigateur ENREGISTRE au lieu
   * d'afficher. Le nom de fichier voyage avec, sinon le fichier s'appellerait
   * « export ».
   */
  app.get("/api/me/export", async (req, reply) => {
    const archive = await privacy.exportAccount(req.user!.id);
    if (!archive) return reply.code(404).send({ error: "compte introuvable" });
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${archiveName()}"`)
      // Une archive porte l'intégralité d'un journal d'enfant : elle ne doit
      // dormir dans aucun cache intermédiaire.
      .header("Cache-Control", "no-store")
      .send(archive);
  });

  /**
   * CE QUE L'EFFACEMENT FERAIT — sans rien effacer.
   *
   * L'écran a besoin de le dire AVANT le bouton : quels carnets partent avec le
   * compte, lesquels restent aux autres, et — le cas échéant — ce qui empêche
   * encore le départ. Un refus est un 409 : la demande est légitime, c'est
   * l'état de l'instance qui s'y oppose, et il est réparable.
   */
  app.get("/api/me/erasure", async (req, reply) => {
    const preview = await privacy.erasurePreview(req.user!.id);
    if (!preview.ok)
      return reply.code(preview.httpCode).send({
        error: preview.error,
        code: preview.code,
        carnets: preview.carnets ?? [],
      });
    return { deletes: preview.deletes, leaves: preview.leaves };
  });

  /** PARTIR. Le corps porte la confirmation : l'adresse du compte, recopiée. */
  app.delete<{ Body: { confirmation?: unknown } }>(
    "/api/me",
    async (req, reply) => {
      const confirmation = (req.body ?? {}).confirmation;
      const result = await privacy.deleteAccount({
        userId: req.user!.id,
        email: req.user!.email,
        confirmation: typeof confirmation === "string" ? confirmation : "",
      });
      if (!result.ok)
        return reply.code(result.httpCode).send({
          error: result.error,
          code: result.code,
          carnets: result.carnets ?? [],
        });
      /* Les sessions du compte sont parties avec lui (cascade sur `user`) : le
         cookie que le navigateur garde encore ne désigne plus rien. On rend la
         liste des carnets effacés pour que l'écran d'adieu puisse les nommer. */
      return reply.code(200).send({ deleted: true, carnets: result.carnets });
    },
  );

  /**
   * EFFACER LE CARNET D'UN ENFANT — administrateur de CE carnet uniquement.
   *
   * Sur `/api/children/:childId` plutôt que sous `/api/me/…` : ce n'est pas un
   * réglage personnel, c'est le carnet lui-même qui disparaît, pour tout son
   * cercle. La confirmation est le prénom de l'enfant.
   */
  app.delete<{ Params: { childId: string }; Body: { confirmation?: unknown } }>(
    "/api/children/:childId",
    async (req, reply) => {
      const confirmation = (req.body ?? {}).confirmation;
      const result = await privacy.deleteCarnet({
        userId: req.user!.id,
        childId: req.params.childId,
        confirmation: typeof confirmation === "string" ? confirmation : "",
      });
      if (!result.ok)
        return reply
          .code(result.httpCode)
          .send({ error: result.error, code: result.code });
      return reply.code(200).send({ deleted: true, name: result.name });
    },
  );
}
