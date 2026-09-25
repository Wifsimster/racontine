/* ===========================================================================
   EMPORTER ET EFFACER, SUR UNE VRAIE BASE.

   Les tests unitaires prouvent les RÈGLES (qui peut partir, ce qui part avec
   lui) contre des doublures. Ils ne peuvent rien dire de ce qui, ici, fait tout
   le travail : les cascades du schéma, la portée du lecteur écrite en SQL, et
   le compte d'administrateurs par carnet. Un effacement qui laisserait une
   table derrière lui passerait les 27 tests unitaires sans broncher.

   Ce script exerce donc l'adaptateur contre un vrai Postgres, et vérifie la
   seule chose qui compte pour un droit à l'effacement : APRÈS, PLUS RIEN.

   Il ne tourne PAS dans `pnpm test` : il lui faut une base, que l'intégration
   continue n'a pas. Pour l'exécuter :

     docker compose up -d db
     pnpm --filter server db:migrate
     pnpm --filter server test:privacy

   Il écrit dans la base qu'on lui donne (comptes et carnets de test, nettoyés
   en fin de course) : à réserver à une base de développement.
   =========================================================================== */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import {
  attachments,
  children,
  entries,
  entryItems,
  mcpTokens,
  mcpUploads,
  memberships,
  notifications,
  pushSubscriptions,
  subscriptions,
  user,
  userLlmSettings,
  wordCorrections,
} from "../src/db/schema.js";
import { DrizzlePrivacyRepository } from "../src/adapters/drizzle-privacy.js";

const ok = (label: string) => console.log("  ok —", label);
const repo = new DrizzlePrivacyRepository();

async function makeUser(name: string): Promise<string> {
  const id = `u-${randomUUID()}`;
  await db.insert(user).values({
    id,
    name,
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

/* ------------------------------ Le décor ---------------------------------- */

const parent = await makeUser("Parent");
const mamie = await makeUser("Mamie");

const [lou] = await db
  .insert(children)
  .values({ name: "Lou", birthdate: "2024-03-11" })
  .returning();
const [anouk] = await db
  .insert(children)
  .values({ name: "Anouk", birthdate: "2022-01-05" })
  .returning();

// Lou : le parent administre, Mamie lit. Anouk : le parent seul.
await db.insert(memberships).values([
  { userId: parent, childId: lou!.id, role: "admin" },
  { userId: mamie, childId: lou!.id, role: "reader" },
  { userId: parent, childId: anouk!.id, role: "admin" },
]);

const [published] = await db
  .insert(entries)
  .values({
    childId: lou!.id,
    date: "2026-02-01",
    source: "nounou",
    status: "published",
    title: "Une journée au parc",
    story: "Elle a couru.",
    createdBy: parent,
    publishedAt: new Date(),
  })
  .returning();
const [draft] = await db
  .insert(entries)
  .values({
    childId: lou!.id,
    date: "2026-02-02",
    source: "nounou",
    status: "draft",
    title: "Brouillon",
    createdBy: parent,
  })
  .returning();

await db.insert(entryItems).values([
  { entryId: published!.id, type: "meal", data: { moment: "midi", contenu: "purée" }, position: 0 },
  { entryId: draft!.id, type: "nap", data: { debut: "13:00" }, position: 0 },
]);
await db.insert(attachments).values([
  {
    entryId: published!.id,
    originalPath: "2026/02/p1.jpg",
    thumbPath: "2026/02/p1_thumb.jpg",
    mime: "image/jpeg",
    rotation: 1,
  },
  {
    entryId: draft!.id,
    originalPath: "2026/02/p2.jpg",
    thumbPath: null,
    mime: "image/jpeg",
  },
]);
await db.insert(wordCorrections).values({
  childId: lou!.id,
  original: "dodo",
  corrected: "doudou",
  field: "recit",
  entryId: published!.id,
  createdBy: mamie,
});
await db
  .insert(subscriptions)
  .values({ userId: mamie, childId: lou!.id, emailEnabled: true });
await db.insert(notifications).values({
  userId: mamie,
  childId: lou!.id,
  entryId: published!.id,
  type: "entry_published",
  title: "Une nouvelle journée de Lou",
});
await db.insert(mcpTokens).values({
  userId: mamie,
  name: "Claude cloud",
  tokenHash: randomUUID(),
  tokenPrefix: "rac_mcp_ab12",
});
await db.insert(userLlmSettings).values({
  userId: mamie,
  anthropicKeyEnc: "v1:blob-chiffré-qui-ne-doit-jamais-sortir",
  anthropicKeyHint: "4f2a",
});
await db.insert(pushSubscriptions).values({
  userId: mamie,
  endpoint: `https://push.test/${randomUUID()}`,
  p256dh: "clé",
  auth: "secret",
});
await db.insert(mcpUploads).values({
  userId: mamie,
  path: "staging/en-attente.bin",
  byteSize: 42,
  expiresAt: new Date(Date.now() + 60_000),
});

/* ------------------------------ Emporter ---------------------------------- */

const mine = await repo.exportFor(parent);
assert.ok(mine);
assert.equal(mine.format, "racontine.export.v1");
assert.deepEqual(
  mine.carnets.map((c) => c.name),
  ["Anouk", "Lou"],
);
const louExport = mine.carnets.find((c) => c.name === "Lou")!;
assert.equal(louExport.entries.length, 2);
assert.equal(louExport.entries[0]!.items.length, 1);
assert.equal(louExport.entries[0]!.pages.length, 1);
// La rotation voyage dans l'URL : sans `?v=`, le lien rendrait la page d'avant.
assert.match(louExport.entries[0]!.pages[0]!.url, /\?size=full&v=1$/);
ok("un administrateur emporte ses carnets, brouillons compris");

// Le chemin de rangement ne sort que par `pageFilesOf`, jamais dans l'archive.
const pageId = louExport.entries[0]!.pages[0]!.id;
const pageFiles = await repo.pageFilesOf([pageId]);
assert.equal(pageFiles.length, 1);
assert.equal(pageFiles[0]!.id, pageId);
assert.equal(JSON.stringify(mine).includes(pageFiles[0]!.originalPath), false);
assert.deepEqual(await repo.pageFilesOf([]), []);
ok("les photos du carnet se retrouvent sur le disque, sans que leur chemin sorte");

const hers = await repo.exportFor(mamie);
assert.ok(hers);
assert.deepEqual(hers.carnets.map((c) => c.name), ["Lou"]);
assert.deepEqual(
  hers.carnets[0]!.entries.map((e) => e.status),
  ["published"],
);
ok("une lectrice n'emporte que le journal publié — comme à l'écran");

assert.equal(hers.carnets[0]!.corrections.length, 1);
assert.equal(hers.carnets[0]!.subscription?.emailEnabled, true);
assert.equal(hers.notifications.length, 1);
assert.equal(hers.mcpTokens.length, 1);
assert.equal(hers.mcpTokens[0]!.prefix, "rac_mcp_ab12");
assert.equal(hers.pushDevices, 1);
ok("ses corrections, son abonnement, ses notifications et ses appareils y sont");

assert.deepEqual(hers.llmKey, { configured: true, hint: "4f2a" });
const serialized = JSON.stringify(hers);
for (const secret of ["blob-chiffré", "tokenHash", "p256dh", "secret"])
  assert.equal(
    serialized.includes(secret),
    false,
    `l'export laisse fuir « ${secret} »`,
  );
ok("aucun secret ne sort : ni clé chiffrée, ni hash de jeton, ni clé de push");

assert.equal(await repo.exportFor("u-inexistant"), null);
ok("un compte disparu n'a pas d'archive");

/* -------------------------- L'état avant de partir ------------------------ */

const snapshot = await repo.erasureSnapshot(parent);
assert.ok(snapshot);
assert.equal(snapshot.carnets.length, 2);
const louStanding = snapshot.carnets.find((c) => c.childName === "Lou")!;
assert.equal(louStanding.members, 2);
assert.equal(louStanding.admins, 1);
const anoukStanding = snapshot.carnets.find((c) => c.childName === "Anouk")!;
assert.equal(anoukStanding.members, 1);
assert.equal(anoukStanding.admins, 1);
ok("le compte des membres et des administrateurs se fait carnet par carnet");

/* Les deux entrées des refus les plus lourds : « qui est propriétaire » et
   « combien d'autres comptes restent ». Elles ne se déduisent d'aucune colonne —
   le propriétaire est le compte le PLUS ANCIEN, calculé à la lecture — et une
   erreur ici ferait, au choix, partir un propriétaire en transmettant l'instance
   en silence, ou retenir pour toujours quelqu'un qui n'est propriétaire de rien. */
const first = (await db
  .select({ id: user.id })
  .from(user)
  .orderBy(asc(user.createdAt), asc(user.id))
  .limit(1))[0]!.id;
const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
assert.equal(snapshot.isOwner, first === parent);
assert.equal(snapshot.otherAccounts, (total!.n ?? 0) - 1);
const hersSnapshot = await repo.erasureSnapshot(mamie);
assert.equal(hersSnapshot!.isOwner, first === mamie);
// Aucune ligne d'abonnement sur une instance sans caisse : rien ne retient personne.
assert.equal(snapshot.activeSubscription, false);
ok("propriété de l'instance et comptes restants se lisent, pas se devinent");

const standing = await repo.standingOn(mamie, lou!.id);
assert.equal(standing?.role, "reader");
assert.equal(standing?.members, 2);
assert.equal(await repo.standingOn(mamie, anouk!.id), null);
ok("hors du cercle, un carnet n'a pas d'existence");

/* -------------------------------- Effacer --------------------------------- */

const files = await repo.filesOfChildren([lou!.id]);
assert.equal(files.length, 2);
assert.deepEqual(
  files.map((f) => f.originalPath).sort(),
  ["2026/02/p1.jpg", "2026/02/p2.jpg"],
);
// La miniature manquante reste null : c'est au service de décider quoi en faire.
assert.equal(files.find((f) => f.originalPath === "2026/02/p2.jpg")?.thumbPath, null);
ok("les fichiers d'un carnet se retrouvent tous, miniature absente comprise");

const staged = await repo.stagedFilesOf(mamie);
assert.deepEqual(staged, [
  { originalPath: "staging/en-attente.bin", thumbPath: null },
]);
ok("les fichiers mis en attente par MCP se retrouvent par leur compte");

await repo.deleteChildren([lou!.id]);
const leftovers = await Promise.all([
  db.select().from(entries).where(eq(entries.childId, lou!.id)),
  db.select().from(entryItems).where(inArray(entryItems.entryId, [published!.id, draft!.id])),
  db.select().from(attachments).where(inArray(attachments.entryId, [published!.id, draft!.id])),
  db.select().from(memberships).where(eq(memberships.childId, lou!.id)),
  db.select().from(subscriptions).where(eq(subscriptions.childId, lou!.id)),
  db.select().from(wordCorrections).where(eq(wordCorrections.childId, lou!.id)),
  db.select().from(notifications).where(eq(notifications.userId, mamie)),
]);
for (const rows of leftovers) assert.deepEqual(rows, []);
ok("effacer un carnet emporte journées, moments, pages, cercle, glossaire et notifications");

await repo.deleteAccount(mamie);
const afterAccount = await Promise.all([
  db.select().from(user).where(eq(user.id, mamie)),
  db.select().from(mcpTokens).where(eq(mcpTokens.userId, mamie)),
  db.select().from(mcpUploads).where(eq(mcpUploads.userId, mamie)),
  db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, mamie)),
  db.select().from(userLlmSettings).where(eq(userLlmSettings.userId, mamie)),
  db.select().from(memberships).where(eq(memberships.userId, mamie)),
]);
for (const rows of afterAccount) assert.deepEqual(rows, []);
ok("effacer un compte emporte jetons, fichiers en attente, appareils, clé et adhésions");

// Ce qui ne lui appartenait pas reste : le carnet d'Anouk n'a jamais été à elle.
assert.equal((await db.select().from(children).where(eq(children.id, anouk!.id))).length, 1);
ok("ce qui appartient aux autres survit à un départ");

/* ------------------------------ Nettoyage --------------------------------- */

await db.delete(children).where(eq(children.id, anouk!.id));
await db.delete(user).where(eq(user.id, parent));
const orphans = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(entries)
  .where(eq(entries.childId, anouk!.id));
assert.equal(orphans[0]?.n, 0);

console.log("\nEmporter et effacer tiennent leurs promesses, sur une vraie base.");
process.exit(0);
