import type { McpTool } from "../protocol.js";
import { createDailyNoteTool } from "./create-daily-note.js";
import { getDailyNoteTool } from "./get-daily-note.js";
import { listChildrenTool } from "./list-children.js";
import { listDailyNotesTool } from "./list-daily-notes.js";
import { uploadDailyNoteTool } from "./upload-daily-note.js";

/**
 * LE CATALOGUE D'OUTILS MCP. Ajouter un outil, c'est écrire son module et
 * l'ajouter à cette liste — le constructeur du serveur ne bouge pas.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  listChildrenTool,
  uploadDailyNoteTool,
  createDailyNoteTool,
  listDailyNotesTool,
  getDailyNoteTool,
];
