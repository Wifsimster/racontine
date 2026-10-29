import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import type { ArchiveEntry, ArchivePacker } from "../ports.js";

export class ZipArchivePacker implements ArchivePacker {
  pack(entries: ArchiveEntry[]): Readable {
    const zip = new ZipFile();
    const mtime = new Date();
    const output = zip.outputStream as Readable;
    zip.on("error", (err: Error) => output.destroy(err));
    for (const entry of entries) {
      if ("data" in entry) {
        zip.addBuffer(entry.data, entry.path, { mtime });
      } else {
        zip.addReadStreamLazy(entry.path, { mtime, compress: false }, (cb) => {
          try {
            cb(null, entry.open());
          } catch (e) {
            cb(e as Error, null as never);
          }
        });
      }
    }
    zip.end();
    return output;
  }
}
