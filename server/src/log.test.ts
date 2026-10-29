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
  const chemin = redactUrl(
    "/api/auth/reset-password/jeton-de-reinitialisation?callbackURL=%2Freset-password",
  );
  assert.ok(!chemin.includes("jeton-de-reinitialisation"));
  assert.ok(chemin.startsWith("/api/auth/reset-password/REDACTED"));
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
  assert.ok(redactUrl("/api/x?token=").includes("REDACTED"));
});

test("une erreur de base ne renvoie JAMAIS la requête SQL au client", () => {
  const err = Object.assign(new Error('Failed query: select "memberships"."id"…'), {
    cause: { code: "42P01" },
  });
  const out = describeFailure(err);
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: "erreur interne" });
  assert.equal(out.severity, "error");
});

test("un identifiant mal formé est une demande invalide (400), pas une panne", () => {
  const err = Object.assign(new Error("Failed query: select …"), {
    cause: new Error('invalid input syntax for type uuid: "pas-un-uuid"'),
  });
  (err.cause as { code?: string }).code = "22P02";
  const out = describeFailure(err);
  assert.equal(out.status, 400);
  assert.deepEqual(out.body, { error: "identifiant invalide" });
  assert.equal(out.severity, "warn");
});

test("les refus déjà écrits pour être lus passent intacts", () => {
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
