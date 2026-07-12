import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authenticateMcpToken,
  generateRawToken,
  hashToken,
} from "./mcp-tokens.js";

test("hashToken est un SHA-256 hex déterministe", () => {
  const h1 = hashToken("rac_mcp_exemple");
  const h2 = hashToken("rac_mcp_exemple");
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, hashToken("rac_mcp_autre"));
});

test("generateRawToken porte le préfixe et un secret base64url", () => {
  const tok = generateRawToken();
  assert.ok(tok.startsWith("rac_mcp_"));
  const secret = tok.slice("rac_mcp_".length);
  // base64url : uniquement A–Z a–z 0–9 - _ (pas de +, /, =).
  assert.match(secret, /^[A-Za-z0-9_-]+$/);
  assert.ok(secret.length >= 42); // 32 octets encodés en base64url
});

test("generateRawToken ne se répète pas", () => {
  const tokens = new Set(Array.from({ length: 50 }, () => generateRawToken()));
  assert.equal(tokens.size, 50);
});

// Ces rejets se produisent AVANT toute requête base : l'en-tête est écarté sur
// sa seule forme (absent, mauvais schéma, mauvais préfixe) — aucun accès DB.
test("authenticateMcpToken rejette un en-tête absent", async () => {
  assert.equal(await authenticateMcpToken(undefined), null);
});

test("authenticateMcpToken rejette un schéma non-Bearer", async () => {
  assert.equal(await authenticateMcpToken("Basic rac_mcp_abc"), null);
});

test("authenticateMcpToken rejette un jeton sans le bon préfixe", async () => {
  assert.equal(await authenticateMcpToken("Bearer pas-un-jeton-racontine"), null);
});
