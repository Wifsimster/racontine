import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChildRepository } from "../ports.js";
import { ChildrenService } from "./children-service.js";

class FakeChildren implements ChildRepository {
  readonly created: { name: string; birthdate: string | null; owner: string }[] =
    [];
  async createWithOwner(params: {
    name: string;
    birthdate: string | null;
    ownerUserId: string;
  }) {
    this.created.push({
      name: params.name,
      birthdate: params.birthdate,
      owner: params.ownerUserId,
    });
    return {
      id: "child-1",
      name: params.name,
      birthdate: params.birthdate,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    };
  }
}

test("créer un enfant coupe les blancs du nom et garde sa date de naissance", async () => {
  const repo = new FakeChildren();
  const result = await new ChildrenService(repo).create({
    userId: "u1",
    name: "  Lou  ",
    birthdate: "2024-03-11",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.child.name, "Lou");
  assert.deepEqual(repo.created, [
    { name: "Lou", birthdate: "2024-03-11", owner: "u1" },
  ]);
});

test("un nom vide ou une date mal formée sont refusés sans rien écrire", async () => {
  const repo = new FakeChildren();
  const service = new ChildrenService(repo);

  const noName = await service.create({ userId: "u1", name: "   " });
  assert.deepEqual(noName, { ok: false, httpCode: 400, error: "name requis" });

  const badDate = await service.create({
    userId: "u1",
    name: "Lou",
    birthdate: "11/03/2024",
  });
  assert.equal(badDate.ok, false);
  if (!badDate.ok) assert.match(badDate.error, /birthdate invalide/);

  assert.deepEqual(repo.created, []);
});

test("la date de naissance est facultative", async () => {
  const repo = new FakeChildren();
  const result = await new ChildrenService(repo).create({
    userId: "u1",
    name: "Lou",
  });
  assert.equal(result.ok, true);
  assert.equal(repo.created[0].birthdate, null);
});
