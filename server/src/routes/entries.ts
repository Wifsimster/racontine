import type { FastifyInstance } from "fastify";
import { and, eq, ne, desc, asc, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  entries,
  entryItems,
  attachments,
  children,
  memberships,
  subscriptions,
  type EntryItemData,
  type Uncertainty,
} from "../db/schema.js";
import { requireUser } from "../plugins/auth.js";
import {
  accessibleChildIds,
  childRole,
  entryChildId,
  hasChildRole,
  roleAtLeast,
} from "../access.js";
import {
  ingestCarnetImages,
  DATE_RE,
  SOURCES,
  ITEM_TYPES,
  type ItemType,
} from "../ingest.js";
import { notifyEntryPublished } from "../notifications.js";
import { recordCorrection } from "../corrections.js";

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
        err instanceof Error && /file too large|request.*too large/i.test(err.message);
      return reply.code(tooLarge ? 413 : 400).send({
        error: tooLarge
          ? "Photo trop volumineuse (max 20 Mo par page)."
          : "Image indécodable (format non supporté ou fichier corrompu).",
      });
    }

    // Le formulaire multipart reste tolérant : une date/source mal formée est
    // ignorée (défaut appliqué), comme historiquement. La validation stricte du
    // service (400 explicite) est réservée aux appels programmatiques (MCP).
    const result = await ingestCarnetImages({
      userId: req.user!.id,
      images,
      childId,
      date: date && DATE_RE.test(date) ? date : undefined,
      source:
        source && (SOURCES as readonly string[]).includes(source)
          ? source
          : undefined,
    });

    if (!result.ok)
      return reply
        .code(result.httpCode)
        .send({ error: result.error, ...(result.id ? { id: result.id } : {}) });

    return reply.code(202).send({ id: result.id, status: result.status });
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

  /**
   * Journées sœurs d'un même envoi de photos couvrant plusieurs jours
   * (voir `batchId` en base). Alimente le stepper de relecture séquentielle
   * du front : un résumé léger par journée (pas les pièces jointes ni le
   * récit complet), triées chronologiquement.
   */
  app.get<{ Params: { batchId: string } }>(
    "/api/entries/batch/:batchId",
    async (req, reply) => {
      const rows = await db.query.entries.findMany({
        where: eq(entries.batchId, req.params.batchId),
        orderBy: [asc(entries.date)],
      });
      if (!rows.length)
        return reply.code(404).send({ error: "lot introuvable" });

      // Toutes les journées d'un lot partagent le même enfant (par construction
      // à l'ingestion) : un seul contrôle d'accès suffit.
      const role = await childRole(req.user!.id, rows[0].childId);
      if (!role) return reply.code(404).send({ error: "lot introuvable" });
      const visible =
        role === "reader" ? rows.filter((e) => e.status === "published") : rows;

      return {
        entries: visible.map((e) => ({
          id: e.id,
          date: e.date,
          status: e.status,
          title: e.title,
        })),
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

  /**
   * Valide une incertitude signalée à la relecture : la valeur choisie (une
   * des suggestions du VLM, l'original conservé tel quel, ou une saisie
   * libre) remplace le mot dans tous les champs de la valorisation où il
   * apparaît, et alimente le glossaire de l'enfant (voir corrections.ts) pour
   * améliorer la reconnaissance de l'écriture aux prochaines lectures.
   */
  app.patch<{
    Params: { id: string; index: string };
    Body: { value?: string };
  }>("/api/entries/:id/uncertainties/:index", async (req, reply) => {
    const { id } = req.params;
    const index = Number(req.params.index);
    const value = req.body?.value?.trim();
    if (!value) return reply.code(400).send({ error: "value requis" });
    if (!Number.isInteger(index) || index < 0)
      return reply.code(400).send({ error: "index invalide" });

    const current = await db
      .select()
      .from(entries)
      .where(eq(entries.id, id))
      .limit(1);
    if (!current.length)
      return reply.code(404).send({ error: "entrée introuvable" });
    const row = current[0];

    if (!(await hasChildRole(req.user!.id, row.childId, "contributor")))
      return reply.code(404).send({ error: "entrée introuvable" });

    const uncertainties = (row.uncertainties ?? []) as Uncertainty[];
    const item = uncertainties[index];
    if (!item)
      return reply.code(404).send({ error: "incertitude introuvable" });
    if (item.resolved)
      return reply.code(409).send({ error: "incertitude déjà validée" });

    const nextUncertainties = uncertainties.map((u, i) =>
      i === index ? { ...u, resolved: value } : u,
    );

    // Le champ signalé par le VLM peut être imprécis : on remplace le mot
    // partout où il apparaît réellement dans la valorisation.
    const patch: Partial<typeof entries.$inferInsert> = {
      uncertainties: nextUncertainties,
      updatedAt: new Date(),
    };
    if (row.title?.includes(item.original))
      patch.title = row.title.split(item.original).join(value);
    if (row.story?.includes(item.original))
      patch.story = row.story.split(item.original).join(value);
    if (row.highlight?.includes(item.original))
      patch.highlight = row.highlight.split(item.original).join(value);
    if (row.transcription?.includes(item.original))
      patch.transcription = row.transcription.split(item.original).join(value);

    await db.transaction(async (tx) => {
      await tx.update(entries).set(patch).where(eq(entries.id, id));
      await recordCorrection({
        childId: row.childId,
        original: item.original,
        corrected: value,
        field: item.champ,
        entryId: id,
        createdBy: req.user!.id,
      });
    });

    return serializeEntry(id);
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
