import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

// `config` lit UPLOADS_DIR à l'import : le dossier de test doit être connu
// AVANT que `storage.ts` (et le module de config) n'entrent en mémoire.
const uploads = await mkdtemp(path.join(tmpdir(), "racontine-uploads-"));
process.env.UPLOADS_DIR = uploads;
const { rotateStoredImage } = await import("./storage.js");

/** Écrit un JPEG uni de w×h dans le dossier d'uploads, et rend son chemin. */
async function put(name: string, w: number, h: number): Promise<string> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: "#888" },
  })
    .jpeg()
    .toBuffer();
  await writeFile(path.join(uploads, name), buf);
  return name;
}

async function size(rel: string): Promise<{ w: number; h: number }> {
  const meta = await sharp(await readFile(path.join(uploads, rel))).metadata();
  return { w: meta.width!, h: meta.height! };
}

test("un quart de tour échange largeur et hauteur, page ET miniature", async () => {
  const original = await put("page.jpg", 400, 300);
  const thumb = await put("page_thumb.jpg", 40, 30);

  const out = await rotateStoredImage(
    { originalPath: original, thumbPath: thumb },
    1,
  );

  assert.deepEqual(out, { width: 300, height: 400 });
  assert.deepEqual(await size(original), { w: 300, h: 400 });
  // La miniature suit : la timeline montre la même page que la relecture.
  assert.deepEqual(await size(thumb), { w: 30, h: 40 });
});

test("un demi-tour garde les proportions", async () => {
  const original = await put("demi.jpg", 400, 300);
  const out = await rotateStoredImage(
    { originalPath: original, thumbPath: null },
    2,
  );
  assert.deepEqual(out, { width: 400, height: 300 });
});

test("les quarts de tour se comptent modulo 4, dans les deux sens", async () => {
  const a = await put("quatre.jpg", 400, 300);
  assert.deepEqual(
    await rotateStoredImage({ originalPath: a, thumbPath: null }, 4),
    { width: 400, height: 300 },
  );
  // -1 (sens inverse) vaut 3 quarts de tour : la page bascule quand même.
  const b = await put("inverse.jpg", 400, 300);
  assert.deepEqual(
    await rotateStoredImage({ originalPath: b, thumbPath: null }, -1),
    { width: 300, height: 400 },
  );
});

test("une page indécodable laisse les fichiers intacts", async () => {
  await writeFile(
    path.join(uploads, "cassee.jpg"),
    Buffer.from("pas une image"),
  );
  const thumb = await put("cassee_thumb.jpg", 40, 30);
  await assert.rejects(
    rotateStoredImage({ originalPath: "cassee.jpg", thumbPath: thumb }, 1),
  );
  // La miniature n'a pas été réécrite alors que la page, elle, a échoué.
  assert.deepEqual(await size(thumb), { w: 40, h: 30 });
});

test("un chemin qui sort du dossier uploads est refusé", async () => {
  await assert.rejects(
    rotateStoredImage({ originalPath: "../secret.jpg", thumbPath: null }, 1),
    /uploads/,
  );
});
