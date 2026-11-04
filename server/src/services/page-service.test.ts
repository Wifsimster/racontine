import assert from "node:assert/strict";
import { test } from "node:test";
import type { PageRecord, PageRepository } from "../ports.js";
import {
  FakeAccessPolicy,
  FakeAttachmentRepository,
  FakeEntryRepository,
  FakeImageStore,
  FakeLogger,
  FakePaywall,
  entryRecord,
} from "../testing/fakes.js";
import { MAX_SOUVENIRS_PER_ENTRY, PageService } from "./page-service.js";

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
    kind: "carnet",
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
  entries?: ReturnType<typeof entryRecord>[];
  existingPages?: Record<string, string[]>;
  paywall?: string | null;
} = {}) {
  const pages = new FakePages(
    opts.page === undefined ? page() : opts.page,
    opts.siblings ?? 2,
  );
  const images = new FakeImageStore();
  const attachments = new FakeAttachmentRepository(opts.existingPages ?? {});
  const service = new PageService({
    pages,
    entries: new FakeEntryRepository(
      opts.entries ?? [entryRecord({ id: "e1", status: "published" })],
    ),
    attachments,
    images,
    access: new FakeAccessPolicy(["child-1"], opts.role ?? "contributor"),
    paywall: new FakePaywall(opts.paywall ?? null),
    logger: new FakeLogger(),
  });
  return { service, pages, images, attachments };
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

test("joindre des photos à une journée publiée les ajoute après les pages existantes", async () => {
  const { service, attachments, images } = build({
    existingPages: { e1: ["old.jpg"] },
  });
  const result = await service.attach({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a"), Buffer.from("b")],
  });
  assert.deepEqual(result, { ok: true, added: 2, total: 3 });
  assert.equal(images.stored.length, 2);
  assert.deepEqual(await attachments.pathsFor("e1"), [
    "old.jpg",
    images.stored[0]!.originalPath,
    images.stored[1]!.originalPath,
  ]);
});

test("un lecteur ne peut pas joindre de photos", async () => {
  const { service, images } = build({ role: "reader" });
  const result = await service.attach({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.httpCode, 404);
  assert.equal(images.stored.length, 0);
});

test("joindre à une journée inconnue ou en lecture est refusé", async () => {
  const missing = build();
  const r1 = await missing.service.attach({
    userId: "u",
    entryId: "nope",
    images: [Buffer.from("a")],
  });
  assert.equal(!r1.ok && r1.httpCode, 404);

  const processing = build({
    entries: [entryRecord({ id: "e1", status: "processing" })],
  });
  const r2 = await processing.service.attach({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.equal(!r2.ok && r2.httpCode, 409);
});

test("le plafond de pages par journée est respecté", async () => {
  const { service, images } = build({
    existingPages: { e1: Array.from({ length: 19 }, (_, i) => `p${i}.jpg`) },
  });
  const result = await service.attach({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a"), Buffer.from("b")],
  });
  assert.equal(!result.ok && result.httpCode, 413);
  assert.equal(images.stored.length, 0);
});

test("une image indécodable ne laisse rien derrière elle", async () => {
  const { service, images, attachments } = build();
  images.rejectNext = true;
  const result = await service.attach({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.equal(!result.ok && result.httpCode, 422);
  assert.deepEqual(await attachments.pathsFor("e1"), []);
});

test("une photo de l'enfant s'ajoute à une journée publiée sans toucher aux pages", async () => {
  const { service, attachments, images } = build({
    existingPages: { e1: ["page.jpg"] },
  });
  const result = await service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a"), Buffer.from("b")],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.added.map((a) => [a.width, a.height]),
    [
      [1200, 1600],
      [1200, 1600],
    ],
  );
  assert.equal(images.stored.length, 2);
  assert.deepEqual(await attachments.pathsFor("e1"), ["page.jpg"]);
  assert.equal(await attachments.countOf("e1", "souvenir"), 2);
  assert.deepEqual(
    attachments.pages.get("e1")!.map((p) => [p.kind, p.position]),
    [
      ["carnet", 0],
      ["souvenir", 1],
      ["souvenir", 2],
    ],
  );
});

test("un lecteur ne peut pas ajouter de photo, et ne l'apprend pas", async () => {
  const { service, images } = build({ role: "reader" });
  const result = await service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.deepEqual(result, {
    ok: false,
    httpCode: 404,
    error: "journée introuvable",
  });
  assert.equal(images.stored.length, 0);
});

test("le paywall fermé bloque l'ajout de photos", async () => {
  const { service, images } = build({ paywall: "Abonnement requis" });
  const result = await service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.deepEqual(result, {
    ok: false,
    httpCode: 402,
    error: "Abonnement requis",
  });
  assert.equal(images.stored.length, 0);
});

test("le plafond de photos par journée ne compte pas les pages du carnet", async () => {
  const { service, images } = build({
    existingPages: { e1: Array.from({ length: 19 }, (_, i) => `p${i}.jpg`) },
  });
  const ok = await service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: Array.from({ length: MAX_SOUVENIRS_PER_ENTRY }, () =>
      Buffer.from("a"),
    ),
  });
  assert.equal(ok.ok, true);

  const over = await service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("b")],
  });
  assert.equal(!over.ok && over.httpCode, 413);
  assert.equal(images.stored.length, MAX_SOUVENIRS_PER_ENTRY);
});

test("ajouter sans photo ou une photo indécodable est refusé proprement", async () => {
  const empty = build();
  const r1 = await empty.service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [],
  });
  assert.equal(!r1.ok && r1.httpCode, 400);

  const broken = build();
  broken.images.rejectNext = true;
  const r2 = await broken.service.addSouvenirs({
    userId: "u",
    entryId: "e1",
    images: [Buffer.from("a")],
  });
  assert.equal(!r2.ok && r2.httpCode, 422);
  assert.equal(await broken.attachments.countOf("e1", "souvenir"), 0);
});

test("une photo de l'enfant se retire même publiée, même seule", async () => {
  const { service, pages, images } = build({
    page: page({ kind: "souvenir", entryStatus: "published" }),
    siblings: 0,
  });
  assert.deepEqual(await service.remove("u", "att-1"), { ok: true });
  assert.deepEqual(pages.removed, ["att-1"]);
  assert.deepEqual(images.deleted, ["p1.jpg"]);
});

test("un lecteur ne voit une photo de l'enfant que sur une journée publiée", async () => {
  const draft = build({ role: "reader", page: page({ kind: "souvenir" }) });
  assert.equal(await draft.service.openForRead("u", "att-1", true), null);

  const published = build({
    role: "reader",
    page: page({ kind: "souvenir", entryStatus: "published" }),
  });
  assert.equal(
    (await published.service.openForRead("u", "att-1", true))?.relPath,
    "p1_thumb.jpg",
  );
});
