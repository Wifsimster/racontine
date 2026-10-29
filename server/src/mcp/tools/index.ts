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

export const MCP_TOOLS: readonly McpTool[] = [
  listChildrenTool,
  uploadDailyNoteTool,
  createDailyNoteTool,
  listDailyNotesTool,
  getDailyNoteTool,
  instanceStatusTool,
  adminConsoleTool,
  publishDailyNoteTool,
  retryDailyNoteTool,
  updateInstanceSettingsTool,
  listCircleTool,
  inviteRelativeTool,
  setMemberRoleTool,
  setMemberNameTool,
  removeMemberTool,
  revokeInvitationTool,
];
