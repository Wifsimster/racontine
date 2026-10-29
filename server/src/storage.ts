import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";

const THUMB_MAX = 512;
const ORIGINAL_MAX = 2400;

export type StoredImage = {
  originalPath: string;
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
};

function absolute(relPath: string): string {
  const root = path.resolve(config.uploadsDir);
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("chemin hors du dossier uploads");
  }
  return abs;
}

export function resolveUpload(relPath: string): string {
  return absolute(relPath);
}

export async function storeCarnetImage(input: Buffer): Promise<StoredImage> {
  const now = new Date();
  const dir = path.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
  );
  const id = randomUUID();
  const originalRel = path.join(dir, `${id}.jpg`);
  const thumbRel = path.join(dir, `${id}_thumb.jpg`);

  await mkdir(absolute(dir), { recursive: true });

  const base = sharp(input, { failOn: "error" }).rotate();

  const normalized = await base
    .clone()
    .resize(ORIGINAL_MAX, ORIGINAL_MAX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();

  await writeFile(absolute(originalRel), normalized.data);
  await writeFile(absolute(thumbRel), thumb);

  return {
    originalPath: originalRel,
    thumbPath: thumbRel,
    mime: "image/jpeg",
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

export async function rotateStoredImage(
  img: { originalPath: string; thumbPath: string | null },
  quarters: number,
): Promise<{ width: number; height: number }> {
  const q = (((Math.trunc(quarters) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const angle = q * 90;

  const original = await sharp(await readFile(absolute(img.originalPath)), {
    failOn: "error",
  })
    .rotate(angle)
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });

  const thumb = img.thumbPath
    ? await sharp(await readFile(absolute(img.thumbPath)), { failOn: "error" })
        .rotate(angle)
        .jpeg({ quality: 72 })
        .toBuffer()
    : null;

  await writeFile(absolute(img.originalPath), original.data);
  if (thumb && img.thumbPath) await writeFile(absolute(img.thumbPath), thumb);

  return { width: original.info.width, height: original.info.height };
}

export async function deleteStored(img: {
  originalPath: string;
  thumbPath: string;
}): Promise<void> {
  await Promise.allSettled([
    unlink(absolute(img.originalPath)),
    unlink(absolute(img.thumbPath)),
  ]);
}
