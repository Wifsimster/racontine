import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "./db/index.js";
import { mcpUploads } from "./db/schema.js";
import { resolveUpload } from "./storage.js";

const STAGING_DIR = "staging";

export const STAGING_TTL_MS = 30 * 60 * 1000;

export const MAX_STAGED_BYTES = 20 * 1024 * 1024;

export const MAX_PENDING_UPLOADS = 24;

export type StagedUpload = {
  id: string;
  byteSize: number;
  expiresAt: Date;
};

async function unlinkStaged(paths: string[]): Promise<void> {
  await Promise.allSettled(
    paths.map((rel) => unlink(resolveUpload(rel))),
  );
}

export async function sweepExpiredUploads(): Promise<void> {
  try {
    const stale = await db
      .delete(mcpUploads)
      .where(lt(mcpUploads.expiresAt, new Date()))
      .returning({ path: mcpUploads.path });
    if (stale.length) await unlinkStaged(stale.map((r) => r.path));
  } catch {
  }
}

export async function stageUpload(
  userId: string,
  bytes: Buffer,
): Promise<StagedUpload | null> {
  await sweepExpiredUploads();
  const [pending] = await db
    .select({ n: count() })
    .from(mcpUploads)
    .where(eq(mcpUploads.userId, userId));
  if ((pending?.n ?? 0) >= MAX_PENDING_UPLOADS) return null;

  const id = randomUUID();
  const rel = path.join(STAGING_DIR, id);
  await mkdir(path.dirname(resolveUpload(rel)), { recursive: true });
  await writeFile(resolveUpload(rel), bytes);

  const expiresAt = new Date(Date.now() + STAGING_TTL_MS);
  try {
    await db.insert(mcpUploads).values({
      id,
      userId,
      path: rel,
      byteSize: bytes.length,
      expiresAt,
    });
  } catch (err) {
    await unlinkStaged([rel]);
    throw err;
  }

  return { id, byteSize: bytes.length, expiresAt };
}

export type ResolvedUploads =
  | { ok: true; buffers: Buffer[] }
  | { ok: false; error: string };

export async function resolveStagedUploads(
  userId: string,
  ids: string[],
): Promise<ResolvedUploads> {
  if (!ids.length) return { ok: true, buffers: [] };

  const rows = await db
    .select({ id: mcpUploads.id, path: mcpUploads.path })
    .from(mcpUploads)
    .where(
      and(
        eq(mcpUploads.userId, userId),
        inArray(mcpUploads.id, ids),
        gt(mcpUploads.expiresAt, new Date()),
      ),
    );

  const byId = new Map(rows.map((r) => [r.id, r.path]));

  const buffers: Buffer[] = [];
  for (const id of ids) {
    const rel = byId.get(id);
    if (!rel)
      return {
        ok: false,
        error: `Upload « ${id} » introuvable ou expiré. Re-téléversez la page via POST /api/mcp/uploads.`,
      };
    try {
      buffers.push(await readFile(resolveUpload(rel)));
    } catch {
      return {
        ok: false,
        error: `Upload « ${id} » illisible sur le serveur. Re-téléversez la page.`,
      };
    }
  }
  return { ok: true, buffers };
}

export async function consumeStagedUploads(
  userId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  try {
    const removed = await db
      .delete(mcpUploads)
      .where(and(eq(mcpUploads.userId, userId), inArray(mcpUploads.id, ids)))
      .returning({ path: mcpUploads.path });
    if (removed.length) await unlinkStaged(removed.map((r) => r.path));
  } catch {
  }
}
