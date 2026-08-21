import { test } from "node:test";
import assert from "node:assert/strict";
import { redactUrl } from "./log.js";

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
