import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";

const THUMB_MAX = 512; // px, côté le plus long
const ORIGINAL_MAX = 2400; // px, borne les photos plein cadre (l'API vision n'a pas besoin de plus)

export type StoredImage = {
  originalPath: string; // relatif à UPLOADS_DIR
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
};

function absolute(relPath: string): string {
  const root = path.resolve(config.uploadsDir);
  const abs = path.resolve(root, relPath);
  // Défense en profondeur : ne jamais sortir du dossier uploads.
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("chemin hors du dossier uploads");
  }
  return abs;
}

export function resolveUpload(relPath: string): string {
  return absolute(relPath);
}

/**
 * Normalise une photo de carnet : auto-rotation EXIF, conversion en JPEG
 * (couvre HEIC/PNG/WebP livrés par la galerie du téléphone), redimensionnement
 * borné, plus une miniature pour la timeline. sharp lève si le format est
 * indécodable — l'appelant transforme ça en entrée `failed`.
 */
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

  const base = sharp(input, { failOn: "error" }).rotate(); // rotate() applique l'orientation EXIF

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

/**
 * Supprime du disque les fichiers d'une image stockée (original + miniature).
 * Best-effort : un fichier déjà absent n'est pas une erreur. Sert à nettoyer les
 * images écrites avant qu'un contrôle en aval n'annule l'ingestion.
 */
export async function deleteStored(img: {
  originalPath: string;
  thumbPath: string;
}): Promise<void> {
  await Promise.allSettled([
    unlink(absolute(img.originalPath)),
    unlink(absolute(img.thumbPath)),
  ]);
}
