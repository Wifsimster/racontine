import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_STAGED_BYTES,
  STAGING_TTL_MS,
  resolveStagedUploads,
} from "./mcp-uploads.js";

// Comme le reste de la suite, on ne teste ici que les chemins sans accès base.

test("resolveStagedUploads([]) court-circuite sans toucher la base", async () => {
  const res = await resolveStagedUploads("u1", []);
  assert.deepEqual(res, { ok: true, buffers: [] });
});

test("les bornes de mise en attente restent raisonnables", () => {
  // 20 Mo par page, aligné sur la limite du formulaire multipart.
  assert.equal(MAX_STAGED_BYTES, 20 * 1024 * 1024);
  // TTL strictement positif (un upload finit toujours par être balayé).
  assert.ok(STAGING_TTL_MS > 0);
});
