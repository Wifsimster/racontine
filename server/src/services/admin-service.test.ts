import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AdminService,
  type AdminChild,
  type AdminEntryCount,
  type AdminInvitation,
  type AdminMembership,
  type AdminRepository,
} from "./admin-service.js";

/* La console d'administration se vérifie sans Postgres : l'agrégation (rôles
   rassemblés par personne, dernier administrateur, compteurs par carnet) est
   du calcul, et c'est elle qui décide ce qu'un écran propose. */

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

class FakeAdminRepo implements AdminRepository {
  constructor(
    private readonly data: {
      children?: AdminChild[];
      members?: AdminMembership[];
      counts?: AdminEntryCount[];
      published?: { childId: string; at: Date }[];
      invitations?: AdminInvitation[];
      owner?: string | null;
    } = {},
  ) {}
  async administeredChildren() {
    return this.data.children ?? [];
  }
  async members() {
    return this.data.members ?? [];
  }
  async entryCounts() {
    return this.data.counts ?? [];
  }
  async lastPublished() {
    return this.data.published ?? [];
  }
  async pendingInvitations() {
    return this.data.invitations ?? [];
  }
  async ownerId() {
    return this.data.owner ?? null;
  }
}

function member(over: Partial<AdminMembership> = {}): AdminMembership {
  return {
    childId: "c-lou",
    userId: "u-admin",
    role: "admin",
    name: "Alex",
    email: "alex@example.test",
    since: new Date("2026-01-01T10:00:00Z"),
    ...over,
  };
}

const LOU: AdminChild = { id: "c-lou", name: "Lou", birthdate: "2024-03-02" };
const ANOUK: AdminChild = { id: "c-anouk", name: "Anouk", birthdate: null };

test("refuse la console à qui n'administre aucun enfant", async () => {
  const service = new AdminService(new FakeAdminRepo());
  const res = await service.console("u-lecteur");
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.httpCode, 403);
});

test("rassemble les rôles d'une même personne sur plusieurs enfants", async () => {
  const service = new AdminService(
    new FakeAdminRepo({
      children: [LOU, ANOUK],
      members: [
        member(),
        member({ childId: "c-anouk" }),
        member({
          userId: "u-mamie",
          name: "Mamie",
          email: "mamie@example.test",
          role: "reader",
        }),
        member({
          childId: "c-anouk",
          userId: "u-mamie",
          name: "Mamie",
          email: "mamie@example.test",
          role: "contributor",
        }),
      ],
    }),
  );

  const res = await service.console("u-admin");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.console.people.length, 2);
  const mamie = res.console.people.find((p) => p.userId === "u-mamie")!;
  assert.deepEqual(
    mamie.roles.map((r) => [r.childName, r.role]),
    [
      ["Anouk", "contributor"],
      ["Lou", "reader"],
    ],
  );
  // Les administrateurs d'abord : c'est la lecture utile d'un cercle.
  assert.equal(res.console.people[0]!.userId, "u-admin");
  assert.equal(res.console.totals.admins, 1);
});

test("signale le seul administrateur d'un enfant, et lui seul", async () => {
  const service = new AdminService(
    new FakeAdminRepo({
      children: [LOU, ANOUK],
      members: [
        member(),
        member({ childId: "c-anouk" }),
        member({
          childId: "c-anouk",
          userId: "u-coparent",
          name: "Camille",
          email: "camille@example.test",
          role: "admin",
        }),
      ],
    }),
  );

  const res = await service.console("u-admin");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const alex = res.console.people.find((p) => p.userId === "u-admin")!;
  // Seul admin de Lou ; sur Anouk, Camille prendrait le relais.
  assert.deepEqual(alex.soleAdminOf, ["c-lou"]);
  assert.equal(alex.isSelf, true);
  const camille = res.console.people.find((p) => p.userId === "u-coparent")!;
  assert.deepEqual(camille.soleAdminOf, []);
  assert.equal(camille.isSelf, false);
});

test("compte les journées par statut, et totalise l'instance administrée", async () => {
  const at = new Date("2026-02-01T18:00:00Z");
  const service = new AdminService(
    new FakeAdminRepo({
      children: [LOU, ANOUK],
      members: [member(), member({ childId: "c-anouk" })],
      counts: [
        { childId: "c-lou", status: "published", count: 12 },
        { childId: "c-lou", status: "draft", count: 2 },
        { childId: "c-lou", status: "failed", count: 1 },
        { childId: "c-anouk", status: "published", count: 3 },
        // Un enfant hors périmètre ne doit rien ajouter aux compteurs.
        { childId: "c-inconnu", status: "published", count: 99 },
      ],
      published: [{ childId: "c-lou", at }],
    }),
  );

  const res = await service.console("u-admin");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const lou = res.console.children.find((c) => c.id === "c-lou")!;
  assert.equal(lou.entries.published, 12);
  assert.equal(lou.entries.total, 15);
  assert.equal(lou.members, 1);
  assert.deepEqual(lou.lastPublishedAt, at);

  const anouk = res.console.children.find((c) => c.id === "c-anouk")!;
  assert.equal(anouk.lastPublishedAt, null);
  assert.equal(anouk.entries.processing, 0);

  assert.equal(res.console.totals.entries, 18);
  assert.equal(res.console.totals.published, 15);
  assert.equal(res.console.totals.children, 2);
});

test("marque le propriétaire de l'instance", async () => {
  const service = new AdminService(
    new FakeAdminRepo({
      children: [LOU],
      members: [
        member(),
        member({
          userId: "u-coparent",
          name: "Camille",
          email: "camille@example.test",
          role: "contributor",
        }),
      ],
      owner: "u-coparent",
    }),
  );

  const res = await service.console("u-admin");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.console.people.find((p) => p.isOwner)!.userId, "u-coparent");
});

test("datent les invitations : la plus urgente d'abord, les périmées dites", async () => {
  const service = new AdminService(
    new FakeAdminRepo({
      children: [LOU],
      members: [member()],
      invitations: [
        {
          id: "inv-loin",
          childId: "c-lou",
          email: "tonton@example.test",
          role: "reader",
          expiresAt: new Date(NOW.getTime() + 5 * DAY),
        },
        {
          id: "inv-perimee",
          childId: "c-lou",
          email: "papi@example.test",
          role: "reader",
          expiresAt: new Date(NOW.getTime() - DAY),
        },
      ],
    }),
  );

  const res = await service.console("u-admin");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.deepEqual(
    res.console.invitations.map((i) => [i.id, i.expired, i.childName]),
    [
      ["inv-perimee", true, "Lou"],
      ["inv-loin", false, "Lou"],
    ],
  );
  assert.equal(res.console.totals.pendingInvitations, 2);
});
