import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db/index.js";
import {
  attachments,
  children,
  entries,
  memberships as membershipRows,
  pushSubscriptions,
  subscriptions as subscriptionRows,
  user,
} from "../src/db/schema.js";
import { pendingUncertaintyCount } from "../src/uncertainties.js";
import { and, eq } from "drizzle-orm";
import {
  DrizzleNotificationLog,
  DrizzlePendingNotifications,
  DrizzleSubscriberDirectory,
} from "../src/notifications/drizzle-stores.js";
import { SubscriberNotifier } from "../src/notifications/subscriber-notifier.js";
import {
  DrizzleCaptureReminderStore,
  listReminderPreferences,
  saveReminderPreference,
} from "../src/notifications/capture-reminder-store.js";
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
import {
  findNeighbours,
  listTimeline,
  listTimelineMonths,
  markAllRead,
  setEntryRead,
} from "../src/queries/entry-feed.js";
import { DuplicateEntryError, EntryNotReviewableError } from "../src/domain/errors.js";

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

assert.equal(await repo.markProcessingUnlessPublished(created.id), false);
const third = await repo.createWithItems({
  childId: child.id,
  date: "2026-01-15",
  source: "nounou",
  status: "draft",
  createdBy: owner,
}, []);
assert.ok(third);
await pages.addMany(third.id, [
  { originalPath: "c.jpg", thumbPath: "c_t.jpg", mime: "image/jpeg", width: 10, height: 20 },
], 0);
assert.equal(await repo.markProcessingUnlessPublished(third.id), true);
await assert.rejects(
  () => revisions.revise(third.id, { title: "Trop tôt" }, null, true),
  EntryNotReviewableError,
);
assert.deepEqual(await revisions.remove(third.id), [
  { originalPath: "c.jpg", thumbPath: "c_t.jpg" },
]);
assert.equal(await repo.findById(third.id), null);
ok("une journée publiée ne se rouvre pas ; en lecture, elle ne se relit pas ; supprimée, elle rend ses fichiers");

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
assert.equal(await memberships.setRole(child.id, owner, "reader"), "last-admin");
assert.equal(await memberships.remove(child.id, owner), "last-admin");
ok("le dernier administrateur ne peut ni se rétrograder ni partir");
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

const [autoSub] = await db
  .select()
  .from(subscriptionRows)
  .where(
    and(
      eq(subscriptionRows.userId, invitee),
      eq(subscriptionRows.childId, child.id),
    ),
  );
assert.equal(autoSub?.emailEnabled, true);
assert.equal(autoSub?.cadence, "chaque");
await db
  .update(subscriptionRows)
  .set({ emailEnabled: false, cadence: "hebdo" })
  .where(eq(subscriptionRows.id, autoSub.id));
ok("accepter une invitation abonne le proche au carnet");

assert.equal((await repo.findById(created.id))?.status, "published");
const notifier = new SubscriberNotifier({
  subscribers: new DrizzleSubscriberDirectory(),
  log: new DrizzleNotificationLog(),
  webBaseUrl: "https://racontine.test",
  logger: { info() {}, warn() {}, error() {} },
});
await notifier.entryPublished({
  entryId: created.id,
  childId: child.id,
  childName: "Lou",
  date: "2026-02-01",
  actorUserId: owner,
});
const pendingStore = new DrizzlePendingNotifications();
const pendingRows = (await pendingStore.pending()).filter(
  (r) => r.childId === child.id,
);
assert.equal(pendingRows.length, 1);
assert.equal(pendingRows[0].recipient.userId, invitee);
assert.equal(pendingRows[0].cadence, "hebdo");
assert.equal(pendingRows[0].recipient.emailEnabled, false);
assert.equal(pendingRows[0].entry?.entryId, created.id);
assert.equal(pendingRows[0].childName, "Lou");
const claimedAt = new Date();
assert.deepEqual(
  await pendingStore.claim([pendingRows[0].notificationId], claimedAt),
  [pendingRows[0].notificationId],
);
assert.deepEqual(
  await pendingStore.claim([pendingRows[0].notificationId], claimedAt),
  [],
);
await pendingStore.markEmailed([pendingRows[0].notificationId], claimedAt);
assert.equal(
  (await pendingStore.pending()).filter((r) => r.childId === child.id).length,
  0,
);
ok("une publication notifie les proches abonnés, et chaque notification ne part qu'une fois");

assert.equal(
  await new DrizzleUserDirectory().findIdByEmail(`${invitee}@example.test`),
  invitee,
);
assert.equal(await memberships.setRole(child.id, invitee, "admin"), "ok");
const stale = await invitations.create({
  childId: child.id,
  email: `${invitee}@example.test`,
  role: "reader",
  token: `jeton-${randomUUID()}`,
  invitedBy: owner,
  expiresAt: new Date(Date.now() + 86_400_000),
});
assert.equal(await invitations.acceptIfPending(stale.id, invitee), true);
assert.equal(
  (await memberships.listMembers(child.id)).find((m) => m.userId === invitee)
    ?.role,
  "admin",
);
ok("accepter une invitation n'abaisse jamais un rôle");

const crossed = await Promise.all([
  memberships.setRole(child.id, owner, "reader"),
  memberships.setRole(child.id, invitee, "reader"),
]);
assert.deepEqual([...crossed].sort(), ["last-admin", "ok"]);
assert.equal(
  (await memberships.listMembers(child.id)).filter((m) => m.role === "admin")
    .length,
  1,
);
await memberships.setRole(child.id, owner, "admin");
await memberships.setRole(child.id, invitee, "reader");
ok("deux rétrogradations croisées laissent un administrateur");

assert.equal(await invitations.revoke(stale.id), false);
const pending2 = await invitations.create({
  childId: child.id,
  email: `${invitee}@example.test`,
  role: "reader",
  token: `jeton-${randomUUID()}`,
  invitedBy: owner,
  expiresAt: new Date(Date.now() + 86_400_000),
});
await memberships.remove(child.id, invitee);
assert.equal(await memberships.isMember(child.id, invitee), false);
assert.equal((await invitations.findById(pending2.id))?.status, "revoked");
ok("retirer un membre retire son adhésion et ses invitations en attente");

const p1 = await listTimeline({ userId: owner, limit: 1 });
assert.equal(p1.kind, "page");
if (p1.kind === "page") {
  assert.equal(p1.entries.length, 1);
  assert.ok(p1.nextCursor);
  const p2 = await listTimeline({ userId: owner, limit: 1, cursor: p1.nextCursor });
  assert.equal(p2.kind, "page");
  if (p2.kind === "page") {
    assert.equal(p2.entries.length, 1);
    assert.notEqual(p2.entries[0].id, p1.entries[0].id);
    assert.ok(p2.entries[0].date <= p1.entries[0].date);
    const p3 = await listTimeline({ userId: owner, limit: 5, cursor: p2.nextCursor });
    if (p3.kind === "page") assert.equal(p3.nextCursor, null);
  }
}
ok("le curseur avance d'une journée à l'autre, sans doublon ni trou");

const windowed = await listTimeline({ userId: owner, limit: 10, from: "2026-02-01" });
if (windowed.kind === "page")
  assert.ok(windowed.entries.every((e) => e.date <= "2026-02-01"));
ok("le bord de fenêtre coupe le fil à la date demandée");

const months = await listTimelineMonths({ userId: owner });
assert.equal(months.kind, "months");
if (months.kind === "months") {
  const feb = months.months.find((m) => m.month === "2026-02");
  assert.equal(feb?.count, 2);
}
ok("l'index des mois compte les journées visibles, mois par mois");

const asReader = await listTimeline({ userId: owner, limit: 10, asReader: true });
assert.equal(asReader.kind, "page");
if (asReader.kind === "page") {
  assert.ok(asReader.entries.length > 0);
  assert.ok(asReader.entries.every((e) => e.status === "published"));
  assert.ok(asReader.entries.every((e) => e.read));
  assert.equal(asReader.unreadCount, 0);
}
ok("en vue lecteur, l'admin ne voit que le publié, et ce qu'il a écrit compte comme lu");

const lecteur = `u-${randomUUID()}`;
await db.insert(user).values({
  id: lecteur,
  name: "Papi",
  email: `${lecteur}@example.test`,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
await db.insert(membershipRows).values({ userId: lecteur, childId: child.id, role: "reader" });
const fresh = await listTimeline({ userId: lecteur, limit: 10 });
assert.equal(fresh.kind, "page");
if (fresh.kind === "page") {
  assert.ok(fresh.unreadCount > 0);
  const target = fresh.entries.find((e) => !e.read)!;
  assert.ok(target);
  const marked = await setEntryRead(lecteur, target.id, true);
  assert.equal(marked.kind, "done");
  const after = await listTimeline({ userId: lecteur, limit: 10 });
  if (after.kind === "page") {
    assert.equal(after.unreadCount, fresh.unreadCount - 1);
    assert.equal(after.entries.find((e) => e.id === target.id)?.read, true);
  }
  await setEntryRead(lecteur, target.id, false);
  const unmarked = await listTimeline({ userId: lecteur, limit: 10 });
  if (unmarked.kind === "page") assert.equal(unmarked.unreadCount, fresh.unreadCount);
  const all = await markAllRead(lecteur);
  assert.deepEqual(all, { kind: "done", marked: fresh.unreadCount });
  const cleared = await listTimeline({ userId: lecteur, limit: 10 });
  if (cleared.kind === "page") assert.equal(cleared.unreadCount, 0);
}
const drafts = await listTimeline({ userId: owner, limit: 10 });
if (drafts.kind === "page") {
  const draft = drafts.entries.find((e) => e.status !== "published");
  if (draft)
    assert.equal((await setEntryRead(lecteur, draft.id, true)).kind, "not_found");
}
await db.delete(user).where(eq(user.id, lecteur));
ok("un lecteur marque une journée lue, non lue, puis tout le carnet");

const carnet = await childRepo.createWithOwner({
  name: "Mila",
  birthdate: "2024-05-02",
  ownerUserId: owner,
});
const pendingWord = { original: "Roueil", contexte: "", suggestions: [], champ: null, resolved: null };
const [jour1, jour2, jour3, jour4, jour5] = await db
  .insert(entries)
  .values([
    { childId: carnet.id, date: "2026-03-01", source: "nounou", status: "published", createdBy: owner, uncertainties: [pendingWord] },
    { childId: carnet.id, date: "2026-03-02", source: "nounou", status: "draft", createdBy: owner, createdAt: new Date("2026-03-02T08:00:00Z"), uncertainties: [] },
    { childId: carnet.id, date: "2026-03-02", source: "maison", status: "published", createdBy: owner, createdAt: new Date("2026-03-02T18:00:00Z"), uncertainties: [{ ...pendingWord, resolved: "Rueil" }] },
    { childId: carnet.id, date: "2026-03-03", source: "nounou", status: "published", createdBy: owner, uncertainties: ["Pépin" as unknown as typeof pendingWord] },
    { childId: carnet.id, date: "2026-03-04", source: "nounou", status: "draft", createdBy: owner, uncertainties: [{ ...pendingWord, resolved: "" }] },
  ])
  .returning({ id: entries.id });

const queue = await listTimeline({ userId: owner, childId: carnet.id, limit: 10, pending: true });
assert.equal(queue.kind, "page");
if (queue.kind === "page") {
  assert.deepEqual(queue.entries.map((e) => e.id), [jour5!.id, jour4!.id, jour1!.id]);
  assert.ok(queue.entries.every((e) => pendingUncertaintyCount(e.uncertainties) > 0));
  assert.equal(queue.pendingCount, 3);
}
const queueMonths = await listTimelineMonths({ userId: owner, childId: carnet.id, pending: true });
if (queueMonths.kind === "months") assert.deepEqual(queueMonths.months, [{ month: "2026-03", count: 3 }]);
const unfiltered = await listTimeline({ userId: owner, childId: carnet.id, limit: 10 });
if (unfiltered.kind === "page") {
  assert.equal(unfiltered.entries.length, 5);
  assert.equal(unfiltered.pendingCount, 3);
}
const readerView = await listTimeline({ userId: owner, childId: carnet.id, limit: 10, asReader: true });
if (readerView.kind === "page") assert.equal(readerView.pendingCount, undefined);
const readerQueue = await listTimeline({ userId: owner, childId: carnet.id, limit: 10, asReader: true, pending: true });
if (readerQueue.kind === "page") {
  assert.equal(readerQueue.entries.length, 0);
  assert.equal(readerQueue.pendingCount, undefined);
}
ok("la file « à vérifier » ne garde que les journées aux mots non résolus, pour qui peut les corriger");

assert.deepEqual(await findNeighbours(owner, { id: jour3!.id, childId: carnet.id }), {
  prevId: jour2!.id,
  nextId: jour4!.id,
});
assert.deepEqual(await findNeighbours(owner, { id: jour1!.id, childId: carnet.id }), {
  prevId: null,
  nextId: jour2!.id,
});
const papi = `u-${randomUUID()}`;
await db.insert(user).values({
  id: papi,
  name: "Papi",
  email: `${papi}@example.test`,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
await db.insert(membershipRows).values({ userId: papi, childId: carnet.id, role: "reader" });
assert.deepEqual(await findNeighbours(papi, { id: jour3!.id, childId: carnet.id }), {
  prevId: jour1!.id,
  nextId: jour4!.id,
});
assert.deepEqual(await findNeighbours(papi, { id: jour4!.id, childId: carnet.id }), {
  prevId: jour3!.id,
  nextId: null,
});
const papiQueue = await listTimeline({ userId: papi, limit: 10, pending: true });
if (papiQueue.kind === "page") {
  assert.equal(papiQueue.entries.length, 0);
  assert.equal(papiQueue.pendingCount, undefined);
}
assert.deepEqual(await findNeighbours(invitee, { id: jour3!.id, childId: carnet.id }), {
  prevId: null,
  nextId: null,
});
await db.delete(user).where(eq(user.id, papi));
await db.delete(children).where(eq(children.id, carnet.id));
ok("les journées voisines suivent date puis création, et un lecteur ne saute que de publiée en publiée");

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

const gestionnaire = `u-${randomUUID()}`;
const lectrice = `u-${randomUUID()}`;
for (const [id, name] of [[gestionnaire, "Maman"], [lectrice, "Tata"]] as const)
  await db.insert(user).values({
    id,
    name,
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
const rappelEnfant = await childRepo.createWithOwner({
  name: "Nino",
  birthdate: null,
  ownerUserId: gestionnaire,
});
await db
  .insert(membershipRows)
  .values({ userId: lectrice, childId: rappelEnfant.id, role: "reader" });
const defaults = await listReminderPreferences(gestionnaire);
assert.deepEqual(defaults, [
  {
    childId: rappelEnfant.id,
    childName: "Nino",
    enabled: false,
    time: "18:30",
    days: [1, 2, 3, 4, 5],
  },
]);
assert.deepEqual(await listReminderPreferences(lectrice), []);
const reminderStore = new DrizzleCaptureReminderStore();
assert.deepEqual(await reminderStore.candidates("2026-11-04"), []);
const saved = await saveReminderPreference(gestionnaire, rappelEnfant.id, {
  enabled: true,
  time: "19:15",
});
assert.deepEqual(saved, {
  childId: rappelEnfant.id,
  enabled: true,
  time: "19:15",
  days: [1, 2, 3, 4, 5],
});
await saveReminderPreference(lectrice, rappelEnfant.id, { enabled: true });
const mineOnly = (rows: Awaited<ReturnType<typeof reminderStore.candidates>>) =>
  rows.filter((r) => r.childId === rappelEnfant.id);
let candidats = mineOnly(await reminderStore.candidates("2026-11-04"));
assert.equal(candidats.length, 1);
assert.equal(candidats[0].userId, gestionnaire);
assert.equal(candidats[0].hasPush, false);
assert.equal(candidats[0].hasEntryToday, false);
await db.insert(pushSubscriptions).values({
  userId: gestionnaire,
  endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
  p256dh: "p",
  auth: "a",
});
await repo.createIfAbsent({
  childId: rappelEnfant.id,
  date: "2026-11-04",
  source: "nounou",
  status: "processing",
  createdBy: gestionnaire,
});
candidats = mineOnly(await reminderStore.candidates("2026-11-04"));
assert.equal(candidats[0].hasPush, true);
assert.equal(candidats[0].hasEntryToday, true);
assert.equal(
  mineOnly(await reminderStore.candidates("2026-11-05"))[0].hasEntryToday,
  false,
);
assert.equal(await reminderStore.claim(gestionnaire, rappelEnfant.id, "2026-11-05"), true);
assert.equal(await reminderStore.claim(gestionnaire, rappelEnfant.id, "2026-11-05"), false);
assert.equal(await reminderStore.claim(gestionnaire, rappelEnfant.id, "2026-11-04"), false);
assert.equal(
  mineOnly(await reminderStore.candidates("2026-11-05"))[0].lastSentOn,
  "2026-11-05",
);
assert.equal(await reminderStore.claim(gestionnaire, rappelEnfant.id, "2026-11-06"), true);
await saveReminderPreference(gestionnaire, rappelEnfant.id, { enabled: false });
assert.deepEqual(mineOnly(await reminderStore.candidates("2026-11-07")), []);
assert.equal(await reminderStore.claim(gestionnaire, rappelEnfant.id, "2026-11-07"), false);
await db.delete(children).where(eq(children.id, rappelEnfant.id));
await db.delete(user).where(eq(user.id, gestionnaire));
await db.delete(user).where(eq(user.id, lectrice));
ok("rappel de capture : gestionnaires seulement, journée et push vus, une réservation par jour");

const reclaimed = await repo.reclaimProcessing("interrompue");
console.log("  ok — reclaimProcessing :", reclaimed, "journée(s) orpheline(s)");

await db.delete(children).where(eq(children.id, child.id));
await db.delete(user).where(eq(user.id, owner));
await db.delete(user).where(eq(user.id, invitee));
console.log("\nTous les adaptateurs répondent comme leurs doublures.");
process.exit(0);
