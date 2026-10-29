import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import {
  deleteStored,
  resolveUpload,
  rotateStoredImage,
  storeCarnetImage,
} from "../storage.js";
import type { ImageStore, StoredImage } from "../ports.js";

export class FileSystemImageStore implements ImageStore {
  store(input: Buffer): Promise<StoredImage> {
    return storeCarnetImage(input);
  }

  read(relPath: string): Promise<Buffer> {
    return readFile(resolveUpload(relPath));
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      return (await stat(resolveUpload(relPath))).isFile();
    } catch {
      return false;
    }
  }

  openRead(relPath: string): Readable {
    return createReadStream(resolveUpload(relPath));
  }

  delete(img: { originalPath: string; thumbPath: string }): Promise<void> {
    return deleteStored(img);
  }

  rotate(
    img: { originalPath: string; thumbPath: string | null },
    quarters: number,
  ): Promise<{ width: number; height: number }> {
    return rotateStoredImage(img, quarters);
  }
}
