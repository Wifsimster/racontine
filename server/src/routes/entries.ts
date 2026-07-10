import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  entries,
  entryItems,
  attachments,
  children,
  type EntryItemData,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import { storeCarnetImage, resolveUpload } from "../storage.js";
import { extractFromImages, type Extraction } from "../vlm.js";

async function readStored(relPath: string): Promise<Buffer> {
  return readFile(resolveUpload(relPath));
}

const ITEM_TYPES = ["meal", "nap", "activity", "anecdote", "health"] as const;
type ItemType = (typeof ITEM_TYPES)[number];
const SOURCES = ["nounou", "mam", "creche", "maison"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Extraction VLM → lignes entry_items. */
function extractionToItems(
  x: Extraction,
): { type: ItemType; data: EntryItemData; position: number }[] {
  const rows: { type: ItemType; data: EntryItemData; position: number }[] = [];
  let pos = 0;
  for (const r of x.repas)
    rows.push({ type: "meal", data: r, position: pos++ });
  for (const s of x.siestes)
    rows.push({ type: "nap", data: s, position: pos++ });
  for (const a of x.activites)
    rows.push({ type: "activity", data: { label: a }, position: pos++ });
  for (const a of x.anecdotes)
    rows.push({ type: "anecdote", data: { text: a }, position: pos++ });
  if (x.sante && x.sante.trim())
    rows.push({ type: "health", data: { note: x.sante }, position: pos++ });
  return rows;
}

/** Entrée complète (items + pièces jointes) sérialisée pour le front. */
async function serializeEntry(entryId: string) {
  const entry = await db.query.entries.findFirst({
    where: eq(entries.id, entryId),
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });
  if (!entry) return null;
  return {
    ...entry,
    attachments: entry.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      mime: a.mime,
      width: a.width,
      height: a.height,
      url: `/api/attachments/${a.id}`,
      thumbUrl: `/api/attachments/${a.id}?size=thumb`,
    })),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Traitement VLM en arrière-plan : processing → draft | failed.
 * Ré-extrait à partir de TOUTES les pages de l'entrée (chemins disque) pour
 * fusionner correctement un ajout de page à une journée existante.
 */
async function processEntry(entryId: string, paths: string[]) {
  try {
    const jpegs = await Promise.all(paths.map((p) => readStored(p)));
    const x = await extractFromImages(jpegs);
    if (x.illisible) {
      await db
        .update(entries)
        .set({
          status: "failed",
          failureReason:
            "Photo illisible : aucun contenu de carnet exploitable détecté.",
          updatedAt: new Date(),
        })
        .where(eq(entries.id, entryId));
      return;
    }
    const items = extractionToItems(x);
    await db.transaction(async (tx) => {
      await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
      if (items.length) {
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId })));
      }
      await tx
        .update(entries)
        .set({
          status: "draft",
          mood: x.humeur,
          title: x.titre,
          story: x.recit,
          highlight: x.temps_fort,
          transcription: x.transcription_integrale,
          uncertainties: x.incertitudes,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, entryId));
    });
  } catch (err) {
    await db
      .update(entries)
      .set({
        status: "failed",
        failureReason:
          err instanceof Error ? err.message : "Erreur d'extraction VLM.",
        updatedAt: new Date(),
      })
      .where(eq(entries.id, entryId));
  }
}

export async function entriesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /* --------------------------------- Enfants ---------------------------- */

  app.get("/api/children", async () => {
    return db.select().from(children).orderBy(children.createdAt);
  });

  app.post<{ Body: { name?: string; birthdate?: string } }>(
    "/api/children",
    async (req, reply) => {
      const name = req.body?.name?.trim();
      if (!name) return reply.code(400).send({ error: "name requis" });
      const birthdate = req.body.birthdate?.trim();
      if (birthdate && !DATE_RE.test(birthdate))
        return reply
          .code(400)
          .send({ error: "birthdate invalide (attendu AAAA-MM-JJ)" });
      const [child] = await db
        .insert(children)
        .values({ name, birthdate: birthdate ?? null })
        .returning();
      return reply.code(201).send(child);
    },
  );

  /* --------------------------------- Ingestion -------------------------- */

  app.post("/api/entries/ingest", async (req, reply) => {
    let childId: string | undefined;
    let date = todayIso();
    let source: (typeof SOURCES)[number] = "nounou";
    const stored: Awaited<ReturnType<typeof storeCarnetImage>>[] = [];

    try {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const buf = await part.toBuffer();
          const img = await storeCarnetImage(buf);
          stored.push(img);
        } else {
          const value = String(part.value);
          if (part.fieldname === "childId") childId = value;
          else if (part.fieldname === "date" && DATE_RE.test(value))
            date = value;
          else if (
            part.fieldname === "source" &&
            (SOURCES as readonly string[]).includes(value)
          )
            source = value as (typeof SOURCES)[number];
        }
      }
    } catch (err) {
      const tooLarge =
        err instanceof Error && /file too large|request.*too large/i.test(err.message);
      return reply.code(tooLarge ? 413 : 400).send({
        error: tooLarge
          ? "Photo trop volumineuse (max 20 Mo par page)."
          : "Image indécodable (format non supporté ou fichier corrompu).",
      });
    }

    if (!stored.length)
      return reply.code(400).send({ error: "aucune photo fournie" });

    // childId facultatif si le foyer n'a qu'un seul enfant.
    if (!childId) {
      const kids = await db.select().from(children).limit(2);
      if (kids.length === 1) childId = kids[0].id;
      else
        return reply
          .code(400)
          .send({ error: "childId requis (plusieurs enfants)" });
    }

    // L'enfant doit exister (sinon violation de clé étrangère → 500).
    const child = await db
      .select({ id: children.id })
      .from(children)
      .where(eq(children.id, childId))
      .limit(1);
    if (!child.length)
      return reply.code(400).send({ error: "enfant introuvable" });

    // Find-or-create sûr face aux requêtes concurrentes : INSERT … ON CONFLICT
    // DO NOTHING, puis relecture si l'entrée existait déjà.
    const [inserted] = await db
      .insert(entries)
      .values({
        childId,
        date,
        source,
        status: "processing",
        createdBy: req.user?.id ?? null,
      })
      .onConflictDoNothing({
        target: [entries.childId, entries.date, entries.source],
      })
      .returning();

    let entry = inserted;
    if (!entry) {
      const [existing] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.childId, childId),
            eq(entries.date, date),
            eq(entries.source, source),
          ),
        )
        .limit(1);
      // Ne pas écraser une journée déjà relue et publiée.
      if (existing.status === "published") {
        return reply.code(409).send({
          error:
            "Cette journée est déjà publiée. Modifiez ou supprimez l'entrée existante avant de re-photographier.",
          id: existing.id,
        });
      }
      await db
        .update(entries)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(entries.id, existing.id));
      entry = existing;
    }
    const entryId = entry.id;

    // Positions à la suite des pages déjà rattachées (fusion multi-requêtes).
    const existingAtts = await db
      .select({ position: attachments.position })
      .from(attachments)
      .where(eq(attachments.entryId, entryId));
    const basePos = existingAtts.reduce(
      (max, a) => Math.max(max, a.position + 1),
      0,
    );

    await db.insert(attachments).values(
      stored.map((img, i) => ({
        entryId,
        kind: "carnet" as const,
        originalPath: img.originalPath,
        thumbPath: img.thumbPath,
        mime: img.mime,
        width: img.width,
        height: img.height,
        position: basePos + i,
      })),
    );

    // Ré-extraction sur TOUTES les pages de l'entrée (existantes + nouvelles).
    const allAtts = await db
      .select({ path: attachments.originalPath })
      .from(attachments)
      .where(eq(attachments.entryId, entryId))
      .orderBy(attachments.position);

    // Extraction en arrière-plan : la requête répond tout de suite.
    void processEntry(
      entryId,
      allAtts.map((a) => a.path),
    );

    return reply.code(202).send({ id: entryId, status: "processing" });
  });

  /* --------------------------------- Timeline --------------------------- */

  app.get<{ Querystring: { childId?: string; limit?: string; offset?: string } }>(
    "/api/entries",
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
      const where = req.query.childId
        ? eq(entries.childId, req.query.childId)
        : undefined;

      const rows = await db.query.entries.findMany({
        where,
        orderBy: [desc(entries.date), desc(entries.createdAt)],
        limit,
        offset,
        with: {
          child: true,
          items: { orderBy: (i, { asc }) => [asc(i.position)] },
          attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
        },
      });

      return {
        entries: rows.map((e) => ({
          ...e,
          attachments: e.attachments.map((a) => ({
            id: a.id,
            url: `/api/attachments/${a.id}`,
            thumbUrl: `/api/attachments/${a.id}?size=thumb`,
          })),
        })),
        nextOffset: rows.length === limit ? offset + limit : null,
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/entries/:id",
    async (req, reply) => {
      const entry = await serializeEntry(req.params.id);
      if (!entry) return reply.code(404).send({ error: "entrée introuvable" });
      return entry;
    },
  );

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
    const { id } = req.params;
    const body = req.body ?? {};

    const current = await db
      .select()
      .from(entries)
      .where(eq(entries.id, id))
      .limit(1);
    if (!current.length)
      return reply.code(404).send({ error: "entrée introuvable" });

    const patch: Partial<typeof entries.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.mood !== undefined) patch.mood = body.mood;
    if (body.title !== undefined) patch.title = body.title;
    if (body.story !== undefined) patch.story = body.story;
    if (body.highlight !== undefined) patch.highlight = body.highlight;
    if (body.transcription !== undefined)
      patch.transcription = body.transcription;
    if (body.source && (SOURCES as readonly string[]).includes(body.source))
      patch.source = body.source as (typeof SOURCES)[number];
    if (body.date) patch.date = body.date;
    if (body.publish) {
      patch.status = "published";
      patch.publishedAt = new Date();
      patch.failureReason = null;
    }

    await db.transaction(async (tx) => {
      if (body.items) {
        const rows = body.items
          .filter((it) => (ITEM_TYPES as readonly string[]).includes(it.type))
          .map((it, i) => ({
            entryId: id,
            type: it.type as ItemType,
            data: it.data as EntryItemData,
            position: it.position ?? i,
          }));
        await tx.delete(entryItems).where(eq(entryItems.entryId, id));
        if (rows.length) await tx.insert(entryItems).values(rows);
      }
      await tx.update(entries).set(patch).where(eq(entries.id, id));
    });

    return serializeEntry(id);
  });

  app.delete<{ Params: { id: string } }>(
    "/api/entries/:id",
    async (req, reply) => {
      await db.delete(entries).where(eq(entries.id, req.params.id));
      return reply.code(204).send();
    },
  );
}
