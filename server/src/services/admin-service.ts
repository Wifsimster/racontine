import type { EntryStatus, MemberRole } from "../db/schema.js";

/* ===========================================================================
   LA CONSOLE D'ADMINISTRATION — ce qu'un administrateur voit d'un seul coup.

   L'écran « Partager » regarde UN enfant à la fois : pour savoir si Mamie est
   lectrice sur Lou et contributrice sur Anouk, il fallait changer d'enfant et
   recompter de tête. Un administrateur a besoin de la vue inverse : les gens
   d'abord, leurs rôles ensuite, et l'état des carnets qu'il administre.

   Rien n'est instance-wide ici, et c'est délibéré : la console ne montre QUE
   les enfants dont l'appelant est administrateur. Sur une instance qui abrite
   deux foyers, l'un n'apprend pas l'adresse e-mail de l'autre en ouvrant un
   écran d'administration.

   Les règles de MUTATION (changer un rôle, retirer un proche, révoquer une
   invitation) restent celles du partage — `sharing-service.ts`, une seule
   implémentation, gardée par enfant. Ce service ne fait que LIRE et agréger.
   =========================================================================== */

/** Hiérarchie des rôles, pour trier les gens par droits décroissants. */
const ROLE_RANK: Record<MemberRole, number> = {
  admin: 0,
  contributor: 1,
  reader: 2,
};

export type AdminChild = {
  id: string;
  name: string;
  birthdate: string | null;
};

export type AdminMembership = {
  childId: string;
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
  /** Depuis quand cette personne fait partie du cercle de cet enfant. */
  since: Date;
};

export type AdminEntryCount = {
  childId: string;
  status: EntryStatus;
  count: number;
};

export type AdminInvitation = {
  id: string;
  childId: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
};

export interface AdminRepository {
  /** Les enfants dont cet utilisateur est administrateur (rôle `admin`). */
  administeredChildren(userId: string): Promise<AdminChild[]>;
  members(childIds: string[]): Promise<AdminMembership[]>;
  /** Journées par enfant et par statut — une ligne par couple non vide. */
  entryCounts(childIds: string[]): Promise<AdminEntryCount[]>;
  lastPublished(childIds: string[]): Promise<{ childId: string; at: Date }[]>;
  pendingInvitations(childIds: string[]): Promise<AdminInvitation[]>;
  /** Propriétaire de l'instance (premier compte créé), pour le signaler. */
  ownerId(): Promise<string | null>;
}

/** Le carnet d'un enfant, vu de l'administration. */
export type ConsoleChild = {
  id: string;
  name: string;
  birthdate: string | null;
  members: number;
  entries: Record<EntryStatus, number> & { total: number };
  lastPublishedAt: Date | null;
};

/** Une personne, tous ses rôles rassemblés. */
export type ConsolePerson = {
  userId: string;
  name: string;
  email: string;
  /** Le propriétaire de l'instance — celui qui tient les réglages. */
  isOwner: boolean;
  /** L'appelant lui-même : un écran ne doit pas l'inviter à se retirer. */
  isSelf: boolean;
  /** Date d'entrée dans le premier des cercles administrés. */
  since: Date;
  roles: { childId: string; childName: string; role: MemberRole }[];
  /**
   * Les enfants dont cette personne est le SEUL administrateur. Le serveur
   * refuse déjà de retirer le dernier administrateur (`sharing-service.ts`) ;
   * le dire ici évite à l'écran de proposer un geste qui sera refusé.
   */
  soleAdminOf: string[];
};

export type ConsoleInvitation = {
  id: string;
  childId: string;
  childName: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
  expired: boolean;
};

export type AdminConsole = {
  children: ConsoleChild[];
  people: ConsolePerson[];
  invitations: ConsoleInvitation[];
  totals: {
    children: number;
    people: number;
    admins: number;
    entries: number;
    published: number;
    pendingInvitations: number;
  };
};

export type AdminRejection = { ok: false; httpCode: number; error: string };
export type AdminOk = { ok: true; console: AdminConsole };

const EMPTY_COUNTS = (): Record<EntryStatus, number> & { total: number } => ({
  processing: 0,
  draft: 0,
  published: 0,
  failed: 0,
  total: 0,
});

export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  /**
   * La console de l'appelant. 403 s'il n'administre aucun enfant : la porte se
   * ferme sur le RÔLE, pas sur l'existence de la page — un contributeur qui
   * tape l'adresse à la main reçoit un refus, jamais la liste des autres.
   */
  async console(userId: string): Promise<AdminOk | AdminRejection> {
    const children = await this.repo.administeredChildren(userId);
    if (children.length === 0)
      return {
        ok: false,
        httpCode: 403,
        error: "réservé aux administrateurs d'un enfant",
      };

    const childIds = children.map((c) => c.id);
    const [members, counts, published, invitations, owner] = await Promise.all([
      this.repo.members(childIds),
      this.repo.entryCounts(childIds),
      this.repo.lastPublished(childIds),
      this.repo.pendingInvitations(childIds),
      this.repo.ownerId(),
    ]);

    const nameOf = new Map(children.map((c) => [c.id, c.name]));
    const lastAt = new Map(published.map((p) => [p.childId, p.at]));

    /* ------------------------------ Les carnets ------------------------- */

    const perChild = new Map<string, Record<EntryStatus, number> & { total: number }>(
      childIds.map((id) => [id, EMPTY_COUNTS()]),
    );
    for (const row of counts) {
      const bucket = perChild.get(row.childId);
      if (!bucket) continue;
      bucket[row.status] += row.count;
      bucket.total += row.count;
    }

    const consoleChildren: ConsoleChild[] = children.map((c) => ({
      id: c.id,
      name: c.name,
      birthdate: c.birthdate,
      members: members.filter((m) => m.childId === c.id).length,
      entries: perChild.get(c.id) ?? EMPTY_COUNTS(),
      lastPublishedAt: lastAt.get(c.id) ?? null,
    }));

    /* ------------------------------- Les gens --------------------------- */

    // Un enfant dont un seul membre est admin : ce membre y est irremplaçable.
    const soleAdmins = new Map<string, string>();
    for (const id of childIds) {
      const admins = members.filter((m) => m.childId === id && m.role === "admin");
      if (admins.length === 1) soleAdmins.set(id, admins[0]!.userId);
    }

    const byUser = new Map<string, AdminMembership[]>();
    for (const m of members) {
      const list = byUser.get(m.userId);
      if (list) list.push(m);
      else byUser.set(m.userId, [m]);
    }

    const people: ConsolePerson[] = [...byUser.values()].map((rows) => {
      const first = rows[0]!;
      const roles = rows
        .map((r) => ({
          childId: r.childId,
          childName: nameOf.get(r.childId) ?? "",
          role: r.role,
        }))
        .sort((a, b) => a.childName.localeCompare(b.childName, "fr"));
      return {
        userId: first.userId,
        name: first.name,
        email: first.email,
        isOwner: owner != null && owner === first.userId,
        isSelf: first.userId === userId,
        since: rows.reduce(
          (min, r) => (r.since < min ? r.since : min),
          first.since,
        ),
        roles,
        soleAdminOf: [...soleAdmins.entries()]
          .filter(([, id]) => id === first.userId)
          .map(([childId]) => childId),
      };
    });

    // Les droits d'abord (le rôle le plus fort que la personne détient), puis
    // l'ordre alphabétique : un cercle se lit comme une liste de contacts.
    people.sort((a, b) => {
      const rank = (p: ConsolePerson) =>
        Math.min(...p.roles.map((r) => ROLE_RANK[r.role]));
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "fr");
    });

    /* --------------------------- Les invitations ------------------------ */

    const now = Date.now();
    const consoleInvitations: ConsoleInvitation[] = invitations
      .map((i) => ({
        id: i.id,
        childId: i.childId,
        childName: nameOf.get(i.childId) ?? "",
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        expired: i.expiresAt.getTime() < now,
      }))
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

    return {
      ok: true,
      console: {
        children: consoleChildren,
        people,
        invitations: consoleInvitations,
        totals: {
          children: consoleChildren.length,
          people: people.length,
          admins: people.filter((p) => p.roles.some((r) => r.role === "admin"))
            .length,
          entries: consoleChildren.reduce((n, c) => n + c.entries.total, 0),
          published: consoleChildren.reduce(
            (n, c) => n + c.entries.published,
            0,
          ),
          pendingInvitations: consoleInvitations.length,
        },
      },
    };
  }
}
