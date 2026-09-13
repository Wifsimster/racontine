import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FakeAccessPolicy,
  FakeChildDirectory,
  FakeEntryRepository,
  FakePublicationNotifier,
  ImmediateRunner,
  entryRecord,
} from "../testing/fakes.js";
import { TranscribedNoteService } from "./transcribed-note-service.js";

function build(
  opts: {
    entries?: ReturnType<typeof entryRecord>[];
    role?: "reader" | "contributor" | "admin" | null;
  } = {},
) {
  const entries = new FakeEntryRepository(opts.entries ?? []);
  const notifier = new FakePublicationNotifier();
  const background = new ImmediateRunner();
  const service = new TranscribedNoteService({
    entries,
    access: new FakeAccessPolicy(["child-1"], opts.role ?? "contributor"),
    children: new FakeChildDirectory("Lou"),
    notifier,
    background,
  });
  return { service, entries, notifier, background };
}

test("une journée transcrite devient un brouillon avec ses moments ordonnés", async () => {
  const { service, entries, notifier } = build();

  const result = await service.create({
    userId: "user-1",
    date: "2026-02-01",
    title: "Journée douce",
    meals: [{ moment: "midi", contenu: "purée" }],
    naps: [{ debut: "13h", fin: "15h" }],
    activities: ["peinture"],
    anecdotes: ["a dit « encore »"],
    health: ["38,2 °C au réveil"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "draft");
  assert.deepEqual(
    entries.itemsOf(result.id).map((i) => i.type),
    ["meal", "nap", "activity", "anecdote", "health"],
  );
  // Un brouillon ne prévient personne.
  assert.deepEqual(notifier.announcements, []);
});

test("publier directement prévient les abonnés", async () => {
  const { service, notifier, background } = build();

  const result = await service.create({
    userId: "user-1",
    date: "2026-02-01",
    story: "Belle journée.",
    publish: true,
  });
  await background.settle();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "published");
  assert.equal(notifier.announcements[0]?.childName, "Lou");
  assert.equal(notifier.announcements[0]?.actorUserId, "user-1");
});

test("une journée existante n'est jamais remplacée en silence", async () => {
  const { service } = build({
    entries: [entryRecord({ id: "e1", date: "2026-02-01", status: "draft" })],
  });

  const result = await service.create({
    userId: "user-1",
    date: "2026-02-01",
    story: "Autre version.",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpCode, 409);
  assert.equal(result.id, "e1");
});

test("les incertitudes fournies en texte libre sont remises en forme", async () => {
  const { service, entries } = build();
  const result = await service.create({
    userId: "user-1",
    date: "2026-02-01",
    uncertainties: ["«Roueil» : mot incertain après «Nounour»"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const stored = (await entries.findById(result.id))?.uncertainties ?? [];
  // Le mot d'un côté, sa glose de l'autre : c'est `original` que la relecture
  // remplacera dans le récit.
  assert.equal(stored[0].original, "Roueil");
  assert.match(stored[0].contexte, /mot incertain/);
});

test("les mêmes règles d'accès que l'ingestion s'appliquent", async () => {
  const reader = build({ role: "reader" });
  const refused = await reader.service.create({ userId: "u", story: "…" });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.httpCode, 403);

  const { service } = build();
  const badSource = await service.create({ userId: "u", source: "ecole" });
  assert.equal(badSource.ok, false);
  if (!badSource.ok) assert.match(badSource.error, /source invalide/);
});
