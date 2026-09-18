import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolContext } from "../protocol.js";
import { MCP_TOOLS } from "./index.js";

/* ===========================================================================
   LE CATALOGUE SE VÉRIFIE SANS SERVEUR NI BASE.

   Un outil s'inscrit sous le nom qu'il déclare : la boucle du constructeur
   (`buildMcpServer`) ne compare pas les deux, si bien qu'un copier-coller
   pouvait inscrire `list_children` deux fois et faire disparaître un outil du
   catalogue annoncé au client. On enregistre donc le catalogue sur un serveur
   d'espionnage — les gestionnaires ne sont jamais appelés, aucun contexte réel
   n'est nécessaire.
   =========================================================================== */

/** Noms réellement inscrits par le catalogue. */
function registeredNames(): string[] {
  const names: string[] = [];
  const spy = {
    registerTool(name: string) {
      names.push(name);
    },
  } as unknown as McpServer;
  // Le contexte n'est touché que dans les gestionnaires, qui ne tournent pas ici.
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
    // Le carnet : ce qui remplit le journal.
    "list_children",
    "upload_daily_note",
    "create_daily_note",
    "list_daily_notes",
    "get_daily_note",
    // L'exploitation : ce qui tient l'instance en production.
    "instance_status",
    "admin_console",
    "publish_daily_note",
    "retry_daily_note",
    "update_instance_settings",
    // Le cercle : qui voit le journal d'un enfant.
    "list_circle",
    "invite_relative",
    "set_member_role",
    "remove_member",
    "revoke_invitation",
  ])
    assert.ok(names.has(expected), `outil manquant : ${expected}`);
});
