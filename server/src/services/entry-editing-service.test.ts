import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DuplicateEntryError,
  InvalidEntryDateError,
} from "../domain/errors.js";
import {
  FakeAccessPolicy,
  FakeChildDirectory,
  FakeEntryRepository,
  FakeLogger,
  FakePublicationNotifier,
  ImmediateRunner,
  entryRecord,
} from "../testing/fakes.js";
import { EntryEditingService } from "./entry-editing-service.js";

function build(
  opts: {
    entries?: ReturnType<typeof entryRecord>[];
    role?: "reader" | "contributor" | "admin" | null;
  } = {},
) {
  const entries = new FakeEntryRepository(
    opts.entries ?? [entryRecord({ id: "e1", status: "draft" })],
  );
  const notifier = new FakePublicationNotifier();
  const background = new ImmediateRunner();
  const service = new EntryEditingService({
    entries,
    revisions: entries,
    access: new FakeAccessPolicy(["child-1"], opts.role ?? "contributor"),
    children: new FakeChildDirectory("Lou"),
    notifier,
    background,
  });
  return { service, entries, notifier, background, logger: new FakeLogger() };
}

test("publier une journée prévient les abonnés une seule fois", async () => {
  const { service, entries, notifier, background } = build();

  const first = await service.revise({
    entryId: "e1",
    userId: "user-1",
    title: "Peinture",
    publish: true,
  });
  await background.settle();

  assert.equal(first.ok, true);
  assert.equal((await entries.findById("e1"))?.status, "published");
  assert.deepEqual(notifier.announcements, [
    {
      entryId: "e1",
      childId: "child-1",
      childName: "Lou",
      date: "2026-02-01",
      actorUserId: "user-1",
    },
  ]);

  // Republier ne renotifie pas : seule la VRAIE transition compte.
  await service.revise({ entryId: "e1", userId: "user-1", publish: true });
  await background.settle();
  assert.equal(notifier.announcements.length, 1);
});

test("un lecteur ne peut pas relire, et ne l'apprend pas", async () => {
  const { service } = build({ role: "reader" });
  const result = await service.revise({
    entryId: "e1",
    userId: "user-1",
    title: "…",
  });
  // Refus uniforme : ni 403, ni indice qu'une journée existe.
  assert.deepEqual(result, {
    ok: false,
    httpCode: 404,
    error: "entrée introuvable",
  });
});

test("une date mal formée est refusée avant toute écriture", async () => {
  const { service, entries } = build();
  const result = await service.revise({
    entryId: "e1",
    userId: "user-1",
    date: "1er février",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 400);
  assert.equal((await entries.findById("e1"))?.date, "2026-02-01");
});

test("les collisions et dates impossibles de la base deviennent 409 et 400", async () => {
  const conflict = build();
  conflict.entries.failNextRevision = new DuplicateEntryError("déjà prise");
  const c = await conflict.service.revise({
    entryId: "e1",
    userId: "user-1",
    date: "2026-02-02",
  });
  assert.equal(c.ok, false);
  if (!c.ok) assert.equal(c.httpCode, 409);

  const impossible = build();
  impossible.entries.failNextRevision = new InvalidEntryDateError("date invalide");
  const i = await impossible.service.revise({
    entryId: "e1",
    userId: "user-1",
    date: "2026-13-40",
  });
  assert.equal(i.ok, false);
  if (!i.ok) assert.equal(i.httpCode, 400);
});

test("les moments d'un type inconnu sont ignorés, les autres renumérotés", async () => {
  const { service, entries } = build();
  await service.revise({
    entryId: "e1",
    userId: "user-1",
    items: [
      { type: "meal", data: { moment: "midi", contenu: "purée" } },
      { type: "licorne", data: { label: "?" } },
      { type: "nap", data: { debut: "13h" } },
    ],
  });
  assert.deepEqual(
    entries.itemsOf("e1").map((i) => [i.type, i.position]),
    [
      ["meal", 0],
      ["nap", 1],
    ],
  );
});

test("trancher une lecture remplace le mot partout et nourrit le glossaire", async () => {
  const { service, entries } = build({
    entries: [
      entryRecord({
        id: "e1",
        status: "draft",
        title: "Roueil au parc",
        story: "Roueil a joué avec Roueil.",
        highlight: "Un câlin",
        uncertainties: [
          {
            original: "Roueil",
            contexte: "mot incertain",
            suggestions: ["Noureil"],
            champ: "titre",
            resolved: null,
          },
        ],
      }),
    ],
  });

  const result = await service.resolveUncertainty({
    entryId: "e1",
    userId: "user-1",
    index: 0,
    value: "Noureil",
  });

  assert.equal(result.ok, true);
  const entry = await entries.findById("e1");
  assert.equal(entry?.title, "Noureil au parc");
  // Toutes les occurrences, pas seulement le champ signalé par le modèle.
  assert.equal(entry?.story, "Noureil a joué avec Noureil.");
  assert.equal(entry?.highlight, "Un câlin");
  assert.equal(entry?.uncertainties?.[0].resolved, "Noureil");
  assert.deepEqual(entries.corrections, [
    {
      childId: "child-1",
      original: "Roueil",
      corrected: "Noureil",
      field: "titre",
      entryId: "e1",
      createdBy: "user-1",
    },
  ]);
});

test("une incertitude déjà tranchée ne se retranche pas", async () => {
  const { service } = build({
    entries: [
      entryRecord({
        id: "e1",
        uncertainties: [
          {
            original: "Roueil",
            contexte: "",
            suggestions: [],
            champ: null,
            resolved: "Noureil",
          },
        ],
      }),
    ],
  });

  const result = await service.resolveUncertainty({
    entryId: "e1",
    userId: "user-1",
    index: 0,
    value: "Autre",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.httpCode, 409);
});

test("supprimer une journée est réservé à l'admin de l'enfant", async () => {
  const contributor = build({ role: "contributor" });
  const refused = await contributor.service.remove("e1", "user-1");
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.httpCode, 403);
  assert.equal(contributor.entries.rows.size, 1);

  const admin = build({ role: "admin" });
  assert.equal((await admin.service.remove("e1", "user-1")).ok, true);
  assert.equal(admin.entries.rows.size, 0);
});
