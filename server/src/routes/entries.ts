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

type SerializableEntry = NonNullable<Awaited<ReturnType<typeof findVisibleEntry>>>;

function serializeEntry(entry: SerializableEntry) {
  return {
    ...entry,
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

  app.get<{
    Querystring: {
      childId?: string;
      limit?: string;
      cursor?: string;
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
