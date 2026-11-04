import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChildAdminAccess } from "../access.js";
import type { InstanceOps } from "../instance-ops.js";
import type { McpTokenUser } from "../mcp-tokens.js";
import type { AdminService } from "../services/admin-service.js";
import type { CarnetReadingService } from "../services/carnet-reading-service.js";
import type { EntryEditingService } from "../services/entry-editing-service.js";
import type { IngestService } from "../services/ingest-service.js";
import type { PageService } from "../services/page-service.js";
import type { SharingService } from "../services/sharing-service.js";
import type { TranscribedNoteService } from "../services/transcribed-note-service.js";
import type { OpsQueries } from "./ops-queries.js";
import type { EntryQueries } from "./queries.js";
import type { StagedUploads } from "./uploads.js";

export const MAX_PAGES = 12;

export function jsonContent(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function decodeBase64Image(input: string): Buffer | null {
  const cleaned = input.replace(/^data:[^;,]*;base64,/, "").trim();
  if (!cleaned) return null;
  try {
    const buf = Buffer.from(cleaned, "base64");
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

export async function collectPages(
  ctx: Pick<McpToolContext, "uploads" | "user">,
  images: string[] | undefined,
  imageIds: string[] | undefined,
): Promise<{ ok: true; buffers: Buffer[] } | { ok: false; error: string }> {
  const buffers: Buffer[] = [];
  if (imageIds?.length) {
    const resolved = await ctx.uploads.resolve(ctx.user.id, imageIds);
    if (!resolved.ok) return resolved;
    buffers.push(...resolved.buffers);
  }
  if (images?.length) {
    for (const [i, img] of images.entries()) {
      const buf = decodeBase64Image(img);
      if (!buf)
        return {
          ok: false,
          error: `Image ${i + 1} invalide : chaîne base64 non décodable.`,
        };
      buffers.push(buf);
    }
  }
  if (!buffers.length)
    return {
      ok: false,
      error:
        "Aucune page fournie : renseignez `images` (base64) ou `imageIds` (pré-téléversées via POST /api/mcp/uploads).",
    };
  if (buffers.length > MAX_PAGES)
    return { ok: false, error: `Trop de pages (max ${MAX_PAGES} par envoi).` };
  return { ok: true, buffers };
}

export type McpToolContext = {
  user: McpTokenUser;
  ingest: IngestService;
  pages: Pick<PageService, "attach">;
  notes: TranscribedNoteService;
  queries: EntryQueries;
  uploads: StagedUploads;
  admin: AdminService;
  editing: EntryEditingService;
  reading: CarnetReadingService;
  instance: InstanceOps;
  ops: OpsQueries;
  sharing: SharingService;
  circleAccess: ChildAdminAccess;
};

export type McpTool = {
  name: string;
  register(server: McpServer, ctx: McpToolContext): void;
};
