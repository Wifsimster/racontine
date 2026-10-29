import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolContext } from "../protocol.js";
import { MCP_TOOLS } from "./index.js";

function registeredNames(): string[] {
  const names: string[] = [];
  const spy = {
    registerTool(name: string) {
      names.push(name);
    },
  } as unknown as McpServer;
  const ctx = {} as McpToolContext;
  for (const tool of MCP_TOOLS) tool.register(spy, ctx);
  return names;
}

test("chaque outil s'inscrit sous le nom qu'il déclare", () => {
  assert.deepEqual(
    registeredNames(),
    MCP_TOOLS.map((t) => t.name),
  );
});

test("aucun nom d'outil n'est servi deux fois", () => {
  const names = MCP_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test("le catalogue expose le carnet, l'exploitation ET le cercle", () => {
  const names = new Set(MCP_TOOLS.map((t) => t.name));
  for (const expected of [
    "list_children",
    "upload_daily_note",
    "create_daily_note",
    "list_daily_notes",
    "get_daily_note",
    "instance_status",
    "admin_console",
    "publish_daily_note",
    "retry_daily_note",
    "update_instance_settings",
    "list_circle",
    "invite_relative",
    "set_member_role",
    "set_member_name",
    "remove_member",
    "revoke_invitation",
  ])
    assert.ok(names.has(expected), `outil manquant : ${expected}`);
});
