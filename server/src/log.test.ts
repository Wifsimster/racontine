import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFailure, redactUrl } from "./log.js";

test("redactUrl masque le jeton d'invitation dans le chemin", () => {
  assert.equal(
    redactUrl("/api/invitations/token/AbCd-1234_xyz"),
    "/api/invitations/token/REDACTED",
  );
  assert.equal(
    redactUrl("/api/invitations/token/AbCd-1234_xyz/accept"),
    "/api/invitations/token/REDACTED/accept",
  );
});

test("redactUrl masque le jeton de magic link en chaîne de requête", () => {
  const redacted = redactUrl(
    "/api/auth/magic-link/verify?token=secret-de-session&callbackURL=%2F",
  );
  assert.ok(!redacted.includes("secret-de-session"));
  assert.ok(redacted.includes("callbackURL"));
});

test("redactUrl masque le jeton de réinitialisation de mot de passe", () => {
  // Le lien de l'e-mail « mot de passe oublié » est une CAPACITÉ : qui le tient
  // choisit le mot de passe du compte. Il arrive au serveur en clair, deux fois
  // — dans le chemin (la vérification), puis en query (le POST du nouveau mot
  // de passe). Ni l'un ni l'autre ne doit finir dans `docker logs`.
  const chemin = redactUrl(
    "/api/auth/reset-password/jeton-de-reinitialisation?callbackURL=%2Freset-password",
  );
  assert.ok(!chemin.includes("jeton-de-reinitialisation"));
  assert.ok(chemin.startsWith("/api/auth/reset-password/REDACTED"));
  // La demande, elle, ne porte aucun secret : elle reste lisible en entier.
  assert.equal(
    redactUrl("/api/auth/request-password-reset"),
    "/api/auth/request-password-reset",
  );
  assert.ok(
    !redactUrl("/api/auth/reset-password?token=jeton-en-query").includes(
      "jeton-en-query",
    ),
  );
});

test("redactUrl masque le segment qui suit magic-link", () => {
  assert.ok(!redactUrl("/api/auth/magic-link/abc123").includes("abc123"));
});

test("redactUrl garde les verbes de route lisibles", () => {
  assert.equal(
    redactUrl("/api/auth/magic-link/verify?token=x"),
    "/api/auth/magic-link/verify?token=REDACTED",
  );
  assert.equal(
    redactUrl("/api/invitations/token/abc/accept").split("/").pop(),
    "accept",
  );
});

test("redactUrl laisse intacte une URL sans secret", () => {
  assert.equal(redactUrl("/api/entries?limit=20&offset=0"), "/api/entries?limit=20&offset=0");
  assert.equal(redactUrl("/api/health"), "/api/health");
});

test("redactUrl gère les cas dégénérés sans lever", () => {
  assert.equal(redactUrl(""), "");
  assert.equal(redactUrl("/"), "/");
  // Un paramètre secret vide reste masqué : l'absence de valeur ne se déduit pas.
  assert.ok(redactUrl("/api/x?token=").includes("REDACTED"));
});

/* ------------- Ce qu'une panne a le droit de dire au client -------------- */

test("une erreur de base ne renvoie JAMAIS la requête SQL au client", () => {
  // Le cas qui a motivé le gestionnaire : `Failed query: select "memberships"…`
  // partait au client à chaque 500, schéma compris.
  const err = Object.assign(new Error('Failed query: select "memberships"."id"…'), {
    cause: { code: "42P01" },
  });
  const out = describeFailure(err);
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: "erreur interne" });
  assert.equal(out.severity, "error");
});

test("un identifiant mal formé est une demande invalide (400), pas une panne", () => {
  // Drizzle enveloppe l'erreur du pilote : le SQLSTATE vit sur `cause`.
  const err = Object.assign(new Error("Failed query: select …"), {
    cause: new Error('invalid input syntax for type uuid: "pas-un-uuid"'),
  });
  (err.cause as { code?: string }).code = "22P02";
  const out = describeFailure(err);
  assert.equal(out.status, 400);
  // Et surtout : la chaîne fautive n'est pas renvoyée en écho.
  assert.deepEqual(out.body, { error: "identifiant invalide" });
  assert.equal(out.severity, "warn");
});

test("les refus déjà écrits pour être lus passent intacts", () => {
  // Limite de débit, corps trop gros, JSON invalide : Fastify porte déjà la
  // bonne phrase et le bon statut — les remplacer serait une régression.
  const tooMany = Object.assign(
    new Error("Trop de requêtes. Réessayez dans 42 s."),
    { statusCode: 429 },
  );
  assert.deepEqual(describeFailure(tooMany), {
    status: 429,
    body: { error: "Trop de requêtes. Réessayez dans 42 s." },
    severity: "warn",
  });

  const tooBig = Object.assign(new Error("Request body is too large"), {
    statusCode: 413,
  });
  assert.equal(describeFailure(tooBig).status, 413);
  assert.equal(describeFailure(tooBig).body.error, "Request body is too large");
});

test("une erreur nue, sans statut, est traitée comme une panne", () => {
  const out = describeFailure(new Error("quelque chose a cassé"));
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: "erreur interne" });
});

test("un 4xx sans message ne rend pas une phrase vide", () => {
  const out = describeFailure({ statusCode: 400 });
  assert.equal(out.status, 400);
  assert.equal(out.body.error, "requête refusée");
});
