import assert from "node:assert/strict";
import { test } from "node:test";
import { CarnetReadError } from "../domain/errors.js";
import {
  FakeAccessPolicy,
  FakeApiKeyStore,
  FakeAttachmentRepository,
  FakeCarnetReader,
  FakeEntryRepository,
  FakeGlossaryStore,
  FakeImageStore,
  FakeLogger,
  ImmediateRunner,
  carnetDay,
  entryRecord,
} from "../testing/fakes.js";
import { CarnetReadingService } from "./carnet-reading-service.js";

/* Ce fichier lit des carnets ENTIERS sans Postgres, sans disque et sans appel
   facturé : tout passe par les ports. Avant le découpage, aucun de ces cas
   n'était atteignable en test. */

function build(
  opts: {
    days?: Parameters<typeof carnetDay>[0][] | Error;
    entries?: ReturnType<typeof entryRecord>[];
    pages?: Record<string, string[]>;
    apiKey?: string | null;
    role?: "reader" | "contributor" | "admin" | null;
  } = {},
) {
  const entries = new FakeEntryRepository(
    opts.entries ?? [entryRecord({ id: "e1", status: "processing" })],
  );
  const attachments = new FakeAttachmentRepository(
    opts.pages ?? { e1: ["p1.jpg"] },
  );
  const reader = new FakeCarnetReader(
    opts.days instanceof Error
      ? opts.days
      : (opts.days ?? [{}]).map((d) => carnetDay(d)),
  );
  const logger = new FakeLogger();
  const background = new ImmediateRunner();
  const service = new CarnetReadingService({
    entries,
    attachments,
    images: new FakeImageStore(),
    reader,
    apiKeys: new FakeApiKeyStore(opts.apiKey === undefined ? "sk-ant-x" : opts.apiKey),
    glossary: new FakeGlossaryStore([{ original: "Roueil", corrected: "Noureil" }]),
    access: new FakeAccessPolicy(["child-1"], opts.role ?? "contributor"),
    background,
    logger,
    newBatchId: () => "batch-fixe",
  });
  return { service, entries, attachments, reader, logger, background };
}

test("une journée unique passe de la lecture au brouillon, moments compris", async () => {
  const { service, entries } = build({
    days: [
      {
        titre: "Peinture et papillons",
        recit: "Belle journée.",
        repas: [{ moment: "midi", contenu: "purée" }],
        activites: ["peinture"],
        sante: "  ",
      },
    ],
  });

  await service.read("e1", ["p1.jpg"], "user-1");

  const entry = await entries.findById("e1");
  assert.equal(entry?.status, "draft");
  assert.equal(entry?.title, "Peinture et papillons");
  // L'ordre des moments suit le registre : repas, siestes, activités…
  assert.deepEqual(
    entries.itemsOf("e1").map((i) => i.type),
    ["meal", "activity"],
  );
  // Une note de santé blanche ne crée pas de moment.
  assert.equal(
    entries.itemsOf("e1").some((i) => i.type === "health"),
    false,
  );
});

test("le glossaire de l'enfant est transmis à la lecture", async () => {
  const { service, reader } = build();
  await service.read("e1", ["p1.jpg"], "user-1");
  assert.deepEqual(reader.calls[0].glossary, [
    { original: "Roueil", corrected: "Noureil" },
  ]);
});

test("des pages illisibles mettent la journée en échec avec un message utile", async () => {
  const { service, entries } = build({ days: [{ illisible: true }] });
  await service.read("e1", ["p1.jpg"], "user-1");
  const entry = await entries.findById("e1");
  assert.equal(entry?.status, "failed");
  assert.match(entry?.failureReason ?? "", /illisible/i);
});

test("un carnet couvrant trois jours crée une journée par date, reliées par un lot", async () => {
  const { service, entries, attachments } = build({
    pages: { e1: ["p1.jpg", "p2.jpg", "p3.jpg"] },
    days: [
      { pages: [1], date: "2026-02-01", titre: "Lundi" },
      { pages: [2], date: "2026-02-02", titre: "Mardi" },
      // Date illisible : la journée suivante hérite de « veille + 1 ».
      { pages: [3], date: null, titre: "Mercredi" },
    ],
  });

  await service.read("e1", ["p1.jpg", "p2.jpg", "p3.jpg"], "user-1");

  const all = [...entries.rows.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  assert.deepEqual(
    all.map((e) => [e.date, e.title, e.batchId]),
    [
      ["2026-02-01", "Lundi", "batch-fixe"],
      ["2026-02-02", "Mardi", "batch-fixe"],
      ["2026-02-03", "Mercredi", "batch-fixe"],
    ],
  );
  // Les pages 2 et 3 ont suivi leur journée.
  assert.deepEqual(await attachments.pathsFor("e1"), ["p1.jpg"]);
  assert.deepEqual(await attachments.pathsFor(all[1].id), ["p2.jpg"]);
  assert.deepEqual(await attachments.pathsFor(all[2].id), ["p3.jpg"]);
});

test("une journée déjà publiée n'est jamais écrasée par un découpage", async () => {
  const published = entryRecord({
    id: "e2",
    date: "2026-02-02",
    status: "published",
    title: "Déjà lue par les proches",
  });
  const { service, entries, attachments } = build({
    entries: [entryRecord({ id: "e1", status: "processing" }), published],
    pages: { e1: ["p1.jpg", "p2.jpg"] },
    days: [
      { pages: [1], date: "2026-02-01" },
      { pages: [2], date: "2026-02-02", titre: "Récrit par le modèle" },
    ],
  });

  await service.read("e1", ["p1.jpg", "p2.jpg"], "user-1");

  assert.equal((await entries.findById("e2"))?.title, "Déjà lue par les proches");
  // Les pages restent sur l'entrée d'origine, avec un signalement à relire.
  assert.deepEqual(await attachments.pathsFor("e1"), ["p1.jpg", "p2.jpg"]);
  const signal = (await entries.findById("e1"))?.uncertainties?.at(-1);
  assert.match(signal?.contexte ?? "", /déjà publiée/);
});

test("une relecture humaine concurrente n'est pas écrasée par la sortie du modèle", async () => {
  // L'entrée a été publiée pendant l'extraction : plus « processing ».
  const { service, entries } = build({
    entries: [entryRecord({ id: "e1", status: "published", title: "Écrit à la main" })],
    days: [{ titre: "Écrit par le modèle" }],
  });

  await service.read("e1", ["p1.jpg"], "user-1");

  assert.equal((await entries.findById("e1"))?.title, "Écrit à la main");
});

test("un échec de lecture connu garde son message ; un échec interne reste générique", async () => {
  const known = build({ days: new CarnetReadError("Votre clé API est invalide.") });
  await known.service.read("e1", ["p1.jpg"], "user-1");
  assert.equal(
    (await known.entries.findById("e1"))?.failureReason,
    "Votre clé API est invalide.",
  );

  const internal = build({ days: new Error("connexion Postgres refusée") });
  await internal.service.read("e1", ["p1.jpg"], "user-1");
  const reason = (await internal.entries.findById("e1"))?.failureReason ?? "";
  assert.match(reason, /a échoué. Réessayez plus tard/);
  assert.doesNotMatch(reason, /Postgres/);
  assert.equal(internal.logger.errors.length, 1);
});

test("sans clé d'API, la journée échoue en disant quoi faire", async () => {
  const { service, entries } = build({ apiKey: null });
  await service.read("e1", ["p1.jpg"], "user-1");
  assert.match(
    (await entries.findById("e1"))?.failureReason ?? "",
    /clé API Anthropic/,
  );
});

test("relancer une lecture exige le rôle contributeur", async () => {
  const { service } = build({
    entries: [entryRecord({ id: "e1", status: "failed" })],
    role: "reader",
  });
  const result = await service.retry("e1", "user-1");
  assert.deepEqual(result, {
    ok: false,
    httpCode: 404,
    error: "entrée introuvable",
  });
});

test("une journée qui n'est pas en échec ne se relance pas", async () => {
  const { service } = build({
    entries: [entryRecord({ id: "e1", status: "draft" })],
  });
  const result = await service.retry("e1", "user-1");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 409);
});

test("relancer une journée en échec repart de ses pages et relit", async () => {
  const { service, entries, background, reader } = build({
    entries: [entryRecord({ id: "e1", status: "failed" })],
    days: [{ titre: "Relue" }],
  });

  assert.deepEqual(await service.retry("e1", "user-1"), { ok: true });
  await background.settle();

  assert.equal(reader.calls.length, 1);
  assert.equal((await entries.findById("e1"))?.title, "Relue");
});

test("au démarrage, les lectures mortes avec le processus repassent en échec", async () => {
  const { service, entries } = build({
    entries: [
      entryRecord({ id: "e1", status: "processing" }),
      entryRecord({ id: "e2", date: "2026-02-02", status: "draft" }),
    ],
  });

  assert.equal(await service.reclaimStuck(), 1);
  assert.match(
    (await entries.findById("e1"))?.failureReason ?? "",
    /interrompue par un redémarrage/,
  );
  assert.equal((await entries.findById("e2"))?.status, "draft");
});
