import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpTool, McpToolContext } from "../protocol.js";
import { attachDailyNotePhotosTool } from "./attach-daily-note-photos.js";
import { removeDailyNotePhotoTool } from "./remove-daily-note-photo.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: { type: string; text: string }[];
}>;

function handlerOf(tool: McpTool, ctx: McpToolContext): Handler {
  let handler: Handler | undefined;
  const spy = {
    registerTool(_name: string, _meta: unknown, fn: Handler) {
      handler = fn;
    },
  } as unknown as McpServer;
  tool.register(spy, ctx);
  return handler!;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("attach_daily_note_photos joint des souvenirs, pas des pages", async () => {
  const calls: { kind: string; count: number }[] = [];
  const ctx = {
    user: { id: "u1" },
    pages: {
      attach: async () => {
        calls.push({ kind: "carnet", count: 0 });
        return { ok: true, added: 0, total: 0 };
      },
      addSouvenirs: async (p: { images: Buffer[] }) => {
        calls.push({ kind: "souvenir", count: p.images.length });
        return {
          ok: true,
          added: [{ id: "ph1", width: 1, height: 1 }],
          total: 3,
        };
      },
    },
    uploads: { consume: async () => {} },
  } as unknown as McpToolContext;

  const res = await handlerOf(attachDailyNotePhotosTool, ctx)({
    entryId: "e1",
    images: [PNG.toString("base64")],
  });
  assert.equal(res.isError, undefined);
  assert.deepEqual(calls, [{ kind: "souvenir", count: 1 }]);
  const body = JSON.parse(res.content[0]!.text);
  assert.deepEqual(body.added, ["ph1"]);
  assert.equal(body.total, 3);
});

test("remove_daily_note_photo refuse de retirer une page du carnet", async () => {
  let removed = false;
  const ctx = {
    user: { id: "u1" },
    queries: { attachmentKind: async () => "carnet" },
    pages: {
      remove: async () => {
        removed = true;
        return { ok: true };
      },
    },
  } as unknown as McpToolContext;

  const res = await handlerOf(removeDailyNotePhotoTool, ctx)({ photoId: "p1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0]!.text, /page du carnet/);
  assert.equal(removed, false);
});

test("remove_daily_note_photo retire un souvenir visible", async () => {
  const ctx = {
    user: { id: "u1" },
    queries: { attachmentKind: async () => "souvenir" },
    pages: { remove: async () => ({ ok: true }) },
  } as unknown as McpToolContext;
  const res = await handlerOf(removeDailyNotePhotoTool, ctx)({ photoId: "p1" });
  assert.equal(res.isError, undefined);
  assert.deepEqual(JSON.parse(res.content[0]!.text), {
    photoId: "p1",
    removed: true,
  });
});

test("remove_daily_note_photo : photo inconnue ou d'un autre foyer", async () => {
  const ctx = {
    user: { id: "u1" },
    queries: { attachmentKind: async () => null },
    pages: { remove: async () => ({ ok: true }) },
  } as unknown as McpToolContext;
  const res = await handlerOf(removeDailyNotePhotoTool, ctx)({ photoId: "x" });
  assert.equal(res.isError, true);
  assert.match(res.content[0]!.text, /introuvable/);
});
