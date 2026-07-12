import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptSecret, decryptSecret } from "./crypto.js";

test("encryptSecret/decryptSecret font un aller-retour fidèle", () => {
  const plain = "sk-ant-abc123_secret-value";
  const blob = encryptSecret(plain);
  assert.notEqual(blob, plain); // jamais en clair
  assert.match(blob, /^v1:/);
  assert.equal(decryptSecret(blob), plain);
});

test("encryptSecret produit un blob différent à chaque appel (IV aléatoire)", () => {
  const plain = "sk-ant-meme-valeur";
  assert.notEqual(encryptSecret(plain), encryptSecret(plain));
});

test("decryptSecret rejette un blob altéré (auth GCM)", () => {
  const blob = encryptSecret("sk-ant-xyz");
  // On corrompt le dernier caractère base64 du payload.
  const tampered = blob.slice(0, -1) + (blob.endsWith("A") ? "B" : "A");
  assert.throws(() => decryptSecret(tampered));
});

test("decryptSecret rejette un format inconnu", () => {
  assert.throws(() => decryptSecret("pas-un-blob"));
  assert.throws(() => decryptSecret("v2:AAAA"));
});
