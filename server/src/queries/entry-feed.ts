import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, entries, memberships } from "../db/schema.js";
import { childRole } from "../access.js";
import { timelineScope } from "../domain/visibility.js";

/* ===========================================================================
   LES LECTURES DU JOURNAL — le côté « consulter », séparé du côté « écrire ».

   Une lecture de timeline ne crée rien, ne notifie personne et n'a aucune règle
   à faire respecter au-delà de la visibilité. La mêler aux écritures dans un
   même fichier de routes obligeait chaque gestionnaire HTTP à porter son SQL,
   ses jointures et sa règle d'accès. Ici, les routes demandent ce qu'elles
   affichent ; la règle de visibilité, elle, est celle du domaine
   (`timelineScope`) — la même que pour les outils MCP.
   =========================================================================== */

/** Une journée avec tout ce qu'il faut pour l'afficher. */
export type FeedEntry = Awaited<ReturnType<typeof findEntryWithRelations>>;

async function findEntryWithRelations(entryId: string) {
  return db.query.entries.findFirst({
    where: eq(entries.id, entryId),
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });
}

/** Enfants suivis par l'utilisateur, avec son rôle sur chacun. */
export async function listAccessibleChildren(userId: string) {
  return db
    .select({
      id: children.id,
      name: children.name,
      birthdate: children.birthdate,
      createdAt: children.createdAt,
      role: memberships.role,
    })
    .from(children)
    .innerJoin(memberships, eq(memberships.childId, children.id))
    .where(eq(memberships.userId, userId))
    .orderBy(children.createdAt);
}

export type TimelinePage =
  | { kind: "denied" }
  | {
      kind: "page";
      entries: NonNullable<FeedEntry>[];
      nextOffset: number | null;
    };

/**
 * Page de timeline : les journées visibles par l'utilisateur, les plus récentes
 * d'abord. Un lecteur ne voit que le journal publié ; contributeur et admin
 * voient aussi les brouillons des enfants qu'ils co-gèrent.
 */
export async function listTimeline(params: {
  userId: string;
  childId?: string;
  limit: number;
  offset: number;
}): Promise<TimelinePage> {
  const mems = await db
    .select({ childId: memberships.childId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, params.userId));

  const scope = timelineScope(mems, params.childId);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty")
    return { kind: "page", entries: [], nextOffset: null };

  const rows = await db.query.entries.findMany({
    where: and(
      inArray(entries.childId, scope.childIds),
      or(
        eq(entries.status, "published"),
        scope.draftableChildIds.length
          ? inArray(entries.childId, scope.draftableChildIds)
          : undefined,
      ),
    ),
    orderBy: [desc(entries.date), desc(entries.createdAt)],
    limit: params.limit,
    offset: params.offset,
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });

  return {
    kind: "page",
    entries: rows,
    nextOffset: rows.length === params.limit ? params.offset + params.limit : null,
  };
}

/**
 * Une journée, si l'utilisateur a le droit de la voir. `null` couvre aussi bien
 * l'absence que le refus : on ne révèle pas l'existence d'une journée non
 * partagée.
 */
export async function findVisibleEntry(userId: string, entryId: string) {
  const entry = await findEntryWithRelations(entryId);
  if (!entry) return null;
  const role = await childRole(userId, entry.childId);
  if (!role) return null;
  if (role === "reader" && entry.status !== "published") return null;
  return entry;
}

/** Résumé d'une journée sœur, pour le stepper de relecture séquentielle. */
export type BatchSummary = {
  id: string;
  date: string;
  status: string;
  title: string | null;
};

/**
 * Journées sœurs d'un même envoi de photos couvrant plusieurs jours. `null` si
 * le lot n'existe pas ou n'est pas visible.
 */
export async function listBatch(
  userId: string,
  batchId: string,
): Promise<BatchSummary[] | null> {
  const rows = await db.query.entries.findMany({
    where: eq(entries.batchId, batchId),
    orderBy: [asc(entries.date)],
  });
  if (!rows.length) return null;

  // Toutes les journées d'un lot partagent le même enfant (par construction à
  // l'ingestion) : un seul contrôle d'accès suffit.
  const role = await childRole(userId, rows[0].childId);
  if (!role) return null;
  const visible =
    role === "reader" ? rows.filter((e) => e.status === "published") : rows;

  return visible.map((e) => ({
    id: e.id,
    date: e.date,
    status: e.status,
    title: e.title,
  }));
}
