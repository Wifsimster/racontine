import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FakeAccessPolicy,
  FakeApiKeyStore,
  FakeAttachmentRepository,
  FakeEntryRepository,
  FakeImageStore,
  entryRecord,
} from "../testing/fakes.js";
import { IngestService } from "./ingest-service.js";

function build(
  opts: {
    entries?: ReturnType<typeof entryRecord>[];
    pages?: Record<string, string[]>;
    apiKey?: string | null;
    childIds?: string[];
    role?: "reader" | "contributor" | "admin" | null;
  } = {},
) {
  const entries = new FakeEntryRepository(opts.entries ?? []);
  const attachments = new FakeAttachmentRepository(opts.pages ?? {});
  const images = new FakeImageStore();
  const reads: { entryId: string; paths: string[]; userId: string }[] = [];
  const service = new IngestService({
    entries,
    attachments,
    images,
    apiKeys: new FakeApiKeyStore(
      opts.apiKey === undefined ? "sk-ant-x" : opts.apiKey,
    ),
    access: new FakeAccessPolicy(opts.childIds ?? ["child-1"], opts.role ?? "contributor"),
    reading: {
      readInBackground: (entryId, paths, userId) =>
        reads.push({ entryId, paths, userId }),
    },
  });
  return { service, entries, attachments, images, reads };
}

const photo = () => Buffer.from("jpeg");

test("une photo de carnet crée la journée, range ses pages et lance la lecture", async () => {
  const { service, entries, images, reads } = build();

  const result = await service.ingest({
    userId: "user-1",
    images: [photo(), photo()],
    date: "2026-02-01",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "processing");
  assert.equal((await entries.findById(result.id))?.status, "processing");
  assert.equal(images.stored.length, 2);
  // La lecture part sur TOUTES les pages de la journée, dans l'ordre.
  assert.deepEqual(reads, [
    {
      entryId: result.id,
      paths: images.stored.map((i) => i.originalPath),
      userId: "user-1",
    },
  ]);
});

test("des pages ajoutées à une journée existante se rangent à la suite", async () => {
  const existing = entryRecord({ id: "e1", date: "2026-02-01", status: "draft" });
  const { service, attachments, reads } = build({
    entries: [existing],
    pages: { e1: ["ancienne.jpg"] },
  });

  const result = await service.ingest({
    userId: "user-1",
    images: [photo()],
    date: "2026-02-01",
  });

  assert.deepEqual(result, { ok: true, id: "e1", status: "processing" });
  const paths = await attachments.pathsFor("e1");
  assert.equal(paths.length, 2);
  assert.equal(paths[0], "ancienne.jpg");
  // La relecture repart de l'ensemble des pages, pas seulement des nouvelles.
  assert.deepEqual(reads[0].paths, paths);
});

test("une journée déjà publiée n'est pas rouverte, et les fichiers écrits sont repris", async () => {
  const { service, images } = build({
    entries: [
      entryRecord({ id: "e1", date: "2026-02-01", status: "published" }),
    ],
  });

  const result = await service.ingest({
    userId: "user-1",
    images: [photo()],
    date: "2026-02-01",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpCode, 409);
  assert.equal(result.id, "e1");
  // Rien ne doit rester sur le disque : ces octets n'appartiennent à personne.
  assert.deepEqual(images.deleted, images.stored.map((i) => i.originalPath));
});

test("une image indécodable annule l'ingestion et ne laisse aucun fichier", async () => {
  const { service, images, entries } = build();
  images.rejectNext = true;

  const result = await service.ingest({
    userId: "user-1",
    images: [photo()],
    date: "2026-02-01",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpCode, 400);
  assert.match(result.error, /indécodable/);
  assert.equal(entries.rows.size, 0);
});

test("sans clé d'API, on refuse tout de suite plutôt que d'échouer en arrière-plan", async () => {
  const { service, images } = build({ apiKey: null });
  const result = await service.ingest({
    userId: "user-1",
    images: [photo()],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpCode, 400);
  assert.match(result.error, /clé API Anthropic/);
  // Aucune image n'a été écrite : le refus précède le stockage.
  assert.equal(images.stored.length, 0);
});

test("childId est facultatif tant qu'un seul enfant est suivi", async () => {
  const one = build({ childIds: ["child-1"] });
  const result = await one.service.ingest({ userId: "u", images: [photo()] });
  assert.equal(result.ok, true);

  const several = build({ childIds: ["child-1", "child-2"] });
  const ambiguous = await several.service.ingest({
    userId: "u",
    images: [photo()],
  });
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.match(ambiguous.error, /childId requis/);
});

test("un lecteur ne peut pas contribuer", async () => {
  const { service } = build({ role: "reader" });
  const result = await service.ingest({
    userId: "user-1",
    images: [photo()],
    childId: "child-1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 403);
});

test("les métadonnées mal formées sont refusées avant tout stockage", async () => {
  const { service, images } = build();

  const badDate = await service.ingest({
    userId: "u",
    images: [photo()],
    date: "01/02/2026",
  });
  assert.deepEqual(badDate, {
    ok: false,
    httpCode: 400,
    error: "date invalide (attendu AAAA-MM-JJ)",
  });

  const badSource = await service.ingest({
    userId: "u",
    images: [photo()],
    source: "ecole",
  });
  assert.equal(badSource.ok, false);
  if (!badSource.ok) assert.match(badSource.error, /source invalide/);

  const noPhoto = await service.ingest({ userId: "u", images: [] });
  assert.deepEqual(noPhoto, {
    ok: false,
    httpCode: 400,
    error: "aucune photo fournie",
  });

  assert.equal(images.stored.length, 0);
});
