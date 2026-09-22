import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  attachments,
  children,
  entries,
  entryItems,
  instanceSubscription,
  mcpTokens,
  mcpUploads,
  memberships,
  notifications,
  pushSubscriptions,
  subscriptions,
  user,
  userLlmSettings,
  wordCorrections,
} from "../db/schema.js";
import { ownerUserId, roleAtLeast } from "../access.js";
import { lockCircle } from "./drizzle-sharing.js";
import type { CarnetStanding, ErasureSnapshot } from "../domain/erasure.js";
import { attachmentUrls } from "../routes/attachment-urls.js";
import type {
  ExportArchive,
  ExportedCarnet,
  ExportedEntry,
  PrivacyRepository,
  StoredFile,
} from "../ports.js";

/* ===========================================================================
   EMPORTER ET EFFACER, EN POSTGRES.

   Deux choses à ne pas perdre de vue en lisant ce fichier :

   1. L'EFFACEMENT S'APPUIE SUR LES CASCADES, et c'est délibéré. Le schéma
      déclare déjà `on delete cascade` de `user` vers sessions, comptes,
      adhésions, abonnements, notifications, appareils push, jetons MCP,
      fichiers en attente et réglages LLM ; et de `children` vers journées,
      moments, pages, cercle, invitations et glossaire. Réécrire ici la liste
      des tables, ce serait en tenir une DEUXIÈME — celle qui, le jour où l'on
      ajoutera une table, oubliera de la nettoyer sans que rien ne le signale.
      La règle du dépôt est donc : une seule ligne effacée, la base fait le
      reste. Ce qui nécessite un geste explicite, ce sont les FICHIERS — eux
      n'ont pas de clé étrangère — et c'est le service qui s'en charge, dans
      l'ordre qu'il explique.

   2. L'EXPORT NE VOIT PAS PLUS QUE L'ÉCRAN. La portée se décide une fois, à
      partir des adhésions : un lecteur n'emporte que le journal publié, comme
      il ne voit que lui dans l'application. Le droit d'accès porte sur SES
      données — pas sur les brouillons du foyer qui l'a invité.
   =========================================================================== */

/**
 * Statuts Stripe qui prélèveront ENCORE quelque chose. `canceled`, `incomplete_expired`
 * et une résiliation déjà programmée n'en font pas partie : il n'y a plus rien à
 * arrêter, et bloquer là-dessus retiendrait quelqu'un qui a déjà fait le geste.
 */
const BILLING_ALIVE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

/** ISO ou null — le JSON ne connaît pas `Date`, et un export se relit ailleurs. */
const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

export class DrizzlePrivacyRepository implements PrivacyRepository {
  /* ----------------------------- Emporter ------------------------------- */

  async exportFor(userId: string): Promise<ExportArchive | null> {
    const [account] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!account) return null;

    const circles = await db
      .select({
        childId: memberships.childId,
        role: memberships.role,
        since: memberships.createdAt,
        name: children.name,
        birthdate: children.birthdate,
      })
      .from(memberships)
      .innerJoin(children, eq(children.id, memberships.childId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(children.name));

    const childIds = circles.map((c) => c.childId);
    /* La même règle que la timeline et que l'outil MCP : contributeur et admin
       voient les brouillons, le lecteur non. Elle est ici appliquée au SQL,
       pas après coup — un filtre en mémoire sur des lignes déjà chargées aurait
       déjà fait sortir de la base ce qu'il prétend cacher. */
    const draftable = circles
      .filter((c) => roleAtLeast(c.role, "contributor"))
      .map((c) => c.childId);
    const readOnly = childIds.filter((id) => !draftable.includes(id));

    const [rows, corrections, subs, notifs, tokens, llm, devices, owner] =
      await Promise.all([
        childIds.length
          ? db
              .select()
              .from(entries)
              .where(
                or(
                  draftable.length
                    ? inArray(entries.childId, draftable)
                    : sql`false`,
                  readOnly.length
                    ? and(
                        inArray(entries.childId, readOnly),
                        eq(entries.status, "published"),
                      )
                    : sql`false`,
                ),
              )
              .orderBy(asc(entries.childId), asc(entries.date))
          : [],
        db
          .select({
            childId: wordCorrections.childId,
            original: wordCorrections.original,
            corrected: wordCorrections.corrected,
            field: wordCorrections.field,
            createdAt: wordCorrections.createdAt,
          })
          .from(wordCorrections)
          .where(eq(wordCorrections.createdBy, userId))
          .orderBy(asc(wordCorrections.createdAt)),
        db
          .select({
            childId: subscriptions.childId,
            emailEnabled: subscriptions.emailEnabled,
          })
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId)),
        db
          .select({
            type: notifications.type,
            title: notifications.title,
            body: notifications.body,
            createdAt: notifications.createdAt,
            readAt: notifications.readAt,
          })
          .from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt)),
        db
          .select({
            name: mcpTokens.name,
            prefix: mcpTokens.tokenPrefix,
            lastUsedAt: mcpTokens.lastUsedAt,
            createdAt: mcpTokens.createdAt,
          })
          .from(mcpTokens)
          .where(eq(mcpTokens.userId, userId))
          .orderBy(asc(mcpTokens.createdAt)),
        db
          .select({
            enc: userLlmSettings.anthropicKeyEnc,
            hint: userLlmSettings.anthropicKeyHint,
          })
          .from(userLlmSettings)
          .where(eq(userLlmSettings.userId, userId))
          .limit(1),
        db
          .select({ n: count() })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId)),
        ownerUserId(),
      ]);

    const entryIds = rows.map((e) => e.id);
    const [items, pages] = await Promise.all([
      entryIds.length
        ? db
            .select()
            .from(entryItems)
            .where(inArray(entryItems.entryId, entryIds))
            .orderBy(asc(entryItems.position))
        : [],
      entryIds.length
        ? db
            .select()
            .from(attachments)
            .where(inArray(attachments.entryId, entryIds))
            .orderBy(asc(attachments.position))
        : [],
    ]);

    const itemsOf = groupBy(items, (i) => i.entryId);
    const pagesOf = groupBy(pages, (p) => p.entryId);
    const entriesOf = groupBy(rows, (e) => e.childId);
    const correctionsOf = groupBy(corrections, (c) => c.childId);
    const subOf = new Map(subs.map((s) => [s.childId, s]));

    const carnets: ExportedCarnet[] = circles.map((circle) => ({
      id: circle.childId,
      name: circle.name,
      birthdate: circle.birthdate,
      role: circle.role,
      since: circle.since.toISOString(),
      subscription: subOf.has(circle.childId)
        ? { emailEnabled: subOf.get(circle.childId)!.emailEnabled }
        : null,
      entries: (entriesOf.get(circle.childId) ?? []).map(
        (e): ExportedEntry => ({
          id: e.id,
          date: e.date,
          source: e.source,
          status: e.status,
          mood: e.mood,
          title: e.title,
          story: e.story,
          highlight: e.highlight,
          transcription: e.transcription,
          uncertainties: e.uncertainties ?? [],
          createdAt: e.createdAt.toISOString(),
          publishedAt: iso(e.publishedAt),
          items: (itemsOf.get(e.id) ?? []).map((i) => ({
            type: i.type,
            data: i.data,
            position: i.position,
          })),
          pages: (pagesOf.get(e.id) ?? []).map((p) => ({
            id: p.id,
            mime: p.mime,
            width: p.width,
            height: p.height,
            url: attachmentUrls({ id: p.id, rotation: p.rotation }).url,
          })),
        }),
      ),
      corrections: (correctionsOf.get(circle.childId) ?? []).map((c) => ({
        original: c.original,
        corrected: c.corrected,
        field: c.field,
        at: c.createdAt.toISOString(),
      })),
    }));

    return {
      format: "racontine.export.v1",
      exportedAt: new Date().toISOString(),
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        createdAt: account.createdAt.toISOString(),
        isOwner: owner != null && owner === userId,
      },
      carnets,
      notifications: notifs.map((n) => ({
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        readAt: iso(n.readAt),
      })),
      mcpTokens: tokens.map((t) => ({
        name: t.name,
        prefix: t.prefix,
        lastUsedAt: iso(t.lastUsedAt),
        createdAt: t.createdAt.toISOString(),
      })),
      // La clé elle-même reste chiffrée en base et n'en sort pas : on ne rend
      // que son existence et son indice d'affichage.
      llmKey: {
        configured: Boolean(llm[0]?.enc),
        hint: llm[0]?.hint ?? null,
      },
      pushDevices: devices[0]?.n ?? 0,
    };
  }

  /* ------------------------------ Partir -------------------------------- */

  async erasureSnapshot(userId: string): Promise<ErasureSnapshot | null> {
    const [me] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!me) return null;

    const [mine, owner, accounts, billing] = await Promise.all([
      db
        .select({
          childId: memberships.childId,
          role: memberships.role,
          childName: children.name,
        })
        .from(memberships)
        .innerJoin(children, eq(children.id, memberships.childId))
        .where(eq(memberships.userId, userId))
        .orderBy(asc(children.name)),
      ownerUserId(),
      db.select({ n: count() }).from(user),
      db
        .select({
          subscriptionId: instanceSubscription.stripeSubscriptionId,
          status: instanceSubscription.status,
          cancelAtPeriodEnd: instanceSubscription.cancelAtPeriodEnd,
        })
        .from(instanceSubscription)
        .limit(1),
    ]);

    const carnets = mine.length
      ? await this.standings(
          mine.map((m) => m.childId),
          new Map(mine.map((m) => [m.childId, m])),
        )
      : [];

    const sub = billing[0];
    return {
      isOwner: owner != null && owner === userId,
      otherAccounts: Math.max((accounts[0]?.n ?? 1) - 1, 0),
      carnets,
      activeSubscription: Boolean(
        sub?.subscriptionId &&
          sub.status &&
          BILLING_ALIVE.includes(sub.status) &&
          !sub.cancelAtPeriodEnd,
      ),
    };
  }

  async standingOn(
    userId: string,
    childId: string,
  ): Promise<CarnetStanding | null> {
    const [mine] = await db
      .select({
        childId: memberships.childId,
        role: memberships.role,
        childName: children.name,
      })
      .from(memberships)
      .innerJoin(children, eq(children.id, memberships.childId))
      .where(
        and(eq(memberships.userId, userId), eq(memberships.childId, childId)),
      )
      .limit(1);
    if (!mine) return null;
    const [standing] = await this.standings(
      [childId],
      new Map([[childId, mine]]),
    );
    return standing ?? null;
  }

  /**
   * Le poids du compte dans chaque cercle : combien de membres, combien
   * d'administrateurs. Un seul passage pour tous les carnets — la règle du
   * dernier administrateur se décide sur des NOMBRES, et les compter un par un
   * ferait autant d'allers-retours que de carnets suivis.
   */
  private async standings(
    childIds: string[],
    mine: Map<string, { role: CarnetStanding["role"]; childName: string }>,
  ): Promise<CarnetStanding[]> {
    const counts = await db
      .select({
        childId: memberships.childId,
        members: count(),
        admins: sql<number>`count(*) filter (where ${memberships.role} = 'admin')::int`,
      })
      .from(memberships)
      .where(inArray(memberships.childId, childIds))
      .groupBy(memberships.childId);

    const byChild = new Map(counts.map((c) => [c.childId, c]));
    return childIds.map((childId) => {
      const row = byChild.get(childId);
      const own = mine.get(childId)!;
      return {
        childId,
        childName: own.childName,
        role: own.role,
        // L'adhésion de l'appelant existe forcément : au pire, elle est seule.
        members: row?.members ?? 1,
        admins: row?.admins ?? (own.role === "admin" ? 1 : 0),
      };
    });
  }

  async filesOfChildren(childIds: string[]): Promise<StoredFile[]> {
    if (childIds.length === 0) return [];
    return db
      .select({
        originalPath: attachments.originalPath,
        thumbPath: attachments.thumbPath,
      })
      .from(attachments)
      .innerJoin(entries, eq(entries.id, attachments.entryId))
      .where(inArray(entries.childId, childIds));
  }

  async stagedFilesOf(userId: string): Promise<StoredFile[]> {
    const rows = await db
      .select({ path: mcpUploads.path })
      .from(mcpUploads)
      .where(eq(mcpUploads.userId, userId));
    return rows.map((r) => ({ originalPath: r.path, thumbPath: null }));
  }

  async deleteChildren(childIds: string[]): Promise<void> {
    if (childIds.length === 0) return;
    await db.delete(children).where(inArray(children.id, childIds));
  }

  async deleteAccount(userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const administered = await tx
        .select({ childId: memberships.childId })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), eq(memberships.role, "admin")),
        )
        // Toujours dans le même ordre : deux effacements simultanés ne
        // s'attendent pas l'un l'autre en croix (interblocage).
        .orderBy(asc(memberships.childId));
      for (const { childId } of administered) {
        await lockCircle(tx, childId);
        const [others] = await tx
          .select({ n: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.childId, childId),
              eq(memberships.role, "admin"),
              ne(memberships.userId, userId),
            ),
          );
        if ((others?.n ?? 0) === 0) return false;
      }
      await tx.delete(user).where(eq(user.id, userId));
      return true;
    });
  }
}

/** Regroupe des lignes par clé, en gardant l'ordre du SQL. */
function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
