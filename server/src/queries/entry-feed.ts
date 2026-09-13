import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
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
      /** L'ancre de la page suivante, ou null quand le carnet est au bout. */
      nextCursor: string | null;
    };

export type TimelineMonths =
  | { kind: "denied" }
  | { kind: "months"; months: { month: string; count: number }[] };

/**
 * Ce que l'utilisateur a le droit de LIRE dans le fil : le journal publié
 * partout, plus les brouillons des enfants qu'il co-gère. Le prédicat est ici,
 * en un seul endroit, parce que deux lectures s'en servent — la page de fil et
 * l'index des mois — et qu'une visibilité qui diverge entre les deux ferait
 * annoncer un mois de douze journées pour n'en montrer que trois.
 */
function visibleTo(scope: { childIds: string[]; draftableChildIds: string[] }) {
  return and(
    inArray(entries.childId, scope.childIds),
    or(
      eq(entries.status, "published"),
      scope.draftableChildIds.length
        ? inArray(entries.childId, scope.draftableChildIds)
        : undefined,
    ),
  );
}

/** Le périmètre visible, ou la raison de n'en avoir aucun. */
async function readingScope(userId: string, childId?: string) {
  const mems = await db
    .select({ childId: memberships.childId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return timelineScope(mems, childId);
}

/**
 * Page de timeline : les journées visibles par l'utilisateur, les plus récentes
 * d'abord. Un lecteur ne voit que le journal publié ; contributeur et admin
 * voient aussi les brouillons des enfants qu'ils co-gèrent.
 *
 * DEUX BORDS, ET AUCUN DÉCALAGE :
 *
 * · `from` — la date à partir de laquelle on regarde (« emmène-moi en mars ») ;
 * · `cursor` — l'identifiant de la dernière journée déjà rendue : la suite
 *   reprend STRICTEMENT après elle.
 *
 * La comparaison de curseur est faite PAR POSTGRES, sur le triplet de tri
 * `(date, created_at, id)` relu depuis la table : l'ancre ne traverse le réseau
 * que sous forme d'identifiant, donc aucun horodatage n'est sérialisé, et aucun
 * fuseau ne peut décaler une page d'une heure. Si l'ancre a disparu entre deux
 * pages (journée supprimée), la sous-requête ne rend rien : plutôt que de
 * tronquer le carnet en silence, on repart du haut de la fenêtre — le front
 * dédoublonne par id et s'arrête quand une page n'apporte plus rien.
 */
export async function listTimeline(params: {
  userId: string;
  childId?: string;
  limit: number;
  cursor?: string | null;
  from?: string | null;
}): Promise<TimelinePage> {
  const scope = await readingScope(params.userId, params.childId);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty")
    return { kind: "page", entries: [], nextCursor: null };

  const anchor = params.cursor
    ? (
        await db
          .select({ id: entries.id })
          .from(entries)
          .where(eq(entries.id, params.cursor))
          .limit(1)
      )[0]?.id
    : undefined;

  const rows = await db.query.entries.findMany({
    where: and(
      visibleTo(scope),
      params.from ? lte(entries.date, params.from) : undefined,
      anchor
        ? sql`(${entries.date}, ${entries.createdAt}, ${entries.id}) < (
              SELECT ancre.date, ancre.created_at, ancre.id
              FROM ${entries} AS ancre
              WHERE ancre.id = ${anchor}
            )`
        : undefined,
    ),
    // `id` ferme le tri : deux journées créées dans la même milliseconde
    // doivent s'ordonner de façon stable, sinon le curseur peut en sauter une.
    orderBy: [desc(entries.date), desc(entries.createdAt), desc(entries.id)],
    limit: params.limit,
    with: {
      child: true,
      items: { orderBy: (i, { asc }) => [asc(i.position)] },
      attachments: { orderBy: (a, { asc }) => [asc(a.position)] },
    },
  });

  return {
    kind: "page",
    entries: rows,
    // Une page pleine PEUT avoir une suite ; une page incomplète est la fin.
    nextCursor: rows.length === params.limit ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}

/**
 * L'INDEX DES MOIS — de quoi sauter dans le carnet sans le dérouler.
 *
 * Sans lui, atteindre la rentrée de l'an dernier se paie en pages : une douzaine
 * d'appuis sur « voir les journées précédentes » et cent cinquante écrans de
 * pouce. Le compte par mois tient en une agrégation, et il est calculé sur la
 * MÊME visibilité que le fil.
 */
export async function listTimelineMonths(params: {
  userId: string;
  childId?: string;
}): Promise<TimelineMonths> {
  const scope = await readingScope(params.userId, params.childId);
  if (scope.kind === "denied") return { kind: "denied" };
  if (scope.kind === "empty") return { kind: "months", months: [] };

  const month = sql<string>`to_char(${entries.date}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, count: sql<number>`count(*)::int` })
    .from(entries)
    .where(visibleTo(scope))
    .groupBy(month)
    .orderBy(sql`1 desc`);

  return { kind: "months", months: rows };
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
