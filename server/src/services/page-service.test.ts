import assert from "node:assert/strict";
import { test } from "node:test";
import type { PageRecord, PageRepository } from "../ports.js";
import {
  FakeAccessPolicy,
  FakeImageStore,
  FakeLogger,
} from "../testing/fakes.js";
import { PageService } from "./page-service.js";

/* Les quatre règles des pages photographiées, vérifiées sans base ni disque. */

class FakePages implements PageRepository {
  readonly removed: string[] = [];
  readonly rotations: { id: string; rotation: number }[] = [];
  constructor(
    private readonly page: PageRecord | null,
    private readonly siblings = 2,
  ) {}
  async findWithEntry() {
    return this.page;
  }
  async countSiblings() {
    return this.siblings;
  }
  async saveRotation(
    id: string,
    size: { width: number; height: number; rotation: number },
  ) {
    this.rotations.push({ id, rotation: size.rotation });
  }
  async remove(id: string) {
    this.removed.push(id);
  }
}

function page(over: Partial<PageRecord> = {}): PageRecord {
  return {
    id: "att-1",
    entryId: "e1",
    originalPath: "p1.jpg",
    thumbPath: "p1_thumb.jpg",
    mime: "image/jpeg",
    rotation: 0,
    width: 1200,
    height: 1600,
    childId: "child-1",
    entryStatus: "draft",
    ...over,
  };
}

function build(opts: {
  page?: PageRecord | null;
  siblings?: number;
  role?: "reader" | "contributor" | "admin" | null;
} = {}) {
  const pages = new FakePages(
    opts.page === undefined ? page() : opts.page,
    opts.siblings ?? 2,
  );
  const images = new FakeImageStore();
  const service = new PageService({
    pages,
    images,
    access: new FakeAccessPolicy(["child-1"], opts.role ?? "contributor"),
    logger: new FakeLogger(),
  });
  return { service, pages, images };
}

test("un lecteur ne voit les pages que d'une journée publiée", async () => {
  const draft = build({ role: "reader" });
  assert.equal(await draft.service.openForRead("u", "att-1", false), null);

  const published = build({
    role: "reader",
    page: page({ entryStatus: "published" }),
  });
  assert.deepEqual(await published.service.openForRead("u", "att-1", false), {
    relPath: "p1.jpg",
    mime: "image/jpeg",
  });
});

test("la miniature n'est servie que si elle existe", async () => {
  const withThumb = build();
  assert.equal(
    (await withThumb.service.openForRead("u", "att-1", true))?.relPath,
    "p1_thumb.jpg",
  );

  const without = build({ page: page({ thumbPath: null }) });
  assert.equal(
    (await without.service.openForRead("u", "att-1", true))?.relPath,
    "p1.jpg",
  );
});

test("tourner une page réécrit le fichier et enregistre l'orientation", async () => {
  const { service, pages, images } = build();
  const result = await service.rotate({
    userId: "u",
    attachmentId: "att-1",
    quarter: 1,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rotation, 1);
  // Un quart de tour impair échange largeur et hauteur.
  assert.equal(result.width, 1600);
  assert.deepEqual(images.rotated, [{ path: "p1.jpg", quarters: 1 }]);
  assert.deepEqual(pages.rotations, [{ id: "att-1", rotation: 1 }]);
});

test("un quart de tour nul ne réencode rien", async () => {
  const { service, pages, images } = build({ page: page({ rotation: 2 }) });
  const result = await service.rotate({
    userId: "u",
    attachmentId: "att-1",
    quarter: 4,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rotation, 2);
  assert.deepEqual(images.rotated, []);
  assert.deepEqual(pages.rotations, []);
});

test("une page qu'on ne peut pas décoder rend 422, pas une exception", async () => {
  const { service, images, pages } = build();
  images.rotateFails = true;
  const result = await service.rotate({
    userId: "u",
    attachmentId: "att-1",
    quarter: 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 422);
  assert.deepEqual(pages.rotations, []);
});

test("tourner reste possible après publication, retirer non", async () => {
  const published = build({ page: page({ entryStatus: "published" }) });
  assert.equal(
    (await published.service.rotate({
      userId: "u",
      attachmentId: "att-1",
      quarter: 1,
    })).ok,
    true,
  );

  const removal = await published.service.remove("u", "att-1");
  assert.equal(removal.ok, false);
  if (!removal.ok) assert.equal(removal.httpCode, 409);
});

test("une journée garde toujours au moins une page", async () => {
  const last = build({ siblings: 1 });
  const refused = await last.service.remove("u", "att-1");
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /dernière page/);
  assert.deepEqual(last.pages.removed, []);

  const several = build({ siblings: 3 });
  assert.deepEqual(await several.service.remove("u", "att-1"), { ok: true });
  assert.deepEqual(several.pages.removed, ["att-1"]);
  // Le fichier part avec la ligne.
  assert.deepEqual(several.images.deleted, ["p1.jpg"]);
});

test("un lecteur ne tourne ni ne retire, et ne l'apprend pas", async () => {
  const { service } = build({ role: "reader" });
  const rotate = await service.rotate({
    userId: "u",
    attachmentId: "att-1",
    quarter: 1,
  });
  assert.deepEqual(rotate, {
    ok: false,
    httpCode: 404,
    error: "pièce jointe introuvable",
  });
  const removal = await service.remove("u", "att-1");
  assert.equal(removal.ok, false);
  if (!removal.ok) assert.equal(removal.httpCode, 404);
});
