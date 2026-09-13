import type { FastifyInstance } from "fastify";
import {
  carnetReading,
  childrenService,
  entryEditing,
  ingestService,
} from "../composition.js";
import { isIsoDate } from "../domain/dates.js";
import { isSource } from "../domain/entry-metadata.js";
import { requireUser } from "../plugins/auth.js";
import {
  findVisibleEntry,
  listAccessibleChildren,
  listBatch,
  listTimeline,
  listTimelineMonths,
} from "../queries/entry-feed.js";
import { parseCursor, parseFrom, parseLimit } from "../domain/feed-window.js";
import { tidyUncertainties } from "../uncertainties.js";
import { attachmentUrls } from "./attachment-urls.js";

/* ===========================================================================
   LA COUCHE HTTP DU JOURNAL — et seulement elle.

   Ces gestionnaires portaient les règles : contrôle d'accès, transition de
   publication, substitution d'un mot tranché, jusqu'aux codes d'erreur de
   Postgres. Tout cela est parti dans `services/` et `queries/` ; il ne reste ici
   que ce qui est vraiment du ressort d'HTTP — lire une requête, choisir un code
   de statut, mettre en forme la réponse.
   =========================================================================== */

type SerializableEntry = NonNullable<Awaited<ReturnType<typeof findVisibleEntry>>>;

/** Entrée complète (moments + pages) mise en forme pour le front. */
function serializeEntry(entry: SerializableEntry) {
  return {
    ...entry,
    /* Les journées déjà en base gardent le `original` fourre-tout que le modèle
       a parfois écrit (le mot ET sa glose dans le même champ). Aucune migration
       ne les réécrit : on les remet en forme à la lecture, pour que l'écran de
       relecture montre un MOT et non une phrase entre guillemets doublés. */
    uncertainties: tidyUncertainties(entry.uncertainties),
    attachments: entry.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      mime: a.mime,
      width: a.width,
      height: a.height,
      ...attachmentUrls(a),
    })),
  };
}

export async function entriesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /* --------------------------------- Enfants ---------------------------- */

  app.get("/api/children", async (req) => listAccessibleChildren(req.user!.id));

  app.post<{ Body: { name?: string; birthdate?: string } }>(
    "/api/children",
    async (req, reply) => {
      const created = await childrenService.create({
        userId: req.user!.id,
        name: req.body?.name,
        birthdate: req.body?.birthdate,
      });
      if (!created.ok)
        return reply.code(created.httpCode).send({ error: created.error });
      return reply.code(201).send({ ...created.child, role: "admin" as const });
    },
  );

  /* --------------------------------- Ingestion -------------------------- */

  app.post("/api/entries/ingest", async (req, reply) => {
    let childId: string | undefined;
    let date: string | undefined;
    let source: string | undefined;
    const images: Buffer[] = [];

    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          images.push(await part.toBuffer());
        } else {
          const value = String(part.value);
          if (part.fieldname === "childId") childId = value;
          else if (part.fieldname === "date") date = value;
          else if (part.fieldname === "source") source = value;
        }
      }
    } catch (err) {
      const tooLarge =
        err instanceof Error &&
        /file too large|request.*too large/i.test(err.message);
      return reply.code(tooLarge ? 413 : 400).send({
        error: tooLarge
          ? "Photo trop volumineuse (max 20 Mo par page)."
          : "Image indécodable (format non supporté ou fichier corrompu).",
      });
    }

    // Le formulaire multipart reste tolérant : une date/source mal formée est
    // ignorée (défaut appliqué), comme historiquement. La validation stricte du
    // service (400 explicite) est réservée aux appels programmatiques (MCP).
    const result = await ingestService.ingest({
      userId: req.user!.id,
      images,
      childId,
      date: date && isIsoDate(date) ? date : undefined,
      source: source && isSource(source) ? source : undefined,
    });

    if (!result.ok)
      return reply
        .code(result.httpCode)
        .send({ error: result.error, ...(result.id ? { id: result.id } : {}) });

    return reply.code(202).send({ id: result.id, status: result.status });
  });

  /* --------------------------------- Timeline --------------------------- */

  app.get<{
    Querystring: {
      childId?: string;
      limit?: string;
      /** Ancre : l'identifiant de la dernière journée déjà reçue. */
      cursor?: string;
      /** Bord haut de la fenêtre (AAAA-MM-JJ) : le saut dans le carnet. */
      from?: string;
    };
  }>("/api/entries", async (req, reply) => {
    const page = await listTimeline({
      userId: req.user!.id,
      childId: req.query.childId,
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
      from: parseFrom(req.query.from),
    });
    if (page.kind === "denied")
      return reply.code(403).send({ error: "accès refusé à cet enfant" });

    return {
      entries: page.entries.map((e) => ({
        ...e,
        attachments: e.attachments.map((a) => ({
          id: a.id,
          ...attachmentUrls(a),
        })),
      })),
      nextCursor: page.nextCursor,
    };
  });

  /* L'index des mois : de quoi sauter dans le carnet sans le dérouler. Route
     STATIQUE avant `/api/entries/:id` — « months » n'est pas un identifiant. */
  app.get<{ Querystring: { childId?: string } }>(
    "/api/entries/months",
    async (req, reply) => {
      const res = await listTimelineMonths({
        userId: req.user!.id,
        childId: req.query.childId,
      });
      if (res.kind === "denied")
        return reply.code(403).send({ error: "accès refusé à cet enfant" });
      return { months: res.months };
    },
  );

  /**
   * Journées sœurs d'un même envoi de photos couvrant plusieurs jours
   * (voir `batchId` en base). Alimente le stepper de relecture séquentielle
   * du front : un résumé léger par journée, trié chronologiquement.
   */
  app.get<{ Params: { batchId: string } }>(
    "/api/entries/batch/:batchId",
    async (req, reply) => {
      const entries = await listBatch(req.user!.id, req.params.batchId);
      if (!entries) return reply.code(404).send({ error: "lot introuvable" });
      return { entries };
    },
  );

  app.get<{ Params: { id: string } }>("/api/entries/:id", async (req, reply) => {
    const entry = await findVisibleEntry(req.user!.id, req.params.id);
    if (!entry) return reply.code(404).send({ error: "entrée introuvable" });
    return serializeEntry(entry);
  });

  /* ------------------------- Relecture / publication -------------------- */

  app.patch<{
    Params: { id: string };
    Body: {
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
  }>("/api/entries/:id", async (req, reply) => {
    const result = await entryEditing.revise({
      entryId: req.params.id,
      userId: req.user!.id,
      ...(req.body ?? {}),
    });
    if (!result.ok)
      return reply.code(result.httpCode).send({ error: result.error });

    const entry = await findVisibleEntry(req.user!.id, req.params.id);
    return entry ? serializeEntry(entry) : null;
  });

  /**
   * Valide une incertitude signalée à la relecture : la valeur choisie (une des
   * suggestions du modèle, l'original conservé tel quel, ou une saisie libre)
   * remplace le mot dans la valorisation et alimente le glossaire de l'enfant.
   */
  app.patch<{
    Params: { id: string; index: string };
    Body: { value?: string };
  }>("/api/entries/:id/uncertainties/:index", async (req, reply) => {
    const result = await entryEditing.resolveUncertainty({
      entryId: req.params.id,
      userId: req.user!.id,
      index: Number(req.params.index),
      value: req.body?.value ?? "",
    });
    if (!result.ok)
      return reply.code(result.httpCode).send({ error: result.error });

    const entry = await findVisibleEntry(req.user!.id, req.params.id);
    return entry ? serializeEntry(entry) : null;
  });

  /**
   * Relance la lecture d'une journée en échec, sur ses pages déjà téléversées.
   *
   * La seule sortie d'un échec était « Reprendre la photo » : correct quand la
   * page est floue, faux quand la lecture est morte avec le processus. Dans ce
   * second cas les pages sont intactes sur le disque et le carnet papier est
   * déjà reparti chez la nounou — la relance est la seule sortie honnête.
   */
  app.post<{ Params: { id: string } }>(
    "/api/entries/:id/retry",
    async (req, reply) => {
      const started = await carnetReading.retry(req.params.id, req.user!.id);
      if (!started.ok)
        return reply.code(started.httpCode).send({ error: started.error });
      return reply.code(202).send({ id: req.params.id, status: "processing" });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/entries/:id",
    async (req, reply) => {
      const result = await entryEditing.remove(req.params.id, req.user!.id);
      if (!result.ok)
        return reply.code(result.httpCode).send({ error: result.error });
      return reply.code(204).send();
    },
  );
}
