import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { and, eq, ne, desc, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  entries,
  entryItems,
  attachments,
  children,
  memberships,
  subscriptions,
  type EntryItemData,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import {
  accessibleChildIds,
  childRole,
  entryChildId,
  hasChildRole,
  roleAtLeast,
} from "../access.js";
import { storeCarnetImage, resolveUpload, deleteStored } from "../storage.js";
import { extractFromImages, VlmError, type Extraction } from "../vlm.js";
import { notifyEntryPublished } from "../notifications.js";

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
      // Compare-and-set : ne marquer « failed » que si l'entrée est toujours en
      // cours de traitement (un PATCH utilisateur a pu la relire/publier).
      await db
        .update(entries)
        .set({
          status: "failed",
          failureReason:
            "Photo illisible : aucun contenu de carnet exploitable détecté.",
          updatedAt: new Date(),
        })
        .where(
          and(eq(entries.id, entryId), eq(entries.status, "processing")),
        );
      return;
    }
    const items = extractionToItems(x);
    await db.transaction(async (tx) => {
      // On n'écrase le contenu que si l'entrée est encore en « processing » :
      // sinon une relecture humaine (PATCH) faite pendant l'extraction serait
      // silencieusement écrasée par la sortie VLM.
      const moved = await tx
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
        .where(
          and(eq(entries.id, entryId), eq(entries.status, "processing")),
        )
        .returning({ id: entries.id });
      if (!moved.length) return;
      await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
      if (items.length) {
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId })));
      }
    });
  } catch (err) {
    // Seuls les VlmError portent un message déjà sûr pour l'utilisateur ; toute
    // autre erreur (DB, lecture disque…) pourrait divulguer des détails internes,
    // on la remplace par un message générique et on journalise le brut.
    if (!(err instanceof VlmError))
      console.error(
        "processEntry — échec inattendu :",
        err instanceof Error ? err.message : err,
      );
    const failureReason =
      err instanceof VlmError
        ? err.message
        : "La lecture automatique du carnet a échoué. Réessayez plus tard.";
    // Le write d'échec ne doit jamais rejeter à son tour (l'appel est
    // fire-and-forget) : on l'isole dans son propre try/catch.
    try {
      await db
        .update(entries)
        .set({
          status: "failed",
          failureReason,
          updatedAt: new Date(),
        })
        .where(
          and(eq(entries.id, entryId), eq(entries.status, "processing")),
        );
    } catch (writeErr) {
      console.error(
        "Échec de l'enregistrement de l'état 'failed' :",
        writeErr instanceof Error ? writeErr.message : writeErr,
      );
    }
  }
}

export async function entriesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  /* --------------------------------- Enfants ---------------------------- */

  app.get("/api/children", async (req) => {
    const ids = await accessibleChildIds(req.user!.id);
    if (!ids.length) return [];
    const rows = await db
      .select({
        id: children.id,
        name: children.name,
        birthdate: children.birthdate,
        createdAt: children.createdAt,
        role: memberships.role,
      })
      .from(children)
      .innerJoin(memberships, eq(memberships.childId, children.id))
      .where(
        and(inArray(children.id, ids), eq(memberships.userId, req.user!.id)),
      )
      .orderBy(children.createdAt);
    return rows;
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
      // Le créateur devient admin de l'enfant et suit d'office sa timeline.
      const child = await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(children)
          .values({ name, birthdate: birthdate ?? null })
          .returning();
        await tx
          .insert(memberships)
          .values({ userId: req.user!.id, childId: c.id, role: "admin" });
        await tx
          .insert(subscriptions)
          .values({ userId: req.user!.id, childId: c.id })
          .onConflictDoNothing({
            target: [subscriptions.userId, subscriptions.childId],
          });
        return c;
      });
      return reply.code(201).send({ ...child, role: "admin" as const });
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

    // childId facultatif si l'utilisateur ne suit qu'un seul enfant.
    if (!childId) {
      const ids = await accessibleChildIds(req.user!.id);
      if (ids.length === 1) childId = ids[0];
      else
        return reply
          .code(400)
          .send({ error: "childId requis (plusieurs enfants)" });
    }

    // Contribuer exige le rôle contributor (ou admin) sur cet enfant. On ne
    // divulgue pas l'existence d'un enfant non partagé : 403 uniforme.
    if (!(await hasChildRole(req.user!.id, childId, "contributor")))
      return reply
        .code(403)
        .send({ error: "accès refusé à cet enfant" });

    // Find-or-create sûr face aux requêtes concurrentes : INSERT … ON CONFLICT
    // DO NOTHING, puis relecture si l'entrée existait déjà. Si une écriture DB
    // échoue, on supprime les fichiers déjà stockés pour ne pas laisser
    // d'orphelins non référencés sur le disque.
    // Une fois les pièces jointes enregistrées, les fichiers sont référencés en
    // base : on ne doit plus les supprimer en cas d'erreur (sinon lignes
    // orphelines pointant vers des fichiers absents).
    let attachmentsCommitted = false;
    try {
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
        // Ne pas écraser une journée déjà relue et publiée : les fichiers venant
        // d'être écrits ne seront rattachés à aucune entrée, on les supprime.
        if (existing.status === "published") {
          await Promise.all(stored.map((img) => deleteStored(img)));
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
      attachmentsCommitted = true;

      // Ré-extraction sur TOUTES les pages de l'entrée (existantes + nouvelles).
      const allAtts = await db
        .select({ path: attachments.originalPath })
        .from(attachments)
        .where(eq(attachments.entryId, entryId))
        .orderBy(attachments.position);

      // Extraction en arrière-plan : la requête répond tout de suite. Le .catch
      // final est un garde-fou : processEntry gère déjà ses erreurs, mais on ne
      // veut aucune promesse rejetée non gérée sur un appel fire-and-forget.
      void processEntry(
        entryId,
        allAtts.map((a) => a.path),
      ).catch((err) => {
        console.error(
          "processEntry a échoué de façon inattendue :",
          err instanceof Error ? err.message : err,
        );
      });

      return reply.code(202).send({ id: entryId, status: "processing" });
    } catch (err) {
      if (!attachmentsCommitted)
        await Promise.all(stored.map((img) => deleteStored(img)));
      throw err;
    }
  });

  /* --------------------------------- Timeline --------------------------- */

  app.get<{ Querystring: { childId?: string; limit?: string; offset?: string } }>(
    "/api/entries",
    async (req, reply) => {
      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

      // Portée : uniquement les enfants suivis par l'utilisateur. Un lecteur ne
      // voit que le journal publié ; contributeur/admin voient aussi les
      // brouillons (relecture).
      const rows0 = await db
        .select({ childId: memberships.childId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, req.user!.id));
      const roleByChild = new Map(rows0.map((r) => [r.childId, r.role]));
      const accessibleIds = [...roleByChild.keys()];
      const draftableIds = accessibleIds.filter((id) =>
        roleAtLeast(roleByChild.get(id)!, "contributor"),
      );

      if (!accessibleIds.length)
        return { entries: [], nextOffset: null };

      let scope = req.query.childId ? [req.query.childId] : accessibleIds;
      if (req.query.childId && !roleByChild.has(req.query.childId))
        return reply.code(403).send({ error: "accès refusé à cet enfant" });

      const draftableInScope = draftableIds.filter((id) => scope.includes(id));
      const where = and(
        inArray(entries.childId, scope),
        or(
          eq(entries.status, "published"),
          draftableInScope.length
            ? inArray(entries.childId, draftableInScope)
            : undefined,
        ),
      );

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
      const childId = await entryChildId(req.params.id);
      if (!childId)
        return reply.code(404).send({ error: "entrée introuvable" });
      const role = await childRole(req.user!.id, childId);
      if (!role) return reply.code(404).send({ error: "entrée introuvable" });

      const entry = await serializeEntry(req.params.id);
      if (!entry) return reply.code(404).send({ error: "entrée introuvable" });
      // Un lecteur ne voit que le journal publié.
      if (role === "reader" && entry.status !== "published")
        return reply.code(404).send({ error: "entrée introuvable" });
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

    // Relire / publier exige contributor+ sur l'enfant.
    if (!(await hasChildRole(req.user!.id, current[0].childId, "contributor")))
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
    // Valider le format de la date avant de l'appliquer (comme à l'ingestion),
    // pour renvoyer un 400 explicite plutôt qu'un 500 sur date invalide.
    if (body.date !== undefined) {
      if (!DATE_RE.test(body.date))
        return reply
          .code(400)
          .send({ error: "date invalide (attendu AAAA-MM-JJ)" });
      patch.date = body.date;
    }
    // NB : la publication est gérée séparément par un compare-and-set atomique
    // ci-dessous (et non via `patch`), pour ne notifier qu'à la vraie transition.

    // Ne notifier qu'à la PREMIÈRE publication. On détecte la transition de
    // façon atomique (UPDATE … WHERE status <> 'published' … RETURNING) : deux
    // requêtes de publication concurrentes ne peuvent pas toutes deux « gagner »,
    // ce qui évite les notifications/e-mails en double.
    let isFirstPublish = false;
    try {
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
        if (body.publish) {
          const flipped = await tx
            .update(entries)
            .set({
              status: "published",
              publishedAt: new Date(),
              failureReason: null,
            })
            .where(and(eq(entries.id, id), ne(entries.status, "published")))
            .returning({ id: entries.id });
          isFirstPublish = flipped.length > 0;
        }
      });
    } catch (err) {
      // Collision avec une autre journée (même enfant/date/source) → 409 ;
      // date syntaxiquement valide mais impossible (ex. 2026-13-40) → 400.
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "23505")
        return reply.code(409).send({
          error:
            "Une journée existe déjà pour cet enfant à cette date et cette source.",
        });
      if (code === "22007" || code === "22008")
        return reply.code(400).send({ error: "date invalide" });
      throw err;
    }

    const result = await serializeEntry(id);

    // Notification des abonnés en arrière-plan (n'impacte pas la réponse).
    if (isFirstPublish && result?.child) {
      void notifyEntryPublished({
        entryId: id,
        childId: result.child.id,
        childName: result.child.name,
        date: result.date,
        actorUserId: req.user?.id ?? null,
      });
    }

    return result;
  });

  app.delete<{ Params: { id: string } }>(
    "/api/entries/:id",
    async (req, reply) => {
      const childId = await entryChildId(req.params.id);
      if (!childId) return reply.code(204).send();
      // Supprimer une journée est réservé à l'admin de l'enfant.
      if (!(await hasChildRole(req.user!.id, childId, "admin")))
        return reply.code(403).send({ error: "accès refusé" });
      await db.delete(entries).where(eq(entries.id, req.params.id));
      return reply.code(204).send();
    },
  );
}
