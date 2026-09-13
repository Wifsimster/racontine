/* ===========================================================================
   LES ADAPTATEURS, SUR UNE VRAIE BASE.

   Les tests unitaires (`pnpm test`) branchent des doublures sur les ports : ils
   prouvent que les SERVICES tiennent leurs règles, jamais que le SQL les tient
   aussi. Ce script est l'autre moitié — il exerce les dépôts Drizzle contre un
   vrai Postgres, et c'est lui qui a montré que le SQLSTATE d'une collision
   n'arrivait pas jusqu'au code appelant (Drizzle enveloppe l'erreur du pilote,
   `err.code` valait `undefined`, et une journée en double rendait 500 au lieu
   de 409).

   Il ne tourne PAS dans `pnpm test` : il lui faut une base, que l'intégration
   continue n'a pas. Pour l'exécuter :

     docker compose up -d db
     pnpm --filter server db:migrate
     pnpm --filter server test:integration

   Il écrit dans la base qu'on lui donne (comptes et journées de test, nettoyés
   en fin de course) : à réserver à une base de développement.
   =========================================================================== */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db/index.js";
import { attachments, children, user } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import {
  DrizzleAttachmentRepository,
  DrizzleChildRepository,
  DrizzleEntryRepository,
  DrizzleEntryRevisionRepository,
} from "../src/adapters/drizzle-entry-repository.js";
import { DrizzlePageRepository } from "../src/adapters/drizzle-page-repository.js";
import {
  DrizzleInvitationRepository,
  DrizzleMembershipRepository,
  DrizzleUserDirectory,
} from "../src/adapters/drizzle-sharing.js";
import { DrizzleAdminRepository } from "../src/adapters/drizzle-admin.js";
import { DuplicateEntryError } from "../src/domain/errors.js";

const ok = (label: string) => console.log("  ok —", label);

const owner = `u-${randomUUID()}`;
await db.insert(user).values({
  id: owner,
  name: "Parent",
  email: `${owner}@example.test`,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const invitee = `u-${randomUUID()}`;
await db.insert(user).values({
  id: invitee,
  name: "Mamie",
  email: `${invitee}@example.test`,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const childRepo = new DrizzleChildRepository();
const child = await childRepo.createWithOwner({
  name: "Lou",
  birthdate: "2024-03-11",
  ownerUserId: owner,
});
ok("createWithOwner crée l'enfant, l'adhésion admin et l'abonnement");

const repo = new DrizzleEntryRepository();
const created = await repo.createIfAbsent({
  childId: child.id,
  date: "2026-02-01",
  source: "nounou",
  status: "processing",
  createdBy: owner,
});
assert.ok(created);
assert.equal(await repo.createIfAbsent({
  childId: child.id,
  date: "2026-02-01",
  source: "nounou",
  status: "processing",
  createdBy: owner,
}), null);
ok("createIfAbsent rend null sur conflit (enfant + date + source)");

const applied = await repo.applyReadingIfProcessing(
  created.id,
  {
    mood: "joyeuse",
    title: "Peinture",
    story: "Belle journée.",
    highlight: null,
    transcription: "texte",
    uncertainties: [
      { original: "Roueil", contexte: "", suggestions: [], champ: null, resolved: null },
    ],
  },
  [
    { type: "meal", data: { moment: "midi", contenu: "purée" }, position: 0 },
    { type: "nap", data: { debut: "13h" }, position: 1 },
  ],
);
assert.equal(applied, true);
assert.equal((await repo.findById(created.id))?.status, "draft");
assert.equal(
  (await repo.applyReadingIfProcessing(created.id, {
    mood: null, title: "Écrasé", story: null, highlight: null,
    transcription: null, uncertainties: [],
  }, [])),
  false,
);
assert.equal((await repo.findById(created.id))?.title, "Peinture");
ok("applyReadingIfProcessing n'écrit que sur une journée encore en lecture");

const pages = new DrizzleAttachmentRepository();
await pages.addMany(created.id, [
  { originalPath: "a.jpg", thumbPath: "a_t.jpg", mime: "image/jpeg", width: 10, height: 20 },
], await pages.nextPosition(created.id));
await pages.addMany(created.id, [
  { originalPath: "b.jpg", thumbPath: "b_t.jpg", mime: "image/jpeg", width: 10, height: 20 },
], await pages.nextPosition(created.id));
assert.deepEqual(await pages.pathsFor(created.id), ["a.jpg", "b.jpg"]);
ok("addMany numérote à la suite des pages déjà rattachées");

const second = await repo.createWithItems({
  childId: child.id,
  date: "2026-02-02",
  source: "nounou",
  status: "draft",
  createdBy: owner,
  batchId: randomUUID(),
}, [{ type: "activity", data: { label: "jardin" }, position: 0 }]);
assert.ok(second);
const ids = await pages.idsFor(created.id);
await pages.moveTo([ids[1]], second.id);
assert.deepEqual(await pages.pathsFor(created.id), ["a.jpg"]);
assert.deepEqual(await pages.pathsFor(second.id), ["b.jpg"]);
ok("moveTo déplace une page vers la journée voisine du lot");

const revisions = new DrizzleEntryRevisionRepository();
const first = await revisions.revise(created.id, { title: "Relu" }, null, true);
assert.equal(first.firstPublish, true);
const again = await revisions.revise(created.id, {}, null, true);
assert.equal(again.firstPublish, false);
ok("revise ne revendique la première publication qu'une fois");

await assert.rejects(
  () => revisions.revise(second.id, { date: "2026-02-01" }, null, false),
  DuplicateEntryError,
);
ok("une collision de date devient DuplicateEntryError, pas un code SQL");

await repo.appendUncertainty(created.id, {
  original: "pages du 2026-02-02",
  contexte: "signalement",
  suggestions: [],
  champ: null,
  resolved: null,
});
assert.equal((await repo.findById(created.id))?.uncertainties?.length, 2);
ok("appendUncertainty ajoute sans écraser les incertitudes existantes");

await revisions.saveResolvedReading(
  created.id,
  { title: "Noureil relu" },
  { childId: child.id, original: "Roueil", corrected: "Noureil", field: null, entryId: created.id, createdBy: owner },
);
assert.equal((await repo.findById(created.id))?.title, "Noureil relu");
ok("saveResolvedReading écrit la journée ET la correction");

const pageRepo = new DrizzlePageRepository();
const att = (await db.select().from(attachments).where(eq(attachments.entryId, created.id)))[0];
const rec = await pageRepo.findWithEntry(att.id);
assert.equal(rec?.childId, child.id);
assert.equal(rec?.entryStatus, "published");
await pageRepo.saveRotation(att.id, { width: 20, height: 10, rotation: 1 });
assert.equal((await pageRepo.findWithEntry(att.id))?.rotation, 1);
assert.equal(await pageRepo.countSiblings(created.id), 1);
ok("le dépôt des pages lit la journée qui les porte et enregistre l'orientation");

const memberships = new DrizzleMembershipRepository();
assert.deepEqual(await memberships.adminIds(child.id), [owner]);
const invitations = new DrizzleInvitationRepository();
const token = `jeton-${randomUUID()}`;
const inv = await invitations.create({
  childId: child.id,
  email: `${invitee}@example.test`,
  role: "reader",
  token,
  invitedBy: owner,
  expiresAt: new Date(Date.now() + 86_400_000),
});
assert.equal((await invitations.findByToken(token))?.childName, "Lou");
assert.equal(await invitations.acceptIfPending(inv.id, invitee), true);
assert.equal(await invitations.acceptIfPending(inv.id, invitee), false);
assert.equal(await memberships.isMember(child.id, invitee), true);
ok("une invitation ne s'accepte qu'une fois, et crée l'adhésion");

assert.equal(
  await new DrizzleUserDirectory().findIdByEmail(`${invitee}@example.test`),
  invitee,
);
await memberships.remove(child.id, invitee);
assert.equal(await memberships.isMember(child.id, invitee), false);
ok("retirer un membre retire son adhésion");

const admin = new DrizzleAdminRepository();
const administered = await admin.administeredChildren(owner);
assert.deepEqual(administered.map((c) => c.id), [child.id]);
assert.deepEqual(await admin.administeredChildren(invitee), []);
const counts = await admin.entryCounts([child.id]);
assert.equal(counts.find((c) => c.status === "published")?.count, 1);
assert.equal(counts.find((c) => c.status === "draft")?.count, 1);
assert.equal((await admin.lastPublished([child.id]))[0]?.childId, child.id);
assert.deepEqual((await admin.members([child.id])).map((m) => m.userId), [owner]);
ok("la console d'administration ne voit que les carnets qu'on administre");

const reclaimed = await repo.reclaimProcessing("interrompue");
console.log("  ok — reclaimProcessing :", reclaimed, "journée(s) orpheline(s)");

// Nettoyage : l'enfant emporte ses journées, ses pages et son cercle (cascade),
// puis les deux comptes de test.
await db.delete(children).where(eq(children.id, child.id));
await db.delete(user).where(eq(user.id, owner));
await db.delete(user).where(eq(user.id, invitee));
console.log("\nTous les adaptateurs répondent comme leurs doublures.");
process.exit(0);
