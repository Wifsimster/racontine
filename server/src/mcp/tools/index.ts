import type { McpTool } from "../protocol.js";
import { adminConsoleTool } from "./admin-console.js";
import { createDailyNoteTool } from "./create-daily-note.js";
import { getDailyNoteTool } from "./get-daily-note.js";
import { instanceStatusTool } from "./instance-status.js";
import { inviteRelativeTool } from "./invite-relative.js";
import { listCircleTool } from "./list-circle.js";
import { listChildrenTool } from "./list-children.js";
import { listDailyNotesTool } from "./list-daily-notes.js";
import { publishDailyNoteTool } from "./publish-daily-note.js";
import { removeMemberTool } from "./remove-member.js";
import { retryDailyNoteTool } from "./retry-daily-note.js";
import { revokeInvitationTool } from "./revoke-invitation.js";
import { setMemberNameTool } from "./set-member-name.js";
import { setMemberRoleTool } from "./set-member-role.js";
import { updateInstanceSettingsTool } from "./update-instance-settings.js";
import { uploadDailyNoteTool } from "./upload-daily-note.js";

/**
 * LE CATALOGUE D'OUTILS MCP. Ajouter un outil, c'est écrire son module et
 * l'ajouter à cette liste — le constructeur du serveur ne bouge pas.
 *
 * Trois familles, et la frontière compte : les outils du CARNET remplissent le
 * journal (c'est le geste du soir, celui d'un parent), ceux de l'EXPLOITATION
 * pilotent l'instance qui l'héberge (c'est le geste d'un agent d'astreinte),
 * ceux du CERCLE décident qui voit le journal d'un enfant — les plus sensibles
 * du produit, et gardés carnet par carnet. Tous portent les droits du jeton :
 * aucun n'ouvre une porte que l'application n'ouvrirait pas au même compte.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  /* --------------------------------- Le carnet -------------------------- */
  listChildrenTool,
  uploadDailyNoteTool,
  createDailyNoteTool,
  listDailyNotesTool,
  getDailyNoteTool,
  /* ------------------------------ L'exploitation ------------------------ */
  instanceStatusTool,
  adminConsoleTool,
  publishDailyNoteTool,
  retryDailyNoteTool,
  updateInstanceSettingsTool,
  /* --------------------------------- Le cercle -------------------------- */
  listCircleTool,
  inviteRelativeTool,
  setMemberRoleTool,
  setMemberNameTool,
  removeMemberTool,
  revokeInvitationTool,
];
