import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_STAGED_BYTES,
  STAGING_TTL_MS,
  resolveStagedUploads,
} from "./mcp-uploads.js";

test("resolveStagedUploads([]) court-circuite sans toucher la base", async () => {
  const res = await resolveStagedUploads("u1", []);
  assert.deepEqual(res, { ok: true, buffers: [] });
});

test("les bornes de mise en attente restent raisonnables", () => {
  assert.equal(MAX_STAGED_BYTES, 20 * 1024 * 1024);
  assert.ok(STAGING_TTL_MS > 0);
});
