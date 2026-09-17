/* ===========================================================================
   LES QUATRE ROUTES, AVEC UNE VRAIE SESSION.

   `integration/privacy.ts` prouve que l'adaptateur efface ce qu'il doit. Il ne
   dit rien du CHEMIN qui y mène — et c'est là que ces routes-ci sont fragiles,
   pour des raisons qui ne se voient dans aucun test unitaire :

     · la confirmation voyage dans le CORPS d'un DELETE. Un parseur qui
       l'ignorerait ne casserait rien de visible : chaque effacement répondrait
       simplement « recopiez votre adresse », pour toujours ;
     · l'export doit DESCENDRE (`Content-Disposition`) et ne dormir dans aucun
       cache — deux en-têtes qu'aucune assertion de service ne regarde ;
     · après le départ, le cookie encore dans le navigateur ne doit plus rien
       ouvrir. C'est la dernière promesse de l'effacement, et la seule qui se
       vérifie de l'extérieur.

   Comme son voisin, il lui faut une vraie base :

     docker compose up -d db
     pnpm --filter server db:migrate
     pnpm --filter server test:privacy:http
   =========================================================================== */
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/index.js";
import { children, memberships, user } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const app = await buildApp();
const ok = (l: string) => console.log("  ok —", l);

const email = `parent-${Date.now()}@example.test`;
const password = "un-mot-de-passe-assez-long";

const signup = await app.inject({
  method: "POST",
  url: "/api/auth/sign-up/email",
  headers: { "content-type": "application/json" },
  payload: JSON.stringify({ email, password, name: "Parent" }),
});
assert.equal(signup.statusCode, 200, signup.body);
const cookie = (signup.headers["set-cookie"] as string[] | string) ?? "";
const jar = (Array.isArray(cookie) ? cookie : [cookie])
  .map((c) => c.split(";")[0])
  .join("; ");
assert.ok(jar.length, "pas de cookie de session");
ok("compte créé, session ouverte");

const me = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: jar } });
const userId = JSON.parse(me.body).id as string;

// Sans session : 401 partout.
for (const [method, url] of [
  ["GET", "/api/me/export"],
  ["GET", "/api/me/erasure"],
  ["DELETE", "/api/me"],
] as const) {
  const res = await app.inject({ method, url });
  assert.equal(res.statusCode, 401, `${method} ${url} → ${res.statusCode}`);
}
ok("sans session, les quatre routes répondent 401");

// Un carnet, pour que l'aperçu ait quelque chose à dire.
const created = await app.inject({
  method: "POST",
  url: "/api/children",
  headers: { cookie: jar, "content-type": "application/json" },
  payload: JSON.stringify({ name: "Léa", birthdate: "2024-03-11" }),
});
assert.equal(created.statusCode, 201, created.body);
const childId = JSON.parse(created.body).id as string;

const exported = await app.inject({
  method: "GET",
  url: "/api/me/export",
  headers: { cookie: jar },
});
assert.equal(exported.statusCode, 200);
assert.match(exported.headers["content-disposition"] as string, /attachment; filename="racontine-export-\d{4}-\d{2}-\d{2}\.json"/);
assert.equal(exported.headers["cache-control"], "no-store");
const archive = JSON.parse(exported.body);
assert.equal(archive.format, "racontine.export.v1");
assert.equal(archive.account.email, email);
assert.equal(archive.carnets[0].name, "Léa");
ok("l'export descend en pièce jointe, nommée et hors cache");

const preview = await app.inject({
  method: "GET",
  url: "/api/me/erasure",
  headers: { cookie: jar },
});
assert.equal(preview.statusCode, 200, preview.body);
assert.deepEqual(JSON.parse(preview.body).deletes, [{ id: childId, name: "Léa" }]);
ok("l'aperçu annonce le carnet qui partirait");

// Mauvaise confirmation → 400, et RIEN n'a bougé.
const refused = await app.inject({
  method: "DELETE",
  url: `/api/children/${childId}`,
  headers: { cookie: jar, "content-type": "application/json" },
  payload: JSON.stringify({ confirmation: "Lou" }),
});
assert.equal(refused.statusCode, 400, refused.body);
assert.equal(JSON.parse(refused.body).code, "confirmation");
assert.equal((await db.select().from(children).where(eq(children.id, childId))).length, 1);
ok("un prénom recopié de travers ne supprime rien (400)");

// Le bon prénom, aux accents près.
const erased = await app.inject({
  method: "DELETE",
  url: `/api/children/${childId}`,
  headers: { cookie: jar, "content-type": "application/json" },
  payload: JSON.stringify({ confirmation: "  lea " }),
});
assert.equal(erased.statusCode, 200, erased.body);
assert.equal((await db.select().from(children).where(eq(children.id, childId))).length, 0);
ok("le prénom recopié efface le carnet (accents et espaces tolérés)");

// Mauvaise adresse → 400.
const badEmail = await app.inject({
  method: "DELETE",
  url: "/api/me",
  headers: { cookie: jar, "content-type": "application/json" },
  payload: JSON.stringify({ confirmation: "SUPPRIMER" }),
});
assert.equal(badEmail.statusCode, 400, badEmail.body);
assert.equal((await db.select().from(user).where(eq(user.id, userId))).length, 1);
ok("« SUPPRIMER » n'efface pas un compte : il faut son adresse");

const gone = await app.inject({
  method: "DELETE",
  url: "/api/me",
  headers: { cookie: jar, "content-type": "application/json" },
  payload: JSON.stringify({ confirmation: email.toUpperCase() }),
});
assert.equal(gone.statusCode, 200, gone.body);
assert.equal((await db.select().from(user).where(eq(user.id, userId))).length, 0);
assert.equal((await db.select().from(memberships).where(eq(memberships.userId, userId))).length, 0);
ok("le compte part, et ses adhésions avec lui");

// La session est morte avec le compte : l'ancien cookie ne vaut plus rien.
const after = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: jar } });
assert.equal(after.statusCode, 401);
ok("le cookie survivant ne rouvre rien (401)");

await app.close();
console.log("\nLes routes tiennent, de la session au 401 final.");
process.exit(0);
