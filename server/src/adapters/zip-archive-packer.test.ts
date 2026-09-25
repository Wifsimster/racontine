import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import yauzl from "yauzl";
import { ZipArchivePacker } from "./zip-archive-packer.js";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Relit un zip : nom de chaque fichier → contenu. */
async function unzip(zip: Buffer): Promise<Map<string, string>> {
  const archive = await yauzl.fromBufferPromise(zip, { lazyEntries: true });
  const entries = await new Promise<yauzl.Entry[]>((resolve, reject) => {
    const found: yauzl.Entry[] = [];
    archive.on("entry", (e: yauzl.Entry) => {
      found.push(e);
      archive.readEntry();
    });
    archive.on("end", () => resolve(found));
    archive.on("error", reject);
    archive.readEntry();
  });
  const out = new Map<string, string>();
  for (const entry of entries)
    out.set(entry.fileName, (await collect(await archive.openReadStreamPromise(entry))).toString());
  return out;
}

test("le zip rend chaque fichier, octets et flux, sous son nom", async () => {
  const zip = await collect(
    new ZipArchivePacker().pack([
      { path: "racontine-export.json", data: Buffer.from('{"ok":true}') },
      { path: "photos/Zoé/2026-09-17-1.jpg", open: () => Readable.from([Buffer.from("jpeg")]) },
    ]),
  );
  const files = await unzip(zip);
  assert.equal(files.get("racontine-export.json"), '{"ok":true}');
  assert.equal(files.get("photos/Zoé/2026-09-17-1.jpg"), "jpeg");
});

test("un fichier illisible coupe le flux au lieu de faire tomber le serveur", async () => {
  const stream = new ZipArchivePacker().pack([
    {
      path: "photos/a.jpg",
      open: () => {
        throw new Error("ENOENT");
      },
    },
  ]);
  await assert.rejects(collect(stream), /ENOENT/);
});
