import type { EntryStatus, MemberRole } from "../db/schema.js";

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
  administeredChildren(userId: string): Promise<AdminChild[]>;
  members(childIds: string[]): Promise<AdminMembership[]>;
  entryCounts(childIds: string[]): Promise<AdminEntryCount[]>;
  lastPublished(childIds: string[]): Promise<{ childId: string; at: Date }[]>;
  pendingInvitations(childIds: string[]): Promise<AdminInvitation[]>;
  ownerId(): Promise<string | null>;
}

export type ConsoleChild = {
  id: string;
  name: string;
  birthdate: string | null;
  members: number;
  entries: Record<EntryStatus, number> & { total: number };
  lastPublishedAt: Date | null;
};

export type ConsolePerson = {
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  isSelf: boolean;
  since: Date;
  roles: { childId: string; childName: string; role: MemberRole }[];
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

    people.sort((a, b) => {
      const rank = (p: ConsolePerson) =>
        Math.min(...p.roles.map((r) => ROLE_RANK[r.role]));
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "fr");
    });

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
