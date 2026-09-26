import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemberRole } from "../db/schema.js";
import {
  SharingService,
  type CircleChange,
  type InvitationRow,
  type InvitationRepository,
  type LinkDelivery,
  type MemberRow,
  type MembershipRepository,
  type UserDirectory,
} from "./sharing-service.js";

/* Les règles qui décident QUI VOIT la journée d'un enfant — jusqu'ici
   inatteignables sans Postgres et une requête HTTP. */

const NOW = new Date("2026-02-01T12:00:00Z");

class FakeMemberships implements MembershipRepository {
  removed: [string, string][] = [];
  roles: [string, string, MemberRole][] = [];
  constructor(
    private admins: string[] = ["u-admin"],
    private members: string[] = ["u-admin"],
  ) {}
  async listMembers(): Promise<MemberRow[]> {
    return this.members.map((userId) => ({
      userId,
      role: this.admins.includes(userId) ? "admin" : "reader",
      name: userId,
      email: `${userId}@example.test`,
      createdAt: NOW,
    }));
  }
  private lastAdmin(userId: string) {
    return this.admins.includes(userId) && this.admins.length <= 1;
  }
  async setRole(
    childId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CircleChange> {
    if (!this.members.includes(userId)) return "missing";
    if (role !== "admin" && this.lastAdmin(userId)) return "last-admin";
    this.roles.push([childId, userId, role]);
    return "ok";
  }
  async remove(childId: string, userId: string): Promise<CircleChange> {
    if (!this.members.includes(userId)) return "missing";
    if (this.lastAdmin(userId)) return "last-admin";
    this.removed.push([childId, userId]);
    return "ok";
  }
  names = new Map<string, string>();
  async nameIfBlank(_childId: string, userId: string, name: string) {
    if (!this.members.includes(userId)) return "missing" as const;
    if (this.names.get(userId)) return "named" as const;
    this.names.set(userId, name);
    return "ok" as const;
  }
  async upsert() {}
  async isMember(_childId: string, userId: string) {
    return this.members.includes(userId);
  }
}

class FakeInvitations implements InvitationRepository {
  created: InvitationRow[] = [];
  accepted: string[] = [];
  pendingAccept = true;
  constructor(private row: InvitationRow | null = null) {}
  async listPending() {
    return this.row ? [this.row] : [];
  }
  async create(r: {
    childId: string;
    email: string;
    role: MemberRole;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }) {
    const row: InvitationRow = { id: "inv-1", status: "pending", ...r };
    this.created.push(row);
    return row;
  }
  async findById() {
    return this.row;
  }
  async findByToken() {
    return this.row ? { ...this.row, childName: "Lou" } : null;
  }
  revokedFor: [string, string][] = [];
  async revoke() {
    return this.row?.status === "pending";
  }
  async revokePendingFor(childId: string, email: string) {
    this.revokedFor.push([childId, email]);
  }
  async acceptIfPending(id: string) {
    if (!this.pendingAccept) return false;
    this.accepted.push(id);
    return true;
  }
}

class FakeUsers implements UserDirectory {
  constructor(private readonly id: string | null = null) {}
  async findIdByEmail() {
    return this.id;
  }
}

class FakeDelivery implements LinkDelivery {
  sent: { to: string; url: string }[] = [];
  async deliver(to: string, _subject: string, url: string) {
    this.sent.push({ to, url });
  }
}

function build(opts: {
  memberships?: FakeMemberships;
  invitations?: FakeInvitations;
  users?: FakeUsers;
} = {}) {
  const memberships = opts.memberships ?? new FakeMemberships();
  const invitations = opts.invitations ?? new FakeInvitations();
  const delivery = new FakeDelivery();
  const service = new SharingService({
    memberships,
    invitations,
    users: opts.users ?? new FakeUsers(null),
    delivery,
    invitationTtlDays: async () => 7,
    inviteUrl: (t) => `https://racontine.test/invite/${t}`,
    newToken: () => "jeton-fixe",
    now: () => NOW,
  });
  return { service, memberships, invitations, delivery };
}

function invitation(over: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: "inv-1",
    childId: "c1",
    email: "mamie@example.test",
    role: "reader",
    token: "jeton",
    status: "pending",
    expiresAt: new Date("2026-02-08T12:00:00Z"),
    ...over,
  };
}

test("inviter un proche crée le lien et le remet à son destinataire", async () => {
  const { service, invitations, delivery } = build();
  const result = await service.invite({
    childId: "c1",
    inviterId: "u-admin",
    email: "  Mamie@Example.test ",
    role: "contributor",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // L'adresse est normalisée avant d'être stockée ET avant l'envoi.
  assert.equal(invitations.created[0].email, "mamie@example.test");
  assert.equal(result.url, "https://racontine.test/invite/jeton-fixe");
  assert.deepEqual(delivery.sent, [
    { to: "mamie@example.test", url: result.url },
  ]);
  // Le lien expire au bout du délai réglé pour l'instance.
  assert.equal(
    invitations.created[0].expiresAt.toISOString(),
    "2026-02-08T12:00:00.000Z",
  );
});

test("une adresse mal formée ou un rôle inconnu sont refusés", async () => {
  const { service, delivery } = build();
  const badEmail = await service.invite({
    childId: "c1",
    inviterId: "u",
    email: "mamie",
  });
  assert.equal(badEmail.ok, false);
  const badRole = await service.invite({
    childId: "c1",
    inviterId: "u",
    email: "mamie@example.test",
    role: "sorcière",
  });
  assert.equal(badRole.ok, false);
  assert.deepEqual(delivery.sent, []);
});

test("on n'invite pas quelqu'un qui suit déjà l'enfant", async () => {
  const { service } = build({
    memberships: new FakeMemberships(["u-admin"], ["u-admin", "u-mamie"]),
    users: new FakeUsers("u-mamie"),
  });
  const result = await service.invite({
    childId: "c1",
    inviterId: "u-admin",
    email: "mamie@example.test",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 409);
});

test("le dernier administrateur ne peut être ni rétrogradé ni retiré", async () => {
  const solo = build({ memberships: new FakeMemberships(["u-admin"], ["u-admin"]) });
  const demote = await solo.service.setRole({
    childId: "c1",
    userId: "u-admin",
    role: "reader",
  });
  assert.equal(demote.ok, false);
  if (!demote.ok) assert.match(demote.error, /au moins un administrateur/);

  const removal = await solo.service.removeMember({
    childId: "c1",
    userId: "u-admin",
  });
  assert.equal(removal.ok, false);
  assert.deepEqual(solo.memberships.removed, []);

  // À deux administrateurs, en retirer un est permis.
  const pair = build({
    memberships: new FakeMemberships(["u-admin", "u-coparent"], [
      "u-admin",
      "u-coparent",
    ]),
  });
  assert.equal(
    (await pair.service.removeMember({ childId: "c1", userId: "u-admin" })).ok,
    true,
  );
  assert.deepEqual(pair.memberships.removed, [["c1", "u-admin"]]);
});

test("une invitation est nominative : un autre compte ne peut pas l'accepter", async () => {
  const { service } = build({ invitations: new FakeInvitations(invitation()) });
  const result = await service.accept({
    token: "jeton",
    userId: "u-voisin",
    userEmail: "voisin@example.test",
    emailVerified: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 403);
});

test("une invitation expirée ou déjà utilisée ne vaut plus rien", async () => {
  const expired = build({
    invitations: new FakeInvitations(
      invitation({ expiresAt: new Date("2026-01-01T00:00:00Z") }),
    ),
  });
  const e = await expired.service.accept({
    token: "jeton",
    userId: "u",
    userEmail: "mamie@example.test",
    emailVerified: true,
  });
  assert.equal(e.ok, false);
  if (!e.ok) assert.equal(e.httpCode, 410);

  const used = build({
    invitations: new FakeInvitations(invitation({ status: "accepted" })),
  });
  const u = await used.service.accept({
    token: "jeton",
    userId: "u",
    userEmail: "mamie@example.test",
    emailVerified: true,
  });
  assert.equal(u.ok, false);
  if (!u.ok) assert.equal(u.httpCode, 410);
});

test("deux acceptations simultanées : une seule gagne", async () => {
  const invitations = new FakeInvitations(invitation());
  const { service } = build({ invitations });
  const first = await service.accept({
    token: "jeton",
    userId: "u-mamie",
    userEmail: "Mamie@Example.test",
    emailVerified: true,
  });
  assert.deepEqual(first, { ok: true, childId: "c1", role: "reader" });

  // Le dépôt signale que l'invitation n'était plus « pending » au commit.
  invitations.pendingAccept = false;
  const second = await service.accept({
    token: "jeton",
    userId: "u-autre",
    userEmail: "mamie@example.test",
    emailVerified: true,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.httpCode, 410);
});

test("le cercle dit quelles invitations sont périmées", async () => {
  const { service } = build({
    invitations: new FakeInvitations(
      invitation({ expiresAt: new Date("2026-01-01T00:00:00Z") }),
    ),
  });
  const circle = await service.circle("c1");
  assert.equal(circle.invitations[0].expired, true);
  assert.equal(circle.invitations[0].url, "https://racontine.test/invite/jeton");
});

test("une adresse non prouvée ne peut pas accepter une invitation", async () => {
  const invitations = new FakeInvitations(invitation());
  const { service } = build({ invitations });
  const result = await service.accept({
    token: "jeton",
    userId: "u-mamie",
    userEmail: "mamie@example.test",
    emailVerified: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 403);
  assert.deepEqual(invitations.accepted, []);
});

test("réinviter une adresse révoque ses liens encore en attente", async () => {
  const { service, invitations } = build();
  await service.invite({
    childId: "c1",
    inviterId: "u-admin",
    email: "Mamie@Example.test",
  });
  assert.deepEqual(invitations.revokedFor, [["c1", "mamie@example.test"]]);
});

test("on nomme un proche sans nom, sans jamais écraser un nom existant", async () => {
  const { service, memberships } = build({
    memberships: new FakeMemberships(["u-admin"], ["u-admin", "u-mamie"]),
  });
  const named = await service.nameMember({
    childId: "c1",
    userId: "u-mamie",
    name: "  Mamie   Jacqueline ",
  });
  assert.deepEqual(named, { ok: true, name: "Mamie Jacqueline" });
  assert.equal(memberships.names.get("u-mamie"), "Mamie Jacqueline");

  const again = await service.nameMember({
    childId: "c1",
    userId: "u-mamie",
    name: "Autre",
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.httpCode, 409);
  assert.equal(memberships.names.get("u-mamie"), "Mamie Jacqueline");

  const stranger = await service.nameMember({
    childId: "c1",
    userId: "u-inconnu",
    name: "X",
  });
  if (!stranger.ok) assert.equal(stranger.httpCode, 404);
  else assert.fail("un non-membre ne se nomme pas");

  for (const bad of ["", "   ", "x".repeat(81)]) {
    const r = await service.nameMember({ childId: "c1", userId: "u-mamie", name: bad });
    if (!r.ok) assert.equal(r.httpCode, 400);
    else assert.fail(`nom accepté : « ${bad} »`);
  }
});
